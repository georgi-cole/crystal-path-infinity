import type { MysteryFeedback } from './mystery-feedback';
import { useEffect, useState } from 'react';
import {
  effectDuration,
  RULESET_VERSION,
  MARKET_SP_PER_HINT,
  HALF_LIFE_HINTS,
  usesMysteryDirectorRules,
} from '@crystal-path-infinity/game-core';
import type {
  ActiveEffect,
  EffectKind,
  MysteryPact,
  PactOption,
} from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { effectCopy, mysteryText } from './mystery.messages';
import './mystery-effects.css';
import { HolographicOffer } from './mystery-box';

export function EffectGlyph({ kind, burst = false }: { kind: EffectKind; burst?: boolean }) {
  let glyph;
  switch (kind) {
    case 'coyote_10s':
      glyph = (
        <>
          <path
            className="cpi-glyph-rise"
            d="m15 12 8 5 10-4 7 9-11 3-6 11-7-3 6-13-7-8Zm14 13 9 10m-23-2-6 5"
          />
          <path className="cpi-glyph-rise cpi-glyph-echo" d="M3 17h9M1 24h12M5 31h7" />
        </>
      );
      break;
    case 'mystery_silence_30s':
    case 'mystery_surge_30s':
      glyph = (
        <>
          <path className="cpi-glyph-shell" d="m24 4 18 10v20L24 44 6 34V14Z" />
          <path
            className="cpi-glyph-turn"
            d="M12 25c0-14 12-9 12 0s12 9 12 0-12-9-12 0-12 14-12 0Z"
          />
          {kind === 'mystery_silence_30s' && <path d="m10 39 28-30" />}
        </>
      );
      break;
    case 'shield_5s':
      glyph = (
        <>
          <path className="cpi-glyph-shell" d="M24 5 39 11v13c0 10-15 19-15 19S9 34 9 24V11Z" />
          <path className="cpi-glyph-core" d="m17 24 5 5 10-12" />
        </>
      );
      break;
    case 'regen_5s':
    case 'regen_3rows':
    case 'heal_10':
    case 'heal_20':
      glyph = (
        <>
          <path className="cpi-glyph-shell" d="m24 5 16 19-16 19L8 24Z" />
          <path className="cpi-glyph-rise" d="M24 16v16m-8-8h16" />
          <path className="cpi-glyph-rise cpi-glyph-echo" d="m9 17 3-5 3 5m18 18 3-5 3 5" />
        </>
      );
      break;
    case 'lucky_5s':
      glyph = (
        <>
          <circle className="cpi-glyph-shell" cx="24" cy="24" r="17" />
          <path className="cpi-glyph-turn" d="m24 12 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" />
        </>
      );
      break;
    case 'inversion_5s':
      glyph = (
        <>
          <path
            className="cpi-glyph-turn"
            d="M10 22a14 14 0 0 1 25-7l3 6m-1-11 1 11-11-1M38 27a14 14 0 0 1-25 7l-3-6m1 11-1-11 11 1"
          />
          <path d="M20 24h8m-4-4v8" />
        </>
      );
      break;
    case 'fragility_5s':
    case 'hurt_10':
    case 'hurt_15':
      glyph = (
        <>
          <path className="cpi-glyph-shell" d="m24 5 16 19-16 19L8 24Z" />
          <path className="cpi-glyph-crack" d="m27 7-9 13 11 5-10 16m1-20-10 3m18 1 11-1" />
        </>
      );
      break;
    case 'drain_5s':
    case 'bleed_3rows':
    case 'blood_oath':
      glyph = (
        <>
          <path
            className="cpi-glyph-shell"
            d="M24 6S10 22 10 30a14 14 0 0 0 28 0C38 22 24 6 24 6Z"
          />
          <path className="cpi-glyph-fall" d="M24 19v15m-5-5 5 5 5-5" />
        </>
      );
      break;
    case 'false_oracle':
      glyph = (
        <>
          <path
            className="cpi-glyph-shell"
            d="M4 24S12 11 24 11s20 13 20 13-8 13-20 13S4 24 4 24Z"
          />
          <ellipse className="cpi-glyph-eye" cx="24" cy="24" rx="6" ry="8" />
          <path d="m24 3 2 4m-15 2 3 3m23-3-3 3" />
        </>
      );
      break;
    case 'hungry_vault':
      glyph = (
        <>
          <path className="cpi-glyph-shell" d="M8 17h32v23H8Zm0 0 7-9h18l7 9M8 26h32" />
          <path className="cpi-glyph-jaw" d="m12 18 4 7 4-7 4 7 4-7 4 7 4-7" />
          <path d="M24 30v6m-3-3h6" />
        </>
      );
      break;
    case 'borrowed_time':
      glyph = (
        <>
          <circle className="cpi-glyph-shell" cx="24" cy="25" r="16" />
          <path d="M20 4h8m-4 0v5" />
          <path className="cpi-glyph-hand" d="M24 14v11l8 5" />
          <path d="m7 10 4 4m26-4-4 4" />
        </>
      );
      break;
    case 'soul_exchange':
    case 'marketing':
      glyph = (
        <>
          <path className="cpi-glyph-turn" d="M9 17h28l-7-7m7 21H9l7 7" />
          <path className="cpi-glyph-shell" d="m12 22 4 5-4 5-4-5Zm24-6 4 5-4 5-4-5Z" />
        </>
      );
      break;
    case 'half_life':
      glyph = (
        <>
          <path
            className="cpi-glyph-shell"
            d="M24 40S5 28 5 16C5 4 20 3 24 14c4-11 19-10 19 2 0 12-19 24-19 24Z"
          />
          <path d="M24 8v32" />
          <path className="cpi-glyph-eye" d="m31 19 3 4 5 1-5 2-3 5-1-5-5-2 5-1Z" />
        </>
      );
      break;
    case 'double_gain_21s':
    case 'double_loss_21s':
      glyph = (
        <>
          <circle className="cpi-glyph-shell" cx="24" cy="24" r="19" />
          <path
            className={kind === 'double_gain_21s' ? 'cpi-glyph-rise' : 'cpi-glyph-fall'}
            d={
              kind === 'double_gain_21s'
                ? 'm12 27 12-12 12 12m-24 8 12-12 12 12'
                : 'm12 13 12 12 12-12m-24 8 12 12 12-12'
            }
          />
          <path d="M8 38h8m-4-4v8m20-4h8" />
        </>
      );
      break;
    case 'gain_hint':
    case 'lose_hint':
      glyph = (
        <>
          <path
            className="cpi-glyph-shell"
            d="M4 24s8-12 20-12 20 12 20 12-8 12-20 12S4 24 4 24Z"
          />
          <path className="cpi-glyph-eye" d="m24 17 5 7-5 7-5-7Z" />
          {kind === 'lose_hint' && <path d="m8 40 32-32" />}
        </>
      );
      break;
  }
  return (
    <svg
      className={'cpi-effect-glyph' + (burst ? ' is-burst' : '')}
      data-effect={kind}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

export function MysteryFeedbackView({
  feedback,
  rulesetVersion = RULESET_VERSION,
}: {
  feedback: MysteryFeedback | null;
  rulesetVersion?: string;
}) {
  const { locale } = useLanguage();
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setDismissed(feedback.id), 4200);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  if (!feedback || feedback.id === dismissed) return null;
  const copy = effectCopy(locale, feedback.kind, rulesetVersion);
  const positive =
    feedback.spDelta !== 0
      ? feedback.spDelta > 0
      : feedback.hintDelta !== 0
        ? feedback.hintDelta > 0
        : copy.positive;
  return (
    <div
      key={feedback.id}
      className={`cpi-mystery-feedback ${positive ? 'is-positive' : 'is-dangerous'}`}
      role="status"
      aria-live="polite"
      data-effect={feedback.kind}
    >
      <EffectGlyph kind={feedback.kind} burst />
      <div>
        <strong>{copy.title}</strong>
        <p>{feedback.action ? mysteryText(locale, feedback.action) : copy.detail}</p>
      </div>
      <div className="cpi-mystery-deltas">
        {feedback.spDelta !== 0 && (
          <b>
            {feedback.spDelta > 0 ? '+' : '−'}
            {Math.abs(feedback.spDelta)} SP
          </b>
        )}
        {feedback.hintDelta !== 0 && (
          <b>
            {feedback.hintDelta > 0 ? '+' : '−'}
            {Math.abs(feedback.hintDelta)} ◈
          </b>
        )}
        {feedback.action === 'triggered' &&
          ['shield_5s', 'coyote_10s'].includes(feedback.kind) &&
          feedback.spDelta === 0 && <b>0 SP</b>}
      </div>
    </div>
  );
}

export function MysteryEffects({
  effects,
  activeTimeMs,
  rulesetVersion = RULESET_VERSION,
}: {
  effects: readonly ActiveEffect[];
  activeTimeMs: number;
  rulesetVersion?: string;
}) {
  const { locale } = useLanguage();
  if (!effects.length) return null;
  return (
    <div className="cpi-mystery-effects" aria-label={mysteryText(locale, 'effects')}>
      {effects.map((effect, index) => {
        const copy = effectCopy(locale, effect.kind, rulesetVersion);
        const remaining =
          effect.expiresAt === null
            ? effect.rowsLeft
            : Math.max(0, effect.expiresAt - activeTimeMs);
        const total = effectDuration(effect.kind) ?? 3;
        return (
          <details
            key={`${effect.kind}:${index}`}
            className={`cpi-force ${copy.positive ? 'is-positive' : 'is-dangerous'}`}
            data-effect={effect.kind}
          >
            <summary>
              <EffectGlyph kind={effect.kind} />
              <span>
                <strong>{copy.title}</strong>
                <small>{mysteryText(locale, copy.positive ? 'beneficial' : 'dangerous')}</small>
              </span>
              <b>
                {effect.expiresAt === null
                  ? `${remaining} ${mysteryText(locale, 'rows')}`
                  : `${(remaining / 1000).toFixed(1)}s`}
              </b>
              <span
                className="cpi-force-track"
                style={{ width: `${(remaining / total) * 100}%` }}
              />
            </summary>
            <p>{copy.detail}</p>
            <small className="cpi-force-priority">
              {effects.some((active) => active.kind === 'coyote_10s')
                ? locale === 'bg'
                  ? 'Койотът спира само щетата от плочката; лечебните грешки работят, а другите цени остават.'
                  : 'Coyote stops tile damage only; healing wrong steps work, and other costs remain.'
                : mysteryText(locale, 'priority')}
            </small>
          </details>
        );
      })}
    </div>
  );
}

export function PactPanel({
  pact,
  hints,
  revealed,
  disabled,
  onChoose,
  sp = 100,
  rulesetVersion = RULESET_VERSION,
  activeTimeMs = 0,
}: {
  pact: MysteryPact | null | undefined;
  hints: number;
  revealed: boolean;
  disabled: boolean;
  onChoose: (option: PactOption) => void;
  sp?: number;
  rulesetVersion?: string;
  activeTimeMs?: number;
}) {
  const { locale } = useLanguage();
  if (!pact) return null;
  if (pact.phase === 'offered' && usesMysteryDirectorRules(rulesetVersion))
    return (
      <HolographicOffer
        pact={pact}
        sp={sp}
        hints={hints}
        revealed={revealed}
        disabled={disabled}
        onChoose={onChoose}
        activeTimeMs={activeTimeMs}
        rulesetVersion={rulesetVersion}
      />
    );
  const copy = effectCopy(locale, pact.kind, rulesetVersion);
  const offered = pact.phase === 'offered';
  const action = (option: PactOption, label: string, unavailable = false) => (
    <button
      type="button"
      key={option}
      onClick={() => onChoose(option)}
      disabled={disabled || unavailable}
      data-pact-option={option}
    >
      {label}
    </button>
  );
  return (
    <section
      className={`cpi-pact ${offered ? 'is-offered' : 'is-bound'}`}
      data-pact={pact.kind}
      aria-label={copy.title}
    >
      <div className="cpi-pact-heading">
        <EffectGlyph kind={pact.kind} />
        <div>
          <small>{mysteryText(locale, offered ? 'contract' : 'effects')}</small>
          <h2>{copy.title}</h2>
        </div>
        {!offered && (
          <div className="cpi-pact-count">
            <b>{pact.rowsLeft}</b>
            <small>{mysteryText(locale, 'rows')}</small>
            <div aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= pact.rowsLeft ? 'is-lit' : ''} />
              ))}
            </div>
          </div>
        )}
      </div>
      {offered ? (
        <p className="cpi-pact-description">{copy.detail}</p>
      ) : (
        <details className="cpi-pact-rules">
          <summary>{mysteryText(locale, 'rules')}</summary>
          <p>{copy.detail}</p>
        </details>
      )}
      {pact.kind === 'false_oracle' && !offered && (
        <div className="cpi-oracle-omen">
          <span aria-hidden="true">{pact.omen === 'left' ? '↖' : '↗'}</span>
          <div>
            <strong>{mysteryText(locale, pact.omen === 'left' ? 'left' : 'right')}</strong>
            <small>{mysteryText(locale, 'omen')}</small>
          </div>
          <b>
            70<span>%</span>
          </b>
        </div>
      )}
      {pact.kind === 'hungry_vault' && !offered && (
        <div className="cpi-vault-bank">
          <strong>
            {pact.bank}
            <small> SP</small>
          </strong>
          <span>{mysteryText(locale, 'bank')}</span>
          <div>
            {[15, 40, 85].map((n) => (
              <b key={n} className={n === pact.bank ? 'is-current' : ''}>
                {n}
              </b>
            ))}
          </div>
        </div>
      )}
      {pact.kind === 'borrowed_time' && !offered && (
        <div className="cpi-pact-debt">
          <b>−65 SP</b>
          <span>
            {pact.rowsLeft} {mysteryText(locale, 'rows')}
          </span>
        </div>
      )}
      {offered && pact.kind === 'false_oracle' && revealed && (
        <p className="cpi-pact-warning">{mysteryText(locale, 'oracleKnown')}</p>
      )}
      <div className="cpi-pact-actions">
        {offered && !['soul_exchange', 'half_life', 'marketing'].includes(pact.kind) && (
          <>
            {action(
              'accept',
              mysteryText(
                locale,
                pact.kind === 'blood_oath'
                  ? 'bloodAccept'
                  : pact.kind === 'false_oracle'
                    ? 'oracleAccept'
                    : pact.kind === 'hungry_vault'
                      ? 'vaultAccept'
                      : 'borrowAccept',
              ),
              pact.kind === 'false_oracle' && revealed,
            )}
            {action(
              'decline',
              mysteryText(locale, pact.kind === 'false_oracle' ? 'oracleDecline' : 'decline'),
            )}
          </>
        )}
        {offered && pact.kind === 'soul_exchange' && (
          <>
            {action('sp', mysteryText(locale, 'spOffer'))}
            {action('hint', mysteryText(locale, 'hintOffer'), hints < 1)}
          </>
        )}
        {offered && pact.kind === 'half_life' && (
          <>
            {action(
              'accept',
              mysteryText(locale, 'halfAccept').replace('{sp}', String(Math.floor(sp / 2))),
              sp < 2,
            )}
            {action('decline', mysteryText(locale, 'walkAway'))}
          </>
        )}
        {offered && pact.kind === 'marketing' && (
          <>
            {action('sell_one', mysteryText(locale, 'sellOne'), hints < 1)}
            {action(
              'sell_all',
              mysteryText(locale, 'sellAll')
                .replace('{hints}', String(hints))
                .replace('{sp}', String(hints * MARKET_SP_PER_HINT)),
              hints < 1,
            )}
            {action('decline', mysteryText(locale, 'walkAway'))}
          </>
        )}
        {!offered &&
          pact.kind === 'hungry_vault' &&
          pact.bank > 0 &&
          action('cashout', mysteryText(locale, 'cashout').replace('{bank}', String(pact.bank)))}
        {!offered &&
          pact.kind === 'borrowed_time' &&
          pact.rowsLeft < 3 &&
          action('settle', mysteryText(locale, 'settle'))}
      </div>
      {offered && pact.kind === 'half_life' && (
        <p className="cpi-trade-preview">
          <small>{mysteryText(locale, 'beforeAfter')}</small>
          <b>
            {sp} → {Math.floor(sp / 2)} SP
          </b>
          <b>
            ◈ {hints} → {hints + HALF_LIFE_HINTS}
          </b>
        </p>
      )}
      {offered && pact.kind === 'marketing' && hints > 0 && (
        <p className="cpi-trade-preview">
          <small>{mysteryText(locale, 'beforeAfter')}</small>
          <b>
            {sp} → {sp + MARKET_SP_PER_HINT} SP
          </b>
          <b>
            ◈ {hints} → {Math.max(0, hints - 1)}
          </b>
        </p>
      )}
      {offered && pact.kind === 'borrowed_time' && (
        <p className="cpi-pact-example">{mysteryText(locale, 'borrowExample')}</p>
      )}
      {offered && pact.kind === 'soul_exchange' && (
        <div className="cpi-soul-examples">
          <p>{mysteryText(locale, 'soulSpExample')}</p>
          <p>{mysteryText(locale, 'soulHintExample')}</p>
        </div>
      )}
      {offered && (
        <>
          {!['half_life', 'marketing'].includes(pact.kind) && (
            <p className="cpi-pact-warning">{mysteryText(locale, 'lethal')}</p>
          )}
          <small className="cpi-pact-frozen">{mysteryText(locale, 'frozen')}</small>
        </>
      )}
    </section>
  );
}
