import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  createRun,
  createRunSession,
  getCurrentRow,
  getRuleset,
  PACT_KINDS,
  PACT_RULESET_VERSION,
  rollMysteryEffect,
  transitionRun,
} from '../src/index.ts';
import type {
  EffectKind,
  PactKind,
  PactOption,
  RandomCursor,
  RandomSource,
  RunCommand,
  RunState,
} from '../src/index.ts';

const rng: RandomSource = {
  algorithm: 'pact-fixture',
  next(cursor) {
    const values = JSON.parse(cursor.state) as number[];
    return {
      value: values[Math.min(Number(cursor.draws), values.length - 1)],
      cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
    };
  },
};
const cursor = (...values: number[]): RandomCursor => ({
  algorithm: rng.algorithm,
  state: JSON.stringify(values),
  draws: '0',
});
function act(state: RunState, command: RunCommand, time = state.activeTimeMs) {
  const result = transitionRun(state, command, { activeTimeMs: time, achievedAt: time, rng });
  assertRunState(result.state, rng);
  return result;
}
function step(state: RunState, wrong = false) {
  const safe = getCurrentRow(state).safeSide;
  return act(state, {
    type: 'choose',
    row: state.currentRow,
    life: state.revivesApplied,
    side: wrong ? (safe === 'left' ? 'right' : 'left') : safe,
  });
}
function choose(state: RunState, option: PactOption) {
  return act(state, { type: 'pact', option, row: state.currentRow, life: state.revivesApplied });
}
function offer(kind: PactKind, sp = 100, subsequent = 0.2) {
  const sample = 0.82 + PACT_KINDS.indexOf(kind) * 0.04;
  let state = createRun(
    {
      runId: 'pact-test',
      rulesetVersion: PACT_RULESET_VERSION,
      routeRng: cursor(0),
      mysteryRng: cursor(sample, subsequent),
      observedAt: 0,
    },
    rng,
  );
  for (let i = 0; i < 25; i += 1) state = step(state).state;
  const index = getCurrentRow(state).index;
  state = {
    ...state,
    sp,
    rows: state.rows.map((row) => (row.index === index ? { ...row, hasMystery: true } : row)),
  };
  const result = act(state, { type: 'mystery', row: state.currentRow, life: 0 });
  expect(result.state.pact?.kind).toBe(kind);
  return result.state;
}

describe('versioned forbidden mystery pacts', () => {
  it('preserves every legacy probability and reserves exactly 4% for each new pact', () => {
    expect(getRuleset().mysteryTable.reduce((sum, entry) => sum + entry.weight, 0)).toBe(100);
    expect(
      getRuleset(PACT_RULESET_VERSION).mysteryTable.reduce((sum, entry) => sum + entry.weight, 0),
    ).toBeCloseTo(100);
    for (let bin = 0; bin < 100; bin += 1)
      expect(PACT_KINDS).not.toContain(rollMysteryEffect((bin + 0.5) / 100));
    const frequencies = new Map<EffectKind, number>();
    for (let bin = 0; bin < 10_000; bin += 1) {
      const kind = rollMysteryEffect((bin + 0.5) / 10_000, PACT_RULESET_VERSION);
      frequencies.set(kind, (frequencies.get(kind) ?? 0) + 1);
    }
    for (const kind of PACT_KINDS) expect(frequencies.get(kind)).toBe(400);
    for (let bin = 0; bin < 100; bin += 1)
      expect(PACT_KINDS).not.toContain(
        rollMysteryEffect((bin + 0.5) / 100, PACT_RULESET_VERSION, false),
      );
  });

  it.each(PACT_KINDS)(
    'requires an explicit decision for %s; mystery cannot be rerolled',
    (kind) => {
      const state = offer(kind);
      expect(step(state).reason).toBe('pact-decision-required');
      expect(act(state, { type: 'hint', row: state.currentRow, life: 0 }).reason).toBe(
        'pact-decision-required',
      );
      expect(act(state, { type: 'mystery', row: state.currentRow, life: 0 }).reason).toBe(
        'pact-decision-required',
      );
      expect(state.currentRow).toBe('26');
    },
  );

  it('holds old effect timers while a contract is read, including after save/resume', () => {
    const state: RunState = {
      ...offer('blood_oath'),
      effects: [{ kind: 'drain_5s', startedAt: 0, expiresAt: 5000, nextTickAt: 500 }],
    };
    const waited = act(
      JSON.parse(JSON.stringify(state)) as RunState,
      { type: 'tick' },
      60_000,
    ).state;
    expect(waited.sp).toBe(100);
    expect(waited.effects[0]).toMatchObject({
      startedAt: 60_000,
      expiresAt: 65_000,
      nextTickAt: 60_500,
    });
    const accepted = choose(waited, 'accept').state;
    expect(act(accepted, { type: 'tick' }, 60_500).state.sp).toBe(133);
  });

  it('blood pays upfront, amplifies real wrong damage, and cannot be waited away', () => {
    let state = choose(offer('blood_oath'), 'accept').state;
    expect(state.sp).toBe(135);
    state = act(state, { type: 'tick' }, 50_000).state;
    expect(state.pact?.rowsLeft).toBe(3);
    state = step(state, true).state;
    expect(state.sp).toBe(100);
    state = step(state).state;
    state = step(state).state;
    expect(state.pact).toBeNull();
  });

  it('blood respects an Aegis block and a healing inversion', () => {
    const accepted = choose(offer('blood_oath'), 'accept').state;
    const shielded: RunState = {
      ...accepted,
      effects: [{ kind: 'shield_5s', startedAt: 0, expiresAt: 5000, nextTickAt: null }],
    };
    expect(step(shielded, true).state.sp).toBe(135);
    const inverted: RunState = {
      ...accepted,
      effects: [{ kind: 'inversion_5s', startedAt: 0, expiresAt: 5000, nextTickAt: null }],
    };
    expect(step(inverted, true).state.sp).toBe(145);
  });

  it.each([
    { sample: 0.699999, truthful: true },
    { sample: 0.7, truthful: false },
    { sample: 0.99, truthful: false },
  ])('the oracle can lie at sample $sample', ({ sample, truthful }) => {
    const state = choose(offer('false_oracle', 100, sample), 'accept').state;
    expect(state.pact?.omen === getCurrentRow(state).safeSide).toBe(truthful);
    expect(act(state, { type: 'hint', row: state.currentRow, life: 0 }).reason).toBe(
      'oracle-blocks-hints',
    );
    const correct = step(state).state;
    expect(correct.sp).toBe(105);
    expect(correct.pact?.rowsLeft).toBe(2);
    expect(correct.mysteryRng.draws).toBe('3');
    expect(step(state, true).state.sp).toBe(60);
  });

  it('does not sell a certain oracle prediction on an already revealed row', () => {
    const offered = offer('false_oracle');
    const state: RunState = {
      ...offered,
      current: { ...offered.current, revealedSafeSide: getCurrentRow(offered).safeSide },
    };
    expect(choose(state, 'accept').reason).toBe('invalid-pact-choice');
    expect(choose(state, 'decline').state.hints).toBe(1);
    expect(choose({ ...offered, hints: 0 }, 'decline').state.sp).toBe(85);
  });

  it('vault success grows an uncredited bank, cashout is one-time and three successes pay 85', () => {
    let state = choose(offer('hungry_vault'), 'accept').state;
    expect(state.sp).toBe(88);
    expect(choose(state, 'cashout').reason).toBe('invalid-pact-choice');
    state = step(state).state;
    expect(state.sp).toBe(88);
    expect(state.pact?.bank).toBe(15);
    const cashout = choose(state, 'cashout').state;
    expect(cashout.sp).toBe(103);
    expect(choose(cashout, 'cashout').reason).toBe('invalid-pact-choice');
    state = step(state).state;
    expect(state.pact?.bank).toBe(40);
    state = step(state).state;
    expect(state.pact).toBeNull();
    expect(state.sp).toBe(173);
  });

  it('a wrong vault tile destroys the whole bank and charges a separate 10-SP fee', () => {
    let state = choose(offer('hungry_vault'), 'accept').state;
    state = step(state).state;
    state = step(state).state;
    const lost = step(state, true).state;
    expect(lost.pact).toBeNull();
    expect(lost.sp).toBe(58);
    const shielded: RunState = {
      ...state,
      effects: [{ kind: 'shield_5s', startedAt: 0, expiresAt: 5000, nextTickAt: null }],
    };
    expect(step(shielded, true).state.sp).toBe(78);
  });

  it('borrowed tomorrow collects 65 on the third step and early settlement costs 55', () => {
    let state = choose(offer('borrowed_time'), 'accept').state;
    expect(state.sp).toBe(150);
    expect(choose(state, 'settle').reason).toBe('invalid-pact-choice');
    state = step(state).state;
    expect(choose(state, 'settle').state.sp).toBe(95);
    state = step(state).state;
    state = step(state).state;
    expect(state.sp).toBe(85);
    expect(state.pact).toBeNull();
  });

  it('debt is not reduced by healing overflow, and fatal debt earns no completed row', () => {
    const capped = choose(offer('borrowed_time', 395), 'accept').state;
    expect(capped.sp).toBe(400);
    let state = choose(offer('borrowed_time', 15), 'accept').state;
    state = step(state).state;
    state = step(state).state;
    state = step(state).state;
    expect(state.sp).toBe(0);
    expect(state.status).toBe('dead');
    expect(state.pact).toBeNull();
    expect(state.lastClearedRow).toBe('27');
    expect(state.death?.cause).toBe('mystery');
  });

  it.each([
    { sample: 0.64, hints: 2, sp: 75 },
    { sample: 0.65, hints: 1, sp: 60 },
  ])('soul/SP trade samples actual 65% boundary $sample', ({ sample, hints, sp }) => {
    const result = choose({ ...offer('soul_exchange', 100, sample), hints: 0 }, 'sp').state;
    expect(result.hints).toBe(hints);
    expect(result.sp).toBe(sp);
    expect(result.pact).toBeNull();
  });

  it.each([
    { sample: 0.64, sp: 140 },
    { sample: 0.65, sp: 70 },
  ])('soul/hint trade has both outcomes at $sample', ({ sample, sp }) => {
    const result = choose(offer('soul_exchange', 100, sample), 'hint').state;
    expect(result.sp).toBe(sp);
    expect(result.hints).toBe(1);
    expect(choose({ ...offer('soul_exchange'), hints: 0 }, 'hint').reason).toBe(
      'invalid-pact-choice',
    );
  });

  it('a fatal sacrifice or refusal cannot be healed or awarded hints afterwards', () => {
    const state = offer('soul_exchange', 25);
    const dead = choose(state, 'sp').state;
    expect(dead.status).toBe('dead');
    expect(dead.hints).toBe(2);
    expect(dead.mysteryRng.draws).toBe(state.mysteryRng.draws);
    expect(choose(offer('blood_oath', 8), 'decline').state.status).toBe('dead');
    expect(choose(offer('hungry_vault', 12), 'accept').state.status).toBe('dead');
    expect(choose(offer('soul_exchange', 20, 0.8), 'hint').state.status).toBe('dead');
  });

  it('cannot overwrite active debt with another random pact', () => {
    let state = choose(offer('borrowed_time'), 'accept').state;
    const index = getCurrentRow(state).index;
    state = {
      ...state,
      current: { ...state.current, mysteryOutcome: null },
      rows: state.rows.map((row) => (row.index === index ? { ...row, hasMystery: true } : row)),
    };
    const result = act(state, { type: 'mystery', row: state.currentRow, life: 0 }).state;
    expect(result.pact).toEqual(state.pact);
    expect(PACT_KINDS).not.toContain(result.current.mysteryOutcome);
  });

  it.each(PACT_KINDS.filter((kind) => kind !== 'soul_exchange'))(
    'resumes %s without rerolling its contract or future',
    (kind) => {
      let state = choose(offer(kind), 'accept').state;
      state = step(state).state;
      const resumed = JSON.parse(JSON.stringify(state)) as RunState;
      expect(step(resumed)).toEqual(step(state));
      expect(choose(resumed, 'decline').reason).toBe('invalid-pact-choice');
    },
  );

  it('binds pact actions to a single row/life and rejects duplicate deliveries', () => {
    const initial = offer('blood_oath');
    const session = createRunSession(initial, rng);
    const accept = session.bind({ type: 'pact', option: 'accept' });
    expect(accept({ activeTimeMs: 0, achievedAt: 0 }).state.sp).toBe(135);
    expect(accept({ activeTimeMs: 0, achievedAt: 0 }).reason).toBe('command-consumed');
    const stale = session.bind({ type: 'pact', option: 'decline' });
    session.bind({ type: 'choose', side: 'left' })({ activeTimeMs: 0, achievedAt: 0 });
    expect(stale({ activeTimeMs: 0, achievedAt: 0 }).reason).toBe('stale-command');
  });

  it('rejects malformed, unsupported and impossible checkpoint contracts', () => {
    const state = offer('blood_oath');
    expect(() => assertRunState({ ...state, rulesetVersion: 'infinity-v1' }, rng)).toThrow();
    expect(() =>
      assertRunState({ ...state, pact: { ...state.pact!, rowsLeft: 99 } }, rng),
    ).toThrow();
    expect(() =>
      assertRunState(
        {
          ...state,
          pact: { kind: 'hungry_vault', phase: 'active', rowsLeft: 2, bank: 85, omen: null },
        },
        rng,
      ),
    ).toThrow();
  });
});
