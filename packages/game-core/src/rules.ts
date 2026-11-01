import { decimal } from './numbers.ts';
import type { EffectKind } from './types.ts';

export const RULESET_VERSION = 'infinity-v1';
export const STARTING_SP = 300;
export const MAX_SP = 400;
export const STARTING_HINTS = 2;
export const EFFECT_DURATION_MS = 5_000;
export const EFFECT_TICK_MS = 500;
export const EFFECT_TICK_SP = 2;
export const MAX_ACTIVE_EFFECTS = 2;
export const MYSTERY_MIN_GAP = 3;
export const MYSTERY_MAX_GAP = 6;
export const MAX_REVIVES = 10;
/** Operational allocation bound, not a limit on route distance. */
export const MAX_ROW_BATCH = 256;
export const MAX_BUFFER_ROWS = 256;

/** Literal weights/order from bbmobilenew-source@6ace929a60410e728928aa51eaf80ba9b5cf2262. */
export const MYSTERY_TABLE: readonly Readonly<{ kind: EffectKind; weight: number }>[] =
  Object.freeze(
    [
      { kind: 'heal_10', weight: 14 },
      { kind: 'heal_20', weight: 8 },
      { kind: 'gain_hint', weight: 10 },
      { kind: 'shield_5s', weight: 10 },
      { kind: 'regen_5s', weight: 8 },
      { kind: 'lucky_5s', weight: 7 },
      { kind: 'hurt_10', weight: 12 },
      { kind: 'hurt_15', weight: 7 },
      { kind: 'lose_hint', weight: 6 },
      { kind: 'fragility_5s', weight: 7 },
      { kind: 'drain_5s', weight: 5 },
      { kind: 'inversion_5s', weight: 6 },
    ].map((entry) => Object.freeze(entry as { kind: EffectKind; weight: number })),
  );

export const RULESET = Object.freeze({
  version: RULESET_VERSION,
  startingSp: STARTING_SP,
  maxSp: MAX_SP,
  startingHints: STARTING_HINTS,
  effectDurationMs: EFFECT_DURATION_MS,
  effectTickMs: EFFECT_TICK_MS,
  effectTickSp: EFFECT_TICK_SP,
  maxActiveEffects: MAX_ACTIVE_EFFECTS,
  mysteryMinGap: MYSTERY_MIN_GAP,
  mysteryMaxGap: MYSTERY_MAX_GAP,
  mysteryTable: MYSTERY_TABLE,
  reviveSp: Object.freeze([200, 200, 200, 200, 200, 150, 150, 150, 150, 150]),
});

export function getRuleset(version: string = RULESET_VERSION): typeof RULESET {
  if (version !== RULESET_VERSION) throw new RangeError(`Unsupported ruleset: ${version}`);
  return RULESET;
}

export function getRowBandDamage(oneBasedRow: string | bigint | number): number {
  const row = BigInt(decimal(oneBasedRow));
  if (row < 1n) throw new RangeError('Damage requires a one-based row.');
  if (row <= 10n) return 10;
  if (row <= 25n) return 15;
  return 20;
}

export function getReviveSp(ordinal: number): number {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > MAX_REVIVES) {
    throw new RangeError('Revive ordinal must be between one and ten.');
  }
  return RULESET.reviveSp[ordinal - 1];
}

export function clampSp(sp: number): number {
  if (!Number.isSafeInteger(sp)) throw new RangeError('SP must be an integer.');
  return Math.max(0, Math.min(MAX_SP, sp));
}
