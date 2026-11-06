import { decimal } from './numbers.ts';
import type { EffectKind } from './types.ts';
import { PACED_RULESET_VERSION, SCAN_RULESET_VERSION } from './pacing.ts';

export const RULESET_VERSION = 'infinity-v1';
/** Experimental, separately identified balance; existing ranked runs remain v1. */
export const PACT_RULESET_VERSION = 'infinity-v2-pacts';
export const BALANCE_RULESET_VERSION = 'infinity-v3-balance';
export const RISK_RULESET_VERSION = 'infinity-v4-hidden-risk';
export const DIRECTOR_RULESET_VERSION = 'infinity-v5-mystery';
export const RELIC_RULESET_VERSION = 'infinity-v6-relics';
export const DISCOVERY_RULESET_VERSION = 'infinity-v7-discovery';
export const DISCOVERY_INTRO_MS = 4_000;
export const CHOICE_GRACE_MS = 60_000;
export const IDLE_WARNING_MS = 3_000;
export const DEATH_COUNTDOWN_MS = 10_000;
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

export const PACT_MYSTERY_TABLE: typeof MYSTERY_TABLE = Object.freeze([
  ...MYSTERY_TABLE.map((entry) => Object.freeze({ ...entry, weight: entry.weight * 0.8 })),
  ...(
    ['blood_oath', 'false_oracle', 'hungry_vault', 'borrowed_time', 'soul_exchange'] as const
  ).map((kind) => Object.freeze({ kind, weight: 4 })),
]);

export const PACT_RULESET = Object.freeze({
  ...RULESET,
  version: PACT_RULESET_VERSION,
  mysteryTable: PACT_MYSTERY_TABLE,
});

export const BALANCE_MYSTERY_TABLE: typeof MYSTERY_TABLE = Object.freeze([
  ...PACT_MYSTERY_TABLE.map((entry) =>
    Object.freeze({
      kind:
        entry.kind === 'regen_5s'
          ? 'regen_3rows'
          : entry.kind === 'drain_5s'
            ? 'bleed_3rows'
            : entry.kind,
      weight: entry.weight * 0.84,
    }),
  ),
  ...(['double_gain_21s', 'double_loss_21s', 'half_life', 'marketing'] as const).map((kind) =>
    Object.freeze({ kind, weight: 4 }),
  ),
]);

export const BALANCE_RULESET = Object.freeze({
  ...PACT_RULESET,
  version: BALANCE_RULESET_VERSION,
  maxSp: null,
  mysteryTable: BALANCE_MYSTERY_TABLE,
  fixedDamage: 5,
});

export const RISK_MYSTERY_TABLE: typeof MYSTERY_TABLE = Object.freeze([
  ...BALANCE_MYSTERY_TABLE.map((entry) => Object.freeze({ ...entry, weight: entry.weight * 0.96 })),
  Object.freeze({ kind: 'coyote_10s' as const, weight: 4 }),
]);
export const RISK_RULESET = Object.freeze({
  ...BALANCE_RULESET,
  version: RISK_RULESET_VERSION,
  mysteryTable: RISK_MYSTERY_TABLE,
  lowBreakRisk: 0.01,
  highBreakRisk: 0.4,
});

export const DIRECTOR_MYSTERY_TABLE: typeof MYSTERY_TABLE = Object.freeze([
  ...RISK_MYSTERY_TABLE.map((entry) => Object.freeze({ ...entry, weight: entry.weight * 0.96 })),
  Object.freeze({ kind: 'mystery_silence_30s' as const, weight: 2 }),
  Object.freeze({ kind: 'mystery_surge_30s' as const, weight: 2 }),
]);
export const DIRECTOR_RULESET = Object.freeze({
  ...RISK_RULESET,
  version: DIRECTOR_RULESET_VERSION,
  mysteryTable: DIRECTOR_MYSTERY_TABLE,
  mysteryMinGap: 5,
  mysteryMaxGap: 5,
});

export const RELIC_RULESET = Object.freeze({
  ...DIRECTOR_RULESET,
  version: RELIC_RULESET_VERSION,
  mysteryMaxGap: 7,
});

export const DISCOVERY_RULESET = Object.freeze({
  ...RELIC_RULESET,
  version: DISCOVERY_RULESET_VERSION,
});

export function usesRelicRules(version: string): boolean {
  return version === RELIC_RULESET_VERSION || version === DISCOVERY_RULESET_VERSION;
}

export function usesMysteryDirectorRules(version: string): boolean {
  return version === DIRECTOR_RULESET_VERSION || usesRelicRules(version);
}

export function usesRiskRules(version: string): boolean {
  return version === RISK_RULESET_VERSION || usesMysteryDirectorRules(version);
}

export function usesBalanceRules(version: string): boolean {
  return version === BALANCE_RULESET_VERSION || usesRiskRules(version);
}

export function supportsPacts(version: string): boolean {
  return version === PACT_RULESET_VERSION || usesBalanceRules(version);
}

const PACED_RULESET = Object.freeze({ ...RULESET, version: PACED_RULESET_VERSION });
const SCAN_RULESET = Object.freeze({ ...RULESET, version: SCAN_RULESET_VERSION });

export function getRuleset(
  version: string = RULESET_VERSION,
):
  | typeof RULESET
  | typeof PACT_RULESET
  | typeof BALANCE_RULESET
  | typeof RISK_RULESET
  | typeof DIRECTOR_RULESET
  | typeof RELIC_RULESET
  | typeof DISCOVERY_RULESET
  | typeof PACED_RULESET
  | typeof SCAN_RULESET {
  if (version === PACED_RULESET_VERSION) return PACED_RULESET;
  if (version === SCAN_RULESET_VERSION) return SCAN_RULESET;
  if (version === DISCOVERY_RULESET_VERSION) return DISCOVERY_RULESET;
  if (version === RELIC_RULESET_VERSION) return RELIC_RULESET;
  if (version === DIRECTOR_RULESET_VERSION) return DIRECTOR_RULESET;
  if (version === RISK_RULESET_VERSION) return RISK_RULESET;
  if (version === BALANCE_RULESET_VERSION) return BALANCE_RULESET;
  if (version === PACT_RULESET_VERSION) return PACT_RULESET;
  if (version !== RULESET_VERSION) throw new RangeError(`Unsupported ruleset: ${version}`);
  return RULESET;
}

export function getRowBandDamage(
  oneBasedRow: string | bigint | number,
  rulesetVersion = RULESET_VERSION,
): number {
  const row = BigInt(decimal(oneBasedRow));
  if (row < 1n) throw new RangeError('Damage requires a one-based row.');
  if (usesBalanceRules(rulesetVersion)) return BALANCE_RULESET.fixedDamage;
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

export function clampSp(sp: number, rulesetVersion = RULESET_VERSION): number {
  if (!Number.isSafeInteger(sp)) throw new RangeError('SP must be an integer.');
  const max = getRuleset(rulesetVersion).maxSp;
  return Math.max(0, max === null ? sp : Math.min(max, sp));
}
