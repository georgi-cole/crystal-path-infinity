import type { PracticeRuntime } from '../practice-runtime';
import type { GuestRewardedAd } from './native-admob';
import type { CampaignTask } from '../campaign-objectives';
import { mysteryCadence } from './mystery-cadence';

export function campaignAllowsSponsorship(
  row: string,
  mission?: { targetRow: number; tasks?: readonly CampaignTask[] },
): boolean {
  if (!mission) return true;
  if (BigInt(row) >= BigInt(mission.targetRow)) return false;
  return !(mission.tasks ?? []).some(
    (task) =>
      task.missed ||
      task.rows?.some((mark) => String(mark.row) === row) ||
      task.id.startsWith('mystery-'),
  );
}

export async function watchMysterySponsor(
  runtime: PracticeRuntime,
  ad: GuestRewardedAd,
  signal: AbortSignal,
) {
  const offer = runtime.getState().sponsorship?.offer;
  if (!offer || offer.status !== 'offered' || signal.aborted) return 'unavailable';
  let pending: Promise<boolean> | undefined;
  let accepting = true;
  const outcome = await ad
    .watch(signal, () => {
      if (accepting && !signal.aborted)
        pending ??= runtime
          .bind({ type: 'sponsor-claim', offerId: offer.id })()
          .then((r) => r.accepted)
          .catch(() => false);
    })
    .catch(() => 'error' as const);
  accepting = false;
  const granted = await pending?.catch(() => false);
  if (outcome !== 'no_fill') mysteryCadence().adEnded();
  return granted ? 'earned' : outcome === 'closed' ? 'dismissed' : outcome;
}
