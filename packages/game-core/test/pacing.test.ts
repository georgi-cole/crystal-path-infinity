import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  createPracticeCursor,
  createRun,
  createTimedRunSession,
  getCurrentRow,
  PACED_RULESET_VERSION,
  PRACTICE_RNG,
  presentRowPressure,
  transitionRun,
} from '../src/index.ts';
import type { RunCommand, RunState } from '../src/index.ts';

function fresh(sp = 300) {
  return {
    ...createRun(
      {
        runId: 'practice-pressure',
        rulesetVersion: PACED_RULESET_VERSION,
        routeRng: createPracticeCursor(14),
        mysteryRng: createPracticeCursor(8),
        observedAt: 100000,
      },
      PRACTICE_RNG,
    ),
    sp,
  };
}
function act(state: RunState, command: RunCommand, time = state.activeTimeMs) {
  return transitionRun(state, command, {
    activeTimeMs: time,
    achievedAt: 100000 + time,
    rng: PRACTICE_RNG,
  });
}
function cross(state: RunState, time: number, wrong = false) {
  const safe = getCurrentRow(state).safeSide;
  return act(
    state,
    {
      type: 'choose',
      side: wrong ? (safe === 'left' ? 'right' : 'left') : safe,
      row: state.currentRow,
      life: state.revivesApplied,
    },
    time,
  );
}
function surviveTo(time: number, sp = 200) {
  let state = fresh(sp);
  for (let at = 7000; at <= time; at += 7000) state = cross(state, at).state;
  return act(state, { type: 'tick' }, time).state;
}

describe('infinity-v2 active-time row pressure', () => {
  it('gives three seconds of grace, then a five-second clock and an exact fatal boundary', () => {
    let state = fresh();
    state = act(state, { type: 'tick' }, 2999).state;
    expect(presentRowPressure(state)?.active).toBe(false);
    state = act(state, { type: 'tick' }, 3000).state;
    expect(presentRowPressure(state)).toMatchObject({
      active: true,
      remainingMs: 5000,
      urgent: false,
    });
    state = act(state, { type: 'tick' }, 7999).state;
    expect(state.status).toBe('playing');
    expect(presentRowPressure(state)?.remainingMs).toBe(1);
    const death = cross(state, 8000);
    expect(death.reason).toBe('died-before-command');
    expect(death.state.sp).toBe(0);
    expect(death.state.death).toMatchObject({ cause: 'idle', fatalRow: '1', activeTimeMs: 8000 });
    expect(death.state.lastClearedRow).toBe('0');
    expect(death.events.map((e) => e.type)).toEqual(['death']);
    assertRunState(death.state, PRACTICE_RNG);
  });
  it('resets only when crossing the row, including a survived wrong pane', () => {
    const hinted = act(fresh(), { type: 'hint', row: '1', life: 0 }, 6000).state;
    expect(hinted.pacing?.rowEnteredAt).toBe(0);
    let state = cross(hinted, 7999, true).state;
    expect(state.lastClearedRow).toBe('1');
    expect(state.pacing?.rowEnteredAt).toBe(7999);
    state = act(state, { type: 'tick' }, 10998).state;
    expect(presentRowPressure(state)?.active).toBe(false);
    state = act(state, { type: 'tick' }, 10999).state;
    expect(presentRowPressure(state)?.remainingMs).toBe(5000);
  });
  it('does not let mystery use or a late heartbeat buy more time on the row', () => {
    let state = fresh();
    while (!getCurrentRow(state).hasMystery) state = cross(state, state.activeTimeMs + 100).state;
    const entered = state.pacing!.rowEnteredAt;
    state = act(state, { type: 'mystery', row: state.currentRow, life: 0 }, entered + 4000).state;
    expect(state.pacing?.rowEnteredAt).toBe(entered);
    const dead = act(state, { type: 'tick' }, entered + 1000000000);
    expect(dead.state.activeTimeMs).toBe(entered + 8000);
    expect(dead.state.death?.cause).toBe('idle');
    expect(dead.events.some((e) => e.type === 'survival-bonus')).toBe(false);
  });
  it('freezes pressure during explicit pause/recovery and discards the unplayed fatal tail on revival', () => {
    let now = 0;
    const session = createTimedRunSession(fresh(), PRACTICE_RNG, {
      monotonicNow: () => now,
      observedAt: 100000,
    });
    session.releaseRecovery();
    now = 2000;
    const hold = session.hold('user');
    now = 65000;
    hold.release();
    expect(session.getState().activeTimeMs).toBe(2000);
    now = 66000;
    session.tick();
    expect(presentRowPressure(session.getState())?.remainingMs).toBe(5000);
    now = 90000;
    session.tick();
    const dead = session.getState();
    expect(dead.activeTimeMs).toBe(8000);
    session.bind({ type: 'grant-revive', deathId: dead.death!.id, ordinal: 1, grantId: 'g1' })();
    session.bind({ type: 'apply-revive', deathId: dead.death!.id, ordinal: 1, grantId: 'g1' })();
    expect(session.getState().pacing?.rowEnteredAt).toBe(8000);
    expect(presentRowPressure(session.getState())?.active).toBe(false);
    now = 91000;
    session.tick();
    expect(session.getState().activeTimeMs).toBe(9000);
  });
  it('retains historical infinity-v1 behavior without silently changing an authoritative run', () => {
    const legacy = createRun(
      {
        runId: 'legacy',
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
        observedAt: 100000,
      },
      PRACTICE_RNG,
    );
    const result = act(legacy, { type: 'tick' }, 600000);
    expect(result.state.status).toBe('playing');
    expect(result.state.sp).toBe(300);
    expect(result.state.pacing).toBeUndefined();
    expect(result.events).toEqual([]);
  });
});

describe('survival minute rewards', () => {
  it('awards exactly five SP at a full active minute and never repeats that boundary', () => {
    const state = surviveTo(59999);
    const bonus = act(state, { type: 'tick' }, 60000);
    expect(bonus.state.sp).toBe(205);
    expect(bonus.state.pacing?.nextSurvivalBonusAt).toBe(120000);
    expect(bonus.events).toContainEqual({
      type: 'survival-bonus',
      amount: 5,
      spDelta: 5,
      sp: 205,
      minute: 1,
      activeTimeMs: 60000,
      observedAt: 160000,
    });
    expect(act(bonus.state, { type: 'tick' }, 60000).events).toEqual([]);
    assertRunState(bonus.state, PRACTICE_RNG);
  });
  it('respects the 400 SP cap and awards the second minute once after continued survival', () => {
    const capped = act(surviveTo(59999, 398), { type: 'tick' }, 60000);
    expect(capped.state.sp).toBe(400);
    expect(capped.events.find((e) => e.type === 'survival-bonus')).toMatchObject({ spDelta: 2 });
    const second = surviveTo(119999);
    const next = act(second, { type: 'tick' }, 120000);
    expect(next.state.sp).toBe(210);
    expect(next.events.find((e) => e.type === 'survival-bonus')).toMatchObject({ minute: 2 });
  });
  it('does not resurrect an expired row or a lethal drain at the bonus boundary', () => {
    let state = surviveTo(49000);
    state = cross(state, 52000).state;
    const idle = act(state, { type: 'tick' }, 60000);
    expect(idle.state.death?.cause).toBe('idle');
    expect(idle.events.some((e) => e.type === 'survival-bonus')).toBe(false);
    state = surviveTo(59000, 2);
    state = {
      ...state,
      effects: [{ kind: 'drain_5s', startedAt: 59000, expiresAt: 64000, nextTickAt: 60000 }],
    };
    const drain = act(state, { type: 'tick' }, 60000);
    expect(drain.state.death?.cause).toBe('drain');
    expect(drain.events.some((e) => e.type === 'survival-bonus')).toBe(false);
    const granted = act(drain.state, {
      type: 'grant-revive',
      deathId: drain.state.death!.id,
      ordinal: 1,
      grantId: 'boundary',
    }).state;
    const revived = act(granted, {
      type: 'apply-revive',
      deathId: drain.state.death!.id,
      ordinal: 1,
      grantId: 'boundary',
    }).state;
    expect(revived.pacing?.nextSurvivalBonusAt).toBe(120000);
    expect(revived.sp).toBe(200);
    assertRunState(revived, PRACTICE_RNG);
  });
  it('rejects missing, stale or backwards pacing checkpoints', () => {
    const state = fresh();
    expect(() => assertRunState({ ...state, pacing: undefined }, PRACTICE_RNG)).toThrow();
    expect(() =>
      assertRunState(
        { ...state, pacing: { rowEnteredAt: 1, nextSurvivalBonusAt: 60000 } },
        PRACTICE_RNG,
      ),
    ).toThrow();
    expect(() =>
      assertRunState(
        { ...state, pacing: { rowEnteredAt: 0, nextSurvivalBonusAt: 0 } },
        PRACTICE_RNG,
      ),
    ).toThrow();
  });
});
