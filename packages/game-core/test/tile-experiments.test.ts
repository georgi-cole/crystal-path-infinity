import { describe, expect, it } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  getCurrentRow,
  getRuleset,
  isBrokenTile,
  parseTileExperiment,
  PRACTICE_RNG,
  takeRows,
  tileExperimentVersion,
  transitionRun,
  usesDiscoveryRules,
  usesStoreTestRules,
} from '../src/index.ts';
import type { RandomCursor, RandomSource } from '../src/index.ts';

const scripted: RandomSource = {
  algorithm: 'grid',
  next(cursor) {
    const values = JSON.parse(cursor.state) as number[];
    return {
      value: values[Number(cursor.draws)] ?? 0.99,
      cursor: { ...cursor, draws: String(BigInt(cursor.draws) + 1n) },
    };
  },
};
const cursor = (...values: number[]): RandomCursor => ({
  algorithm: 'grid',
  state: JSON.stringify(values),
  draws: '0',
});
function initial(version: string) {
  return createRun(
    {
      runId: 'practice-odds',
      rulesetVersion: version,
      routeRng: createPracticeCursor(712),
      mysteryRng: createPracticeCursor(997),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
}

describe('immutable local tile-odds experiments', () => {
  it('normalizes sides and rejects noncanonical or impossible identities', () => {
    const version = tileExperimentVersion(1, 60, true);
    expect(parseTileExperiment(version)).toEqual({
      highBreakPercent: 60,
      lowBreakPercent: 1,
      store: true,
    });
    for (const bad of [-1, 101, 0.5, NaN, Infinity])
      expect(() => tileExperimentVersion(bad, 1)).toThrow();
    for (const bad of [
      'infinity-v10-tiles-1-60-store',
      'infinity-v10-tiles-060-1-store',
      'infinity-v10-tiles-101-1-store',
      'infinity-v10-tiles-60-1-ranked',
    ]) {
      expect(parseTileExperiment(bad)).toBeNull();
      expect(() => getRuleset(bad)).toThrow();
    }
  });
  it('has exactly 30.5% blind break probability on either fixed side for 60%/1%', () => {
    let left = 0,
      right = 0,
      both = 0,
      intact = 0,
      total = 0;
    for (const assignment of [0.25, 0.75])
      for (let a = 0; a < 100; a++)
        for (let b = 0; b < 100; b++) {
          const row = takeRows(
            {
              rulesetVersion: tileExperimentVersion(60, 1),
              nextIndex: '0',
              nextMysteryIndex: '100',
              rng: cursor(assignment, (a + 0.5) / 100, (b + 0.5) / 100),
            },
            1,
            scripted,
          ).rows[0];
          const l = isBrokenTile(row, 'left'),
            r = isBrokenTile(row, 'right');
          left += Number(l);
          right += Number(r);
          both += Number(l && r);
          intact += Number(!l && !r);
          total++;
        }
    expect(left / total).toBe(0.305);
    expect(right / total).toBe(0.305);
    expect(both / total).toBe(0.006);
    expect(intact / total).toBe(0.396);
  });
  it.each([false, true])('retains discovery and Store semantics (Store=%s)', (store) => {
    const version = tileExperimentVersion(45, 1, store),
      run = initial(version);
    expect(usesDiscoveryRules(version)).toBe(true);
    expect(usesStoreTestRules(version)).toBe(store);
    expect(run.discovery).toEqual({ known: [], introduction: null });
    expect(Boolean(run.storeTest)).toBe(store);
    expect(getRuleset(version)).toMatchObject({
      maxSp: null,
      lowBreakRisk: 0.01,
      highBreakRisk: 0.45,
      mysteryMinGap: 5,
      mysteryMaxGap: 7,
    });
    const next = transitionRun(
      run,
      { type: 'choose', row: run.currentRow, life: 0, side: getCurrentRow(run).safeSide },
      { activeTimeMs: 2000, achievedAt: 2000, rng: PRACTICE_RNG },
    );
    expect(next.accepted).toBe(true);
    expect(next.state.rulesetVersion).toBe(version);
    expect(() =>
      createRun(
        {
          runId: 'ranked-cannot-use-this',
          rulesetVersion: version,
          routeRng: createPracticeCursor(1),
          mysteryRng: createPracticeCursor(2),
          observedAt: 0,
        },
        PRACTICE_RNG,
      ),
    ).toThrow(/local practice/);
  });
  it('distinguishes independent 50/50 from the original one-intact-one-broken rule', () => {
    const version = tileExperimentVersion(50, 50);
    for (const value of [0.1, 0.9]) {
      const row = takeRows(
        {
          rulesetVersion: version,
          nextIndex: '0',
          nextMysteryIndex: '100',
          rng: cursor(0.25, value, value),
        },
        1,
        scripted,
      ).rows[0];
      expect(isBrokenTile(row, 'left')).toBe(isBrokenTile(row, 'right'));
    }
  });
});
