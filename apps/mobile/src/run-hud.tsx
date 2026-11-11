import { STARTING_SP } from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { HintCounter } from './resource-feedback';
import { SpCounter } from './scene-instruments';
import type { HintCue } from './mystery-feedback';
import type { SurvivalReward } from './run-signals';

export function RunHud({
  campaign = false,
  row,
  clearedRows,
  sp,
  maxSp,
  hints,
  bonus = null,
  hintCue,
  reducedMotion,
  canHint,
  canPause,
  paused,
  onHint,
  onPause,
}: {
  campaign?: boolean;
  row: string;
  clearedRows: string;
  sp: number;
  maxSp: number | null;
  hints: number;
  bonus?: SurvivalReward | null;
  hintCue?: HintCue;
  reducedMotion: boolean;
  canHint: boolean;
  canPause: boolean;
  paused: boolean;
  onHint: () => void;
  onPause: () => void;
}) {
  const { t, number } = useLanguage();
  const criticalSp = maxSp === null ? 10 : 60;
  const warningSp = maxSp === null ? 30 : 140;
  const spClass = sp <= criticalSp ? 'is-danger' : sp <= warningSp ? 'is-warn' : 'is-safe';
  const spPct = Math.max(0, Math.min(100, (sp / (maxSp ?? Math.max(STARTING_SP, sp))) * 100));
  return (
    <header className="cpi-hud-header">
      <div className="cpi-hud-position">
        <span className="cpi-hud-wordmark">{campaign ? 'Campaign' : 'Infinity'}</span>
        <strong className="cps-row-display">
          {t('general.row', {
            row: number(row),
          })}
        </strong>
        <span className="cpi-hud-cleared">
          {t('game.cleared')} <b>{clearedRows}</b>
        </span>
      </div>
      <div className="cpi-hud-stability">
        <div className="cps-sp-display">
          <span className="cps-sp-label">{t('game.stabilityShort')}</span>
          <span className={`cps-sp-value ${spClass}`}>
            <SpCounter value={sp} bonus={bonus} reduced={reducedMotion} />
            {maxSp !== null && <small> / {maxSp}</small>}
          </span>
        </div>
        <div
          className={`cps-sp-bar-main cpi-energy-meter ${sp <= criticalSp ? 'is-low' : ''}`}
          role={maxSp === null ? 'img' : 'meter'}
          aria-label={
            sp <= warningSp
              ? t(sp <= criticalSp ? 'game.spCritical' : 'game.spLow', {
                  sp: number(sp),
                })
              : maxSp === null
                ? `${number(sp)} SP`
                : t('game.spAccessible')
          }
          aria-valuemin={maxSp === null ? undefined : 0}
          aria-valuemax={maxSp ?? undefined}
          aria-valuenow={maxSp === null ? undefined : sp}
        >
          <div className={`cps-sp-bar-fill ${spClass}`} style={{ width: `${spPct}%` }} />
          <div className="cpi-energy-segments" aria-hidden="true">
            {Array.from({ length: 14 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <span className="cpi-energy-marker" style={{ left: `${spPct}%` }} aria-hidden="true" />
        </div>
      </div>
      <div className="cpi-scene-toolbar-actions">
        <button
          type="button"
          className="cps-hint-btn cpi-hud-control cpi-hint-control"
          onClick={onHint}
          disabled={!canHint}
          aria-label={t('game.hintButton', { count: number(hints) })}
        >
          <HintCounter count={hints} cue={hintCue} />
        </button>
        <button
          type="button"
          className="cpi-pause-control cpi-hud-control"
          onClick={onPause}
          disabled={!canPause}
          aria-label={paused ? t('game.resumeGame') : t('game.pauseGame')}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {paused ? (
              <path d="m9 5 10 7-10 7V5Z" />
            ) : (
              <>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </>
            )}
          </svg>
        </button>
      </div>
    </header>
  );
}
