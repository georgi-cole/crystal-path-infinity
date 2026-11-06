import { useEffect, useId, useRef } from 'react';
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
    <svg
      className={'cpi-mystery-cube' + (opened ? ' is-open' : '')}
      data-tier={tier}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <ellipse className="cpi-cube-orbit" cx="50" cy="78" rx="37" ry="10" />
      <path className="cpi-cube-left" d="m20 43 30 17v31L20 74Z" />
      <path className="cpi-cube-right" d="m50 60 30-17v31L50 91Z" />
      <g className="cpi-cube-lid">
        <path d="m20 39 30-17 30 17-30 17Z" />
        <path d="m20 39 30 17 30-17m-30 17v7" />
      </g>
      <path
        className="cpi-cube-runes"
        d={
          tier === 'major'
            ? 'm57 67 5 2 6-9 4 3-3 12-12 7Z'
            : tier === 'choice'
              ? 'm62 63 8 3-8 13-7-3Z'
              : tier === 'anomaly'
                ? 'm56 73c0-10 9-4 9-9s-9 2-9 9c0 7 17-11 17-5s-8 8-8 2'
                : 'm63 62 2 5 6-1-6 6-2 6-2-4-6 1 6-6Z'
        }
      />
      <path className="cpi-cube-signal" d="M50 16V5m-13 9-4-7m30 7 4-7" />
    </svg>
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

export function HolographicOffer({
  pact,
  sp,
  hints,
  revealed,
  disabled,
  onChoose,
  activeTimeMs,
  rulesetVersion,
}: {
  pact: MysteryPact;
  sp: number;
  hints: number;
  revealed: boolean;
  disabled: boolean;
  onChoose: (option: PactOption) => void;
  activeTimeMs: number;
  rulesetVersion: string;
}) {
  const { locale } = useLanguage();
  const bg = locale === 'bg',
    tier = mysteryTier(pact.kind),
    copy = effectCopy(locale, pact.kind, rulesetVersion);
  const cards = mysteryChoiceCards(pact, sp, hints, revealed, bg);
  const heading = useRef<HTMLHeadingElement>(null),
    id = useId();
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
      className="cpi-hologram"
      data-tier={tier}
      data-pact={pact.kind}
      role="dialog"
      aria-labelledby={id}
    >
      <div className="cpi-holo-beam" aria-hidden="true" />
      <div className="cpi-holo-projection">
        <header>
          <span className="cpi-holo-tier">{names[tier][bg ? 0 : 1]}</span>
          <span className={'cpi-choice-clock' + (remaining === 0 ? ' is-active' : '')} role="timer">
            {remaining > 0
              ? `${bg ? 'Време за избор' : 'Decision time'} · ${Math.ceil(remaining / 1000)}s`
              : `Death clock · ${countdown}s`}
          </span>
        </header>
        <h2 ref={heading} tabIndex={-1} id={id}>
          {copy.title}
        </h2>
        <p className="cpi-holo-intro">
          {bg ? 'Избери какво ще вземеш със себе си.' : 'Choose what you carry forward.'}
        </p>
        <div className="cpi-holo-resources">
          <span>
            {sp} <small>SP</small>
          </span>
          <span>
            {hints} <small>{bg ? 'подсказки' : 'hints'}</small>
          </span>
        </div>
        <div className="cpi-holo-options">
          {cards.map((card, index) => (
            <button
              type="button"
              key={card.option}
              data-pact-option={card.option}
              className={'cpi-holo-option' + (card.quiet ? ' is-quiet' : '')}
              disabled={disabled || card.disabled}
              onClick={() => onChoose(card.option)}
            >
              <span className="cpi-holo-option-number" aria-hidden="true">
                0{index + 1}
              </span>
              <strong>{card.title}</strong>
              <b>{card.price}</b>
              {card.lines.map((line) => (
                <span className="cpi-holo-result" key={line}>
                  {line}
                </span>
              ))}
              <span className="cpi-holo-select" aria-hidden="true">
                {bg ? 'ИЗБЕРИ' : 'CHOOSE'} ↗
              </span>
            </button>
          ))}
        </div>
        <details className="cpi-holo-terms">
          <summary>{bg ? 'Точните условия' : 'Read the terms'}</summary>
          <p>{copy.detail}</p>
        </details>
        {pact.kind === 'soul_exchange' && (
          <p className="cpi-holo-caution">
            {bg
              ? 'След отваряне няма безплатен отказ. Жертвата може да е фатална.'
              : 'Once opened, there is no free refusal. A sacrifice can be fatal.'}
          </p>
        )}
        {pact.kind === 'false_oracle' && revealed && (
          <p className="cpi-holo-caution">
            {bg
              ? 'Този ред вече е разкрит. Приемането е недостъпно.'
              : 'This row is already revealed. Acceptance is unavailable.'}
          </p>
        )}
        <p className={'cpi-holo-clock-note' + (!remaining ? ' is-active' : '')} role="status">
          {remaining > 0
            ? bg
              ? 'Ефектите и death clock са спрени за първата минута.'
              : 'Effects and the death clock pause for the first minute.'
            : bg
              ? 'SP изтичат все по-бързо: 20% за първите 5 секунди, 80% за следващите 5. Избери сега.'
              : 'SP drain accelerates: 20% in the first 5 seconds, 80% in the next 5. Choose now.'}
        </p>
      </div>
      <div className="cpi-holo-projector">
        <MysteryCube tier={tier} opened />
        <span aria-hidden="true" />
      </div>
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
  clock: { warningAt: number; expiresAt: number } | null | undefined;
  activeTimeMs: number;
  offered?: boolean;
}) {
  const { locale } = useLanguage();
  if (!clock || offered) return null;
  const active = activeTimeMs >= clock.warningAt;
  return (
    <div className={'cpi-death-clock' + (active ? ' is-active' : '')} role="timer">
      <span>
        {active ? 'Death clock · SP ↓' : locale === 'bg' ? 'Следваща стъпка' : 'Next step'}
      </span>
      <b>
        {Math.max(
          0,
          Math.ceil(((active ? clock.expiresAt : clock.warningAt) - activeTimeMs) / 1000),
        )}
        s
      </b>
      <i
        style={{ transform: `scaleX(${Math.max(0, (clock.expiresAt - activeTimeMs) / 13000)})` }}
      />
    </div>
  );
}
