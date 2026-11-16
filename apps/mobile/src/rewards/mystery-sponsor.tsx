import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { RunState, PactOption } from '@crystal-path-infinity/game-core';
import type { PracticeRuntime, PracticePauseLease } from '../practice-runtime';
import type { GuestRewardedAd } from './native-admob';
import { mysteryCadence } from './mystery-cadence';
import { watchMysterySponsor, chooseMysteryAlternative } from './mystery-sponsor-flow';
import { MysterySponsorHologram } from './mystery-sponsor-hologram';
import './mystery-sponsor.css';

export function MysterySponsor({
  state,
  runtimeRef,
  ad,
  campaign,
  enabled,
  visible,
}: {
  state: RunState;
  runtimeRef: RefObject<PracticeRuntime | null>;
  ad?: GuestRewardedAd | null;
  campaign: boolean;
  enabled: boolean;
  visible: boolean;
}) {
  const offer = state.sponsorship?.offer;
  const [phase, setPhase] = useState('idle');
  const lease = useRef<PracticePauseLease | null>(null);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const [heldOffer, setHeldOffer] = useState<string | null>(null);
  const offerId = offer?.id;
  const held = !!offerId && heldOffer === offerId;
  useEffect(() => {
    if (!offerId || !enabled) return;
    let active = true;
    const runtime = runtimeRef.current;
    void runtime
      ?.hold('ad')
      .then(async (hold) => {
        if (!active) {
          await hold.release();
          return;
        }
        lease.current = hold;
        setHeldOffer(offerId);
      })
      .catch(() => {
        if (active) setPhase('error');
      });
    return () => {
      active = false;
      request.current?.abort();
      void lease.current?.release().catch(() => {});
      lease.current = null;
    };
  }, [offerId, runtimeRef, enabled]);
  if (!offer || !visible) return null;
  const earned = offer.status === 'earned';
  const waiting = phase === 'watching';
  const dismiss = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      if (
        (await runtime.bind({ type: 'sponsor-dismiss', offerId: offer.id })()).accepted &&
        !earned
      )
        mysteryCadence().decline();
    } catch {
      setPhase('error');
    } finally {
      lock.current = false;
    }
  };
  const watch = async () => {
    const runtime = runtimeRef.current;
    if (!ad || !runtime || lock.current || !held || !enabled) return;
    lock.current = true;
    const controller = new AbortController();
    request.current = controller;
    setPhase('watching');
    try {
      const result = await watchMysterySponsor(runtime, ad, controller.signal);
      if (!controller.signal.aborted) setPhase(result);
    } catch {
      if (!controller.signal.aborted) setPhase('error');
    } finally {
      lock.current = false;
    }
  };
  const choose = async (option: PactOption) => {
    const runtime = runtimeRef.current;
    if (!runtime || lock.current) return;
    lock.current = true;
    const hold = lease.current;
    try {
      await chooseMysteryAlternative(runtime, offer.id, option, async () => {
        await hold?.release();
      });
    } catch {
      setPhase('error');
    } finally {
      lock.current = false;
    }
  };
  return (
    <MysterySponsorHologram
      state={state}
      campaign={campaign}
      waiting={waiting}
      unavailable={!earned && phase !== 'idle' && !waiting}
      disabled={!held || !ad || !enabled}
      onWatch={() => void watch()}
      onDismiss={() => void dismiss()}
      onChoose={(option) => void choose(option)}
    />
  );
}
