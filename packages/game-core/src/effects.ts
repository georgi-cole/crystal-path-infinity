import { addSafeInteger, assertNonNegativeInteger } from './numbers.ts';
import {
  EFFECT_DURATION_MS,
  EFFECT_TICK_MS,
  MAX_ACTIVE_EFFECTS,
  getRuleset,
  RULESET_VERSION,
  usesBalanceRules,
} from './rules.ts';
import { effectDuration } from './effect-rules.ts';
import { isPactKind } from './pacts.ts';
import type { ActiveEffect, EffectKind, TimedEffectKind } from './types.ts';

export interface MysteryApplied {
  readonly spDelta: number;
  readonly hintDelta: number;
  readonly addedEffect: ActiveEffect | null;
  readonly label: string;
}

export function rollMysteryEffect(
  sample: number,
  rulesetVersion = RULESET_VERSION,
  allowPacts = true,
  allowedKinds?: readonly EffectKind[],
): EffectKind {
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('Mystery sample must be finite and in [0, 1).');
  }
  const table = getRuleset(rulesetVersion).mysteryTable.filter(
    (entry) =>
      (allowPacts || !isPactKind(entry.kind)) &&
      (!allowedKinds || allowedKinds.includes(entry.kind)),
  );
  if (!table.length) throw new RangeError('No eligible mystery result.');
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = sample * total;
  let cumulative = 0;
  for (const entry of table) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.kind;
  }
  return table[table.length - 1].kind;
}

export function applyMysteryEffect(kind: EffectKind, now: number): MysteryApplied {
  assertNonNegativeInteger(now, 'Active time');
  switch (kind) {
    case 'blood_oath':
    case 'false_oracle':
    case 'hungry_vault':
    case 'borrowed_time':
    case 'soul_exchange':
    case 'half_life':
    case 'marketing':
    case 'mystery_silence_30s':
    case 'mystery_surge_30s':
      return { spDelta: 0, hintDelta: 0, addedEffect: null, label: kind };
    case 'regen_3rows':
    case 'bleed_3rows':
      return {
        spDelta: 0,
        hintDelta: 0,
        addedEffect: { kind, startedAt: now, expiresAt: null, nextTickAt: null, rowsLeft: 3 },
        label: kind,
      };
    case 'heal_10':
      return { spDelta: 10, hintDelta: 0, addedEffect: null, label: '+10 SP' };
    case 'heal_20':
      return { spDelta: 20, hintDelta: 0, addedEffect: null, label: '+20 SP' };
    case 'gain_hint':
      return { spDelta: 0, hintDelta: 1, addedEffect: null, label: '+1 Hint' };
    case 'hurt_10':
      return { spDelta: -10, hintDelta: 0, addedEffect: null, label: '-10 SP' };
    case 'hurt_15':
      return { spDelta: -15, hintDelta: 0, addedEffect: null, label: '-15 SP' };
    case 'lose_hint':
      return { spDelta: 0, hintDelta: -1, addedEffect: null, label: '-1 Hint' };
    case 'shield_5s':
    case 'regen_5s':
    case 'lucky_5s':
    case 'fragility_5s':
    case 'drain_5s':
    case 'inversion_5s':
    case 'double_gain_21s':
    case 'double_loss_21s':
    case 'coyote_10s':
      return {
        spDelta: 0,
        hintDelta: 0,
        addedEffect: {
          kind,
          startedAt: now,
          expiresAt: addSafeInteger(
            now,
            effectDuration(kind) ?? EFFECT_DURATION_MS,
            'Effect expiry',
          ),
          nextTickAt:
            kind === 'regen_5s' || kind === 'drain_5s'
              ? addSafeInteger(now, EFFECT_TICK_MS, 'First effect tick')
              : null,
        },
        label: `${kind.slice(0, 1).toUpperCase()}${kind.slice(1).replace('_', ' ')}`,
      };
  }
}

export function pruneEffects(effects: readonly ActiveEffect[], now: number): ActiveEffect[] {
  return effects.filter((effect) => effect.expiresAt === null || effect.expiresAt > now);
}

export function mergeEffect(
  effects: readonly ActiveEffect[],
  added: ActiveEffect | null,
  now: number,
  rulesetVersion = RULESET_VERSION,
): ActiveEffect[] {
  let alive = pruneEffects(effects, now);
  if (!added) return alive;
  if (usesBalanceRules(rulesetVersion))
    alive = alive.filter((effect) => effect.kind !== added.kind);
  if (alive.length >= MAX_ACTIVE_EFFECTS) {
    // Stable sort preserves source insertion order when expiries tie.
    alive.sort((left, right) => (left.expiresAt ?? Infinity) - (right.expiresAt ?? Infinity));
    alive.splice(0, alive.length - MAX_ACTIVE_EFFECTS + 1);
  }
  return [...alive, added];
}

export function resolveWrongTileDelta(
  baseDamage: number,
  effects: readonly ActiveEffect[],
  now: number,
  rulesetVersion = RULESET_VERSION,
): { delta: number; newEffects: ActiveEffect[]; consumedKind?: TimedEffectKind } {
  assertNonNegativeInteger(baseDamage, 'Base damage');
  const alive = pruneEffects(effects, now);
  if (alive.some((effect) => effect.kind === 'coyote_10s')) {
    // Coyote prevents tile damage without wasting Aegis or Brittle oath.
    // Healing wrong steps still work and Borrowed luck still spends its charge.
    const lucky = alive.findIndex((effect) => effect.kind === 'lucky_5s');
    if (lucky >= 0)
      return {
        delta: baseDamage,
        newEffects: alive.filter((_, index) => index !== lucky),
        consumedKind: 'lucky_5s',
      };
    return {
      delta: alive.some((effect) => effect.kind === 'inversion_5s') ? baseDamage : 0,
      newEffects: alive,
    };
  }
  for (const kind of ['shield_5s', 'lucky_5s', 'inversion_5s', 'fragility_5s'] as const) {
    const index = alive.findIndex((effect) => effect.kind === kind);
    if (index < 0) continue;
    if (kind === 'inversion_5s')
      return {
        delta: usesBalanceRules(rulesetVersion) ? baseDamage : Math.floor(baseDamage / 2),
        newEffects: alive,
      };
    return {
      delta: kind === 'shield_5s' ? 0 : kind === 'lucky_5s' ? baseDamage : -(baseDamage * 2),
      newEffects: alive.filter((_, position) => position !== index),
      consumedKind: kind,
    };
  }
  return { delta: -baseDamage, newEffects: alive };
}
