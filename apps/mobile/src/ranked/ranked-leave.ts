import type { RankedClient } from './ranked-client';
import type { RewardFlowState } from '../rewards/reward-flow';
export type RewardExitState = Pick<RewardFlowState, 'phase' | 'fullscreen' | 'waiting'>;
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
  if (
    !run ||
    run.runId !== runId ||
    reward?.fullscreen ||
    ['loading', 'showing', 'reviving'].includes(reward?.phase ?? '')
  )
    return false;
  if (run.status === 'dead') {
    if (
      run.rewardPending ||
      run.revivesGranted > run.revivesApplied ||
      reward?.phase === 'earned_pending' ||
      reward?.phase === 'granted'
    )
      return client.archivePending(runId);
    if (state.phase !== 'ready' || !state.online || reward?.waiting) return false;
    await client.command({ type: 'end' });
    return client.snapshot().run?.runId === runId && client.snapshot().run?.status === 'finished';
  }
  if (run.status !== 'finished') await client.command({ type: 'pause' });
  return true;
}
