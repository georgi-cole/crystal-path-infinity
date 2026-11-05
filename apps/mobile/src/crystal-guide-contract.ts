import {
  getRuleset,
  ROW_GRACE_MS,
  DEATH_CLOCK_MS,
  SURVIVAL_BONUS_SP,
  SURVIVAL_BONUS_INTERVAL_MS,
  HINT_SCAN_MS,
} from '@crystal-path-infinity/game-core';
import type { RunEvent, EffectKind } from '@crystal-path-infinity/game-core';
import { PRACTICE_RULESET_VERSION } from './practice-rules';

export const GUIDE_RULES = getRuleset(PRACTICE_RULESET_VERSION);
export const GUIDE_PACING = {
  grace: ROW_GRACE_MS,
  countdown: DEATH_CLOCK_MS,
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
} as const satisfies Record<keyof typeof GUIDE_RULES, Intent>;
export const GUIDE_EVENT_COVERAGE = {
  'choice-resolved': 'fracture',
  'row-cleared': 'footing',
  'hint-used': 'insight',
  'survival-bonus': 'pursuit',
  'mystery-resolved': 'temptation',
  death: 'pursuit',
  'effects-ticked': 'discovery',
  'effects-expired': 'discovery',
  'run-ended': 'footing',
  'reward-pending': 'account',
  'reward-cleared': 'account',
  'revive-granted': 'account',
  'revive-applied': 'account',
} as const satisfies Record<RunEvent['type'], Intent>;
export const GUIDE_MYSTERY_COVERAGE = {
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
