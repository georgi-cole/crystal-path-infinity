/** Local playtest identity: odds are fixed for a whole run and its saved route. */
export const TILE_EXPERIMENT_PREFIX = 'infinity-v10-tiles-';
export const BUSINESS_TILE_EXPERIMENT_PREFIX = 'infinity-v12-tiles-';
const READING_TILE_EXPERIMENT_PREFIX = 'infinity-v13-tiles-';
export interface TileExperiment {
  readonly highBreakPercent: number;
  readonly lowBreakPercent: number;
  readonly store: boolean;
  readonly business?: true;
  readonly extendedReading?: true;
}
const identity = /^infinity-v(10|12|13)-tiles-(0|[1-9]\d?|100)-(0|[1-9]\d?|100)-(plain|store)$/;

export function parseTileExperiment(version: string): TileExperiment | null {
  if (typeof version !== 'string') return null;
  const match = identity.exec(version);
  if (!match) return null;
  const highBreakPercent = Number(match[2]),
    lowBreakPercent = Number(match[3]);
  if (lowBreakPercent > highBreakPercent) return null;
  return {
    highBreakPercent,
    lowBreakPercent,
    store: match[4] === 'store',
    ...(match[1] !== '10' ? { business: true as const } : {}),
    ...(match[1] === '13' ? { extendedReading: true as const } : {}),
  };
}
export function tileExperimentVersion(
  a: number,
  b: number,
  store = false,
  business: boolean | 'extended-reading' = false,
): string {
  if (![a, b].every((value) => Number.isInteger(value) && value >= 0 && value <= 100))
    throw new RangeError('Tile chances must be whole percentages from zero to one hundred.');
  const prefix =
    business === 'extended-reading'
      ? READING_TILE_EXPERIMENT_PREFIX
      : business
        ? BUSINESS_TILE_EXPERIMENT_PREFIX
        : TILE_EXPERIMENT_PREFIX;
  return `${prefix}${Math.max(a, b)}-${Math.min(a, b)}-${store ? 'store' : 'plain'}`;
}
