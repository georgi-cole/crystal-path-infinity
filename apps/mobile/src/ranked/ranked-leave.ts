import type { RankedClient, RankedClientState } from './ranked-client';
import type { RewardFlowState } from '../rewards/reward-flow';
export function hasUnclaimedAd(run: NonNullable<RankedClientState['run']>) {
  return run.status === 'dead' && (run.rewardPending || run.revivesGranted > run.revivesApplied);
}

export type RewardExitState = Pick<RewardFlowState, 'phase' | 'fullscreen' | 'waiting'>;
export function canLeaveReward(reward: RewardExitState | null | undefined) {
  return !reward?.fullscreen && !['loading', 'showing', 'reviving'].includes(reward?.phase ?? '');
}

export function canUseCreditFromReward(reward: RewardExitState | null | undefined) {
  return (
    !reward?.fullscreen &&
    !reward?.waiting &&
    !['loading', 'showing', 'earned_pending', 'granted', 'reviving'].includes(reward?.phase ?? '')
  );
}
/** Menu acknowledgement must not leave an unclaimed death resumable or discard a pending/granted ad. */
export async function leaveVerifiedRun(
  client: RankedClient,
  runId: string,
  readReward: () => RewardExitState | null,
): Promise<boolean> {
  const state = client.snapshot(),
    run = state.run,
    reward = readReward();
  if (!run || run.runId !== runId || !canLeaveReward(reward)) return false;
  if (run.status === 'dead') {
    if (hasUnclaimedAd(run) || reward?.phase === 'earned_pending' || reward?.phase === 'granted')
      return client.archivePending(runId);
    if (state.phase !== 'ready' || !state.online || reward?.waiting) return false;
    await client.command({ type: 'end' });
    return client.snapshot().run?.runId === runId && client.snapshot().run?.status === 'finished';
  }
  if (run.status !== 'finished') await client.command({ type: 'pause' });
  return true;
}
