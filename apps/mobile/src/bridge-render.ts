function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameFields(a: object, b: object): boolean {
  const left = Object.entries(a);
  const right = Object.entries(b);
  return (
    left.length === right.length &&
    left.every(
      ([key, value]) =>
        Object.hasOwn(b, key) && Object.is(value, (b as Record<string, unknown>)[key]),
    )
  );
}

function sameRow(a: object, b: object): boolean {
  const { cue: leftCue, ...left } = a as Record<string, unknown>;
  const { cue: rightCue, ...right } = b as Record<string, unknown>;
  return (
    sameFields(left, right) &&
    (Object.is(leftCue, rightCue) ||
      (isRecord(leftCue) && isRecord(rightCue) && sameFields(leftCue, rightCue)))
  );
}

/** Compare the bounded renderer projection, including callbacks and every prop.
 * Timer ticks allocate fresh row projections without changing bridge artwork.
 * Never compare RunState or ignore handlers: both could hide a real update.
 */
export function sameBridgePresentation<T extends object>(a: T, b: T): boolean {
  const left: [string, unknown][] = Object.entries(a);
  if (left.length !== Object.keys(b).length) return false;
  return left.every(([key, value]) => {
    if (!Object.hasOwn(b, key)) return false;
    const next = (b as Record<string, unknown>)[key];
    if (Object.is(value, next)) return true;
    if (key === 'rows' && Array.isArray(value) && Array.isArray(next)) {
      const rows: unknown[] = value;
      const nextRows: unknown[] = next;
      return (
        rows.length === nextRows.length &&
        rows.every((row, i) => {
          const nextRow = nextRows[i];
          return isRecord(row) && isRecord(nextRow) && sameRow(row, nextRow);
        })
      );
    }
    if (key === 'hintScan' && isRecord(value) && isRecord(next)) return sameFields(value, next);
    return false;
  });
}
