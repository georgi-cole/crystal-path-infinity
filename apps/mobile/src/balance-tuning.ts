import {
  BUSINESS_RULESET_VERSION,
  BUSINESS_STORE_RULESET_VERSION,
  tileExperimentVersion,
} from '@crystal-path-infinity/game-core';
import type { PracticeStorage } from './practice-save';
import { QA_TOOLS_ENABLED } from './app-profile';

export type BalanceTuning =
  | { readonly mode: 'classic' }
  | { readonly mode: 'independent'; readonly high: number; readonly low: number };
export const BALANCE_TUNING_KEY = 'cpi.playtest.tile-odds.v1';
export const DEFAULT_BALANCE_TUNING: BalanceTuning = Object.freeze({ mode: 'classic' });
export const BALANCE_PRESETS = Object.freeze([
  { id: 'classic', high: 100, low: 0 },
  ...[80, 70, 60, 50, 45, 40, 30, 20, 10].map((high) => ({ id: `${high}-1`, high, low: 1 })),
  { id: '50-50', high: 50, low: 50 },
]);

function valid(tuning: BalanceTuning): boolean {
  return (
    tuning.mode === 'classic' ||
    (tuning.mode === 'independent' &&
      [tuning.high, tuning.low].every((v) => Number.isInteger(v) && v >= 0 && v <= 100))
  );
}
export function readBalanceTuning(storage: Pick<PracticeStorage, 'getItem'>): BalanceTuning {
  try {
    const saved = JSON.parse(storage.getItem(BALANCE_TUNING_KEY) ?? 'null') as {
      version?: unknown;
      tuning?: BalanceTuning;
    } | null;
    if (saved?.version === 1 && saved.tuning && valid(saved.tuning))
      return saved.tuning.mode === 'classic'
        ? DEFAULT_BALANCE_TUNING
        : {
            mode: 'independent',
            high: Math.max(saved.tuning.high, saved.tuning.low),
            low: Math.min(saved.tuning.high, saved.tuning.low),
          };
  } catch {
    /* Optional local playtest settings. */
  }
  return DEFAULT_BALANCE_TUNING;
}
export function writeBalanceTuning(
  storage: Pick<PracticeStorage, 'setItem'>,
  tuning: BalanceTuning,
): void {
  if (!valid(tuning)) throw new RangeError('Choose whole percentages from zero to one hundred.');
  storage.setItem(BALANCE_TUNING_KEY, JSON.stringify({ version: 1, tuning }));
}
export function tuningRuleset(tuning: BalanceTuning, store: boolean): string {
  return tuning.mode === 'classic'
    ? store
      ? BUSINESS_STORE_RULESET_VERSION
      : BUSINESS_RULESET_VERSION
    : tileExperimentVersion(tuning.high, tuning.low, store, true);
}
export function nextPracticeRuleset(store: boolean): string {
  if (!QA_TOOLS_ENABLED || import.meta.env.MODE === 'production' || typeof window === 'undefined')
    return tuningRuleset(DEFAULT_BALANCE_TUNING, store);
  try {
    return tuningRuleset(readBalanceTuning(window.localStorage), store);
  } catch {
    return tuningRuleset(DEFAULT_BALANCE_TUNING, store);
  }
}
