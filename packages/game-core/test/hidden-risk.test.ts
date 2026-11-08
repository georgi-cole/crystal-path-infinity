import { describe, expect, it } from 'vitest';
import {
  applyMysteryEffect,
  assertRunState,
  BALANCE_RULESET_VERSION,
  createPracticeCursor,
  createRowStream,
  createRun,
  getCurrentRow,
  getRuleset,
  hintSafeSide,
  isBrokenTile,
  mergeEffect,
  offerPact,
  PRACTICE_RNG,
  RISK_RULESET_VERSION,
  rollMysteryEffect,
  takeRows,
  transitionRun,
} from '../src/index.ts';
import type {
  ActiveEffect,
  BridgeRow,
  RandomCursor,
  RandomSource,
  RunCommand,
  RunState,
  TileSide,
} from '../src/index.ts';

const version = RISK_RULESET_VERSION;
const scripted: RandomSource = {
  algorithm: 'risk-fixture',
  next(cursor) {
    const values = JSON.parse(cursor.state) as number[];
    return {
      value: values[Number(cursor.draws)] ?? 0.99,
      cursor: { ...cursor, draws: String(BigInt(cursor.draws) + 1n) },
    };
  },
};
const cursor = (...values: number[]): RandomCursor => ({
  algorithm: scripted.algorithm,
  state: JSON.stringify(values),
  draws: '0',
});
function sample(assignment: number, left: number, right: number): BridgeRow {
  return takeRows(
    {
      rulesetVersion: version,
      nextIndex: '0',
      nextMysteryIndex: '99',
      rng: cursor(assignment, left, right),
    },
    1,
    scripted,
  ).rows[0];
}
function fresh(): RunState {
  return createRun(
    {
      runId: 'practice-hidden-risk',
      rulesetVersion: version,
      routeRng: createPracticeCursor(123),
      mysteryRng: createPracticeCursor(456),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
}
function outcomes(
  state: RunState,
  left: boolean,
  right: boolean,
  lowRiskSide: TileSide = 'left',
): RunState {
  const row = getCurrentRow(state);
  const updated: BridgeRow = {
    ...row,
    safeSide: lowRiskSide,
    risk: { lowRiskSide, broken: { left, right } },
  };
  return {
    ...state,
    rows: state.rows.map((r) =>
      r.index === row.index ? { ...updated, safeSide: hintSafeSide(updated) ?? lowRiskSide } : r,
    ),
  };
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
function step(state: RunState, side: TileSide = 'left', time = state.activeTimeMs) {
  return act(state, { type: 'choose', row: state.currentRow, life: 0, side }, time);
}
const effect = (kind: ActiveEffect['kind'], now = 0) => applyMysteryEffect(kind, now).addedEffect!;
const protectedRun = () => ({
  ...outcomes(fresh(), true, true),
  sp: 100,
  effects: [effect('coyote_10s')],
});

describe('v4 hidden 40% / 1% route', () => {
  it('randomly assigns the smaller risk to either side and uses strict independent thresholds', () => {
    expect(sample(0.499, 0.009, 0.399).risk).toEqual({
      lowRiskSide: 'left',
      broken: { left: true, right: true },
    });
    expect(sample(0.499, 0.01, 0.4).risk?.broken).toEqual({ left: false, right: false });
    expect(sample(0.5, 0.399, 0.009).risk).toEqual({
      lowRiskSide: 'right',
      broken: { left: true, right: true },
    });
    expect(sample(0.5, 0.4, 0.01).risk?.broken).toEqual({ left: false, right: false });
  });

  it('has exactly 20.5% break risk on either fixed side across the full probability grid', () => {
    let leftBroken = 0,
      rightBroken = 0,
      bothBroken = 0,
      bothSafe = 0;
    for (const assignment of [0.25, 0.75])
      for (let l = 0; l < 100; l += 1)
        for (let r = 0; r < 100; r += 1) {
          const row = sample(assignment, (l + 0.5) / 100, (r + 0.5) / 100);
          const left = isBrokenTile(row, 'left'),
            right = isBrokenTile(row, 'right');
          leftBroken += Number(left);
          rightBroken += Number(right);
          bothBroken += Number(left && right);
          bothSafe += Number(!left && !right);
        }
    expect({ leftBroken, rightBroken, bothBroken, bothSafe }).toEqual({
      leftBroken: 4100,
      rightBroken: 4100,
      bothBroken: 80,
      bothSafe: 11880,
    });
  });

  it('preserves route, mystery spacing and RNG through batching and serialization above 2^53', () => {
    const initial = createRowStream(createPracticeCursor(97), PRACTICE_RNG, version);
    const start = {
      ...initial,
      nextIndex: '90071992547409930',
      nextMysteryIndex: '90071992547409933',
    };
    const whole = takeRows(start, 24, PRACTICE_RNG);
    const first = takeRows(start, 7, PRACTICE_RNG);
    const restored = JSON.parse(JSON.stringify(first.stream)) as typeof first.stream;
    const second = takeRows(restored, 17, PRACTICE_RNG);
    expect([...first.rows, ...second.rows]).toEqual(whole.rows);
    expect(second.stream).toEqual(whole.stream);
    const old = takeRows(
      createRowStream(createPracticeCursor(97), PRACTICE_RNG, BALANCE_RULESET_VERSION),
      24,
      PRACTICE_RNG,
    );
    expect(
      old.rows.every((row) => row.risk === undefined && isBrokenTile(row, row.safeSide) === false),
    ).toBe(true);
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('resolves both choices from actual outcomes (%s, %s)', (left, right) => {
    const state = { ...outcomes(fresh(), left, right), sp: 100 };
    expect(step(state, 'left').state.sp).toBe(left ? 95 : 100);
    expect(step(state, 'right').state.sp).toBe(right ? 95 : 100);
  });

  it('reveals truly surviving glass, even when the lower-risk tile broke', () => {
    const state = outcomes(fresh(), true, false);
    const result = act(state, { type: 'hint', row: '1', life: 0 });
    expect(result.state.current.revealedSafeSide).toBe('right');
    expect(result.state.hints).toBe(1);
    expect(step(result.state, 'right').state.sp).toBe(300);
    expect(hintSafeSide(outcomes(fresh(), false, false, 'right').rows[0])).toBe('right');
  });

  it('warns about two broken tiles without charging a hint, and does not re-roll them', () => {
    const state = outcomes(fresh(), true, true);
    const result = act(state, { type: 'hint', row: '1', life: 0 });
    expect(result.accepted).toBe(true);
    expect(result.state.hints).toBe(2);
    expect(result.state.current).toMatchObject({ noSafeTile: true, revealedSafeSide: null });
    expect(result.events.map((event) => event.type)).toEqual(['hint-unavailable']);
    expect(result.state.stream).toEqual(state.stream);
    expect(result.state.rows).toEqual(state.rows);
    expect(act(result.state, { type: 'hint', row: '1', life: 0 }).reason).toBe('already-revealed');
    expect(step(result.state).state.sp).toBe(295);
  });

  it('rejects missing, malformed, legacy or inconsistent risk checkpoints', () => {
    const state = fresh();
    expect(() =>
      assertRunState({ ...state, rows: state.rows.map((row) => ({ ...row, risk: undefined })) }),
    ).toThrow();
    expect(() =>
      assertRunState({
        ...state,
        rulesetVersion: BALANCE_RULESET_VERSION,
        stream: { ...state.stream, rulesetVersion: BALANCE_RULESET_VERSION },
      }),
    ).toThrow();
    expect(() =>
      assertRunState({
        ...outcomes(state, false, false),
        current: { ...state.current, noSafeTile: true },
      }),
    ).toThrow();
    expect(() =>
      assertRunState({
        ...state,
        rows: state.rows.map((row) => ({
          ...row,
          risk: { ...row.risk!, lowRiskSide: 'middle' as TileSide },
        })),
      }),
    ).toThrow();
  });
});

describe('Run Coyote protects tile damage for exactly ten seconds', () => {
  it('survives repeated broken tiles without spending the effect; expires before the boundary input', () => {
    let state: RunState = protectedRun();
    const first = step(state, 'left', 9999);
    expect(first.state.sp).toBe(100);
    expect(first.events.find((event) => event.type === 'choice-resolved')).toMatchObject({
      protectedBy: 'coyote_10s',
      consumedKind: null,
    });
    state = outcomes(first.state, true, true);
    expect(step(state, 'right', 9999).state.sp).toBe(100);
    expect(step(state, 'right', 10000).state.sp).toBe(95);
  });

  it('does not stop bleeding, harmful mysteries, vault penalties or debt', () => {
    const bleeding = { ...protectedRun(), effects: [effect('coyote_10s'), effect('bleed_3rows')] };
    expect(step(bleeding).state.sp).toBe(97);
    let debt: RunState = {
      ...protectedRun(),
      pact: { ...offerPact('borrowed_time'), phase: 'active', rowsLeft: 3 },
    };
    for (let i = 0; i < 3; i += 1) debt = step(outcomes(debt, true, true)).state;
    expect(debt.sp).toBe(35);
    const vault: RunState = {
      ...protectedRun(),
      pact: { ...offerPact('hungry_vault'), phase: 'active', rowsLeft: 3 },
    };
    expect(step(vault).state.sp).toBe(90);
    const state = protectedRun();
    let seed = 1;
    while (
      rollMysteryEffect(PRACTICE_RNG.next(createPracticeCursor(seed)).value, version) !== 'hurt_10'
    )
      seed += 1;
    const custom = {
      ...state,
      rows: state.rows.map((row) => ({ ...row, hasMystery: true })),
      mysteryRng: createPracticeCursor(seed),
    };
    const hurt = act(custom, { type: 'mystery', row: '1', life: 0 });
    expect(hurt.state.sp).toBe(90);
  });

  it('preserves Aegis and Brittle oath and still allows one-shot and repeated healing', () => {
    for (const kind of ['shield_5s', 'fragility_5s'] as const) {
      const result = step({ ...protectedRun(), effects: [effect('coyote_10s'), effect(kind)] });
      expect(result.state.sp).toBe(100);
      expect(result.state.effects).toHaveLength(2);
    }
    const lucky = step({ ...protectedRun(), effects: [effect('coyote_10s'), effect('lucky_5s')] });
    expect(lucky.state.sp).toBe(105);
    expect(lucky.state.effects.map((e) => e.kind)).toEqual(['coyote_10s']);
    const inversion = step({
      ...protectedRun(),
      effects: [effect('coyote_10s'), effect('inversion_5s')],
    });
    expect(inversion.state.sp).toBe(105);
    expect(step(outcomes(inversion.state, true, true)).state.sp).toBe(110);
    expect(
      step({ ...protectedRun(), effects: [effect('coyote_10s'), effect('double_loss_21s')] }).state
        .sp,
    ).toBe(100);
  });

  it('freezes while reading a pact, refreshes duplicate drops and keeps a normalized 22-result table', () => {
    const state: RunState = {
      ...protectedRun(),
      current: { ...fresh().current, mysteryOutcome: 'half_life' },
      pact: offerPact('half_life'),
    };
    expect(act(state, { type: 'tick' }, 30000).state.effects[0].expiresAt).toBe(40000);
    expect(mergeEffect(protectedRun().effects, effect('coyote_10s', 5000), 5000, version)).toEqual([
      effect('coyote_10s', 5000),
    ]);
    expect(getRuleset(version).mysteryTable).toHaveLength(22);
    expect(getRuleset(version).mysteryTable.reduce((sum, row) => sum + row.weight, 0)).toBeCloseTo(
      100,
    );
    expect(rollMysteryEffect(0.99, version)).toBe('coyote_10s');
    const legacy = createRun(
      {
        runId: 'legacy',
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
        observedAt: 0,
        rulesetVersion: BALANCE_RULESET_VERSION,
      },
      PRACTICE_RNG,
    );
    expect(() => assertRunState({ ...legacy, effects: [effect('coyote_10s')] })).toThrow();
  });
});
