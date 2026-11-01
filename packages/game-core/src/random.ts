import { addDecimal, assertNonEmpty, decimal } from './numbers.ts';
import type { RandomCursor, RandomSource } from './types.ts';

export function assertRandomCursor(cursor: RandomCursor, source?: RandomSource): void {
  assertNonEmpty(cursor.algorithm, 'RNG algorithm');
  if (typeof cursor.state !== 'string') throw new TypeError('RNG state must be a string.');
  decimal(cursor.draws);
  if (source && source.algorithm !== cursor.algorithm) {
    throw new RangeError('RNG adapter does not match the serialized algorithm.');
  }
}

export function drawRandom(cursor: RandomCursor, source: RandomSource) {
  assertRandomCursor(cursor, source);
  const draw = source.next(Object.freeze({ ...cursor }));
  if (!Number.isFinite(draw.value) || draw.value < 0 || draw.value >= 1) {
    throw new RangeError('RNG value must be finite and in [0, 1).');
  }
  assertRandomCursor(draw.cursor, source);
  if (draw.cursor.draws !== addDecimal(cursor.draws)) {
    throw new RangeError('RNG cursor must advance by exactly one draw.');
  }
  return { value: draw.value, cursor: { ...draw.cursor } };
}

const MASK_64 = (1n << 64n) - 1n;
const SPLITMIX_ALGORITHM = 'splitmix64-practice-v1';

/** Reproducible practice/test PRNG. NOT cryptographic or a ranked security boundary. */
export const PRACTICE_RNG: RandomSource = Object.freeze({
  algorithm: SPLITMIX_ALGORITHM,
  next(cursor: RandomCursor) {
    assertRandomCursor(cursor);
    if (cursor.algorithm !== SPLITMIX_ALGORITHM) throw new RangeError('Wrong RNG algorithm.');
    const previous = BigInt(decimal(cursor.state));
    if (previous > MASK_64) throw new RangeError('Practice RNG state exceeds 64 bits.');
    const state = (previous + 0x9e3779b97f4a7c15n) & MASK_64;
    let mixed = state;
    mixed = ((mixed ^ (mixed >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    mixed = ((mixed ^ (mixed >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    mixed ^= mixed >> 31n;
    return {
      value: Number(mixed >> 11n) / 9_007_199_254_740_992,
      cursor: {
        algorithm: SPLITMIX_ALGORITHM,
        state: state.toString(),
        draws: addDecimal(cursor.draws),
      },
    };
  },
});

export function createPracticeCursor(seed: string | bigint | number): RandomCursor {
  const state = decimal(seed);
  if (BigInt(state) > MASK_64) throw new RangeError('Practice seed exceeds 64 bits.');
  return { algorithm: SPLITMIX_ALGORITHM, state, draws: '0' };
}
