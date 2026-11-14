import { MAX_REVIVES } from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import type { PracticeRuntime } from '../practice-runtime';
import { presentRunOutcome } from '../run-outcome';
import type { GuestRewardedAd } from './native-admob';

const grantPrefix = 'guest-ad-';

function localPractice(state: RunState) {
  return state.runId.startsWith('practice-') && !state.storeTest;
}

export function guestAdOffer(state: RunState) {
  const remaining = MAX_REVIVES - state.revivesGranted;
  if (!localPractice(state) || remaining <= 0) return null;
  const offer = presentRunOutcome(state).offer;
  return offer && { ...offer, grantsRemaining: remaining };
}

export function earnedGuestContinuation(state: RunState) {
  if (!localPractice(state) || state.status !== 'dead' || state.pendingReward) return undefined;
  return state.reviveReceipts.find(
    (receipt) =>
      receipt.deathId === state.death?.id &&
      receipt.status === 'granted' &&
      receipt.grantId.startsWith(grantPrefix),
  );
}

export async function watchGuestContinuation(
  runtime: Pick<PracticeRuntime, 'bind' | 'getState'>,
  ad: GuestRewardedAd,
  signal: AbortSignal,
) {
  const state = runtime.getState();
  const offer = guestAdOffer(state);
  if (!offer || !state.death || signal.aborted) return 'unavailable';
  const grant = {
    deathId: state.death.id,
    ordinal: offer.ordinal,
    grantId: grantPrefix + crypto.randomUUID(),
  };
  const record = runtime.bind({ type: 'grant-revive', ...grant });
  let recording: Promise<boolean> | undefined;
  const dismissed = await ad
    .watch(signal, () => {
      if (!signal.aborted) {
        recording ??= record()
          .then((result) => result.accepted)
          .catch(() => false);
      }
    })
    .catch(() => 'error' as const);
  if (!(await recording)) {
    if (dismissed === 'no_fill') return 'no_fill';
    if (dismissed === 'error') return 'error';
    return dismissed === 'closed' && !recording ? 'dismissed' : 'unavailable';
  }
  // An earned continuation is already checkpointed while the ad is open.
  // If closing/applying is interrupted, the saved grant can be used on Resume.
  if (dismissed === 'closed' && !signal.aborted) {
    try {
      if ((await runtime.bind({ type: 'apply-revive', ...grant })()).accepted) return 'resumed';
    } catch {
      // The saved grant survives a transient clock or foreground failure.
    }
  }
  return 'earned';
}
