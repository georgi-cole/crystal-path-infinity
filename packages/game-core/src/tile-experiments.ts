/** Local playtest identity: odds are fixed for a whole run and its saved route. */
export const TILE_EXPERIMENT_PREFIX = 'infinity-v10-tiles-';
export interface TileExperiment {
  readonly highBreakPercent: number;
  readonly lowBreakPercent: number;
  readonly store: boolean;
}
const identity = /^infinity-v10-tiles-(0|[1-9]\d?|100)-(0|[1-9]\d?|100)-(plain|store)$/;

export function parseTileExperiment(version: string): TileExperiment | null {
  if (typeof version !== 'string' || !version.startsWith(TILE_EXPERIMENT_PREFIX)) return null;
  const match = identity.exec(version);
  if (!match) return null;
  const highBreakPercent = Number(match[1]),
    lowBreakPercent = Number(match[2]);
  if (lowBreakPercent > highBreakPercent) return null;
  return { highBreakPercent, lowBreakPercent, store: match[3] === 'store' };
}
export function tileExperimentVersion(a: number, b: number, store = false): string {
  if (![a, b].every((value) => Number.isInteger(value) && value >= 0 && value <= 100))
    throw new RangeError('Tile chances must be whole percentages from zero to one hundred.');
  return `${TILE_EXPERIMENT_PREFIX}${Math.max(a, b)}-${Math.min(a, b)}-${store ? 'store' : 'plain'}`;
}
