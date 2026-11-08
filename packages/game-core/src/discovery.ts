import { addSafeInteger, assertNonNegativeInteger } from './numbers.ts';
import { isPactKind } from './pacts.ts';
import {
  DISCOVERY_RULESET_VERSION,
  IDLE_WARNING_MS,
  discoveryTiming,
  getRuleset,
  usesDiscoveryRules,
} from './rules.ts';
import type { EffectKind, MysteryDiscovery, RunState } from './types.ts';

export function needsDiscoveryIntroduction(kind: EffectKind): boolean {
  return (
    !isPactKind(kind) &&
    !['heal_10', 'heal_20', 'hurt_10', 'hurt_15', 'gain_hint', 'lose_hint'].includes(kind)
  );
}

export function assertDiscovery(
  value: MysteryDiscovery,
  activeTimeMs: number,
  rulesetVersion = DISCOVERY_RULESET_VERSION,
): void {
  const kinds = getRuleset(DISCOVERY_RULESET_VERSION).mysteryTable.map(({ kind }) => kind);
  if (
    !value ||
    !Array.isArray(value.known) ||
    value.known.length > kinds.length ||
    new Set(value.known).size !== value.known.length ||
    value.known.some(
      (kind: unknown) => typeof kind !== 'string' || !kinds.includes(kind as EffectKind),
    )
  )
    throw new RangeError('Invalid mystery discoveries.');
  const intro = value.introduction;
  if (intro === null) return;
  if (!intro || !value.known.includes(intro.kind) || !needsDiscoveryIntroduction(intro.kind))
    throw new RangeError('Invalid mystery introduction.');
  assertNonNegativeInteger(intro.startedAt, 'Introduction start');
  assertNonNegativeInteger(intro.expiresAt, 'Introduction expiry');
  if (
    intro.expiresAt - intro.startedAt !== discoveryTiming(rulesetVersion).displayMs ||
    intro.startedAt > activeTimeMs ||
    intro.expiresAt <= activeTimeMs
  )
    throw new RangeError('Invalid mystery introduction time.');
}

export function discoverMystery(state: RunState, kind: EffectKind): RunState {
  if (!usesDiscoveryRules(state.rulesetVersion) || state.discovery!.known.includes(kind))
    return state;
  const introduce = needsDiscoveryIntroduction(kind) && state.sp > 0;
  return {
    ...state,
    discovery: {
      known: [...state.discovery!.known, kind],
      introduction: introduce
        ? {
            kind,
            startedAt: state.activeTimeMs,
            expiresAt: addSafeInteger(
              state.activeTimeMs,
              discoveryTiming(state.rulesetVersion).displayMs,
              'Introduction expiry',
            ),
          }
        : null,
    },
    ...(introduce
      ? {
          mysteryDirector: {
            ...state.mysteryDirector!,
            lastStepAt: state.activeTimeMs,
            pressure: undefined,
          },
        }
      : {}),
  };
}

/** Advance the protected part of the reading window without consuming effects.
 * The description can remain visible after normal time resumes. */
export function settleDiscoveryIntroduction(
  state: RunState,
  now: number,
  observedAt: number,
): RunState {
  const intro = state.discovery?.introduction;
  if (!intro) return state;
  const timing = discoveryTiming(state.rulesetVersion);
  const holdUntil = addSafeInteger(intro.startedAt, timing.holdMs, 'Reading hold expiry');
  const until = Math.min(now, holdUntil);
  const elapsed = until - state.activeTimeMs;
  if (elapsed <= 0) return state;
  const shift = (time: number) => addSafeInteger(time, elapsed, 'Frozen introduction time');
  // Keep the same death-clock deadline after the description is dismissed.
  const clockAnchor = addSafeInteger(
    intro.startedAt,
    timing.warningDelayMs - IDLE_WARNING_MS,
    'Reading death clock anchor',
  );
  return {
    ...state,
    activeTimeMs: until,
    lastObservedAt: observedAt,
    discovery: { ...state.discovery, introduction: until === intro.expiresAt ? null : intro },
    effects: state.effects.map((effect) =>
      effect.expiresAt === null
        ? { ...effect, startedAt: shift(effect.startedAt) }
        : {
            ...effect,
            startedAt: shift(effect.startedAt),
            expiresAt: shift(effect.expiresAt),
            nextTickAt: effect.nextTickAt === null ? null : shift(effect.nextTickAt),
          },
    ),
    mysteryDirector: {
      ...state.mysteryDirector!,
      lastStepAt: Math.min(until, clockAnchor),
      pressure: undefined,
      rhythm: state.mysteryDirector!.rhythm
        ? {
            ...state.mysteryDirector!.rhythm,
            startedAt: shift(state.mysteryDirector!.rhythm.startedAt),
            expiresAt: shift(state.mysteryDirector!.rhythm.expiresAt),
          }
        : null,
    },
  };
}

export function endDiscoveryIntroduction(state: RunState): RunState {
  return state.discovery?.introduction
    ? { ...state, discovery: { ...state.discovery, introduction: null } }
    : state;
}
