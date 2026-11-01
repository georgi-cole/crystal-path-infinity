import { describe, expect, it } from 'vitest';
import {
  applyMysteryEffect,
  createRowStream,
  createRun,
  getRowBandDamage,
  mergeEffect,
  pruneEffects,
  resolveWrongTileDelta,
  rollMysteryEffect,
  takeRows,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type {
  ActiveEffect,
  RandomCursor,
  RandomSource,
  RowStreamState,
  RunCommand,
  RunState,
  TimedEffectKind,
} from '@crystal-path-infinity/game-core';
import {
  damageCases,
  floatingRollCases,
  initialResources,
  mysteryCases,
  priorityCases,
  routeCases,
  sourceProvenance,
  standaloneCases,
} from './fixtures/source-baseline';

// Injected test randomness; never official/server entropy.
const constantRng: RandomSource = {
  algorithm: 'baseline-constant-v1',
  next(cursor) {
    return {
      value: Number(cursor.state),
      cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
    };
  },
};
const cursor = (sample: number): RandomCursor => ({
  algorithm: constantRng.algorithm,
  state: String(sample),
  draws: '0',
});
function run(mysterySample = 0): RunState {
  return createRun(
    {
      runId: 'baseline-run',
      routeRng: cursor(0),
      mysteryRng: cursor(mysterySample),
      observedAt: 1000,
      buffer: { ahead: 8, history: 2 },
    },
    constantRng,
  );
}
function act(state: RunState, command: RunCommand, activeTimeMs = state.activeTimeMs) {
  return transitionRun(state, command, {
    activeTimeMs,
    achievedAt: 1000 + activeTimeMs,
    rng: constantRng,
  });
}
function choose(state: RunState, side: 'left' | 'right'): RunState {
  const result = act(state, {
    type: 'choose',
    row: state.currentRow,
    life: state.revivesApplied,
    side,
  });
  expect(result.accepted).toBe(true);
  return result.state;
}
function mysteryRow(sample: number): RunState {
  let state = run(sample);
  for (let i = 0; i < 3; i += 1) state = choose(state, 'left');
  expect(state.currentRow).toBe('4');
  return state;
}
function effect(kind: TimedEffectKind, startedAt = 0): ActiveEffect {
  return {
    kind,
    startedAt,
    expiresAt: startedAt + 5000,
    nextTickAt: kind === 'regen_5s' || kind === 'drain_5s' ? startedAt + 500 : null,
  };
}

describe(`source baseline ${sourceProvenance.commit}`, () => {
  it('starts with the original SP and hint resources', () => {
    expect(run()).toMatchObject({ ...initialResources, lastClearedRow: '0', currentRow: '1' });
  });
  it.each(damageCases)('uses source damage $damage on displayed row $row', ({ row, damage }) => {
    expect(getRowBandDamage(row)).toBe(damage);
  });
  it('matches all twelve source weights across 100 interior probability bins', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i += 1) {
      const kind = rollMysteryEffect((i + 0.5) / 100);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect([...counts]).toEqual(mysteryCases.map(({ kind, weight }) => [kind, weight]));
  });
  it.each(mysteryCases)('preserves $kind probability interval and resource delta', (expected) => {
    expect(rollMysteryEffect((expected.start + 0.001) / 100)).toBe(expected.kind);
    expect(rollMysteryEffect((expected.end - 0.001) / 100)).toBe(expected.kind);
    const applied = applyMysteryEffect(expected.kind, 1234);
    expect(applied.spDelta).toBe(expected.spDelta);
    expect(applied.hintDelta).toBe(expected.hintDelta);
    if (expected.timed)
      expect(applied.addedEffect).toMatchObject({ kind: expected.kind, expiresAt: 6234 });
    else expect(applied.addedEffect).toBeNull();
  });
  it.each(floatingRollCases)(
    'matches the captured source boundary at $sample',
    ({ sample, kind }) => {
      expect(rollMysteryEffect(sample)).toBe(kind);
    },
  );
  it.each(priorityCases)('resolves priority $effects independently of array order', (fixture) => {
    const effects = fixture.effects.map((kind) => effect(kind));
    const result = resolveWrongTileDelta(15, effects, 1000);
    expect(result.delta).toBe(fixture.delta);
    expect(result.consumedKind ?? null).toBe(fixture.consumed);
    expect(result.newEffects.map(({ kind }) => kind)).toEqual(fixture.remaining);
    expect(effects.map(({ kind }) => kind)).toEqual(fixture.effects);
  });
  it('doubles a wrong step for fragility and consumes it', () => {
    expect(resolveWrongTileDelta(20, [effect('fragility_5s')], 1000)).toMatchObject({
      delta: -40,
      consumedKind: 'fragility_5s',
      newEffects: [],
    });
  });
  it('expires effects at equality, before wrong-step resolution', () => {
    const expired = effect('shield_5s');
    expect(pruneEffects([expired], 4999)).toHaveLength(1);
    expect(pruneEffects([expired], 5000)).toEqual([]);
    expect(resolveWrongTileDelta(15, [expired], 5000)).toMatchObject({
      delta: -15,
      newEffects: [],
    });
  });
  it('consumes one duplicate shield instance, retaining the other', () => {
    const first = effect('shield_5s', 200);
    const second = effect('shield_5s', 100);
    const result = resolveWrongTileDelta(20, [first, second], 300);
    expect(result.delta).toBe(0);
    expect(result.newEffects).toEqual([second]);
  });
  it('keeps inversion active across repeated wrong steps', () => {
    const original = effect('inversion_5s');
    const first = resolveWrongTileDelta(15, [original], 1000);
    const second = resolveWrongTileDelta(20, first.newEffects, 2000);
    expect([first.delta, second.delta]).toEqual([7, 10]);
    expect(second.newEffects).toEqual([original]);
  });
  it('evicts the soonest expiry at capacity, regardless of insertion order', () => {
    const later = effect('regen_5s', 200);
    const sooner = effect('shield_5s', 100);
    const added = effect('lucky_5s', 300);
    expect(mergeEffect([later, sooner], added, 300)).toEqual([later, added]);
  });
  it('evicts the earlier insertion on equal expiry and allows duplicate kinds', () => {
    const shield = effect('shield_5s');
    const regen = effect('regen_5s');
    const laterRegen = effect('regen_5s', 100);
    expect(mergeEffect([shield, regen], laterRegen, 100)).toEqual([regen, laterRegen]);
  });
  it('prunes expired entries when no timed effect is added', () => {
    expect(mergeEffect([effect('shield_5s')], null, 5000)).toEqual([]);
  });
  it.each(routeCases)(
    'matches original route draws for source seed $seed across batches',
    (fixture) => {
      const tape: RandomSource = {
        algorithm: 'source-draw-tape-v1',
        next(current) {
          const position = Number(current.state);
          const value = fixture.samples[position];
          if (value === undefined) throw new Error('Source reference tape exhausted');
          return {
            value,
            cursor: {
              algorithm: current.algorithm,
              state: String(position + 1),
              draws: (BigInt(current.draws) + 1n).toString(),
            },
          };
        },
      };
      const initial = createRowStream({ algorithm: tape.algorithm, state: '0', draws: '0' }, tape);
      let stream = initial;
      const rows = [];
      for (const size of [3, 1, 7, 9]) {
        const resumed = JSON.parse(JSON.stringify(stream)) as RowStreamState;
        const batch = takeRows(resumed, size, tape);
        rows.push(...batch.rows);
        stream = batch.stream;
      }
      expect(rows.map(({ safeSide }) => safeSide)).toEqual(fixture.sides);
      expect(rows.filter(({ hasMystery }) => hasMystery).map(({ index }) => index)).toEqual(
        fixture.mysteryIndices,
      );
      expect(stream.nextIndex).toBe('20');
      expect(stream.nextMysteryIndex).toBe('21');
      expect(stream.rng.draws).toBe(String(fixture.samples.length));
      expect(takeRows(initial, 20, tape).rows).toEqual(rows);
    },
  );
});

describe('accepted standalone deviations from the source', () => {
  it.each(standaloneCases.endlessDamageRows)('keeps 20-SP damage at exact large row %s', (row) => {
    expect(getRowBandDamage(row)).toBe(20);
  });
  it('does not award the fatal 24th wrong row after the source all-wrong sequence', () => {
    let state = run();
    for (let row = 1; row <= 23; row += 1) {
      state = choose(state, 'right');
      if (row === 10) expect(state).toMatchObject(standaloneCases.fatalWrongSequence.after10Wrong);
    }
    expect(state).toMatchObject(standaloneCases.fatalWrongSequence.after23Wrong);
    const fatal = act(state, { type: 'choose', row: '24', life: 0, side: 'right' });
    expect(fatal.accepted).toBe(true);
    expect(fatal.state).toMatchObject({
      sp: 0,
      status: 'dead',
      lastClearedRow: '23',
      currentRow: '24',
    });
    expect(fatal.state.death).toMatchObject({ fatalRow: '24', cause: 'wrong_tile' });
    expect(fatal.events.filter(({ type }) => type === 'death')).toHaveLength(1);
    expect(fatal.events.some(({ type }) => type === 'row-cleared')).toBe(false);
  });
  it('continues play and mystery cadence through displayed rows 350 and 351', () => {
    let state = run();
    for (let i = 0; i < 351; i += 1) state = choose(state, 'left');
    expect(state).toMatchObject({
      status: 'playing',
      lastClearedRow: '351',
      currentRow: '352',
      result: null,
    });
    expect(state.rows.find(({ index }) => index === '351')?.hasMystery).toBe(true);
  });
  it.each(mysteryCases)('applies and consumes $kind on the same unresolved row once', (fixture) => {
    const initial = mysteryRow((fixture.start + 0.5) / 100);
    const command = { type: 'mystery', row: '4', life: 0 } as const;
    const first = act(initial, command);
    expect(first.accepted).toBe(true);
    expect(first.state).toMatchObject({
      sp: 300 + fixture.spDelta,
      hints: 2 + fixture.hintDelta,
      lastClearedRow: '3',
      currentRow: '4',
      current: { mysteryOutcome: fixture.kind },
    });
    const repeated = act(first.state, command);
    expect(repeated.accepted).toBe(false);
    expect(repeated.reason).toBe('mystery-consumed');
    expect(repeated.state.mysteryRng).toEqual(first.state.mysteryRng);
    expect(repeated.state.sp).toBe(first.state.sp);
    expect(repeated.state.hints).toBe(first.state.hints);
  });
  it('floors mystery hint loss at zero after two separately consumed hints', () => {
    let state = run(0.79);
    for (let i = 0; i < 2; i += 1) {
      const hinted = act(state, { type: 'hint', row: state.currentRow, life: 0 });
      expect(hinted.accepted).toBe(true);
      expect(hinted.state.current.revealedSafeSide).toBe('left');
      state = choose(hinted.state, 'left');
    }
    state = choose(state, 'left');
    const result = act(state, { type: 'mystery', row: '4', life: 0 });
    expect(result.accepted).toBe(true);
    expect(result.state.hints).toBe(0);
  });
  it('caps instant mystery healing at 400 SP', () => {
    const state = { ...mysteryRow(0.18), sp: 395 };
    expect(act(state, { type: 'mystery', row: '4', life: 0 }).state.sp).toBe(standaloneCases.spCap);
  });
  it.each(['lucky_5s', 'inversion_5s'] as const)('caps %s wrong-step healing at 400 SP', (kind) => {
    const state = { ...run(), sp: 399, effects: [effect(kind)] };
    expect(choose(state, 'right').sp).toBe(standaloneCases.spCap);
  });
  it.each([
    ['regen_5s', 318],
    ['drain_5s', 282],
  ] as const)('gives %s nine pre-expiry pulses', (kind, finalSp) => {
    const initial = { ...run(), effects: [effect(kind)] };
    expect(act(initial, { type: 'tick' }, 499).state.sp).toBe(300);
    const result = act(initial, { type: 'tick' }, 5000);
    expect(result.state.sp).toBe(finalSp);
    expect(result.state.effects).toEqual([]);
    expect(
      result.events
        .filter(({ type }) => type === 'effects-ticked')
        .map(({ activeTimeMs }) => activeTimeMs),
    ).toEqual(standaloneCases.timedPulseOffsetsMs);
  });
  it('stacks regen instances and sums simultaneous regen/drain before clamping', () => {
    const doubled = { ...run(), effects: [effect('regen_5s'), effect('regen_5s')] };
    expect(act(doubled, { type: 'tick' }, 500).state.sp).toBe(304);
    const cancelled = { ...run(), sp: 399, effects: [effect('regen_5s'), effect('drain_5s')] };
    expect(act(cancelled, { type: 'tick' }, 500).state.sp).toBe(399);
  });
  it('resolves fatal due drain before an otherwise safe input', () => {
    const state = { ...run(), sp: 2, effects: [effect('drain_5s')] };
    const result = act(state, { type: 'choose', row: '1', life: 0, side: 'left' }, 500);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('died-before-command');
    expect(result.state).toMatchObject({
      sp: 0,
      lastClearedRow: '0',
      currentRow: '1',
      status: 'dead',
    });
    expect(result.state.death).toMatchObject({ fatalRow: '1', cause: 'drain' });
    expect(result.events.some(({ type }) => type === 'choice-resolved')).toBe(false);
  });
  it('preserves consumed mystery and hints across a fatal mystery restore', () => {
    const initial = mysteryRow(0.62);
    const hinted = act(initial, { type: 'hint', row: '4', life: 0 });
    const dead = act({ ...hinted.state, sp: 10 }, { type: 'mystery', row: '4', life: 0 });
    expect(dead.state.death).toMatchObject({ fatalRow: '4', cause: 'mystery' });
    if (!dead.state.death) throw new Error('Expected source-derived fatal mystery');
    const reference = { deathId: dead.state.death.id, ordinal: 1, grantId: 'baseline-grant' };
    const granted = act(dead.state, { type: 'grant-revive', ...reference });
    const restored = act(granted.state, { type: 'apply-revive', ...reference });
    expect(granted.accepted).toBe(true);
    expect(restored.accepted).toBe(true);
    expect(restored.state).toMatchObject({
      sp: 200,
      hints: 1,
      lastClearedRow: '3',
      currentRow: '4',
      revivesGranted: 1,
      revivesApplied: 1,
      revivesToReachScore: 0,
      current: { revealedSafeSide: 'left', mysteryOutcome: 'hurt_10' },
      effects: [],
    });
    expect(act(restored.state, { type: 'mystery', row: '4', life: 1 }).reason).toBe(
      'mystery-consumed',
    );
  });
  it('retains known-row hint information and rejects another charge', () => {
    const initial = run();
    const first = act(initial, { type: 'hint', row: '1', life: 0 });
    const later = act(first.state, { type: 'hint', row: '1', life: 0 }, 3500);
    expect(later.accepted).toBe(false);
    expect(later.reason).toBe('already-revealed');
    expect(later.state.hints).toBe(1);
    expect(later.state.current.revealedSafeSide).toBe('left');
  });
});
