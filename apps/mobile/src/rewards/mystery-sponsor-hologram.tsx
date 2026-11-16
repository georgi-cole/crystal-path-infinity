import { useEffect, useRef } from 'react';
import type { MysterySponsorOffer, PactOption, RunState } from '@crystal-path-infinity/game-core';
import { marketingSale } from '@crystal-path-infinity/game-core';
import { HolographicOffer, MysteryCube } from '../mystery-box';
import { MysteryCache } from '../world-treasures';
import { useThemeId } from '../store-context';
import { useLanguage } from '../language-context';
import './mystery-sponsor.css';

function sponsorRewardLabel(offer: MysterySponsorOffer, bg: boolean): string {
  switch (offer.kind) {
    case 'market':
      return bg ? '+20 SP · запази подсказките' : '+20 SP · keep hints';
    case 'healing':
      return '+10 SP';
    case 'sp-protection':
      return bg ? `Върни ${offer.amount} SP` : `Restore ${offer.amount} SP`;
    case 'hint-protection':
      return bg ? 'Върни 1 подсказка' : 'Restore 1 hint';
    case 'cleanse':
      return bg ? 'Спри кървенето' : 'Clear bleed';
  }
}

/** The box owns its choices; no separate screen, backdrop or fixed popup. */
export function MysterySponsorHologram({
  state,
  campaign,
  waiting,
  unavailable,
  disabled,
  onWatch,
  onDismiss,
  onChoose,
}: {
  state: RunState;
  campaign: boolean;
  waiting: boolean;
  unavailable: boolean;
  disabled: boolean;
  onWatch: () => void;
  onDismiss: () => void;
  onChoose: (option: PactOption) => void;
}) {
  const { locale } = useLanguage();
  const theme = useThemeId();
  const heading = useRef<HTMLHeadingElement>(null);
  const offer = state.sponsorship?.offer;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [offer?.id]);
  if (!offer) return null;
  const bg = locale === 'bg';
  const earned = offer.status === 'earned';
  const reward = sponsorRewardLabel(offer, bg);
  const note = !earned && campaign && (
    <small className="cpi-relic-sponsor-note">
      {bg ? 'Бонус от реклама: без Mastery' : 'Ad bonus: no Mastery'}
    </small>
  );
  const status = waiting
    ? bg
      ? 'Зареждане…'
      : 'Loading…'
    : unavailable
      ? bg
        ? 'Няма реклама · можеш да продължиш'
        : 'Ad unavailable · keep your result'
      : null;
  const watchLabel = bg ? 'Гледай реклама' : 'Watch ad';
  const adAction = (
    <div className="cpi-relic-sponsor-action">
      <button
        type="button"
        className="cpi-relic-ad-action"
        disabled={disabled || waiting}
        onClick={onWatch}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 11 7-11 7V5Z" />
        </svg>
        <span>{watchLabel}</span>
        <strong>{reward}</strong>
      </button>
      {note}
      {status && <small role="status">{status}</small>}
    </div>
  );
  if (!earned && offer.kind === 'market' && state.pact?.phase === 'offered')
    return (
      <HolographicOffer
        pact={state.pact}
        sp={state.sp}
        hints={state.hints}
        marketingHints={marketingSale(state).count}
        revealed={state.current.revealedSafeSide !== null}
        disabled={waiting}
        onChoose={onChoose}
        activeTimeMs={state.activeTimeMs}
        rulesetVersion={state.rulesetVersion}
        extraAction={adAction}
        clockHidden
      />
    );
  return (
    <section
      className="cpi-relic-choice cpi-sponsored-relic"
      data-tier="choice"
      role="dialog"
      aria-label={bg ? 'Избор от кутията' : 'Mystery box choice'}
    >
      <header className="cpi-relic-heading">
        <h2 ref={heading} tabIndex={-1}>
          {earned ? (bg ? 'Бонусът е получен' : 'Reward received') : reward}
        </h2>
      </header>
      <div className="cpi-relic-options">
        {!earned && (
          <button
            type="button"
            className="cpi-relic-option"
            disabled={disabled || waiting}
            onClick={onWatch}
          >
            <span className="cpi-relic-symbol">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="m9 5 11 7-11 7V5Z" />
              </svg>
            </span>
            <span className="cpi-relic-option-title">{watchLabel}</span>
          </button>
        )}
        <button
          type="button"
          className="cpi-relic-option is-quiet"
          disabled={waiting}
          onClick={onDismiss}
        >
          <span className="cpi-relic-symbol">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M4 12h15m-6-6 6 6-6 6" />
            </svg>
          </span>
          <span className="cpi-relic-option-title">
            {earned ? (bg ? 'Продължи' : 'Continue') : bg ? 'Запази резултата' : 'Keep result'}
          </span>
        </button>
      </div>
      {note}
      {status && (
        <small className="cpi-relic-sponsor-note" role="status">
          {status}
        </small>
      )}
      <div className="cpi-relic-source" aria-hidden="true">
        {theme === 'obsidian' ? (
          <MysteryCube tier="choice" opened />
        ) : (
          <MysteryCache theme={theme} open />
        )}
      </div>
    </section>
  );
}
