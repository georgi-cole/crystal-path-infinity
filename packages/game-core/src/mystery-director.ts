import { addDecimal, addSafeInteger, assertNonNegativeInteger, decimal } from './numbers.ts';
import { drawRandom } from './random.ts';
import {
  usesRelicRules,
  usesMysteryDirectorRules,
  getRuleset,
  CHOICE_GRACE_MS,
  IDLE_WARNING_MS,
  discoveryTiming,
  DEATH_COUNTDOWN_MS,
  usesBusinessRules,
  usesExtendedDiscoveryReading,
  assertSpAmount,
} from './rules.ts';
import { isPactKind } from './pacts.ts';
import type { EffectKind, MysteryTier, RandomSource, RunState } from './types.ts';

export const MYSTERY_TIER_WEIGHTS = Object.freeze({
  standard: 70,
  choice: 20,
  major: 6,
  anomaly: 4,
});
export const MYSTERY_TIERS = Object.freeze(['standard', 'choice', 'major', 'anomaly'] as const);

/** Schedule once, on a game transition. Reading, saving and buffering never reroll the gap. */
export function scheduleNextMystery(
  state: RunState,
  afterRow: string,
  rng: RandomSource,
): RunState {
  const rules = getRuleset(state.rulesetVersion);
  const surge = state.mysteryDirector!.rhythm?.kind === 'mystery_surge_30s';
  const draw =
    !surge && usesRelicRules(state.rulesetVersion) ? drawRandom(state.mysteryRng, rng) : null;
  const gap = surge
    ? 3
    : rules.mysteryMinGap +
      (draw ? Math.floor(draw.value * (rules.mysteryMaxGap - rules.mysteryMinGap + 1)) : 0);
  return {
    ...state,
    mysteryRng: draw?.cursor ?? state.mysteryRng,
    mysteryDirector: { ...state.mysteryDirector!, nextRow: addDecimal(afterRow, BigInt(gap)) },
  };
}
const cooldowns: Partial<Record<EffectKind, readonly [number, number]>> = {
  marketing: [20, 30_000],
  hungry_vault: [20, 30_000],
  false_oracle: [20, 30_000],
  half_life: [60, 180_000],
  soul_exchange: [45, 120_000],
  blood_oath: [35, 90_000],
  borrowed_time: [40, 90_000],
};
export function mysteryTier(kind: EffectKind): MysteryTier {
  if (kind === 'mystery_silence_30s' || kind === 'mystery_surge_30s') return 'anomaly';
  if (['half_life', 'soul_exchange', 'blood_oath', 'borrowed_time'].includes(kind)) return 'major';
  return isPactKind(kind) ? 'choice' : 'standard';
}
export function mysteryEligibleKinds(state: RunState, tier: MysteryTier): EffectKind[] {
  const history = state.mysteryDirector?.history ?? [];
  const row = BigInt(state.currentRow),
    now = state.activeTimeMs;
  const ready = (old: (typeof history)[number], rows: number, ms: number) =>
    row - BigInt(old.row) >= BigInt(rows) && now - old.at >= ms;
  if ((tier === 'choice' || tier === 'major') && state.pact) return [];
  if (tier === 'anomaly' && state.mysteryDirector?.rhythm) return [];
  if (
    tier !== 'standard' &&
    history.some((old) => {
      const previous = mysteryTier(old.kind);
      if (tier === 'major' && previous === 'major') return !ready(old, 30, 90_000);
      if (tier === 'anomaly' && previous === 'anomaly') return !ready(old, 30, 60_000);
      return (
        (tier === 'choice' || tier === 'major') &&
        (previous === 'choice' || previous === 'major') &&
        !ready(old, 10, 0)
      );
    })
  )
    return [];
  return getRuleset(state.rulesetVersion)
    .mysteryTable.filter(({ kind }) => {
      if (mysteryTier(kind) !== tier) return false;
      const previous = history.find((old) => old.kind === kind);
      const [rows, ms] = cooldowns[kind] ?? [10, 0];
      return !previous || ready(previous, rows, ms);
    })
    .map(({ kind }) => kind);
}

/** A box gets its public tier once on arrival, never from a render or a repeated click. */
export function prepareMysteryRow(state: RunState, rng: RandomSource): RunState {
  if (!usesMysteryDirectorRules(state.rulesetVersion) || state.status !== 'playing') return state;
  let next = state;
  let director = next.mysteryDirector!;
  if (director.rhythm && director.rhythm.expiresAt <= next.activeTimeMs) {
    director = {
      ...director,
      rhythm: null,
    };
    next = { ...next, mysteryDirector: director };
    if (!next.current.mysteryTier) next = scheduleNextMystery(next, next.currentRow, rng);
    director = next.mysteryDirector!;
  }
  const available =
    BigInt(next.currentRow) >= BigInt(director.nextRow) &&
    director.rhythm?.kind !== 'mystery_silence_30s';
  if (available && !next.current.mysteryTier) {
    const tiers = MYSTERY_TIERS.filter((tier) => mysteryEligibleKinds(next, tier).length > 0);
    const draw = drawRandom(next.mysteryRng, rng);
    let roll = draw.value * tiers.reduce((sum, tier) => sum + MYSTERY_TIER_WEIGHTS[tier], 0);
    const selected =
      tiers.find((tier) => {
        roll -= MYSTERY_TIER_WEIGHTS[tier];
        return roll < 0;
      }) ?? 'standard';
    next = {
      ...next,
      mysteryRng: draw.cursor,
      current: { ...next.current, mysteryTier: selected },
    };
  }
  const currentIndex = (BigInt(next.currentRow) - 1n).toString();
  return {
    ...next,
    rows: next.rows.map((row) => ({
      ...row,
      hasMystery: row.index === currentIndex && !!next.current.mysteryTier,
    })),
  };
}

export function recordMysteryOpen(state: RunState, kind: EffectKind, rng: RandomSource): RunState {
  const director = state.mysteryDirector!;
  const history = [
    ...director.history.filter((old) => old.kind !== kind),
    { kind, row: state.currentRow, at: state.activeTimeMs },
  ];
  const special = mysteryTier(kind) === 'anomaly';
  const next: RunState = {
    ...state,
    mysteryDirector: {
      ...director,
      history,
      ...(isPactKind(kind) ? { pressure: undefined } : {}),
      ...(special
        ? {
            rhythm: {
              kind: kind as 'mystery_silence_30s' | 'mystery_surge_30s',
              startedAt: state.activeTimeMs,
              expiresAt: addSafeInteger(state.activeTimeMs, 30_000, 'Mystery rhythm expiry'),
            },
          }
        : {}),
    },
  };
  return special ? scheduleNextMystery(next, state.currentRow, rng) : next;
}

export function advanceMysteryRow(
  state: RunState,
  clearedRow: string,
  rng: RandomSource,
): RunState {
  if (!state.mysteryDirector) return state;
  const next: RunState = {
    ...state,
    mysteryDirector: {
      ...state.mysteryDirector,
      lastStepAt: state.activeTimeMs,
      pressure: undefined,
    },
  };
  return BigInt(clearedRow) >= BigInt(state.mysteryDirector.nextRow)
    ? scheduleNextMystery(next, clearedRow, rng)
    : next;
}

/** Redistribute healing/damage over the time still left; resource changes never extend the clock. */
export function rebaseDeathPressure(state: RunState, previousSp: number): RunState {
  if (!state.mysteryDirector?.pressure || state.sp === previousSp) return state;
  return {
    ...state,
    mysteryDirector: {
      ...state.mysteryDirector,
      pressure: { anchorAt: state.activeTimeMs, anchorSp: state.sp, paid: 0 },
    },
  };
}

/** A newly accepted hint or box gets a fresh reading window, once per action. */
export function refreshDecisionWindow(state: RunState): RunState {
  if (usesExtendedDiscoveryReading(state.rulesetVersion) && state.discovery?.introduction)
    return state;
  return usesBusinessRules(state.rulesetVersion) && state.mysteryDirector
    ? {
        ...state,
        mysteryDirector: {
          ...state.mysteryDirector,
          lastStepAt: state.activeTimeMs,
          pressure: undefined,
        },
      }
    : state;
}

export function getDeathClock(
  state: RunState,
): { warningAt: number; expiresAt: number; firstLossAt?: number } | null {
  if (!usesMysteryDirectorRules(state.rulesetVersion) || state.status !== 'playing') return null;
  const intro = state.discovery?.introduction;
  const warningAt =
    state.pact?.phase === 'offered'
      ? addSafeInteger(state.pact.offeredAt!, CHOICE_GRACE_MS, 'Decision grace')
      : intro
        ? addSafeInteger(
            intro.startedAt,
            discoveryTiming(state.rulesetVersion).warningDelayMs,
            'Discovery grace',
          )
        : addSafeInteger(state.mysteryDirector!.lastStepAt, IDLE_WARNING_MS, 'Idle grace');
  return {
    warningAt,
    expiresAt: addSafeInteger(warningAt, DEATH_COUNTDOWN_MS, 'Death clock expiry'),
    ...(usesBusinessRules(state.rulesetVersion) ? { firstLossAt: warningAt + 3000 } : {}),
  };
}

/** Smooth acceleration: F(x) = .6x² + .4x³. Halfway costs exactly 20%, the end 100%.
 * Integer arithmetic preserves small/very large SP totals and identical catch-up results. */
export function deathClockPaid(
  anchorSp: number,
  anchorAt: number,
  warningAt: number,
  now: number,
  version?: string,
): number {
  if (version && usesBusinessRules(version)) {
    // First loss is half a point at three clock seconds. The remaining budget
    // follows the same accelerating curve over the final seven seconds.
    const first = warningAt + 3000;
    if (now < first) return 0;
    const units = BigInt(anchorSp * 2);
    const duration = 7000n;
    const polynomial = (at: number) => {
      const t = BigInt(Math.max(0, Math.min(7000, at - first)));
      return 3n * t * t * duration + 2n * t * t * t;
    };
    const end = 5n * duration * duration * duration;
    if (anchorAt < first) {
      const initial = units > 0n ? 1n : 0n;
      return Number(initial + ((units - initial) * polynomial(now)) / end) / 2;
    }
    const start = polynomial(anchorAt);
    return end <= start
      ? anchorSp
      : Number((units * (polynomial(now) - start)) / (end - start)) / 2;
  }
  const duration = BigInt(DEATH_COUNTDOWN_MS);
  const polynomial = (at: number) => {
    const t = BigInt(Math.max(0, Math.min(DEATH_COUNTDOWN_MS, at - warningAt)));
    return 3n * t * t * duration + 2n * t * t * t;
  };
  const start = polynomial(anchorAt),
    end = 5n * duration * duration * duration;
  return end <= start
    ? anchorSp
    : Number((BigInt(anchorSp) * (polynomial(now) - start)) / (end - start));
}

export function assertMysteryDirector(state: RunState): void {
  const d = state.mysteryDirector;
  if (!usesMysteryDirectorRules(state.rulesetVersion)) {
    if (
      d !== undefined ||
      state.current.mysteryTier !== undefined ||
      state.pact?.offeredAt !== undefined
    )
      throw new RangeError('Director outside a supported ruleset.');
    return;
  }
  if (!d || !Array.isArray(d.history) || d.history.length > 24)
    throw new RangeError('Invalid mystery director.');
  decimal(d.nextRow);
  assertNonNegativeInteger(d.lastStepAt, 'Last step time');
  if (d.lastStepAt > state.activeTimeMs) throw new RangeError('Last step in future.');
  if (d.pressure) {
    assertNonNegativeInteger(d.pressure.anchorAt, 'Pressure anchor');
    assertSpAmount(d.pressure.anchorSp, 'Pressure budget', state.rulesetVersion);
    assertSpAmount(d.pressure.paid, 'Pressure paid', state.rulesetVersion);
    if (d.pressure.anchorAt > state.activeTimeMs || d.pressure.paid > d.pressure.anchorSp)
      throw new RangeError('Invalid death clock pressure.');
  }
  if (BigInt(d.nextRow) < 1n) throw new RangeError('Invalid mystery schedule.');
  const kinds = new Set<string>();
  for (const old of d.history as NonNullable<RunState['mysteryDirector']>['history']) {
    decimal(old.row);
    assertNonNegativeInteger(old.at, 'Mystery cooldown');
    if (
      BigInt(old.row) > BigInt(state.currentRow) ||
      old.at > state.activeTimeMs ||
      kinds.has(old.kind) ||
      !getRuleset(state.rulesetVersion).mysteryTable.some(({ kind }) => old.kind === kind)
    )
      throw new RangeError('Invalid cooldown history.');
    kinds.add(old.kind);
  }
  if (state.current.mysteryTier !== undefined && !MYSTERY_TIERS.includes(state.current.mysteryTier))
    throw new RangeError('Invalid mystery tier.');
  if (d.rhythm) {
    assertNonNegativeInteger(d.rhythm.startedAt, 'Rhythm start');
    assertNonNegativeInteger(d.rhythm.expiresAt, 'Rhythm expiry');
    if (
      mysteryTier(d.rhythm.kind) !== 'anomaly' ||
      d.rhythm.expiresAt - d.rhythm.startedAt !== 30_000 ||
      d.rhythm.startedAt > state.activeTimeMs
    )
      throw new RangeError('Invalid mystery rhythm.');
  }
  if (state.pact?.phase === 'offered') {
    assertNonNegativeInteger(state.pact.offeredAt!, 'Offer start');
    if (state.pact.offeredAt! > state.activeTimeMs) throw new RangeError('Offer in future.');
  }
}
