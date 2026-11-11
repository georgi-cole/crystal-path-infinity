import { addDecimal, assertNonNegativeInteger, compareDecimal, decimal } from './numbers.ts';
import { drawRandom, assertRandomCursor } from './random.ts';
import { assertJourneyRoute, journeyRow } from './journey.ts';
import { parseTileExperiment } from './tile-experiments.ts';
import type { JourneyRoute } from './journey.ts';
import {
  getRuleset,
  MAX_ROW_BATCH,
  MYSTERY_MAX_GAP,
  MYSTERY_MIN_GAP,
  RULESET_VERSION,
  tileBreakProbabilities,
  usesRiskRules,
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
  if (!usesRiskRules(version)) {
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
  journey?: JourneyRoute,
): RowStreamState {
  getRuleset(rulesetVersion);
  const draw = drawRandom(cursor, rng);
  return {
    rulesetVersion,
    nextIndex: '0',
    nextMysteryIndex: gap(draw.value).toString(),
    rng: draw.cursor,
    ...(journey ? { journey } : {}),
  };
}

export function assertRowStream(stream: RowStreamState, rng?: RandomSource): void {
  getRuleset(stream.rulesetVersion);
  const identity = parseTileExperiment(stream.rulesetVersion)?.journey;
  if (
    !!stream.journey !== !!identity ||
    (stream.journey && stream.journey.season !== (identity === 'plain' ? 'spring' : identity))
  )
    throw new RangeError('Mismatched Journey rules.');
  if (stream.journey) assertJourneyRoute(stream.journey);
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
  const odds = usesRiskRules(stream.rulesetVersion)
    ? tileBreakProbabilities(stream.rulesetVersion)
    : null;
  for (let i = 0; i < count; i += 1) {
    const side = drawRandom(cursor, rng);
    cursor = side.cursor;
    const lowRiskSide = side.value < 0.5 ? 'left' : 'right';
    let risk: BridgeRow['risk'];
    let special: ReturnType<typeof journeyRow> | undefined;
    if (odds) {
      const left = drawRandom(cursor, rng);
      const right = drawRandom(left.cursor, rng);
      cursor = right.cursor;
      if (stream.journey)
        special = journeyRow(
          stream.journey,
          BigInt(nextIndex) + 1n,
          lowRiskSide,
          left.value,
          right.value,
        );
      risk = {
        lowRiskSide,
        broken: special?.broken ?? {
          left: left.value < (lowRiskSide === 'left' ? odds.low : odds.high),
          right: right.value < (lowRiskSide === 'right' ? odds.low : odds.high),
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
      hasMystery: hasMystery || !!special?.encounter,
      ...(risk ? { risk } : {}),
      ...(special?.cue ? { cue: special.cue } : {}),
      ...(special?.encounter ? { encounter: special.encounter } : {}),
    };
    rows.push(risk ? { ...row, safeSide: hintSafeSide(row) ?? lowRiskSide } : row);
    nextIndex = addDecimal(nextIndex);
  }
  return {
    rows,
    stream: { ...stream, nextIndex, nextMysteryIndex, rng: cursor },
  };
}
