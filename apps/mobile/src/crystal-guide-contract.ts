import {
  getRuleset,
  IDLE_WARNING_MS,
  DEATH_COUNTDOWN_MS,
  SURVIVAL_BONUS_SP,
  SURVIVAL_BONUS_INTERVAL_MS,
  HINT_SCAN_MS,
} from '@crystal-path-infinity/game-core';
import type { RunEvent, EffectKind } from '@crystal-path-infinity/game-core';
import { PRACTICE_RULESET_VERSION } from './practice-rules';

export const GUIDE_RULES = getRuleset(PRACTICE_RULESET_VERSION);
export const GUIDE_PACING = {
  grace: IDLE_WARNING_MS,
  countdown: DEATH_COUNTDOWN_MS,
  bonus: SURVIVAL_BONUS_SP,
  interval: SURVIVAL_BONUS_INTERVAL_MS,
  scan: HINT_SCAN_MS,
};
export const GUIDE_CHAPTERS = ['footing', 'fracture', 'insight', 'pursuit', 'temptation'] as const;
type Intent = (typeof GUIDE_CHAPTERS)[number] | 'discovery' | 'account';

/** New rule fields/events cannot silently bypass a guide review in a later PR.
 * Numbers are read live, while the writer decides what belongs to discovery. */
export const GUIDE_RULE_COVERAGE = {
  version: 'footing',
  fixedDamage: 'fracture',
  lowBreakRisk: 'discovery',
  highBreakRisk: 'discovery',
  startingSp: 'footing',
  maxSp: 'discovery',
  startingHints: 'insight',
  effectDurationMs: 'discovery',
  effectTickMs: 'discovery',
  effectTickSp: 'discovery',
  maxActiveEffects: 'discovery',
  mysteryMinGap: 'discovery',
  mysteryMaxGap: 'discovery',
  mysteryTable: 'temptation',
  reviveSp: 'discovery',
} as const satisfies Record<
  keyof typeof GUIDE_RULES | 'fixedDamage' | 'lowBreakRisk' | 'highBreakRisk',
  Intent
>;
export const GUIDE_EVENT_COVERAGE = {
  'choice-resolved': 'fracture',
  'row-cleared': 'footing',
  'hint-used': 'insight',
  'survival-bonus': 'pursuit',
  'mystery-resolved': 'temptation',
  death: 'pursuit',
  'row-effect-ticked': 'discovery',
  'hint-unavailable': 'insight',
  'death-clock-ticked': 'pursuit',
  'pact-resolved': 'discovery',
  'effects-ticked': 'discovery',
  'effects-expired': 'discovery',
  'run-ended': 'footing',
  'reward-pending': 'account',
  'reward-cleared': 'account',
  'revive-granted': 'account',
  'revive-applied': 'account',
  'test-resource-used': 'account',
  'journey-resource-used': 'account',
  'journey-gear-queued': 'account',
  'journey-loadout-applied': 'account',
} as const satisfies Record<RunEvent['type'], Intent>;
export const GUIDE_MYSTERY_COVERAGE = {
  regen_3rows: 'discovery',
  bleed_3rows: 'discovery',
  blood_oath: 'discovery',
  false_oracle: 'discovery',
  hungry_vault: 'discovery',
  borrowed_time: 'discovery',
  soul_exchange: 'discovery',
  half_life: 'discovery',
  marketing: 'discovery',
  double_gain_21s: 'discovery',
  double_loss_21s: 'discovery',
  coyote_10s: 'discovery',
  mystery_silence_30s: 'discovery',
  mystery_surge_30s: 'discovery',
  heal_10: 'discovery',
  heal_20: 'discovery',
  gain_hint: 'discovery',
  shield_5s: 'discovery',
  regen_5s: 'discovery',
  lucky_5s: 'discovery',
  hurt_10: 'discovery',
  hurt_15: 'discovery',
  lose_hint: 'discovery',
  fragility_5s: 'discovery',
  drain_5s: 'discovery',
  inversion_5s: 'discovery',
} as const satisfies Record<EffectKind, Intent>;
