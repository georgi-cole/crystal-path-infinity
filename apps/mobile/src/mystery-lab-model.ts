import {
  createPracticeCursor,
  createRun,
  getCurrentRow,
  hintSafeSide,
  PACT_RULESET_VERSION,
  PRACTICE_RNG,
  rollMysteryEffect,
  transitionRun,
  usesMysteryDirectorRules,
  mysteryTier,
  getRuleset,
} from '@crystal-path-infinity/game-core';
import type { EffectKind, TransitionResult, RunState } from '@crystal-path-infinity/game-core';

/** Explicitly scripted outcome, confined to the disposable demonstration room. */
export function prepareMysteryLabStep(
  state: RunState,
  layout: 'mixed' | 'both-broken' | 'both-safe' = 'mixed',
): RunState {
  const current = getCurrentRow(state);
  return {
    ...state,
    current: {
      mysteryOutcome: state.current.mysteryOutcome,
      lastChoice: state.current.lastChoice,
      revealedSafeSide: null,
    },
    rows: state.rows.map((row) => {
      if (row.index !== current.index) return row;
      const changed = {
        ...row,
        safeSide: 'left' as const,
        ...(row.risk
          ? {
              risk: {
                lowRiskSide: row.risk.lowRiskSide,
                broken: { left: layout === 'both-broken', right: layout !== 'both-safe' },
              },
            }
          : {}),
      };
      return { ...changed, safeSide: hintSafeSide(changed) ?? changed.risk?.lowRiskSide ?? 'left' };
    }),
  };
}

/** An isolated practice fixture; never persisted, ranked or offered as a real score. */
export function createMysteryLabRun(
  kind: EffectKind,
  sp = 100,
  seed = 91025,
  rulesetVersion = PACT_RULESET_VERSION,
): TransitionResult {
  const firstRewardSeed = seed * 10_007;
  let rewardSeed = firstRewardSeed;
  while (rewardSeed < firstRewardSeed + 100_000) {
    const draw = PRACTICE_RNG.next(createPracticeCursor(rewardSeed));
    if (
      rollMysteryEffect(
        draw.value,
        rulesetVersion,
        true,
        usesMysteryDirectorRules(rulesetVersion)
          ? getRuleset(rulesetVersion)
              .mysteryTable.filter((entry) => mysteryTier(entry.kind) === mysteryTier(kind))
              .map((entry) => entry.kind)
          : undefined,
      ) === kind
    )
      break;
    rewardSeed += 1;
  }
  if (rewardSeed === firstRewardSeed + 100_000) throw new Error('Mystery room unavailable.');
  let state = createRun(
    {
      runId: `practice-lab-${kind}-${seed}`,
      rulesetVersion,
      routeRng: createPracticeCursor(seed),
      mysteryRng: createPracticeCursor(rewardSeed),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
  for (let i = 0; i < 25; i += 1) {
    state = transitionRun(
      state,
      { type: 'choose', row: state.currentRow, life: 0, side: getCurrentRow(state).safeSide },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    ).state;
  }
  const currentIndex = getCurrentRow(state).index;
  state = {
    ...state,
    sp,
    ...(usesMysteryDirectorRules(rulesetVersion)
      ? {
          mysteryDirector: { ...state.mysteryDirector!, nextRow: state.currentRow, history: [] },
          mysteryRng: createPracticeCursor(rewardSeed),
          current: { ...state.current, mysteryTier: mysteryTier(kind) },
        }
      : {}),
    rows: state.rows.map((row) =>
      row.index === currentIndex ? { ...row, hasMystery: true } : row,
    ),
  };
  return transitionRun(
    state,
    { type: 'mystery', row: state.currentRow, life: 0 },
    { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
  );
}
