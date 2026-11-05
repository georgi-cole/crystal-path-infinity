import type { RunState, TileSide, TimedSessionResult } from '@crystal-path-infinity/game-core';

export interface HintScan {
  readonly id: string;
  readonly row: string;
  readonly side: TileSide;
  readonly activeAt: number;
}
export interface SurvivalReward {
  readonly id: string;
  readonly amount: number;
  readonly delta: number;
  readonly fromSp: number;
  readonly activeAt: number;
}
export interface RunSignals {
  readonly hint: HintScan | null;
  readonly bonus: SurvivalReward | null;
}
export const EMPTY_RUN_SIGNALS: RunSignals = { hint: null, bonus: null };

/** Two bounded visual notifications; neither owns gameplay time or resources. */
export function collectRunSignals(previous: RunSignals, result: TimedSessionResult): RunSignals {
  let hint = previous.hint,
    bonus = previous.bonus;
  for (const event of result.events) {
    const id = `${result.state.runId}:${result.state.revivesApplied}:${event.activeTimeMs}:${event.type}:${'row' in event ? event.row : ''}`;
    if (event.type === 'hint-used')
      hint = { id, row: event.row, side: event.safeSide, activeAt: event.activeTimeMs };
    if (event.type === 'survival-bonus')
      bonus = {
        id,
        amount: event.amount,
        delta: event.spDelta,
        fromSp: event.sp - event.spDelta,
        activeAt: event.activeTimeMs,
      };
    if (event.type === 'choice-resolved' || event.type === 'death') hint = null;
  }
  return hint === previous.hint && bonus === previous.bonus ? previous : { hint, bonus };
}
export function liveSignal<T extends { readonly activeAt: number }>(
  signal: T | null,
  state: Pick<RunState, 'activeTimeMs' | 'status'>,
  duration: number,
): T | null {
  return signal &&
    state.status === 'playing' &&
    state.activeTimeMs >= signal.activeAt &&
    state.activeTimeMs - signal.activeAt < duration
    ? signal
    : null;
}
