import { describe, expect, it } from 'vitest';
import {
  applyMysteryEffect,
  assertRunState,
  BALANCE_RULESET_VERSION,
  clampSp,
  createRun,
  createRunSession,
  getCurrentRow,
  getRowBandDamage,
  getRuleset,
  mergeEffect,
  rollMysteryEffect,
  transitionRun,
} from '../src/index.ts';
import type {
  ActiveEffect,
  EffectKind,
  PactOption,
  RandomCursor,
  RandomSource,
  RunCommand,
  RunState,
} from '../src/index.ts';

const rng: RandomSource = {
  algorithm: 'balance-fixture',
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
const version = BALANCE_RULESET_VERSION;
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
    life: 0,
    side: wrong ? (safe === 'left' ? 'right' : 'left') : safe,
  });
}
function sampleFor(kind: EffectKind) {
  const table = getRuleset(version).mysteryTable;
  let lower = 0;
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of table) {
    if (entry.kind === kind) return (lower + entry.weight / 2) / total;
    lower += entry.weight;
  }
  throw new Error('Missing fixture kind.');
}
function mystery(kind: EffectKind, sp = 100, nextRoll = 0.2) {
  let state = createRun(
    {
      runId: 'balance-test',
      rulesetVersion: version,
      routeRng: cursor(0),
      mysteryRng: cursor(sampleFor(kind), nextRoll),
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
  return act(state, { type: 'mystery', row: state.currentRow, life: 0 }).state;
}
const pact = (state: RunState, option: PactOption) =>
  act(state, { type: 'pact', row: state.currentRow, life: 0, option });
const effect = (kind: ActiveEffect['kind']) => applyMysteryEffect(kind, 0).addedEffect!;

describe('v3 uncapped SP, constant damage and explicit resource trades', () => {
  it('has no gameplay SP ceiling, preserves legacy ceilings, and uses 5 damage on every row', () => {
    expect(getRuleset(version).maxSp).toBeNull();
    expect(clampSp(50_000, version)).toBe(50_000);
    expect(clampSp(50_000)).toBe(400);
    expect(clampSp(-20, version)).toBe(0);
    for (const row of ['1', '10', '11', '25', '26', '10000', '900719925474099300'])
      expect(getRowBandDamage(row, version)).toBe(5);
    expect(mystery('heal_20', 5000).sp).toBe(5020);
    const state = mystery('heal_10', 1000);
    expect(step(state, true).state.sp).toBe(1005);
    expect(() => assertRunState({ ...state, rulesetVersion: 'infinity-v1' }, rng)).toThrow();
  });

  it('keeps a complete normalized mystery distribution and can draw all new results', () => {
    const table = getRuleset(version).mysteryTable;
    expect(table.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(100);
    expect(new Set(table.map((entry) => entry.kind)).size).toBe(table.length);
    for (const entry of table)
      expect(rollMysteryEffect(sampleFor(entry.kind), version)).toBe(entry.kind);
    expect(table.some((entry) => entry.kind === 'regen_5s' || entry.kind === 'drain_5s')).toBe(
      false,
    );
  });

  it('Second breath grants 6 after each of 3 survived rows and cannot rescue a fatal tile', () => {
    let state = mystery('regen_3rows');
    state = act(state, { type: 'tick' }, 60_000).state;
    expect(state.sp).toBe(100);
    expect(state.effects[0]).toMatchObject({ rowsLeft: 3 });
    state = step(state, true).state;
    expect(state.sp).toBe(101);
    expect(state.effects[0]).toMatchObject({ rowsLeft: 2 });
    state = step(state).state;
    expect(state.sp).toBe(107);
    state = step(state).state;
    expect(state.sp).toBe(113);
    expect(state.effects).toHaveLength(0);
    const fatal = step(mystery('regen_3rows', 5), true).state;
    expect(fatal.status).toBe('dead');
    expect(fatal.sp).toBe(0);
    expect(fatal.lastClearedRow).toBe('25');
  });

  it('bleeds 3 per choice, persists while idle, can kill on a safe tile, and bypasses Aegis', () => {
    let state = mystery('bleed_3rows');
    state = act(state, { type: 'tick' }, 60_000).state;
    expect(state.sp).toBe(100);
    state = step(state).state;
    expect(state.sp).toBe(97);
    state = step(state, true).state;
    expect(state.sp).toBe(89);
    state = step(state).state;
    expect(state.sp).toBe(86);
    expect(state.effects).toHaveLength(0);
    const fatal = step(mystery('bleed_3rows', 3)).state;
    expect(fatal.status).toBe('dead');
    expect(fatal.death?.cause).toBe('drain');
    expect(fatal.lastClearedRow).toBe('25');
    const shielded = {
      ...mystery('bleed_3rows'),
      effects: [effect('bleed_3rows'), effect('shield_5s')],
    };
    expect(step(shielded, true).state.sp).toBe(97);
  });

  it('sums simultaneous row healing and bleeding without a false intermediate death', () => {
    const state = {
      ...mystery('heal_10', 1),
      sp: 1,
      effects: [effect('regen_3rows'), effect('bleed_3rows')],
    };
    expect(step(state).state.sp).toBe(4);
    expect(step(state).state.status).toBe('playing');
  });

  it('doubles gains and damage for exactly 21 seconds and refreshes rather than stacks', () => {
    const boosted = mystery('double_gain_21s', 1000);
    expect(boosted.effects[0]).toMatchObject({ expiresAt: 21_000 });
    const lucky = { ...boosted, effects: [...boosted.effects, effect('lucky_5s')] };
    expect(step(lucky, true).state.sp).toBe(1010);
    expect(step(mystery('double_loss_21s'), true).state.sp).toBe(90);
    const expired = act(mystery('double_loss_21s'), { type: 'tick' }, 21_000).state;
    expect(step(expired, true).state.sp).toBe(95);
    const fresh = applyMysteryEffect('double_gain_21s', 1000).addedEffect;
    const effects = mergeEffect(boosted.effects, fresh, 1000, version);
    expect(effects).toHaveLength(1);
    expect(effects[0].expiresAt).toBe(22_000);
  });

  it('doubles row awards and bleeding, and composes with brittle damage', () => {
    const state = mystery('heal_10');
    expect(
      step({ ...state, effects: [effect('regen_3rows'), effect('double_gain_21s')] }).state.sp,
    ).toBe(122);
    expect(
      step({ ...state, effects: [effect('bleed_3rows'), effect('double_loss_21s')] }).state.sp,
    ).toBe(104);
    expect(
      step({ ...state, effects: [effect('fragility_5s'), effect('double_loss_21s')] }, true).state
        .sp,
    ).toBe(90);
  });

  it('Twisted fate repeatedly turns −5 into +5; Borrowed luck does so only once', () => {
    let twisted = mystery('inversion_5s');
    const first = step(twisted, true);
    expect(first.state.sp).toBe(105);
    expect(first.events.find((event) => event.type === 'choice-resolved')).toMatchObject({
      consumedKind: null,
    });
    twisted = step(first.state, true).state;
    expect(twisted.sp).toBe(110);
    expect(twisted.effects).toHaveLength(1);
    const lucky = step(mystery('lucky_5s'), true);
    expect(lucky.state.sp).toBe(105);
    expect(lucky.state.effects).toHaveLength(0);
    expect(lucky.events.find((event) => event.type === 'choice-resolved')).toMatchObject({
      consumedKind: 'lucky_5s',
    });
    expect(step(lucky.state, true).state.sp).toBe(100);
  });

  it.each([
    { sp: 100, after: 50 },
    { sp: 101, after: 50 },
    { sp: 2, after: 1 },
    { sp: 10000, after: 5000 },
  ])('sells precisely half of $sp for five hints', ({ sp, after }) => {
    const state = pact(mystery('half_life', sp), 'accept').state;
    expect(state.sp).toBe(after);
    expect(state.hints).toBe(7);
    expect(state.pact).toBeNull();
  });

  it('Half Life and Marketing can be declined for free, and cannot create hints or SP from nothing', () => {
    for (const kind of ['half_life', 'marketing'] as const) {
      expect(pact(mystery(kind), 'decline').state.sp).toBe(100);
    }
    expect(pact(mystery('half_life', 1), 'accept').reason).toBe('invalid-pact-choice');
    expect(pact({ ...mystery('marketing'), hints: 0 }, 'sell_one').reason).toBe(
      'invalid-pact-choice',
    );
  });

  it('sells one or all hints at exactly 20 SP and keeps prices fixed under modifiers', () => {
    const state = mystery('marketing', 1000);
    const one = pact(state, 'sell_one').state;
    expect(one.sp).toBe(1020);
    expect(one.hints).toBe(1);
    const all = pact({ ...state, hints: 5 }, 'sell_all').state;
    expect(all.sp).toBe(1100);
    expect(all.hints).toBe(0);
    const modified = { ...state, effects: [effect('double_gain_21s'), effect('double_loss_21s')] };
    expect(pact(modified, 'sell_one').state.sp).toBe(1020);
    const half = { ...mystery('half_life', 101), effects: modified.effects };
    expect(pact(half, 'accept').state.sp).toBe(50);
  });

  it('doubles both voluntary and automatic vault payouts while keeping loans and debt exact', () => {
    let vault = mystery('hungry_vault');
    vault = pact({ ...vault, effects: [effect('double_gain_21s')] }, 'accept').state;
    vault = step(vault).state;
    expect(pact(vault, 'cashout').state.sp).toBe(118);
    vault = step(vault).state;
    vault = step(vault).state;
    expect(vault.sp).toBe(258);
    let loan = mystery('borrowed_time', 1000);
    loan = pact(
      { ...loan, effects: [effect('double_gain_21s'), effect('double_loss_21s')] },
      'accept',
    ).state;
    expect(loan.sp).toBe(1050);
    loan = step(step(step(loan).state).state).state;
    expect(loan.sp).toBe(985);
  });

  it('persists row charges, 21-second timers and SP above 400 exactly', () => {
    const state = {
      ...mystery('regen_3rows', 5000),
      effects: [effect('regen_3rows'), effect('double_gain_21s')],
    };
    const advanced = step(state).state;
    const resumed = JSON.parse(JSON.stringify(advanced)) as RunState;
    expect(step(resumed)).toEqual(step(advanced));
    expect(act(resumed, { type: 'tick' }, 10_000).state.effects).toHaveLength(2);
  });

  it('delivers a trade once, even if the same callback is repeated', () => {
    const session = createRunSession(mystery('half_life'), rng);
    const accept = session.bind({ type: 'pact', option: 'accept' });
    expect(accept({ activeTimeMs: 0, achievedAt: 0 }).state.hints).toBe(7);
    expect(accept({ activeTimeMs: 0, achievedAt: 0 }).reason).toBe('command-consumed');
  });
});
