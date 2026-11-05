import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  createPracticeCursor,
  createRun,
  createTimedRunSession,
  getCurrentRow,
  HINT_SCAN_MS,
  PACED_RULESET_VERSION,
  PRACTICE_RNG,
  presentRowPressure,
  ROW_GRACE_MS,
  DEATH_CLOCK_MS,
  SCAN_RULESET_VERSION,
  transitionRun,
} from '../src/index.ts';
import type { RunCommand, RunState } from '../src/index.ts';

const fresh = (version = SCAN_RULESET_VERSION) =>
  createRun(
    {
      runId: 'practice-scan',
      rulesetVersion: version,
      routeRng: createPracticeCursor(1),
      mysteryRng: createPracticeCursor(2),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
const at = (state: RunState, command: RunCommand, time: number) =>
  transitionRun(state, command, { activeTimeMs: time, achievedAt: time, rng: PRACTICE_RNG });
const hint = (state: RunState, time: number) =>
  at(state, { type: 'hint', row: state.currentRow, life: state.revivesApplied }, time);

describe('infinity-v3 bounded hint scan hold', () => {
  it('holds the existing countdown for exactly the scan, then resumes without resetting it', () => {
    const started = ROW_GRACE_MS + 2000;
    const scanned = hint(fresh(), started).state;
    const before = presentRowPressure(scanned)!;
    expect(before).toMatchObject({ paused: true, remainingMs: DEATH_CLOCK_MS - 2000 });
    const during = at(scanned, { type: 'tick' }, started + HINT_SCAN_MS - 1).state;
    expect(presentRowPressure(during)).toMatchObject({
      paused: true,
      remainingMs: before.remainingMs,
      urgent: false,
    });
    const resumed = at(during, { type: 'tick' }, started + HINT_SCAN_MS).state;
    expect(presentRowPressure(resumed)).toMatchObject({
      paused: false,
      remainingMs: before.remainingMs,
    });
    const moving = at(resumed, { type: 'tick' }, started + HINT_SCAN_MS + 100).state;
    expect(presentRowPressure(moving)?.remainingMs).toBe(before.remainingMs - 100);
    const fatal = at(moving, { type: 'tick' }, ROW_GRACE_MS + DEATH_CLOCK_MS + HINT_SCAN_MS);
    expect(fatal.state.death).toMatchObject({
      cause: 'idle',
      activeTimeMs: ROW_GRACE_MS + DEATH_CLOCK_MS + HINT_SCAN_MS,
    });
  });
  it('also protects the first scan during initial grace, and never accepts a hint after zero', () => {
    let state = hint(fresh(), 0).state;
    state = at(state, { type: 'tick' }, ROW_GRACE_MS + HINT_SCAN_MS - 1).state;
    expect(presentRowPressure(state)?.active).toBe(false);
    state = at(state, { type: 'tick' }, ROW_GRACE_MS + HINT_SCAN_MS).state;
    expect(presentRowPressure(state)).toMatchObject({ active: true, remainingMs: DEATH_CLOCK_MS });
    const late = hint(fresh(), ROW_GRACE_MS + DEATH_CLOCK_MS);
    expect(late.reason).toBe('died-before-command');
    expect(late.state.hints).toBe(fresh().hints);
  });
  it('does not let repeated hints extend the hold and never carries it into the next row', () => {
    const started = ROW_GRACE_MS + 100;
    const scanned = hint(fresh(), started).state;
    const repeated = hint(scanned, started + 50);
    expect(repeated.reason).toBe('already-revealed');
    expect(repeated.state.pacing?.hintScanStartedAt).toBe(started);
    const crossed = at(
      repeated.state,
      { type: 'choose', row: scanned.currentRow, life: 0, side: getCurrentRow(scanned).safeSide },
      started + 100,
    ).state;
    expect(crossed.pacing?.hintScanStartedAt).toBeUndefined();
    expect(presentRowPressure(crossed)).toMatchObject({ active: false, paused: false });
    assertRunState(crossed, PRACTICE_RNG);
  });
  it('keeps effects and active survival time moving while only row pressure is held', () => {
    let state = fresh();
    state = at(state, { type: 'tick' }, ROW_GRACE_MS).state;
    state = {
      ...state,
      effects: [
        {
          kind: 'regen_5s',
          startedAt: ROW_GRACE_MS,
          nextTickAt: ROW_GRACE_MS + 500,
          expiresAt: ROW_GRACE_MS + 5000,
        },
      ],
    };
    const scanned = hint(state, ROW_GRACE_MS + 100).state;
    const pulse = at(scanned, { type: 'tick' }, ROW_GRACE_MS + 500);
    expect(pulse.state.activeTimeMs).toBe(ROW_GRACE_MS + 500);
    expect(pulse.state.sp).toBe(state.sp + 2);
    expect(presentRowPressure(pulse.state)).toMatchObject({
      paused: true,
      remainingMs: DEATH_CLOCK_MS - 100,
    });
  });
  it('persists a partial scan across checkpoint/recovery and an ordinary pause', () => {
    let now = 0;
    const scanned = at(
      hint(fresh(), ROW_GRACE_MS).state,
      { type: 'tick' },
      ROW_GRACE_MS + 200,
    ).state;
    const restored = JSON.parse(JSON.stringify(scanned)) as RunState;
    const session = createTimedRunSession(restored, PRACTICE_RNG, {
      monotonicNow: () => now,
      observedAt: restored.lastObservedAt,
    });
    now = 60000;
    session.releaseRecovery();
    expect(presentRowPressure(session.getState())).toMatchObject({
      paused: true,
      remainingMs: DEATH_CLOCK_MS,
    });
    const pause = session.hold('user');
    now += 60000;
    pause.release();
    expect(session.getState().activeTimeMs).toBe(restored.activeTimeMs);
    now += HINT_SCAN_MS - 200;
    session.tick();
    expect(presentRowPressure(session.getState())).toMatchObject({
      paused: false,
      remainingMs: DEATH_CLOCK_MS,
    });
    session.dispose();
  });
  it('retains v2 hint timing and rejects forged scan holds on historical or unknown rows', () => {
    const old = hint(fresh(PACED_RULESET_VERSION), ROW_GRACE_MS).state;
    expect(old.pacing?.hintScanStartedAt).toBeUndefined();
    expect(at(old, { type: 'tick' }, ROW_GRACE_MS + DEATH_CLOCK_MS).state.death?.cause).toBe(
      'idle',
    );
    expect(() =>
      assertRunState(
        { ...old, pacing: { ...old.pacing!, hintScanStartedAt: old.activeTimeMs } },
        PRACTICE_RNG,
      ),
    ).toThrow();
    const next = fresh();
    expect(() =>
      assertRunState({ ...next, pacing: { ...next.pacing!, hintScanStartedAt: 0 } }, PRACTICE_RNG),
    ).toThrow();
  });
});
