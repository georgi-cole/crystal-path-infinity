import { describe, expect, it } from 'vitest';
import {
  applyMysteryEffect,
  assertRunState,
  createPracticeCursor,
  createRun,
  createTimedRunSession,
  deathClockPaid,
  DIRECTOR_RULESET_VERSION,
  getCurrentRow,
  getDeathClock,
  getRuleset,
  hintSafeSide,
  mysteryEligibleKinds,
  mysteryTier,
  PRACTICE_RNG,
  prepareMysteryRow,
  rollMysteryEffect,
  transitionRun,
} from '../src/index.ts';
import type { EffectKind, MysteryTier, RunCommand, RunState } from '../src/index.ts';

const version = DIRECTOR_RULESET_VERSION;
function fresh(): RunState {
  return createRun(
    {
      runId: 'practice-director',
      rulesetVersion: version,
      routeRng: createPracticeCursor(53),
      mysteryRng: createPracticeCursor(91),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
}
function act(state: RunState, command: RunCommand, time = state.activeTimeMs) {
  const result = transitionRun(state, command, {
    activeTimeMs: time,
    achievedAt: time,
    rng: PRACTICE_RNG,
  });
  assertRunState(result.state, PRACTICE_RNG);
  return result;
}
function safeStep(state: RunState, time = state.activeTimeMs): RunState {
  const row = getCurrentRow(state);
  const changed = {
    ...row,
    safeSide: 'left' as const,
    risk: { ...row.risk!, broken: { left: false, right: false } },
  };
  const prepared = {
    ...state,
    rows: state.rows.map((r) =>
      r.index === row.index ? { ...changed, safeSide: hintSafeSide(changed)! } : r,
    ),
  };
  return act(prepared, { type: 'choose', row: state.currentRow, life: 0, side: 'left' }, time)
    .state;
}
function box(kind: EffectKind, base = fresh()): RunState {
  const tier = mysteryTier(kind);
  const state: RunState = {
    ...base,
    current: { ...base.current, mysteryTier: tier },
    mysteryDirector: { ...base.mysteryDirector!, nextRow: base.currentRow },
  };
  const eligible = mysteryEligibleKinds(state, tier);
  let seed = 1;
  while (
    rollMysteryEffect(
      PRACTICE_RNG.next(createPracticeCursor(seed)).value,
      version,
      true,
      eligible,
    ) !== kind
  ) {
    if (seed > 10000) throw new Error('Unavailable fixture.');
    seed += 1;
  }
  return prepareMysteryRow({ ...state, mysteryRng: createPracticeCursor(seed) }, PRACTICE_RNG);
}
function open(kind: EffectKind, base = fresh()) {
  const state = box(kind, base);
  return act(state, { type: 'mystery', row: state.currentRow, life: 0 }).state;
}

describe('mystery tiers, cooldowns and deterministic rhythm', () => {
  it('shows a tier before opening, only on arrival, with the usual box every five rows', () => {
    let state = fresh();
    for (let row = 1; row <= 15; row += 1) {
      expect(getCurrentRow(state).hasMystery).toBe(row % 5 === 0);
      expect(!!state.current.mysteryTier).toBe(row % 5 === 0);
      expect(
        state.rows
          .filter((r) => r.index !== getCurrentRow(state).index)
          .every((r) => !r.hasMystery),
      ).toBe(true);
      state = safeStep(state, row * 500);
    }
  });

  it('keeps a spawned tier stable while ticking, hinting, saving or changing resources', () => {
    const state = box('half_life');
    const later = act(state, { type: 'tick' }, 2000).state;
    const restored = JSON.parse(JSON.stringify(later)) as RunState;
    const repeated = act(restored, { type: 'hint', row: '1', life: 0 }, 2100).state;
    expect(repeated.current.mysteryTier).toBe('major');
    expect(repeated.mysteryRng).toEqual(state.mysteryRng);
  });

  it('enforces both row and time cooldowns for Half Life, plus the shared major-pact cooldown', () => {
    const initial = open('half_life');
    expect(initial.mysteryDirector!.history).toEqual([{ kind: 'half_life', row: '1', at: 0 }]);
    const at = (rows: number, now: number): RunState => ({
      ...initial,
      pact: null,
      currentRow: String(rows),
      activeTimeMs: now,
    });
    expect(mysteryEligibleKinds(at(60, 180000), 'major')).not.toContain('half_life');
    expect(mysteryEligibleKinds(at(61, 179999), 'major')).not.toContain('half_life');
    expect(mysteryEligibleKinds(at(61, 180000), 'major')).toContain('half_life');
    expect(mysteryEligibleKinds(at(30, 90000), 'major')).toEqual([]);
    expect(mysteryEligibleKinds(at(31, 90000), 'major')).toContain('blood_oath');
  });

  it('starts cooldowns on opening even after free refusal and prevents consecutive ordinary repeats', () => {
    let state = open('marketing');
    state = act(state, { type: 'pact', row: '1', life: 0, option: 'decline' }).state;
    expect(state.mysteryDirector!.history[0].kind).toBe('marketing');
    expect(
      mysteryEligibleKinds({ ...state, currentRow: '20', activeTimeMs: 30000 }, 'choice'),
    ).not.toContain('marketing');
    expect(
      mysteryEligibleKinds({ ...state, currentRow: '21', activeTimeMs: 30000 }, 'choice'),
    ).toContain('marketing');
    const standard = open('heal_10');
    expect(mysteryEligibleKinds({ ...standard, currentRow: '6' }, 'standard')).not.toContain(
      'heal_10',
    );
    expect(mysteryEligibleKinds({ ...standard, currentRow: '11' }, 'standard')).toContain(
      'heal_10',
    );
  });

  it('keeps active contracts intact and never offers another choice while a pact is active', () => {
    const offered = open('borrowed_time');
    let state = act(offered, { type: 'pact', row: '1', life: 0, option: 'accept' }).state;
    expect(mysteryEligibleKinds(state, 'major')).toEqual([]);
    expect(mysteryEligibleKinds(state, 'choice')).toEqual([]);
    state = safeStep(state, 1000);
    expect(state.pact?.rowsLeft).toBe(2);
  });

  it('always gives a genuinely fair 50/50 split inside a violet box', () => {
    const state = box('mystery_silence_30s');
    const kinds = mysteryEligibleKinds(state, 'anomaly');
    expect(kinds).toEqual(['mystery_silence_30s', 'mystery_surge_30s']);
    expect(rollMysteryEffect(0.499999, version, true, kinds)).toBe('mystery_silence_30s');
    expect(rollMysteryEffect(0.5, version, true, kinds)).toBe('mystery_surge_30s');
  });

  it.each(['mystery_silence_30s', 'mystery_surge_30s'] as const)(
    'applies %s immediately, then returns to five-row spacing without backfill',
    (kind) => {
      let state = open(kind);
      expect(state.mysteryDirector!.rhythm?.expiresAt).toBe(30000);
      const appeared: number[] = [];
      for (let i = 1; i < 30; i += 1) {
        state = safeStep(state, i * 1000);
        if (state.current.mysteryTier) appeared.push(Number(state.currentRow));
      }
      if (kind === 'mystery_silence_30s') expect(appeared).toEqual([]);
      else expect(appeared).toEqual([4, 7, 10, 13, 16, 19, 22, 25, 28]);
      state = safeStep(state, 30000);
      expect(state.mysteryDirector!.rhythm).toBeNull();
      expect(state.mysteryDirector!.nextRow).toBe('35');
    },
  );

  it('rejects malformed cooldown ledgers and makes tier metadata part of the versioned contract', () => {
    const state = fresh();
    expect(() => assertRunState({ ...state, mysteryDirector: undefined })).toThrow();
    expect(() =>
      assertRunState({
        ...state,
        mysteryDirector: {
          ...state.mysteryDirector!,
          history: [{ kind: 'half_life', row: '2', at: 1 }],
        },
      }),
    ).toThrow();
    expect(() =>
      assertRunState({
        ...state,
        current: { ...state.current, mysteryTier: 'reward' as MysteryTier },
      }),
    ).toThrow();
    expect(getRuleset(version).mysteryTable).toHaveLength(24);
  });
});

describe('three-second idle grace and progressive ten-second death clock', () => {
  it('recalculates the remaining drain after early debt payment without extending the deadline', () => {
    let state = open('borrowed_time', { ...fresh(), sp: 100 });
    state = act(state, { type: 'pact', row: '1', life: 0, option: 'accept' }).state;
    state = safeStep(state);
    state = act(state, { type: 'tick' }, 8000).state;
    expect(state.sp).toBe(120);
    const paid = act(state, {
      type: 'pact',
      row: state.currentRow,
      life: 0,
      option: 'settle',
    }).state;
    expect(paid.sp).toBe(65);
    expect(paid.mysteryDirector!.pressure?.anchorSp).toBe(65);
    expect(getDeathClock(paid)?.expiresAt).toBe(13000);
    expect(act(paid, { type: 'tick' }, 10000).state.sp).toBe(47);
  });

  it('excludes manual/background pause time and keeps the same unfinished decision after recovery', () => {
    let now = 0;
    const session = createTimedRunSession(
      open('half_life', { ...fresh(), sp: 100 }),
      PRACTICE_RNG,
      { monotonicNow: () => now },
    );
    session.releaseRecovery();
    now = 60000;
    expect(session.tick().state.sp).toBe(100);
    const pause = session.hold('user');
    const background = session.hold('background');
    now = 600000;
    pause.release();
    background.release();
    expect(session.getState().activeTimeMs).toBe(60000);
    now = 605000;
    expect(session.tick().state.sp).toBe(80);
    expect(session.getState().pact?.offeredAt).toBe(0);
    expect(getDeathClock(session.getState())?.expiresAt).toBe(70000);
  });

  it('redistributes a healing mystery over the remaining curve without extending the deadline', () => {
    const prepared = box('heal_20', { ...fresh(), sp: 100 });
    const healed = act(prepared, { type: 'mystery', row: '1', life: 0 }, 8000).state;
    expect(healed.sp).toBe(100);
    expect(getDeathClock(healed)?.expiresAt).toBe(13000);
    expect(act(healed, { type: 'tick' }, 13000).state.sp).toBe(0);
    expect(healed.mysteryDirector!.pressure?.anchorSp).toBe(100);
  });

  it('uses a smooth 20% / 80% curve and preserves small and huge SP totals exactly', () => {
    expect(deathClockPaid(1000, 3000, 3000, 8000)).toBe(200);
    expect(deathClockPaid(1000, 3000, 3000, 13000)).toBe(1000);
    const payments = Array.from({ length: 11 }, (_, i) =>
      deathClockPaid(1000, 3000, 3000, 3000 + i * 1000),
    );
    expect(payments.slice(1).every((value, i) => value >= payments[i])).toBe(true);
    expect(payments[9] - payments[8]).toBeGreaterThan(payments[2] - payments[1]);
    expect(deathClockPaid(Number.MAX_SAFE_INTEGER, 0, 0, 5000)).toBe(
      Number(BigInt(Number.MAX_SAFE_INTEGER) / 5n),
    );
    expect(deathClockPaid(1, 0, 0, 9900)).toBe(0);
  });

  it('starts after three seconds, loses exactly 20% halfway and dies at zero at the ten-second boundary', () => {
    const state = { ...fresh(), sp: 100 };
    expect(act(state, { type: 'tick' }, 3000).state.sp).toBe(100);
    const half = act(state, { type: 'tick' }, 8000).state;
    expect(half.sp).toBe(80);
    expect(half.status).toBe('playing');
    const dead = act(half, { type: 'tick' }, 13000).state;
    expect(dead.sp).toBe(0);
    expect(dead.death).toMatchObject({ cause: 'death_clock', activeTimeMs: 13000, fatalRow: '1' });
    expect(dead.lastClearedRow).toBe('0');
    expect(act(state, { type: 'choose', side: 'left', row: '1', life: 0 }, 13000).reason).toBe(
      'died-before-command',
    );
  });

  it('stops on a real tile choice without refunding spent SP, while hints do not reset it', () => {
    const state = { ...fresh(), sp: 100 };
    const half = act(state, { type: 'tick' }, 8000).state;
    const chosen = safeStep(half, 8000);
    expect(chosen.sp).toBe(80);
    expect(getDeathClock(chosen)).toEqual({ warningAt: 11000, expiresAt: 21000 });
    expect(act(chosen, { type: 'tick' }, 10000).state.sp).toBe(80);
    const hinted = act(state, { type: 'hint', row: '1', life: 0 }, 1000).state;
    expect(getDeathClock(hinted)).toEqual({ warningAt: 3000, expiresAt: 13000 });
  });

  it('is identical after a long clock jump or many small ticks and survives checkpoint recovery', () => {
    const state = { ...fresh(), sp: 12345 };
    const direct = act(state, { type: 'tick' }, 11100).state;
    let incremental = state as RunState;
    for (let time = 100; time <= 11100; time += 100)
      incremental = act(incremental, { type: 'tick' }, time).state;
    expect(incremental).toEqual(direct);
    const restored = JSON.parse(JSON.stringify(incremental)) as RunState;
    expect(act(restored, { type: 'tick' }, 12000)).toEqual(act(direct, { type: 'tick' }, 12000));
    const jumped = act(state, { type: 'tick' }, 1000000);
    expect(jumped.state.activeTimeMs).toBe(13000);
    expect(jumped.events.length).toBeLessThan(110);
  });

  it('gives an offered choice a full minute, freezes effects, then drains over ten seconds', () => {
    const state = open('half_life', {
      ...fresh(),
      sp: 100,
      effects: [applyMysteryEffect('coyote_10s', 0).addedEffect!],
    });
    expect(getDeathClock(state)).toEqual({ warningAt: 60000, expiresAt: 70000 });
    const waiting = act(state, { type: 'tick' }, 60000).state;
    expect(waiting.sp).toBe(100);
    expect(waiting.effects[0].expiresAt).toBe(70000);
    const pressured = act(waiting, { type: 'tick' }, 65000).state;
    expect(pressured.sp).toBe(80);
    const accepted = act(pressured, { type: 'pact', row: '1', life: 0, option: 'accept' }).state;
    expect(accepted.sp).toBe(40);
    expect(accepted.hints).toBe(7);
    expect(getDeathClock(accepted)).toEqual({ warningAt: 68000, expiresAt: 78000 });
    expect(act(pressured, { type: 'tick' }, 70000).state.status).toBe('dead');
  });

  it('opening a contract during an active death clock starts the grace once and cannot refresh it', () => {
    const prepared = box('half_life', { ...fresh(), sp: 100 });
    const offered = act(prepared, { type: 'mystery', row: '1', life: 0 }, 8000).state;
    expect(offered.sp).toBe(80);
    expect(offered.mysteryDirector!.pressure).toBeUndefined();
    expect(getDeathClock(offered)).toEqual({ warningAt: 68000, expiresAt: 78000 });
    const duplicate = act(offered, { type: 'mystery', row: '1', life: 0 }, 9000);
    expect(duplicate.reason).toBe('pact-decision-required');
    expect(duplicate.state.pact!.offeredAt).toBe(8000);
    expect(act(offered, { type: 'tick' }, 73000).state.sp).toBe(64);
  });
});
