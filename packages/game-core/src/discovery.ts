import { addSafeInteger, assertNonNegativeInteger } from './numbers.ts';
import { isPactKind } from './pacts.ts';
import {
  DISCOVERY_RULESET_VERSION,
  DISCOVERY_INTRO_MS,
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

export function assertDiscovery(value: MysteryDiscovery, activeTimeMs: number): void {
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
    intro.expiresAt - intro.startedAt !== DISCOVERY_INTRO_MS ||
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
              DISCOVERY_INTRO_MS,
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

/** Reading consumes at most four seconds, and none of an owned effect's lifetime.
 * This lives in the engine so catch-up ticks, pause and checkpoint recovery agree. */
export function settleDiscoveryIntroduction(
  state: RunState,
  now: number,
  observedAt: number,
): RunState {
  const intro = state.discovery?.introduction;
  if (!intro) return state;
  const until = Math.min(now, intro.expiresAt);
  const elapsed = until - state.activeTimeMs;
  const shift = (time: number) => addSafeInteger(time, elapsed, 'Frozen introduction time');
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
      lastStepAt: until,
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
