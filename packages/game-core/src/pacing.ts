import { addSafeInteger } from './numbers.ts';
import type { RunPacing, RunState } from './types.ts';

export const PACED_RULESET_VERSION = 'infinity-v2';
export const ROW_GRACE_MS = 3_000;
export const DEATH_CLOCK_MS = 5_000;
export const SURVIVAL_BONUS_INTERVAL_MS = 60_000;
export const SURVIVAL_BONUS_SP = 5;

export function nextSurvivalBonusAt(activeTimeMs: number): number {
  return addSafeInteger(
    Math.floor(activeTimeMs / SURVIVAL_BONUS_INTERVAL_MS) * SURVIVAL_BONUS_INTERVAL_MS,
    SURVIVAL_BONUS_INTERVAL_MS,
    'Survival bonus boundary',
  );
}

export function createRunPacing(activeTimeMs: number): RunPacing {
  return { rowEnteredAt: activeTimeMs, nextSurvivalBonusAt: nextSurvivalBonusAt(activeTimeMs) };
}

export function rowDeadline(pacing: RunPacing): number {
  return addSafeInteger(pacing.rowEnteredAt, ROW_GRACE_MS + DEATH_CLOCK_MS, 'Row deadline');
}

/** Projection only. Its clock is the canonical foreground-only active timeline. */
export function presentRowPressure(state: Pick<RunState, 'status' | 'activeTimeMs' | 'pacing'>) {
  if (!state.pacing || state.status !== 'playing') return null;
  const elapsed = Math.max(0, state.activeTimeMs - state.pacing.rowEnteredAt);
  const remainingMs = Math.max(0, ROW_GRACE_MS + DEATH_CLOCK_MS - elapsed);
  return {
    active: elapsed >= ROW_GRACE_MS,
    remainingMs,
    fraction: Math.min(1, remainingMs / DEATH_CLOCK_MS),
    urgent: elapsed >= ROW_GRACE_MS && remainingMs <= 3_000,
  };
}
