import type { RunState } from '@crystal-path-infinity/game-core';

/** Explicit menu exit declines an unclaimed continuation; shopping preserves it. */
export function shouldFinishPracticeOnExit(
  state: RunState,
  destination: 'home' | 'store',
): boolean {
  return (
    destination === 'home' &&
    state.status === 'dead' &&
    state.pendingReward === null &&
    !state.reviveReceipts.some((receipt) => receipt.status === 'granted')
  );
}
