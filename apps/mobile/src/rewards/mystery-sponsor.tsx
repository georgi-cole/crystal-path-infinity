import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { RunState, MysterySponsorOffer } from '@crystal-path-infinity/game-core';
import type { PracticeRuntime, PracticePauseLease } from '../practice-runtime';
import type { GuestRewardedAd } from './native-admob';
import { useLanguage } from '../language-context';
import { mysteryCadence } from './mystery-cadence';
import { watchMysterySponsor } from './mystery-sponsor-flow';
import './mystery-sponsor.css';

const copy = (offer: MysterySponsorOffer, bg: boolean) => {
  switch (offer.kind) {
    case 'market':
      return bg
        ? 'Реклама: +20 Stability, запази подсказките'
        : 'Watch ad: +20 Stability, keep your hints';
    case 'healing':
      return bg ? 'Реклама: още +10 Stability' : 'Watch ad: +10 extra Stability';
    case 'sp-protection':
      return bg
        ? `Реклама: възстанови ${offer.amount} Stability`
        : `Watch ad: restore the ${offer.amount} Stability lost`;
    case 'hint-protection':
      return bg ? 'Реклама: върни изгубената подсказка' : 'Watch ad: recover your lost hint';
    case 'cleanse':
      return bg
        ? 'Реклама: премахни това кървене (3 стъпки)'
        : 'Watch ad: cleanse this 3-step bleed';
  }
};

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
  const { locale } = useLanguage();
  const bg = locale === 'bg';
  const [phase, setPhase] = useState('idle');
  const lease = useRef<PracticePauseLease | null>(null);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (visible) heading.current?.focus({ preventScroll: true });
  }, [visible]);
  const [heldOffer, setHeldOffer] = useState<string | null>(null);
  const offerId = offer?.id;
  const held = !!offerId && heldOffer === offerId;
  useEffect(() => {
    if (!offerId) return;
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
  }, [offerId, runtimeRef]);
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
  return (
    <section
      className="cpi-sponsor-choice"
      role="dialog"
      aria-modal="true"
      aria-label={bg ? 'Предложение от кутията' : 'Cache offer'}
    >
      <span className="cpi-menu-eyebrow">
        {bg ? 'Подарък от пътя' : 'A little help from the trail'}
      </span>
      <h2 ref={heading} tabIndex={-1}>
        {earned ? (bg ? 'Бонусът е получен' : 'Reward received') : copy(offer, bg)}
      </h2>
      {campaign && !earned && (
        <p>
          {bg
            ? 'Бонусът помага за мисията. Mastery изисква опит без помощ.'
            : 'Helps this attempt. Mastery requires an attempt without assistance.'}
        </p>
      )}
      {waiting && <p role="status">{bg ? 'Рекламата се зарежда…' : 'Loading ad…'}</p>}
      {!waiting && !earned && phase !== 'idle' && (
        <p role="status">
          {bg
            ? 'Бонусът още не е получен. Опитай пак или продължи.'
            : 'No reward received. Try again or continue.'}
        </p>
      )}
      {!earned && (
        <button
          type="button"
          disabled={waiting || !held || !ad || !enabled}
          onClick={() => void watch()}
        >
          {bg ? 'Гледай реклама' : 'Watch ad'}
        </button>
      )}
      <button type="button" disabled={waiting} onClick={() => void dismiss()}>
        {earned
          ? bg
            ? 'Продължи'
            : 'Continue'
          : bg
            ? 'Продължи без бонус'
            : 'Continue without bonus'}
      </button>
      {!earned && (
        <small>
          {bg
            ? 'Незадължително · Няма допълнителна санкция при отказ'
            : 'Optional · Declining adds no penalty'}
        </small>
      )}
    </section>
  );
}
