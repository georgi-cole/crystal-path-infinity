import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CHOICE_GRACE_MS, DEATH_COUNTDOWN_MS, mysteryTier } from '@crystal-path-infinity/game-core';
import type {
  MysteryPact,
  MysteryTier,
  MysteryRhythm,
  PactOption,
} from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { effectCopy } from './mystery.messages';
import { mysteryChoiceCards } from './mystery-choice-model';
import { MysteryPager } from './mystery-pager';
import { useThemeId } from './store-context';
import { MysteryCache } from './world-treasures';
import { RenderedMysteryCache } from './mystery-cache-art';
import './mystery-hologram.css';

const names = {
  standard: ['Искра', 'Spark'],
  choice: ['Сделка', 'Trade'],
  major: ['Голямо решение', 'Major pact'],
  anomaly: ['Разлом · 50/50', 'Rift · 50/50'],
};
export function MysteryCube({
  tier = 'standard',
  opened = false,
}: {
  tier?: MysteryTier;
  opened?: boolean;
}) {
  return (
    <span
      className={'cpi-mystery-cube' + (opened ? ' is-open' : '')}
      data-tier={tier}
      aria-hidden="true"
    >
      <RenderedMysteryCache theme="obsidian" open={opened} />
    </span>
  );
}

export function MysteryTierLegend() {
  const { locale } = useLanguage();
  return (
    <div className="cpi-tier-legend">
      {(Object.keys(names) as MysteryTier[]).map((tier) => (
        <span key={tier} data-tier={tier}>
          <i />
          {names[tier][locale === 'bg' ? 0 : 1]}
        </span>
      ))}
    </div>
  );
}

const glyphPaths = {
  life: 'M12 21 3.7 12.7a5.3 5.3 0 0 1 7.5-7.5l.8.8.8-.8a5.3 5.3 0 0 1 7.5 7.5Z',
  hint: 'm12 2 8 10-8 10-8-10Zm0 0v20M4 12h16',
  keep: 'M4 12h15m-6-6 6 6-6 6',
  oath: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-3 10 2 2 5-5',
  omen: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  vault: 'M4 5h16v15H4Zm0 4h16m-11 6h6m-3-3v6M7 5V2h10v3',
  loan: 'M12 3a9 9 0 1 1-8 5M3 3v6h6m3-2v5l3 2',
};

export function HolographicOffer({
  pact,
  sp,
  hints,
  revealed,
  disabled,
  onChoose,
  activeTimeMs,
  rulesetVersion,
  marketingHints = hints,
}: {
  pact: MysteryPact;
  sp: number;
  hints: number;
  revealed: boolean;
  disabled: boolean;
  onChoose: (option: PactOption) => void;
  activeTimeMs: number;
  rulesetVersion: string;
  marketingHints?: number;
}) {
  const { locale, t, number } = useLanguage();
  const theme = useThemeId();
  const bg = locale === 'bg',
    tier = mysteryTier(pact.kind),
    copy = effectCopy(locale, pact.kind, rulesetVersion);
  const cards = mysteryChoiceCards(pact, sp, hints, revealed, bg, marketingHints);
  const primary = cards.slice(0, 2),
    extra = cards.slice(2);
  const [detailPage, setDetailPage] = useState<number | null>(null);
  const paragraphs = copy.detail.split('\n\n');
  const totalDetailPages = paragraphs.length + 1;
  const showDetails = detailPage !== null;
  const heading = useRef<HTMLHeadingElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const wasShowingDetails = useRef(false);
  const id = useId();
  const detailsId = useId();
  useLayoutEffect(() => {
    if (showDetails) backButton.current?.focus({ preventScroll: true });
    else if (wasShowingDetails.current) openButton.current?.focus({ preventScroll: true });
    wasShowingDetails.current = showDetails;
  }, [showDetails]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    return () => {
      queueMicrotask(() =>
        document
          .querySelector<HTMLButtonElement>(
            '.cpi-bridge-pane:not(:disabled), .cpi-lab-controls button:not(:disabled)',
          )
          ?.focus({ preventScroll: true }),
      );
    };
  }, [pact.kind, pact.offeredAt]);
  const remaining = Math.max(0, (pact.offeredAt ?? activeTimeMs) + CHOICE_GRACE_MS - activeTimeMs);
  const countdown = Math.max(
    0,
    Math.ceil(
      ((pact.offeredAt ?? activeTimeMs) + CHOICE_GRACE_MS + DEATH_COUNTDOWN_MS - activeTimeMs) /
        1000,
    ),
  );
  return (
    <section
      className="cpi-relic-choice"
      data-tier={tier}
      data-pact={pact.kind}
      data-view={showDetails ? 'details' : undefined}
      role="dialog"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showDetails) {
          event.preventDefault();
          setDetailPage(null);
        }
      }}
    >
      <header className="cpi-relic-heading">
        <span className="cpi-relic-tier">{names[tier][bg ? 0 : 1]}</span>
        <h2 ref={heading} tabIndex={-1} id={id}>
          {copy.title}
        </h2>
      </header>
      <div className="cpi-relic-choice-actions" hidden={showDetails}>
        <div className="cpi-relic-options">
          {primary.map((card, index) => (
            <button
              type="button"
              key={card.option}
              data-pact-option={card.option}
              className={'cpi-relic-option' + (card.quiet ? ' is-quiet' : '')}
              disabled={disabled || card.disabled}
              onClick={() => onChoose(card.option)}
            >
              <span className="cpi-relic-symbol" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  <path d={glyphPaths[card.glyph]} />
                </svg>
              </span>
              <span className="cpi-relic-option-title">{card.title}</span>
              <strong>{card.reward}</strong>
              <span className="cpi-relic-price">{card.price}</span>
              {card.risk && <span className="cpi-relic-risk">{card.risk}</span>}
              <span className="cpi-relic-key" aria-hidden="true">
                0{index + 1}
              </span>
            </button>
          ))}
        </div>
        <div className="cpi-relic-tools">
          {extra.map((card) => (
            <button
              type="button"
              key={card.option}
              data-pact-option={card.option}
              className="cpi-relic-leave"
              disabled={disabled || card.disabled}
              onClick={() => onChoose(card.option)}
            >
              {card.title} · {card.price}
            </button>
          ))}
          <button
            type="button"
            ref={openButton}
            className="cpi-relic-info"
            aria-expanded={showDetails}
            aria-controls={detailsId}
            onClick={() => setDetailPage(0)}
          >
            {bg ? 'Условия' : 'Details'} <span aria-hidden="true">+</span>
          </button>
        </div>
        {pact.kind === 'soul_exchange' && (
          <p className="cpi-relic-caution">
            {bg
              ? 'Жертвата е задължителна · може да е фатална'
              : 'A sacrifice is required · can be fatal'}
          </p>
        )}
        {pact.kind === 'false_oracle' && revealed && (
          <p className="cpi-relic-caution">
            {bg ? 'Редът е разкрит · видението е недостъпно' : 'Row revealed · vision unavailable'}
          </p>
        )}
        <div className="cpi-relic-source" aria-hidden="true">
          {theme === 'obsidian' ? (
            <MysteryCube tier={tier} opened />
          ) : (
            <MysteryCache theme={theme} open />
          )}
        </div>
      </div>
      {detailPage !== null && (
        <section className="cpi-relic-details" id={detailsId} aria-label={t('guide.howItWorks')}>
          <header>
            <h3>{t('guide.howItWorks')}</h3>
            <button
              ref={backButton}
              type="button"
              className="cpi-relic-detail-back"
              onClick={() => setDetailPage(null)}
            >
              {bg ? 'Към избора' : 'Back to choices'}
            </button>
          </header>
          <div className="cpi-relic-detail-copy">
            {detailPage < paragraphs.length ? (
              <p>{paragraphs[detailPage]}</p>
            ) : (
              <>
                {pact.kind === 'marketing' && marketingHints < hints && (
                  <p>
                    {bg
                      ? 'Резервните подсказки споделят лимита за SP в този опит. Останалите можеш да използваш по пътя.'
                      : 'Reserve hints share this run’s SP allowance. You can still use the remaining hints on the bridge.'}
                  </p>
                )}
                <dl>
                  {cards
                    .filter((card) => !card.quiet)
                    .map((card) => (
                      <div key={card.option}>
                        <dt>{card.title}</dt>
                        {card.lines.map((line) => (
                          <dd key={line}>{line}</dd>
                        ))}
                      </div>
                    ))}
                </dl>
              </>
            )}
          </div>
          <footer className="cpi-relic-detail-footer">
            <p className="cpi-relic-detail-note">
              {bg
                ? 'Ефектите чакат 60 сек. После тръгва death clock.'
                : 'Effects wait 60s. Then the death clock starts.'}
            </p>
            <MysteryPager
              className="cpi-relic-detail-pager"
              label={t('guide.howItWorks')}
              previous={t('guide.previousPart')}
              next={t('guide.nextPart')}
              position={t('guide.partPosition', {
                page: number(detailPage + 1),
                total: number(totalDetailPages),
              })}
              onChange={(offset) =>
                setDetailPage((detailPage + offset + totalDetailPages) % totalDetailPages)
              }
            />
          </footer>
        </section>
      )}
      <span
        className={'cpi-choice-clock' + (remaining === 0 ? ' is-active' : '')}
        role="timer"
        aria-label={
          remaining > 0
            ? bg
              ? 'Оставащо време без death clock'
              : 'Time before the death clock'
            : 'Death clock'
        }
      >
        {remaining > 0
          ? `${bg ? 'Спокойно' : 'Take your time'} · ${Math.ceil(remaining / 1000)}s`
          : `Death clock · ${countdown}s`}
      </span>
      {remaining === 0 && (
        <span className="cpi-relic-urgent" role="status">
          {bg ? 'SP изтичат · избери сега' : 'SP draining · choose now'}
        </span>
      )}
    </section>
  );
}

export function MysteryRhythmBadge({
  rhythm,
  activeTimeMs,
}: {
  rhythm?: MysteryRhythm | null;
  activeTimeMs: number;
}) {
  const { locale } = useLanguage();
  if (!rhythm || rhythm.expiresAt <= activeTimeMs) return null;
  const silent = rhythm.kind === 'mystery_silence_30s';
  return (
    <div className="cpi-rhythm-badge" data-tier="anomaly">
      <span>∞</span>
      <strong>
        {locale === 'bg'
          ? silent
            ? 'Тишина · без кутии'
            : 'Поток · кутия през 3 реда'
          : silent
            ? 'Silence · no boxes'
            : 'Surge · a box every 3 rows'}
      </strong>
      <b>{Math.ceil((rhythm.expiresAt - activeTimeMs) / 1000)}s</b>
    </div>
  );
}

export function DeathClockBadge({
  clock,
  activeTimeMs,
  offered = false,
}: {
  clock: { warningAt: number; expiresAt: number; firstLossAt?: number } | null | undefined;
  activeTimeMs: number;
  offered?: boolean;
}) {
  const { locale } = useLanguage();
  if (!clock || offered) return null;
  const active = activeTimeMs >= clock.warningAt;
  return (
    <div className={'cpi-idle-pressure' + (active ? ' is-active' : '')} role="timer">
      <span>
        {active
          ? clock.firstLossAt && activeTimeMs < clock.firstLossAt
            ? locale === 'bg'
              ? 'Death clock · избери плочка'
              : 'Death clock · choose a tile'
            : 'Death clock · SP ↓'
          : locale === 'bg'
            ? 'Следваща стъпка'
            : 'Next step'}
      </span>
      <b>
        {Math.max(
          0,
          Math.ceil(((active ? clock.expiresAt : clock.warningAt) - activeTimeMs) / 1000),
        )}
        s
      </b>
      <i
        style={{
          transform: `scaleX(${Math.min(1, Math.max(0, (clock.expiresAt - activeTimeMs) / DEATH_COUNTDOWN_MS))})`,
        }}
      />
    </div>
  );
}
