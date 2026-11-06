import { RunReserves } from './run-reserves';
import { useTestStore, useThemeId } from './store-context';
import { ThemeScope } from './store-provider';
import { WorldPathCompanion, WorldStepEffect } from './world-effects';
import { companionStandingSide } from './world-companion';
import { MysteryCache, WorldOutcomeHero } from './world-treasures';
import type { ThemeId } from './store-catalog';
import type { ReactNode } from 'react';
import { StageAtmosphere } from './stage-atmosphere';
import { useSoundtrack } from './soundtrack';
import { PrismBridge } from './prism-bridge';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPracticeCursor,
  createRun,
  MAX_SP,
  getMaxRevives,
  STORE_TEST_RULESET_VERSION,
  PRACTICE_RNG,
  presentRowPressure,
  HINT_SCAN_MS,
} from '@crystal-path-infinity/game-core';
import type {
  RunEvent,
  TestResource,
  RunState,
  SessionCommand,
  TileSide,
  TimedSessionResult,
  EffectKind,
} from '@crystal-path-infinity/game-core';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import { createStandaloneAudio } from './standalone-audio';
import type { StandaloneAudio } from './standalone-audio';
import { optionalHaptic } from './optional-haptic';
import {
  readPracticePersonalBest,
  recordPracticePersonalBest,
  upgradePracticePacing,
} from './practice-save';
import { formatActiveDuration, presentRunOutcome } from './run-outcome';
import { useLanguage } from './language-context';
import type { PracticeSettings } from './practice-save';
import { AudioSettingsControls } from './audio-settings-controls';
import { createPracticeRuntime, schedulePracticeTick } from './practice-runtime';
import type { PracticePauseLease, PracticeRuntime } from './practice-runtime';
import { presentInfinityScene } from './infinity-presentation';
import { createSceneDirector } from './scene-cinematics';
import type { SceneCinematic, SceneFeedback } from './scene-cinematics';
import { EffectGlyph } from './effect-glyph';
import { AnimatedResult } from './animated-result';
import { DeathClock, SpCounter } from './scene-instruments';
import { collectRunSignals, EMPTY_RUN_SIGNALS, liveSignal } from './run-signals';
import type { RunSignals } from './run-signals';
import { PRACTICE_RULESET_VERSION } from './practice-rules';
import { createHintCaptionGate } from './hint-caption';
import type { MessageKey } from './i18n/messages';
import './infinity-scene.css';
import './infinity-hud-premium.css';
import './run-outcome.css';
import './scene-cinematics.css';
import './row-pressure.css';

const EFFECT_MESSAGE: Record<EffectKind, MessageKey> = {
  shield_5s: 'game.effectShield',
  regen_5s: 'game.effectRegen',
  lucky_5s: 'game.effectLucky',
  fragility_5s: 'game.effectFragile',
  drain_5s: 'game.effectDrain',
  inversion_5s: 'game.effectInversion',
  heal_10: 'game.effectHeal',
  heal_20: 'game.effectHeal',
  hurt_10: 'game.effectHurt',
  hurt_15: 'game.effectHurt',
  gain_hint: 'game.effectHintGain',
  lose_hint: 'game.effectHintLoss',
};
const DEFAULT_VISUAL_SKIN = {
  id: 'infinity-glass-v1',
  shell: 'cps-shell--premium',
  title: 'Crystal Path: Infinity',
} as const;
// Visual choice is not stored inside the reducer or checkpoint. Future skins
// can replace this map without changing route, hints, SP or a ranked response.
export const INFINITY_SCENE_SKIN = DEFAULT_VISUAL_SKIN;

export type { SceneFeedback } from './scene-cinematics';
export interface InfinitySceneViewProps {
  readonly resourcePanel?: ReactNode;
  readonly trial?: boolean;
  readonly state: RunState;
  readonly feedback: SceneFeedback | null;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly paused: boolean;
  readonly error: string | null;
  readonly onChoose: (side: TileSide) => void;
  readonly onHint: () => void;
  readonly onMystery: () => void;
  readonly onPause: () => void;
  readonly onEnd: () => void;
  readonly onRequestEnd: () => void;
  readonly onCancelEnd: () => void;
  readonly confirmEnd: boolean;
  readonly onExit: () => void;
  readonly onViewRankings: () => void;
  readonly personalBest: string | null;
  readonly newPersonalBest: boolean;
  readonly onRestart: () => void;
  readonly onRetry: () => void;
  readonly settings: PracticeSettings;
  readonly onSettingsChange: (next: PracticeSettings) => void;
  readonly cinematic?: SceneCinematic | null;
  readonly signals?: RunSignals;
  readonly hintCaptionRow?: string | null;
}

/** No game-core mutations or timers. All callbacks are externally owned events. */
export function InfinitySceneView({
  resourcePanel,
  trial = false,
  state,
  feedback,
  ready,
  busy,
  paused,
  error,
  onChoose,
  onHint,
  onMystery,
  onPause,
  onEnd,
  onRequestEnd,
  onCancelEnd,
  confirmEnd,
  onExit,
  onViewRankings,
  personalBest,
  newPersonalBest,
  onRestart,
  onRetry,
  settings,
  onSettingsChange,
  cinematic = null,
  signals = EMPTY_RUN_SIGNALS,
  hintCaptionRow = null,
}: InfinitySceneViewProps) {
  const { t, number } = useLanguage();
  const themeId = useThemeId();
  const presented = presentInfinityScene(state);
  const outcome = presentRunOutcome(state);
  const worldOutcomeTheme =
    themeId !== 'obsidian' &&
    !error &&
    !confirmEnd &&
    ['dead', 'grant-ready', 'finished'].includes(outcome.phase)
      ? themeId
      : null;
  const clearedRows = number(state.result?.lastClearedRow ?? state.lastClearedRow);
  const rawFatalRow = state.result?.fatalRow ?? state.death?.fatalRow ?? null;
  const fatalRow = rawFatalRow === null ? null : number(rawFatalRow);
  const deathCause = state.result?.deathCause ?? state.death?.cause ?? null;
  const localizedDeathReason = deathCause
    ? t(
        deathCause === 'wrong_tile'
          ? 'game.deathWrong'
          : deathCause === 'idle'
            ? 'game.deathIdle'
            : deathCause === 'mystery'
              ? 'game.deathMystery'
              : 'game.deathDrain',
      )
    : null;
  const overlayVisible =
    !!error || (!cinematic?.fatal && (paused || confirmEnd || outcome.phase !== 'playing'));
  const catastrophic = state.death !== null && state.status !== 'playing';
  const pressure = presentRowPressure(state);
  const bonus = liveSignal(signals.bonus, state, 2400);
  const hintScan =
    liveSignal(signals.hint, state, HINT_SCAN_MS) ??
    (pressure?.paused &&
    state.pacing?.hintScanStartedAt !== undefined &&
    state.current.revealedSafeSide
      ? {
          id: `${state.runId}:${state.revivesApplied}:${state.currentRow}:scan-recovery`,
          row: state.currentRow,
          side: state.current.revealedSafeSide,
          activeAt: state.pacing.hintScanStartedAt,
        }
      : null);
  const emergency =
    state.status === 'playing' && ((state.sp > 0 && state.sp < 15) || pressure?.urgent);
  const hostileReveal = cinematic?.mystery
    ? cinematic.mystery.spDelta < 0 ||
      ['fragility_5s', 'drain_5s', 'inversion_5s', 'lose_hint'].includes(cinematic.mystery.kind)
    : false;
  const current = presented.rows.find((row) => row.phase === 'current');
  const cinematicBlocks = !!cinematic && (cinematic.phase !== 'reveal' || cinematic.fatal);
  const interactive =
    ready &&
    !busy &&
    !cinematicBlocks &&
    !paused &&
    !confirmEnd &&
    !error &&
    outcome.phase === 'playing';
  const spClass = state.sp <= 60 ? 'is-danger' : state.sp <= 140 ? 'is-warn' : 'is-safe';
  const spPct = Math.max(0, Math.min(100, (state.sp / MAX_SP) * 100));
  const notice =
    cinematic?.phase === 'impact'
      ? t(cinematic.feedback?.kind === 'wrong' ? 'game.impactWrong' : 'game.impactSafe')
      : (error ??
        (outcome.phase === 'verification-pending'
          ? t('game.noticePending')
          : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
            ? t('game.noticeDead')
            : outcome.phase === 'finished'
              ? t('game.noticeFinished')
              : !ready
                ? t('game.noticePreparing')
                : paused
                  ? t('game.noticePaused')
                  : current?.mysteryAvailable
                    ? t('game.noticeMystery')
                    : state.current.mysteryOutcome
                      ? t('game.noticeMysteryDone')
                      : t('game.noticeChoose')));

  return (
    <main
      className={`cps-shell ${INFINITY_SCENE_SKIN.shell} cpi-infinity-scene${catastrophic ? ' is-catastrophe' : ''}${emergency ? ' is-emergency' : ''}${paused ? ' is-paused' : ''}${pressure?.active ? ' has-death-clock' : ''}${settings.reducedMotion ? ' cpi-reduced-motion' : ''}`}
      data-world={themeId}
      data-testid="infinity-scene"
      aria-label={INFINITY_SCENE_SKIN.title}
    >
      <p className="cpi-run-mode">
        {t(trial ? 'vault.trial' : state.storeTest?.assisted ? 'vault.assisted' : 'vault.classic')}
      </p>
      <StageAtmosphere emergency={emergency || catastrophic} />
      <div className="cps-content" inert={overlayVisible}>
        <header className="cpi-hud-header">
          <div className="cpi-hud-position">
            <span className="cpi-hud-wordmark">Infinity</span>
            <strong className="cps-row-display">
              {t('general.row', {
                row: number(
                  cinematic?.rows?.find((row) => row.phase === 'current')?.label ??
                    presented.currentRow,
                ),
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
                <SpCounter value={state.sp} bonus={bonus} reduced={settings.reducedMotion} />
                <small> / {MAX_SP}</small>
              </span>
            </div>
            <div
              className={`cps-sp-bar-main cpi-energy-meter ${state.sp <= 60 ? 'is-low' : ''}`}
              role="meter"
              aria-label={t('game.spAccessible')}
              aria-valuemin={0}
              aria-valuemax={MAX_SP}
              aria-valuenow={state.sp}
            >
              <div className={`cps-sp-bar-fill ${spClass}`} style={{ width: `${spPct}%` }} />
              <div className="cpi-energy-segments" aria-hidden="true">
                {Array.from({ length: 14 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
              <span
                className="cpi-energy-marker"
                style={{ left: `${spPct}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="cpi-scene-toolbar-actions">
            <button
              type="button"
              className="cps-hint-btn cpi-hud-control cpi-hint-control"
              onClick={onHint}
              disabled={
                !interactive || state.hints === 0 || state.current.revealedSafeSide !== null
              }
              aria-label={t('game.hintButton', { count: number(state.hints) })}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.8 14.5 9.5 21.2 12 14.5 14.5 12 21.2 9.5 14.5 2.8 12 9.5 9.5Z" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              <span className="cps-hint-count">{state.hints}</span>
            </button>
            <button
              type="button"
              className="cpi-pause-control cpi-hud-control"
              onClick={onPause}
              disabled={!ready || busy || cinematicBlocks || !!error || state.status !== 'playing'}
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
        <section className="cps-board" aria-label={t('game.bridge')} dir="ltr">
          <div className="cpi-stage-instruments">
            <div
              className={'cpi-death-clock' + (bonus ? ' is-rewarding' : '')}
              aria-label={t('game.timeAlive')}
            >
              <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M6 3h20M6 29h20M9 4v5l14 14v5M23 4v5L9 23v5M12 6h8M12 26h8" />
              </svg>
              <div>
                <span>{t('game.timeAlive')}</span>
                <time>{formatActiveDuration(state.activeTimeMs)}</time>
              </div>
              <i aria-hidden="true" />
              {bonus && (
                <span key={bonus.id} className="cpi-survival-bonus" role="status">
                  <strong>+{bonus.amount} SP</strong>
                  <small>{t(state.sp === MAX_SP ? 'game.maxSp' : 'game.survivalBonus')}</small>
                </span>
              )}
            </div>
            {presented.effects.length > 0 && (
              <div className="cps-effects" aria-label={t('game.effects')}>
                {presented.effects.map((effect, i) => (
                  <span
                    key={effect.kind + ':' + (state.effects[i]?.startedAt ?? i)}
                    className={`cps-effect ${effect.positive ? 'is-pos' : 'is-neg'}`}
                  >
                    <span className="cpi-effect-symbol">
                      <EffectGlyph kind={effect.kind} />
                      <svg className="cpi-effect-orbit" viewBox="0 0 48 48" aria-hidden="true">
                        <circle
                          cx="24"
                          cy="24"
                          r="22"
                          pathLength="100"
                          strokeDasharray={`${effect.percent} 100`}
                        />
                      </svg>
                    </span>
                    <span className="cpi-effect-copy">
                      <span className="cps-effect-name">{t(EFFECT_MESSAGE[effect.kind])}</span>
                      <span className="cps-effect-timer">
                        {(effect.remainingMs / 1000).toFixed(1)}s
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="cpi-right-instruments">
            {pressure?.active && <DeathClock pressure={pressure} />}
            {state.sp <= 140 && state.status === 'playing' && (
              <div
                className={'cpi-sp-danger-copy ' + (state.sp <= 60 ? 'is-critical' : 'is-low')}
                role="status"
                aria-label={t(state.sp <= 60 ? 'game.spCritical' : 'game.spLow', {
                  sp: number(state.sp),
                })}
              >
                <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path d="m16 3 14 25H2L16 3Z" />
                  <path d="M16 11v8m0 4v1" />
                </svg>
                <span>
                  {t(
                    emergency
                      ? 'game.emergency'
                      : state.sp <= 60
                        ? 'game.criticalLabel'
                        : 'game.lowLabel',
                  )}
                  <strong>
                    {number(state.sp)} <small>SP</small>
                  </strong>
                </span>
              </div>
            )}
          </div>
          <PrismBridge
            rows={cinematic?.rows ?? presented.rows}
            feedback={cinematic?.feedback ?? feedback}
            interactive={interactive}
            onChoose={onChoose}
            onMystery={onMystery}
            reducedMotion={settings.reducedMotion}
            phase={cinematic?.phase}
            collapsed={catastrophic && (!cinematic || cinematic.phase === 'collapse')}
            eventId={state.death?.id ?? cinematic?.id ?? ''}
            fractureSeed={`${state.runId}:${state.revivesApplied}`}
            hintScan={hintScan}
            showHintCaption={hintCaptionRow === state.currentRow}
          />
          <WorldStepEffect theme={themeId} cinematic={cinematic} reduced={settings.reducedMotion} />
          {themeId !== 'obsidian' && (
            <WorldPathCompanion
              theme={themeId}
              cinematic={cinematic}
              standingSide={companionStandingSide(cinematic?.rows ?? presented.rows)}
              sp={state.sp}
              effects={presented.effects}
              reduced={settings.reducedMotion}
              paused={paused}
              reaction={
                emergency || catastrophic || hostileReveal || cinematic?.feedback?.kind === 'wrong'
                  ? 'panic'
                  : cinematic?.feedback?.kind === 'safe' || cinematic?.mystery
                    ? 'happy'
                    : 'calm'
              }
            />
          )}
          {cinematic?.mystery && (
            <div
              key={cinematic.id}
              className={
                'cpi-mystery-release' +
                (themeId !== 'obsidian' ? ' cpi-world-reveal' : '') +
                (hostileReveal ? ' is-hostile' : '')
              }
              aria-hidden="true"
            >
              <span className="cpi-release-flare" />
              {themeId !== 'obsidian' && (
                <span className="cpi-world-reveal-cache">
                  <MysteryCache theme={themeId} open />
                </span>
              )}
              <span className="cpi-released-symbol">
                <EffectGlyph kind={cinematic.mystery.kind} />
              </span>
              <div className="cpi-mystery-readout">
                <span>{t(hostileReveal ? 'game.mysteryCritical' : 'game.mysterySignal')}</span>
                <strong>{t(EFFECT_MESSAGE[cinematic.mystery.kind])}</strong>
                <b>
                  {cinematic.mystery.spDelta !== 0
                    ? `${cinematic.mystery.spDelta > 0 ? '+' : ''}${cinematic.mystery.spDelta} SP`
                    : cinematic.mystery.hintDelta !== 0
                      ? `${cinematic.mystery.hintDelta > 0 ? '+' : ''}${cinematic.mystery.hintDelta}`
                      : '05.0s'}
                </b>
              </div>
            </div>
          )}
          {cinematic?.feedback && cinematic.phase !== 'contact' && cinematic.phase !== 'travel' && (
            <div className={'cpi-step-readout is-' + cinematic.feedback.kind} aria-hidden="true">
              {t(
                cinematic.fatal
                  ? 'game.collapse'
                  : cinematic.feedback.kind === 'wrong'
                    ? 'game.impactWrong'
                    : 'game.impactSafe',
              )}
            </div>
          )}
          {catastrophic && (
            <div className="cpi-death-veil" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
        </section>
        <p className="visually-hidden" role="status" aria-live="polite">
          {notice}
        </p>
        <p className="cpi-scene-footer">
          <span aria-hidden="true">—</span>
          {t('game.bridgeGuidance')}
          <span aria-hidden="true">—</span>
          <span className="visually-hidden">{t('game.crossingNote')}</span>
        </p>
      </div>
      {overlayVisible && (
        <div className="cpi-overlay">
          <div
            className={
              'cpi-overlay-card cpi-run-outcome' + (worldOutcomeTheme ? ' is-world-outcome' : '')
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="cpi-run-outcome-title"
          >
            {worldOutcomeTheme && (
              <WorldOutcomeHero theme={worldOutcomeTheme} finished={outcome.phase === 'finished'} />
            )}
            <header className="cpi-dialog-heading">
              <span className="cpi-dialog-emblem" data-phase={outcome.phase} aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <path
                    d={
                      catastrophic
                        ? 'M5 35 14 20l6 8 6-14 8 6 9 15M12 35l8-7m6-14 6 21M6 40h12m12 0h12'
                        : outcome.phase === 'finished'
                          ? 'M8 26l11 11L40 12M8 10h12M8 15h7'
                          : paused && !confirmEnd
                            ? 'M16 12v24M32 12v24'
                            : 'M8 34 24 10l16 24M18 25h12M24 34v6'
                    }
                  />
                  <circle cx="40" cy="8" r="2" />
                </svg>
              </span>
              <h2 id="cpi-run-outcome-title">
                {t(
                  error
                    ? 'game.clockTitle'
                    : confirmEnd && outcome.canEnd
                      ? 'game.confirmTitle'
                      : outcome.phase === 'verification-pending'
                        ? 'game.pendingTitle'
                        : outcome.phase === 'finished'
                          ? 'game.complete'
                          : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
                            ? 'game.deathTitle'
                            : 'game.paused',
                )}
              </h2>
            </header>
            {error ? (
              <>
                <p role="alert">{error}</p>
                <p>{t('game.clockRecover')}</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onRetry}>
                    {t('game.retryClock')}
                  </button>
                  <button type="button" onClick={onExit}>
                    {t('general.saveLeave')}
                  </button>
                </div>
              </>
            ) : confirmEnd && outcome.canEnd ? (
              <>
                <p>
                  {t('game.confirmCleared', { row: clearedRows })}{' '}
                  {fatalRow !== null
                    ? t('game.confirmFatal', { row: fatalRow })
                    : t('game.confirmUnfinished')}
                </p>
                {outcome.forfeitsGrant && <p role="alert">{t('game.confirmForfeit')}</p>}
                <p>{t('game.confirmLocal')}</p>
                <div className="cpi-overlay-actions">
                  <button
                    type="button"
                    data-cpi-overlay-primary
                    disabled={busy}
                    onClick={onCancelEnd}
                  >
                    {t('game.keepAttempt')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onEnd}
                    className="cpi-run-danger-action"
                  >
                    {outcome.forfeitsGrant ? t('game.confirmForfeitButton') : t('game.confirmEnd')}
                  </button>
                </div>
              </>
            ) : outcome.phase === 'verification-pending' ? (
              <>
                <p>{t('game.pendingExplanation', { row: clearedRows })}</p>
                <p role="status">{t('game.pendingRecovery')}</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onExit}>
                    {t('game.savePending')}
                  </button>
                </div>
              </>
            ) : outcome.phase === 'finished' ? (
              <>
                <p className="cpi-run-status-label">
                  {t(state.storeTest?.assisted ? 'vault.assisted' : 'game.practiceUnverified')}
                </p>
                <div className="cpi-result-score">
                  <span>{t('game.rowsCleared')}</span>
                  <strong>
                    <AnimatedResult
                      value={state.result?.lastClearedRow ?? state.lastClearedRow}
                      reduced={settings.reducedMotion}
                    />
                  </strong>
                </div>
                <dl className="cpi-result-details">
                  <div>
                    <dt>{t('game.fatalRow')}</dt>
                    <dd>
                      {rawFatalRow === null ? (
                        t('general.none')
                      ) : (
                        <AnimatedResult value={rawFatalRow} reduced={settings.reducedMotion} />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('game.activeTime')}</dt>
                    <dd>{outcome.activeTime}</dd>
                  </div>
                  <div>
                    <dt>{t('game.revivesApplied')}</dt>
                    <dd>
                      <AnimatedResult
                        value={String(outcome.appliedContinues)}
                        reduced={settings.reducedMotion}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>{t('game.bestLocal')}</dt>
                    <dd>{personalBest === null ? t('general.notSaved') : number(personalBest)}</dd>
                  </div>
                </dl>
                {localizedDeathReason && <p>{localizedDeathReason}</p>}
                {newPersonalBest && <p className="cpi-new-best">{t('game.bestNew')}</p>}
                <p>{t(state.storeTest?.assisted ? 'vault.assistedResult' : 'game.resultLocal')}</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onRestart}>
                    {t('game.nextRun')}
                  </button>
                  <button type="button" onClick={onViewRankings}>
                    {t('game.rankingsNotLive')}
                  </button>
                  <button type="button" onClick={onExit}>
                    {t('game.returnMenu')}
                  </button>
                </div>
              </>
            ) : outcome.phase === 'dead' || outcome.phase === 'grant-ready' ? (
              <>
                {localizedDeathReason && <p>{localizedDeathReason}</p>}
                <div className="cpi-result-score">
                  <span>{t('game.rowsCleared')}</span>
                  <strong>
                    <AnimatedResult value={state.lastClearedRow} reduced={settings.reducedMotion} />
                  </strong>
                </div>
                <p>{t('game.fatalNotCounted', { row: fatalRow ?? t('general.none') })}</p>
                {outcome.offer ? (
                  <div className="cpi-revive-offer">
                    <strong>
                      {t('game.bargainTitle', {
                        sp: number(outcome.offer.restoreSp),
                      })}
                    </strong>
                    <span>{t('game.bargainBody')}</span>
                    {!resourcePanel && <span>{t('game.bargainSleeping')}</span>}
                  </div>
                ) : outcome.phase === 'grant-ready' ? (
                  <p role="status">{t('game.grantReady')}</p>
                ) : (
                  <p>{t('game.noContinues')}</p>
                )}
                {resourcePanel}
                <div className="cpi-overlay-actions">
                  <button
                    type="button"
                    data-cpi-overlay-primary
                    disabled={busy}
                    onClick={onRequestEnd}
                  >
                    {t('general.endRun')}
                  </button>
                  <button type="button" disabled={busy} onClick={onExit}>
                    {t(outcome.forfeitsGrant ? 'general.saveLeave' : 'game.returnMenu')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{t('game.pausedExplanation')}</p>
                <p>{t('game.pausedRows', { row: clearedRows })}</p>
                <details className="cpi-run-ledger">
                  <summary>{t('game.runDetails')}</summary>
                  <div className="cpi-run-metrics" aria-label={t('menu.progress')}>
                    <span>
                      {t('game.cleared')} <strong>{clearedRows}</strong>
                    </span>
                    <span>
                      {t('game.used')}{' '}
                      <strong>
                        {number(outcome.appliedContinues)} / {getMaxRevives(state.rulesetVersion)}
                      </strong>
                    </span>
                    <span>
                      {t('game.granted')}{' '}
                      <strong>
                        {number(outcome.grantedContinues)} / {getMaxRevives(state.rulesetVersion)}
                      </strong>
                    </span>
                    <span>
                      {t('game.quota')} <strong>{number(outcome.grantsRemaining)}</strong>
                    </span>
                  </div>
                </details>
                {resourcePanel}
                <AudioSettingsControls settings={settings} onChange={onSettingsChange} />
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary disabled={busy} onClick={onPause}>
                    {t('general.resume')}
                  </button>
                  <button type="button" disabled={busy} onClick={onRequestEnd}>
                    {t('general.endRun')}
                  </button>
                  <button type="button" disabled={busy} onClick={onExit}>
                    {t('general.saveLeave')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function makeInitialRun(testEconomy = false): RunState {
  const seed = new Uint32Array(2);
  crypto.getRandomValues(seed);
  const route = (BigInt(seed[0]) << 32n) | BigInt(seed[1]);
  const mystery = route ^ 0x9e3779b97f4a7c15n;
  return createRun(
    {
      runId: 'practice-' + route.toString(16),
      rulesetVersion: testEconomy ? STORE_TEST_RULESET_VERSION : PRACTICE_RULESET_VERSION,
      routeRng: createPracticeCursor(route),
      mysteryRng: createPracticeCursor(mystery),
      observedAt: Date.now(),
      buffer: { ahead: 8, history: 2 },
    },
    PRACTICE_RNG,
  );
}

interface InfinityRunProps {
  trial?: boolean;
  onExit: () => void;
  onViewRankings: () => void;
  onExitCancelled: () => void;
  exitRequest: number;
  onRestart: () => void;
  initialState: RunState | null;
  onCheckpoint: (state: RunState) => void;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
}
function InfinityRun({
  trial = false,
  onExit,
  onViewRankings,
  onExitCancelled,
  exitRequest,
  onRestart,
  initialState,
  onCheckpoint,
  settings,
  onSettingsChange,
}: InfinityRunProps) {
  const { t } = useLanguage();
  const { store } = useTestStore();
  const runTheme = useThemeId();
  const [resourceMessage, setResourceMessage] = useState('');
  const [initial] = useState(() =>
    initialState ? upgradePracticePacing(initialState) : makeInitialRun(!!store && !trial),
  );
  const [initialAudioSettings] = useState(settings);
  const lastCommittedActiveMs = useRef(-500);
  const [state, setState] = useState<RunState>(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null);
  const [cinematic, setCinematic] = useState<SceneCinematic | null>(null);
  const [signals, setSignals] = useState<RunSignals>(EMPTY_RUN_SIGNALS);
  const [hintCaptionRow, setHintCaptionRow] = useState<string | null>(null);
  const [hintCaptionGate] = useState(() => createHintCaptionGate(() => window.localStorage));
  const [confirmEnd, setConfirmEnd] = useState(false);
  useSoundtrack(
    state.status === 'playing' ? 'run' : cinematic?.fatal ? null : 'ended',
    settings.music && (state.status !== 'playing' || (ready && !paused && !confirmEnd && !error)),
    settings.music && (!!cinematic?.fatal || confirmEnd),
  );
  const [personalBest, setPersonalBest] = useState<string | null>(null);
  const [newPersonalBest, setNewPersonalBest] = useState(false);
  const runtimeRef = useRef<PracticeRuntime | null>(null);
  const audioRef = useRef<StandaloneAudio | null>(null);
  const pauseRef = useRef<PracticePauseLease | null>(null);
  const commandLock = useRef(false);
  const exitLock = useRef(false);
  const directorRef = useRef<ReturnType<typeof createSceneDirector> | null>(null);
  const reducedRef = useRef(settings.reducedMotion);

  useEffect(() => {
    reducedRef.current = settings.reducedMotion;
    if (settings.reducedMotion) directorRef.current?.finish();
  }, [settings.reducedMotion]);

  useEffect(() => {
    let alive = true;
    const lifecycle = getGameplayLifecycle();
    const audio = createStandaloneAudio(
      {
        createMedia: (source) => new Audio(source),
        haptic: optionalHaptic,
      },
      { ...initialAudioSettings, music: false },
      runTheme,
    );
    audioRef.current = audio;
    const director = createSceneDirector(
      initial,
      (beat) => {
        if (alive) setCinematic(beat);
      },
      (callback, delay) => {
        const timer = window.setTimeout(callback, delay);
        return () => window.clearTimeout(timer);
      },
      () => reducedRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    directorRef.current = director;
    audio.setForeground(document.visibilityState !== 'hidden');
    const runtime = createPracticeRuntime({
      state: initial,
      rng: PRACTICE_RNG,
      lifecycle,
      schedule: schedulePracticeTick,
      playback: audio,
      onTransition: (result: TimedSessionResult) => {
        if (!alive) return;
        director.receive(result);
        const hint = result.events.find((event) => event.type === 'hint-used');
        if (hint && hintCaptionGate.claim()) setHintCaptionRow(hint.row);
        if (result.events.length) setSignals((previous) => collectRunSignals(previous, result));
        let earnedNewBest = false;
        if (!trial && result.events.some((event) => event.type === 'run-ended')) {
          try {
            earnedNewBest =
              result.state.storeTest?.assisted && store
                ? store.recordAssistedBest(result.state.lastClearedRow)
                : recordPracticePersonalBest(window.localStorage, result.state.lastClearedRow);
            setPersonalBest(
              result.state.storeTest?.assisted && store
                ? store.snapshot().assistedBest
                : readPracticePersonalBest(window.localStorage),
            );
            setNewPersonalBest(earnedNewBest);
          } catch {
            // A storage error must not change game result or claim a saved best.
            setPersonalBest(null);
            setNewPersonalBest(false);
          }
        }
        audio.playEvents(result.events, result.state, {
          foreground: document.visibilityState !== 'hidden',
          personalBest: earnedNewBest,
        });
        if (
          result.events.length > 0 ||
          result.state.status !== 'playing' ||
          result.state.activeTimeMs - lastCommittedActiveMs.current >= 500
        ) {
          onCheckpoint(result.state);
          lastCommittedActiveMs.current = result.state.activeTimeMs;
        }
        setState(result.state);
        const choice = result.events.find(
          (event): event is Extract<RunEvent, { type: 'choice-resolved' }> =>
            event.type === 'choice-resolved',
        );
        if (choice)
          setFeedback({
            row: (BigInt(choice.row) - 1n).toString(),
            side: choice.side,
            kind: choice.wrong ? 'wrong' : 'safe',
          });
      },
      onError: (reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : 'Clock read failed.');
      },
    });
    runtimeRef.current = runtime;
    const unsubscribeCheckpoint = lifecycle.subscribe((snapshot) => {
      audio.setForeground(snapshot.active);
      if (!snapshot.active && alive) {
        director.finish();
        setSignals(EMPTY_RUN_SIGNALS);
        try {
          onCheckpoint(runtime.getState());
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Local save failed.');
        }
      }
    });
    void runtime.ready
      .then(() => {
        if (alive) {
          setReady(true);
          setState(runtime.getState());
        }
      })
      .catch((reason) => {
        if (alive)
          setError(reason instanceof Error ? reason.message : 'Unable to initialize clock.');
      });
    return () => {
      alive = false;
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      if (audioRef.current === audio) audioRef.current = null;
      if (directorRef.current === director) directorRef.current = null;
      director.dispose();
      unsubscribeCheckpoint();
      runtime.dispose();
    };
  }, [initial, onCheckpoint, initialAudioSettings, hintCaptionGate, store, trial, runTheme]);

  useEffect(() => {
    audioRef.current?.setSettings({ ...settings, music: false });
  }, [settings]);

  useEffect(() => {
    if (paused || confirmEnd || state.status !== 'playing' || error) {
      document.querySelector<HTMLButtonElement>('.cpi-overlay [data-cpi-overlay-primary]')?.focus();
    }
  }, [paused, confirmEnd, state.status, state.pendingReward, error, cinematic?.fatal]);

  useEffect(() => {
    if (!confirmEnd) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmEnd(false);
      }
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [confirmEnd]);

  function unlockAudio() {
    void audioRef.current?.unlock();
  }

  async function issue(command: SessionCommand) {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      !ready ||
      (paused && command.type !== 'end') ||
      commandLock.current ||
      (command.type !== 'end' && directorRef.current?.isBusy())
    )
      return;
    commandLock.current = true;
    setBusy(true);
    try {
      const result = await runtime.bind(command)();
      setState(result.state);
      if (
        !result.accepted &&
        result.reason &&
        ![
          'clock-paused',
          'stale-command',
          'stale-pause',
          'command-consumed',
          'died-before-command',
        ].includes(result.reason)
      )
        setError(`Action unavailable: ${result.reason}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gameplay command failed.');
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }

  async function togglePause(requestEndAfterPause = false) {
    if (requestEndAfterPause && paused) {
      setConfirmEnd(true);
      return;
    }
    if (paused) unlockAudio();
    const runtime = runtimeRef.current;
    if (!runtime || commandLock.current || directorRef.current?.isBusy()) return;
    commandLock.current = true;
    setBusy(true);
    try {
      if (pauseRef.current) {
        const lease = pauseRef.current;
        pauseRef.current = null;
        await lease.release();
        setPaused(false);
      } else {
        const lease = await runtime.hold('user');
        pauseRef.current = lease;
        setPaused(true);
      }
      if (requestEndAfterPause) setConfirmEnd(true);
      onCheckpoint(runtime.getState());
      lastCommittedActiveMs.current = runtime.getState().activeTimeMs;
      setState(runtime.getState());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pause failed.');
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      await runtime.refresh();
      setError(null);
      setReady(true);
      setState(runtime.getState());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Clock is unavailable.');
    }
  }
  const exit = useCallback(async () => {
    if (exitLock.current) return;
    if (commandLock.current) {
      onExitCancelled();
      return;
    }
    exitLock.current = true;
    try {
      const runtime = runtimeRef.current;
      if (
        (runtime?.getState().status ?? state.status) === 'playing' &&
        !paused &&
        !window.confirm(t('app.saveLeaveConfirm'))
      ) {
        onExitCancelled();
        return;
      }
      if (runtime) {
        try {
          const latest = runtime.getState();
          if (
            latest.status === 'dead' &&
            !latest.storeTest &&
            latest.pendingReward === null &&
            !latest.reviveReceipts.some((receipt) => receipt.status === 'granted')
          ) {
            // Leaving a declined death finalizes its result instead of advertising a dead Resume.
            await runtime.bind({ type: 'end', forfeitGrantedReward: false })();
          }
          if (!paused) await runtime.hold('recovery');
          onCheckpoint(runtime.getState());
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to pause and save.');
          onExitCancelled();
          return;
        }
      }
      onExit();
    } finally {
      exitLock.current = false;
    }
  }, [state.status, paused, onCheckpoint, onExit, onExitCancelled, t]);

  async function useResource(resource: TestResource, amount: number): Promise<boolean> {
    const runtime = runtimeRef.current;
    if (
      !runtime ||
      !store ||
      !ready ||
      commandLock.current ||
      trial ||
      directorRef.current?.isBusy()
    )
      return false;
    const previous = runtime.getState();
    if (!previous.storeTest || (previous.status === 'playing' && !paused)) return false;
    commandLock.current = true;
    setBusy(true);
    setResourceMessage('');
    try {
      const result = await runtime.bind(
        { type: 'test-resource', resource, amount, sequence: previous.storeTest.sequence + 1 },
        store.commitResource,
      )();
      setState(result.state);
      if (!result.accepted) {
        setResourceMessage(`Action unavailable: ${result.reason}`);
        return false;
      }
      setResourceMessage(t('vault.resourceUsed'));
      return true;
    } catch (cause) {
      setResourceMessage(
        cause instanceof Error ? cause.message : 'Test resource could not be saved.',
      );
      return false;
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }

  const handledExitRequest = useRef(0);
  useEffect(() => {
    if (exitRequest === 0 || handledExitRequest.current === exitRequest) return;
    handledExitRequest.current = exitRequest;
    void exit();
  }, [exitRequest, exit]);
  return (
    <InfinitySceneView
      trial={trial}
      resourcePanel={
        store && state.storeTest && !trial ? (
          <RunReserves state={state} busy={busy} onUse={useResource} message={resourceMessage} />
        ) : undefined
      }
      state={state}
      feedback={feedback}
      cinematic={cinematic}
      signals={signals}
      hintCaptionRow={hintCaptionRow}
      ready={ready}
      busy={busy}
      paused={paused}
      error={error}
      onChoose={(side) => {
        unlockAudio();
        void issue({ type: 'choose', side });
      }}
      onHint={() => {
        unlockAudio();
        void issue({ type: 'hint' });
      }}
      onMystery={() => {
        unlockAudio();
        void issue({ type: 'mystery' });
      }}
      onPause={() => {
        void togglePause();
      }}
      onRequestEnd={() => {
        if (!ready || busy || commandLock.current || !presentRunOutcome(state).canEnd) return;
        if (state.status === 'dead') {
          setConfirmEnd(true);
        } else {
          void togglePause(true);
        }
      }}
      onCancelEnd={() => setConfirmEnd(false)}
      confirmEnd={confirmEnd}
      onEnd={() => {
        if (!confirmEnd || !presentRunOutcome(state).canEnd) return;
        // The explicit confirmation includes forfeiture of any unused grant.
        // Core rejects unresolved pending rewards; no fake SSV success exists.
        setConfirmEnd(false);
        void issue({ type: 'end', forfeitGrantedReward: true });
      }}
      onViewRankings={() => {
        if (state.status === 'finished' && state.result) onViewRankings();
      }}
      personalBest={personalBest}
      newPersonalBest={newPersonalBest}
      onExit={() => {
        void exit();
      }}
      onRestart={onRestart}
      onRetry={() => {
        void retry();
      }}
      settings={settings}
      onSettingsChange={onSettingsChange}
    />
  );
}

/** A new attempt and an explicitly resumed checkpoint have distinct owners. */
export function InfinityPractice({
  trialTheme,
  onExit,
  onViewRankings,
  onExitCancelled,
  exitRequest = 0,
  initialState = null,
  onCheckpoint,
  settings,
  onSettingsChange,
}: {
  trialTheme?: ThemeId;
  onExit: () => void;
  onViewRankings: () => void;
  onExitCancelled?: () => void;
  exitRequest?: number;
  initialState?: RunState | null;
  onCheckpoint: (state: RunState) => void;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
}) {
  const themeId = useThemeId();
  const [attempt, setAttempt] = useState(0);
  const restartLock = useRef(false);
  useEffect(() => {
    restartLock.current = false;
  }, [attempt]);
  return (
    <ThemeScope theme={trialTheme ?? themeId}>
      <InfinityRun
        trial={!!trialTheme}
        key={attempt}
        initialState={attempt === 0 ? initialState : null}
        onCheckpoint={onCheckpoint}
        settings={settings}
        onSettingsChange={onSettingsChange}
        onExit={onExit}
        onViewRankings={onViewRankings}
        onExitCancelled={onExitCancelled ?? (() => {})}
        exitRequest={exitRequest}
        onRestart={() => {
          if (restartLock.current) return;
          restartLock.current = true;
          setAttempt((n) => n + 1);
        }}
      />
    </ThemeScope>
  );
}
