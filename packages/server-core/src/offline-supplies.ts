export interface OfflineSupplies {
  readonly sp: number;
  readonly hints: number;
  readonly credits: number;
  readonly shields: number;
  readonly seasonChanges: number;
}
export interface OfflineAllocation extends OfflineSupplies {
  readonly operationId: string;
}
export function parseOfflineSupplies(value: unknown): OfflineSupplies | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ['sp', 'hints', 'credits', 'shields', 'seasonChanges'] as const;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some(
      (key) =>
        !Number.isSafeInteger(row[key]) || (row[key] as number) < 0 || (row[key] as number) > 10000,
    )
  )
    return null;
  const result = Object.fromEntries(
    keys.map((key) => [key, row[key]]),
  ) as unknown as OfflineSupplies;
  return keys.some((key) => result[key] > 0) ? result : null;
}
