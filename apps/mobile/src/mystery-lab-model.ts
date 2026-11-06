import {
  createPracticeCursor,
  createRun,
  getCurrentRow,
  PACT_RULESET_VERSION,
  PRACTICE_RNG,
  rollMysteryEffect,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { EffectKind, TransitionResult } from '@crystal-path-infinity/game-core';

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
    if (rollMysteryEffect(draw.value, rulesetVersion) === kind) break;
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
