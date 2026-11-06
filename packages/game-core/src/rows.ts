import { addDecimal, assertNonNegativeInteger, compareDecimal, decimal } from './numbers.ts';
import { drawRandom, assertRandomCursor } from './random.ts';
import {
  getRuleset,
  MAX_ROW_BATCH,
  MYSTERY_MAX_GAP,
  MYSTERY_MIN_GAP,
  RULESET_VERSION,
  RISK_RULESET,
  RISK_RULESET_VERSION,
} from './rules.ts';
import type { BridgeRow, RandomCursor, RandomSource, RowStreamState, TileSide } from './types.ts';

export function isBrokenTile(row: BridgeRow, side: TileSide): boolean {
  return row.risk ? row.risk.broken[side] : side !== row.safeSide;
}

/** A true surviving tile, not merely the side assigned the smaller risk. */
export function hintSafeSide(row: BridgeRow): TileSide | null {
  if (!row.risk) return row.safeSide;
  const preferred = row.risk.lowRiskSide;
  if (!row.risk.broken[preferred]) return preferred;
  const other = preferred === 'left' ? 'right' : 'left';
  return row.risk.broken[other] ? null : other;
}

export function assertRowRisk(row: BridgeRow, version: string): void {
  if (version !== RISK_RULESET_VERSION) {
    if (row.risk !== undefined) throw new RangeError('Risk draws outside v4.');
    return;
  }
  if (
    !row.risk ||
    !['left', 'right'].includes(row.risk.lowRiskSide) ||
    !row.risk.broken ||
    typeof row.risk.broken.left !== 'boolean' ||
    typeof row.risk.broken.right !== 'boolean' ||
    row.safeSide !== (hintSafeSide(row) ?? row.risk.lowRiskSide)
  )
    throw new RangeError('Invalid hidden risk row.');
}

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
    const lowRiskSide = side.value < 0.5 ? 'left' : 'right';
    let risk: BridgeRow['risk'];
    if (stream.rulesetVersion === RISK_RULESET_VERSION) {
      const left = drawRandom(cursor, rng);
      const right = drawRandom(left.cursor, rng);
      cursor = right.cursor;
      risk = {
        lowRiskSide,
        broken: {
          left:
            left.value <
            (lowRiskSide === 'left' ? RISK_RULESET.lowBreakRisk : RISK_RULESET.highBreakRisk),
          right:
            right.value <
            (lowRiskSide === 'right' ? RISK_RULESET.lowBreakRisk : RISK_RULESET.highBreakRisk),
        },
      };
    }
    const hasMystery = nextIndex === nextMysteryIndex;
    if (hasMystery) {
      const distance = drawRandom(cursor, rng);
      cursor = distance.cursor;
      nextMysteryIndex = addDecimal(nextIndex, gap(distance.value));
    }
    const row: BridgeRow = {
      index: nextIndex,
      safeSide: lowRiskSide,
      hasMystery,
      ...(risk ? { risk } : {}),
    };
    rows.push(risk ? { ...row, safeSide: hintSafeSide(row) ?? lowRiskSide } : row);
    nextIndex = addDecimal(nextIndex);
  }
  return {
    rows,
    stream: { rulesetVersion: stream.rulesetVersion, nextIndex, nextMysteryIndex, rng: cursor },
  };
}
