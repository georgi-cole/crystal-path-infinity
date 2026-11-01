import type { Decimal } from './types.ts';

export function decimal(value: Decimal | bigint | number): Decimal {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError('Integer input must be non-negative and exactly representable.');
    }
    return String(value);
  }
  const result = String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(result)) {
    throw new RangeError('Expected a canonical non-negative decimal integer.');
  }
  return result;
}

export function addDecimal(value: Decimal, amount: bigint = 1n): Decimal {
  return decimal(BigInt(decimal(value)) + amount);
}

export function compareDecimal(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const left = BigInt(decimal(a));
  const right = BigInt(decimal(b));
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

export function addSafeInteger(value: number, amount: number, name: string): number {
  const result = value + amount;
  assertNonNegativeInteger(result, name);
  return result;
}

export function assertNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}
