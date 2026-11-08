import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  BUSINESS_RULESET_VERSION,
  BUSINESS_STORE_RULESET_VERSION,
  CLASSIC_STORE_RULESET_VERSION,
  createPracticeCursor,
  createRun,
  deathClockPaid,
  getCurrentRow,
  getDeathClock,
  getRuleset,
  marketingSale,
  offerPact,
  parseTileExperiment,
  PRACTICE_RNG,
  rollMysteryEffect,
  tileExperimentVersion,
  transitionRun,
} from '../src/index.ts';
import type { RunState, RunCommand, EffectKind } from '../src/index.ts';

function fresh(version = BUSINESS_STORE_RULESET_VERSION): RunState {
  return createRun(
    {
      runId: 'practice-business',
      rulesetVersion: version,
      routeRng: createPracticeCursor(714),
      mysteryRng: createPracticeCursor(391),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
}
function act(state: RunState, command: RunCommand, now = state.activeTimeMs) {
  const result = transitionRun(state, command, {
    rng: PRACTICE_RNG,
    activeTimeMs: now,
    achievedAt: now,
  });
  assertRunState(result.state, PRACTICE_RNG);
  return result;
}
function resource(state: RunState, kind: 'sp' | 'hints', amount = 1) {
  const result = act(state, {
    type: 'test-resource',
    resource: kind,
    amount,
    sequence: state.storeTest!.sequence + 1,
  });
  expect(result.accepted).toBe(true);
  return result.state;
}
function market(state: RunState): RunState {
  return {
    ...state,
    pact: { ...offerPact('marketing'), offeredAt: state.activeTimeMs },
    current: { ...state.current, mysteryOutcome: 'marketing', mysteryTier: 'choice' },
  };
}
function sell(state: RunState, option: 'sell_all' | 'sell_one' = 'sell_all') {
  return act(market(state), {
    type: 'pact',
    option,
    row: state.currentRow,
    life: state.revivesApplied,
  });
}
function withBox(state: RunState, kind: EffectKind): RunState {
  let seed = 1;
  const eligible = getRuleset(state.rulesetVersion)
    .mysteryTable.filter((e) =>
      [
        'heal_10',
        'heal_20',
        'hurt_10',
        'hurt_15',
        'gain_hint',
        'lose_hint',
        'shield_5s',
        'regen_3rows',
        'lucky_5s',
        'fragility_5s',
        'bleed_3rows',
        'inversion_5s',
        'double_gain_21s',
        'double_loss_21s',
        'coyote_10s',
      ].includes(e.kind),
    )
    .map((e) => e.kind);
  while (
    rollMysteryEffect(
      PRACTICE_RNG.next(createPracticeCursor(seed)).value,
      state.rulesetVersion,
      true,
      eligible,
    ) !== kind
  )
    seed++;
  const index = getCurrentRow(state).index;
  return {
    ...state,
    mysteryRng: createPracticeCursor(seed),
    rows: state.rows.map((r) => (r.index === index ? { ...r, hasMystery: true } : r)),
    current: { ...state.current, mysteryOutcome: null, mysteryTier: 'standard' },
  };
}

describe('business playtest clock and resource economy', () => {
  it('warns at 3s, stays free through two clock seconds, and takes exactly 0.5 at the third', () => {
    let state = fresh();
    expect(getDeathClock(state)).toEqual({ warningAt: 3000, firstLossAt: 6000, expiresAt: 13000 });
    state = act(state, { type: 'tick' }, 5999).state;
    expect(state.sp).toBe(300);
    const first = act(state, { type: 'tick' }, 6000);
    expect(first.state.sp).toBe(299.5);
    expect(first.events.filter((e) => e.type === 'death-clock-ticked')).toMatchObject([
      { delta: -0.5 },
    ]);
    const dead = act(first.state, { type: 'tick' }, 13000).state;
    expect(dead.sp).toBe(0);
    expect(dead.death?.cause).toBe('death_clock');
  });
  it('keeps accelerated loss deterministic for coarse ticks and half-point budgets', () => {
    const initial = { ...fresh(), sp: 100.5 };
    let fine = initial;
    for (let now = 100; now <= 11700; now += 100) fine = act(fine, { type: 'tick' }, now).state;
    expect(fine).toEqual(act(initial, { type: 'tick' }, 11700).state);
    expect(deathClockPaid(100.5, 3000, 3000, 6000, BUSINESS_RULESET_VERSION)).toBe(0.5);
    expect(deathClockPaid(0.5, 3000, 3000, 6000, BUSINESS_RULESET_VERSION)).toBe(0.5);
  });
  it('gives a successful hint a fresh window but cannot be extended by repeated clicks', () => {
    const initial = fresh();
    const hinted = act(initial, { type: 'hint', row: '1', life: 0 }, 5000).state;
    expect(hinted.sp).toBe(300);
    expect(getDeathClock(hinted)?.firstLossAt).toBe(11000);
    const repeat = act(hinted, { type: 'hint', row: '1', life: 0 }, 5100);
    expect(repeat.reason).toBe('already-revealed');
    expect(getDeathClock(repeat.state)?.firstLossAt).toBe(11000);
    expect(act(repeat.state, { type: 'tick' }, 11000).state.sp).toBe(299.5);
  });
  it('also gives a both-broken hint result reading time once', () => {
    const initial = fresh(tileExperimentVersion(100, 100, true, true));
    const hinted = act(initial, { type: 'hint', row: '1', life: 0 }, 5000).state;
    expect(hinted.current.noSafeTile).toBe(true);
    expect(getDeathClock(hinted)?.firstLossAt).toBe(11000);
    expect(act(hinted, { type: 'hint', row: '1', life: 0 }, 5100).reason).toBe('already-revealed');
  });
  it('redistributes SP refills over the remaining clock without extending its deadline', () => {
    const active = act(fresh(), { type: 'tick' }, 8000).state;
    const topped = resource(active, 'sp', 100);
    expect(topped.sp).toBe(active.sp + 100);
    expect(getDeathClock(topped)?.expiresAt).toBe(13000);
    expect(act(topped, { type: 'tick' }, 13000).state.sp).toBe(0);
  });
  it('refreshes reading time on a repeat reward without introducing it again', () => {
    const initial = withBox(
      { ...fresh(), discovery: { known: ['heal_10'], introduction: null } },
      'heal_10',
    );
    const reward = act(initial, { type: 'mystery', row: '1', life: 0 }, 5000).state;
    expect(reward.sp).toBe(310);
    expect(reward.discovery?.introduction).toBeNull();
    expect(getDeathClock(reward)?.firstLossAt).toBe(11000);
    expect(act(reward, { type: 'mystery', row: '1', life: 0 }, 5100).reason).toBe(
      'mystery-consumed',
    );
  });
  it('counts purchased-hint conversions in the same 200 SP reserve allowance', () => {
    let state = fresh();
    for (let i = 0; i < 20; i++) state = resource(state, 'hints');
    expect(marketingSale(state)).toEqual({ count: 12, paidCount: 10, sp: 240 });
    const sold = sell(state);
    expect(sold.accepted).toBe(true);
    expect(sold.state.sp).toBe(540);
    expect(sold.state.hints).toBe(10);
    expect(sold.state.storeTest).toMatchObject({
      reserveSpent: 200,
      convertedHintSp: 200,
      paidHints: 10,
      hintsSpent: 20,
      assisted: true,
    });
    expect(sell(sold.state, 'sell_one').reason).toBe('invalid-pact-choice');
    expect(
      act(sold.state, { type: 'test-resource', resource: 'sp', amount: 1, sequence: 21 }).reason,
    ).toBe('resource-limit');
  });
  it('shares a partially used budget and still allows all free hints to trade', () => {
    let state = resource(fresh(), 'sp', 100);
    for (let i = 0; i < 10; i++) state = resource(state, 'hints');
    const sold = sell(state).state;
    expect(sold.hints).toBe(5);
    expect(sold.storeTest?.convertedHintSp).toBe(100);
    expect(sold.storeTest?.reserveSpent).toBe(200);
    const free = { ...sold, hints: sold.hints + 5 };
    expect(marketingSale(free)).toEqual({ count: 5, paidCount: 0, sp: 100 });
    expect(sell(free).state.storeTest?.reserveSpent).toBe(200);
  });
  it('consumes purchased stock when a hint is used or lost, without labelling new gifts as paid', () => {
    const state = resource(fresh(), 'hints');
    const used = act(state, { type: 'hint', row: '1', life: 0 }).state;
    expect(used.storeTest?.paidHints).toBe(0);
    expect(used.hints).toBe(2);
    const lost = act(withBox(state, 'lose_hint'), { type: 'mystery', row: '1', life: 0 }).state;
    expect(lost.storeTest?.paidHints).toBe(0);
    expect(lost.hints).toBe(2);
    const gift = act(withBox(state, 'gain_hint'), { type: 'mystery', row: '1', life: 0 }).state;
    expect(gift.storeTest?.paidHints).toBe(1);
    expect(gift.hints).toBe(4);
  });
  it('keeps historical v9 clocks and trades unchanged and distinguishes new experimental runs', () => {
    let old = fresh(CLASSIC_STORE_RULESET_VERSION);
    expect(act(old, { type: 'tick' }, 6000).state.sp).toBeLessThan(299.5);
    for (let i = 0; i < 20; i++) old = resource(old, 'hints');
    expect(sell(old).state.sp).toBe(740);
    expect(sell(old).state.storeTest?.reserveSpent).toBe(0);
    expect(parseTileExperiment(tileExperimentVersion(80, 1, true, true))).toMatchObject({
      business: true,
      highBreakPercent: 80,
      lowBreakPercent: 1,
    });
    expect(parseTileExperiment(tileExperimentVersion(80, 1, true))).not.toHaveProperty('business');
  });
});
