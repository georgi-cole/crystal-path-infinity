/** Local-play board. A device-reported result is never a verified_results row. */
export const LOCAL_INFINITY_BOARD = 'infinity-device-v1';
export interface InfinityScore {
  schemaVersion: 1;
  runId: string;
  rows: string;
  revives: number;
  activeTimeMs: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Size, integer and coarse plausibility checks only; this is not replay proof. */
export function parseInfinityScore(value: unknown): InfinityScore | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 5 ||
    v.schemaVersion !== 1 ||
    typeof v.runId !== 'string' ||
    !UUID.test(v.runId) ||
    typeof v.rows !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(v.rows) ||
    !Number.isInteger(v.revives) ||
    (v.revives as number) < 0 ||
    (v.revives as number) > 15 ||
    !Number.isSafeInteger(v.activeTimeMs) ||
    (v.activeTimeMs as number) < 0 ||
    BigInt(v.rows) > BigInt(v.activeTimeMs as number) + 1n
  )
    return null;
  return {
    schemaVersion: 1,
    runId: v.runId,
    rows: v.rows,
    revives: v.revives as number,
    activeTimeMs: v.activeTimeMs as number,
  };
}
