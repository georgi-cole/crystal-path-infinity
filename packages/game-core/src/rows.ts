import { addDecimal, assertNonNegativeInteger, compareDecimal, decimal } from './numbers.ts';
import { drawRandom, assertRandomCursor } from './random.ts';
import {
  getRuleset,
  MAX_ROW_BATCH,
  MYSTERY_MAX_GAP,
  MYSTERY_MIN_GAP,
  RULESET_VERSION,
} from './rules.ts';
import type { BridgeRow, RandomCursor, RandomSource, RowStreamState } from './types.ts';

function gap(value: number): bigint {
  return BigInt(MYSTERY_MIN_GAP + Math.floor(value * (MYSTERY_MAX_GAP - MYSTERY_MIN_GAP + 1)));
}

export function createRowStream(
  cursor: RandomCursor,
  rng: RandomSource,
  rulesetVersion: string = RULESET_VERSION,
): RowStreamState {
  getRuleset(rulesetVersion);
  const draw = drawRandom(cursor, rng);
  return {
    rulesetVersion,
    nextIndex: '0',
    nextMysteryIndex: gap(draw.value).toString(),
    rng: draw.cursor,
  };
}

export function assertRowStream(stream: RowStreamState, rng?: RandomSource): void {
  getRuleset(stream.rulesetVersion);
  decimal(stream.nextIndex);
  decimal(stream.nextMysteryIndex);
  if (compareDecimal(stream.nextMysteryIndex, stream.nextIndex) < 0) {
    throw new RangeError('Mystery cursor cannot precede the next generated row.');
  }
  assertRandomCursor(stream.rng, rng);
}

/** Batching changes allocation only, never the route or RNG consumption order. */
export function takeRows(stream: RowStreamState, count: number, rng: RandomSource) {
  assertRowStream(stream, rng);
  assertNonNegativeInteger(count, 'Batch size');
  if (count > MAX_ROW_BATCH)
    throw new RangeError(`A row batch may contain at most ${MAX_ROW_BATCH}.`);
  let nextIndex = stream.nextIndex;
  let nextMysteryIndex = stream.nextMysteryIndex;
  let cursor = stream.rng;
  const rows: BridgeRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = drawRandom(cursor, rng);
    cursor = side.cursor;
    const hasMystery = nextIndex === nextMysteryIndex;
    if (hasMystery) {
      const distance = drawRandom(cursor, rng);
      cursor = distance.cursor;
      nextMysteryIndex = addDecimal(nextIndex, gap(distance.value));
    }
    rows.push({ index: nextIndex, safeSide: side.value < 0.5 ? 'left' : 'right', hasMystery });
    nextIndex = addDecimal(nextIndex);
  }
  return {
    rows,
    stream: { rulesetVersion: stream.rulesetVersion, nextIndex, nextMysteryIndex, rng: cursor },
  };
}
