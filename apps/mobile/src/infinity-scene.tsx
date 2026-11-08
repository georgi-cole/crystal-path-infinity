import { nextPracticeRuleset } from './balance-tuning';
import { QA_TOOLS_ENABLED, practiceStorage } from './app-profile';
import { shouldFinishPracticeOnExit } from './practice-exit';
import { DiscoveryIntroduction } from './mystery-introduction';
import { MysteryJournal } from './mystery-discovery';
import { readMysteryJournal } from './mystery-journal-model';
import { mysteryFeedbackFromEvents, runCuesFromEvents } from './mystery-feedback';
import type { MysteryFeedback, RunCues } from './mystery-feedback';
import { MysteryEffects, MysteryFeedbackView, PactPanel, EffectGlyph } from './mystery-effects';
import { EffectConsumption, HintCounter } from './resource-feedback';
import { MysteryRhythmBadge, DeathClockBadge } from './mystery-box';
import { MysteryLab } from './mystery-lab';
import { effectCopy, mysteryText } from './mystery.messages';
import './run-status.css';
import { RunReserves } from './run-reserves';
import { useTestStore, useThemeId } from './store-context';
import { ThemeScope } from './store-provider';
import { WorldPathCompanion, WorldStepEffect } from './world-effects';
import { companionStandingSide } from './world-companion';
import { MysteryCache, WorldOutcomeHero } from './world-treasures';
import { WorldNavGlyph } from './world-navigation';
import type { ThemeId } from './store-catalog';
import { isPetWorld, WORLD_KITS } from './world-kits';
import type { ReactNode } from 'react';
import { StageAtmosphere } from './stage-atmosphere';
import { useSoundtrack } from './soundtrack';
import { PrismBridge } from './prism-bridge';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  createPracticeCursor,
  createRun,
  getRuleset,
  parseTileExperiment,
  STARTING_SP,
  getDeathClock,
  isPactKind,
  getMaxRevives,
  PRACTICE_RNG,
  presentRowPressure,
  HINT_SCAN_MS,
  marketingSale,
} from '@crystal-path-infinity/game-core';
import type {
  RunEvent,
  TestResource,
  RunState,
  SessionCommand,
  TileSide,
  TimedSessionResult,
  EffectKind,
  PactOption,
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
import { presentRunOutcome } from './run-outcome';
import { useLanguage } from './language-context';
import type { PracticeSettings } from './practice-save';
import { AudioSettingsControls } from './audio-settings-controls';
import { createPracticeRuntime, schedulePracticeTick } from './practice-runtime';
import type { PracticePauseLease, PracticeRuntime } from './practice-runtime';
import { presentInfinityScene } from './infinity-presentation';
import { createSceneDirector } from './scene-cinematics';
import type { SceneCinematic, SceneFeedback } from './scene-cinematics';
import { AnimatedResult } from './animated-result';
import { DeathClock, SpCounter } from './scene-instruments';
import { collectRunSignals, EMPTY_RUN_SIGNALS, liveSignal } from './run-signals';
import type { RunSignals } from './run-signals';
import { createHintCaptionGate } from './hint-caption';
import './infinity-scene.css';
import './infinity-hud-premium.css';
import './run-outcome.css';
import './scene-cinematics.css';
import './row-pressure.css';

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
  readonly onPact?: (option: PactOption) => void;
  readonly mysteryFeedback?: MysteryFeedback | null;
  readonly resourceCues?: RunCues;
  readonly onMysteryLab?: () => void;
  readonly onMysteryJournal?: () => void;
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
function PauseDetails({
  progress,
  reserve,
  audio,
}: {
  progress: ReactNode;
  reserve?: ReactNode;
  audio: ReactNode;
}) {
  const { t } = useLanguage();
  const id = useId();
  const [open, setOpen] = useState<string | null>(null);
  const panels = [
    { key: 'progress', label: t('game.runDetails'), content: progress },
    ...(reserve ? [{ key: 'reserve', label: t('vault.manage'), content: reserve }] : []),
    { key: 'sound', label: t('settings.audioLegend'), content: audio },
  ];
  return (
    <div className="cpi-pause-details">
      <div className="cpi-pause-detail-buttons" role="group" aria-label={t('game.runDetails')}>
        {panels.map((panel) => (
          <button
            key={panel.key}
            type="button"
            aria-expanded={open === panel.key}
            aria-controls={`${id}-${panel.key}`}
            onClick={() => setOpen((current) => (current === panel.key ? null : panel.key))}
          >
            {panel.label}
          </button>
        ))}
      </div>
      {panels.map((panel) => (
        <div key={panel.key} id={`${id}-${panel.key}`} hidden={open !== panel.key}>
          {panel.content}
        </div>
      ))}
    </div>
  );
}

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
  onPact,
  mysteryFeedback = null,
  resourceCues = {},
  onMysteryLab,
  onMysteryJournal,
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
  const { t, number, locale } = useLanguage();
  const themeId = useThemeId();
  const petWorld = isPetWorld(themeId);
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
          ? petWorld
            ? 'vault.petWrong'
            : 'game.deathWrong'
          : deathCause === 'idle' || deathCause === 'death_clock'
            ? petWorld
              ? 'vault.petIdle'
              : 'game.deathIdle'
            : deathCause === 'mystery'
              ? petWorld
                ? 'vault.petMystery'
                : 'game.deathMystery'
              : petWorld
                ? 'vault.petDrain'
                : 'game.deathDrain',
      )
    : null;
  const overlayVisible =
    !!error || (!cinematic?.fatal && (paused || confirmEnd || outcome.phase !== 'playing'));
  const catastrophic = state.death !== null && state.status !== 'playing';
  const pressure = presentRowPressure(state);
  const deathClock = getDeathClock(state);
  const pactOffered = state.pact?.phase === 'offered';
  const clockActive = deathClock !== null && state.activeTimeMs >= deathClock.warningAt;
  const oracleActive = state.pact?.kind === 'false_oracle' && state.pact.phase === 'active';
  const maxSp = getRuleset(state.rulesetVersion).maxSp;
  const discoveryKind = state.discovery?.introduction?.kind;
  const rhythm = state.mysteryDirector?.rhythm;
  const visibleEffects = discoveryKind
    ? state.effects.filter((effect) => effect.kind !== discoveryKind)
    : state.effects;
  const mysteryFeedbackVisible =
    mysteryFeedback !== null &&
    (mysteryFeedback.action !== null ||
      (!isPactKind(mysteryFeedback.kind) &&
        mysteryFeedback.kind !== discoveryKind &&
        mysteryFeedback.kind !== rhythm?.kind &&
        !state.effects.some((effect) => effect.kind === mysteryFeedback.kind)));
  const criticalSp = maxSp === null ? 10 : 60;
  const warningSp = maxSp === null ? 30 : 140;
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
    state.status === 'playing' &&
    ((state.sp > 0 && state.sp < 15) || pressure?.urgent || clockActive);
  const hostileReveal = cinematic?.mystery
    ? cinematic.mystery.spDelta < 0 ||
      cinematic.mystery.hintDelta < 0 ||
      !effectCopy(locale, cinematic.mystery.kind, state.rulesetVersion).positive
    : false;
  const current = presented.rows.find((row) => row.phase === 'current');
  const cinematicBlocks = !!cinematic && (cinematic.phase !== 'reveal' || cinematic.fatal);
  const interactive =
    ready &&
    !busy &&
    !cinematicBlocks &&
    !pactOffered &&
    !paused &&
    !confirmEnd &&
    !error &&
    outcome.phase === 'playing';
  const spClass =
    state.sp <= criticalSp ? 'is-danger' : state.sp <= warningSp ? 'is-warn' : 'is-safe';
  const spPct = Math.max(
    0,
    Math.min(100, (state.sp / (maxSp ?? Math.max(STARTING_SP, state.sp))) * 100),
  );
  const experiment =
    import.meta.env.MODE !== 'production' ? parseTileExperiment(state.rulesetVersion) : null;
  const modeLabel = trial
    ? t('vault.trial')
    : state.storeTest?.assisted
      ? t('vault.assisted')
      : experiment
        ? locale === 'bg'
          ? 'Тест'
          : 'Playtest'
        : t('vault.classic');
  const notice =
    cinematic?.phase === 'impact'
      ? t(cinematic.feedback?.kind === 'wrong' ? 'game.impactWrong' : 'game.impactSafe')
      : (error ??
        (outcome.phase === 'verification-pending'
          ? t('game.noticePending')
          : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
            ? t(petWorld ? 'vault.petRestTitle' : 'game.noticeDead')
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

  const rescueNote = worldOutcomeTheme && (
    <p className="cpi-world-safe-home" role="status">
      {t(WORLD_KITS[worldOutcomeTheme].safe)}
    </p>
  );
  const dialogHeading = (
    <h2 id="cpi-run-outcome-title" tabIndex={-1}>
      {t(
        error
          ? 'game.clockTitle'
          : confirmEnd && outcome.canEnd
            ? 'game.confirmTitle'
            : outcome.phase === 'verification-pending'
              ? 'game.pendingTitle'
              : outcome.phase === 'finished'
                ? petWorld
                  ? 'vault.petFinishedTitle'
                  : themeId === 'league'
                    ? 'vault.leagueFinishedTitle'
                    : 'game.complete'
                : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
                  ? petWorld
                    ? 'vault.petRestTitle'
                    : themeId === 'league'
                      ? 'vault.leagueRestTitle'
                      : 'game.deathTitle'
                  : petWorld
                    ? 'vault.petPaused'
                    : 'game.paused',
      )}
    </h2>
  );

  return (
    <main
      className={`cps-shell ${INFINITY_SCENE_SKIN.shell} cpi-infinity-scene${catastrophic ? ' is-catastrophe' : ''}${emergency ? ' is-emergency' : ''}${paused ? ' is-paused' : ''}${pressure?.active || clockActive ? ' is-death-clock' : ''}${settings.reducedMotion ? ' cpi-reduced-motion' : ''}`}
      data-world={themeId}
      data-testid="infinity-scene"
      aria-label={INFINITY_SCENE_SKIN.title}
    >
      <p className="cpi-run-mode">
        {modeLabel}
        {experiment && ` · ${experiment.highBreakPercent}% / ${experiment.lowBreakPercent}%`}
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
                {maxSp !== null && <small> / {maxSp}</small>}
              </span>
            </div>
            <div
              className={`cps-sp-bar-main cpi-energy-meter ${state.sp <= criticalSp ? 'is-low' : ''}`}
              role={maxSp === null ? 'img' : 'meter'}
              aria-label={
                state.sp <= warningSp
                  ? t(state.sp <= criticalSp ? 'game.spCritical' : 'game.spLow', {
                      sp: number(state.sp),
                    })
                  : maxSp === null
                    ? `${number(state.sp)} SP`
                    : t('game.spAccessible')
              }
              aria-valuemin={maxSp === null ? undefined : 0}
              aria-valuemax={maxSp ?? undefined}
              aria-valuenow={maxSp === null ? undefined : state.sp}
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
                !interactive ||
                oracleActive ||
                !!state.discovery?.introduction ||
                state.hints === 0 ||
                state.current.revealedSafeSide !== null
              }
              aria-label={t('game.hintButton', { count: number(state.hints) })}
            >
              <HintCounter count={state.hints} cue={resourceCues.hints} />
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
        <aside
          className={'cpi-run-status' + (pactOffered ? ' is-choosing' : '')}
          aria-label={t('game.effects')}
        >
          <div className="cpi-status-clock-slot">
            {clockActive && (
              <DeathClockBadge clock={deathClock} activeTimeMs={state.activeTimeMs} />
            )}
            {pressure?.active && <DeathClock pressure={pressure} />}
          </div>
          <div className="cpi-status-forces">
            <MysteryEffects
              effects={visibleEffects}
              activeTimeMs={state.activeTimeMs}
              rulesetVersion={state.rulesetVersion}
            />
            {state.pact?.phase === 'active' && (
              <PactPanel
                pact={state.pact}
                hints={state.hints}
                marketingHints={marketingSale(state).count}
                revealed={state.current.revealedSafeSide !== null}
                disabled={!interactive}
                onChoose={(option) => onPact?.(option)}
                sp={state.sp}
                rulesetVersion={state.rulesetVersion}
                activeTimeMs={state.activeTimeMs}
              />
            )}
            {rhythm?.kind !== discoveryKind && (
              <MysteryRhythmBadge rhythm={rhythm} activeTimeMs={state.activeTimeMs} />
            )}
          </div>
          <div className="cpi-status-feedback-slot">
            <DiscoveryIntroduction
              discovery={state.discovery}
              activeTimeMs={state.activeTimeMs}
              rulesetVersion={state.rulesetVersion}
              reducedMotion={settings.reducedMotion}
            />
            {!overlayVisible && (
              <MysteryFeedbackView
                rulesetVersion={state.rulesetVersion}
                feedback={mysteryFeedbackVisible ? mysteryFeedback : null}
              />
            )}
            {bonus && (
              <span className="cpi-status-bonus" role="status">
                +{bonus.amount} SP
              </span>
            )}
          </div>
        </aside>
        <section className="cps-board" aria-label={t('game.bridge')} dir="ltr">
          {pactOffered && (
            <PactPanel
              pact={state.pact}
              hints={state.hints}
              marketingHints={marketingSale(state).count}
              revealed={state.current.revealedSafeSide !== null}
              disabled={!ready || busy || paused || !!error}
              onChoose={(option) => onPact?.(option)}
              sp={state.sp}
              rulesetVersion={state.rulesetVersion}
              activeTimeMs={state.activeTimeMs}
            />
          )}
          <PrismBridge
            rows={cinematic?.rows ?? presented.rows}
            feedback={cinematic?.feedback ?? feedback}
            interactive={interactive}
            onChoose={onChoose}
            omen={oracleActive ? state.pact?.omen : null}
            onMystery={onMystery}
            reducedMotion={settings.reducedMotion}
            phase={cinematic?.phase}
            collapsed={catastrophic && (!cinematic || cinematic.phase === 'collapse')}
            fractureSeed={`${state.runId}:${state.revivesApplied}`}
            hintScan={hintScan}
            showHintCaption={hintCaptionRow === state.currentRow}
            mysteryReveal={!!state.discovery?.introduction}
          />
          <WorldStepEffect theme={themeId} cinematic={cinematic} reduced={settings.reducedMotion} />
          {themeId !== 'obsidian' && outcome.phase !== 'finished' && (
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
          {cinematic?.mystery && !state.discovery?.introduction && !pactOffered && (
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
            </div>
          )}
          {cinematic?.feedback && cinematic.phase !== 'contact' && cinematic.phase !== 'travel' && (
            <div className={'cpi-step-readout is-' + cinematic.feedback.kind} aria-hidden="true">
              {t(
                cinematic.fatal
                  ? petWorld
                    ? 'vault.safeCompanions'
                    : 'game.collapse'
                  : cinematic.feedback.kind === 'wrong'
                    ? 'game.impactWrong'
                    : 'game.impactSafe',
              )}
            </div>
          )}
          {catastrophic && !petWorld && (
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
          {t(petWorld ? 'vault.petGuidance' : 'game.bridgeGuidance')}
          <span aria-hidden="true">—</span>
          <span className="visually-hidden">{t('game.crossingNote')}</span>
        </p>
      </div>
      <EffectConsumption cue={resourceCues.consumption} hidden={overlayVisible} />
      {overlayVisible && (
        <div className="cpi-overlay cpi-crossing-overlay">
          <div
            className={
              'cpi-overlay-card cpi-run-outcome' + (worldOutcomeTheme ? ' is-world-outcome' : '')
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="cpi-run-outcome-title"
          >
            {worldOutcomeTheme ? (
              <WorldOutcomeHero theme={worldOutcomeTheme} finished={outcome.phase === 'finished'}>
                {dialogHeading}
              </WorldOutcomeHero>
            ) : (
              <header className="cpi-dialog-heading">
                {paused && !confirmEnd && !error && themeId !== 'obsidian' && (
                  <span className="cpi-dialog-kicker">{t(WORLD_KITS[themeId].title)}</span>
                )}
                {dialogHeading}
              </header>
            )}
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
              <div className="cpi-outcome-split">
                <div>
                  {rescueNote}
                  <p className="cpi-run-status-label">
                    {t(state.storeTest?.assisted ? 'vault.assisted' : 'game.practiceUnverified')}
                  </p>
                  <div className="cpi-result-score">
                    <span>{t(petWorld ? 'vault.rowsExplored' : 'game.rowsCleared')}</span>
                    <strong>
                      <AnimatedResult
                        value={state.result?.lastClearedRow ?? state.lastClearedRow}
                        reduced={settings.reducedMotion}
                      />
                    </strong>
                  </div>
                  <dl className="cpi-result-details">
                    <div>
                      <dt>{t(petWorld ? 'vault.uncrossedRow' : 'game.fatalRow')}</dt>
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
                      <dd>
                        {personalBest === null ? t('general.notSaved') : number(personalBest)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="cpi-outcome-next">
                  {localizedDeathReason && <p>{localizedDeathReason}</p>}
                  {newPersonalBest && <p className="cpi-new-best">{t('game.bestNew')}</p>}
                  <p>
                    {t(state.storeTest?.assisted ? 'vault.assistedResult' : 'game.resultLocal')}
                  </p>
                  <div className="cpi-overlay-actions cpi-result-actions">
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
                </div>
              </div>
            ) : outcome.phase === 'dead' || outcome.phase === 'grant-ready' ? (
              <div className="cpi-outcome-split">
                <div>
                  {rescueNote}
                  {localizedDeathReason && <p>{localizedDeathReason}</p>}
                  <div className="cpi-result-score">
                    <span>{t(petWorld ? 'vault.rowsExplored' : 'game.rowsCleared')}</span>
                    <strong>
                      <AnimatedResult
                        value={state.lastClearedRow}
                        reduced={settings.reducedMotion}
                      />
                    </strong>
                  </div>
                  <p>
                    {t(petWorld ? 'vault.petFatalNotCounted' : 'game.fatalNotCounted', {
                      row: fatalRow ?? t('general.none'),
                    })}
                  </p>
                </div>
                <div className="cpi-outcome-next">
                  {resourcePanel ? (
                    resourcePanel
                  ) : outcome.offer && QA_TOOLS_ENABLED ? (
                    <div className="cpi-revive-offer">
                      <strong>
                        {t(petWorld ? 'vault.petContinueTitle' : 'game.bargainTitle', {
                          sp: number(outcome.offer.restoreSp),
                        })}
                      </strong>
                      <span>{t(petWorld ? 'vault.petContinueBody' : 'game.bargainBody')}</span>
                      <span>{t('game.bargainSleeping')}</span>
                    </div>
                  ) : outcome.offer ? (
                    <p>{t('vault.continuationUnavailable')}</p>
                  ) : outcome.phase === 'grant-ready' ? (
                    <p role="status">{t('game.grantReady')}</p>
                  ) : (
                    <p>{t('game.noContinues')}</p>
                  )}
                  <div className="cpi-overlay-actions">
                    <button
                      type="button"
                      data-cpi-overlay-primary={!resourcePanel || undefined}
                      disabled={busy}
                      onClick={outcome.phase === 'dead' ? onRestart : onRequestEnd}
                    >
                      {t(outcome.phase === 'dead' ? 'vault.restartFree' : 'general.endRun')}
                    </button>
                    <button type="button" disabled={busy} onClick={onExit}>
                      {t(outcome.forfeitsGrant ? 'general.saveLeave' : 'game.returnMenu')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cpi-pause-layout">
                <p className="cpi-pause-summary">
                  <span>{t(petWorld ? 'vault.petPausedDetail' : 'game.pausedExplanation')}</span>{' '}
                  <strong>{t('game.pausedRows', { row: clearedRows })}</strong>
                </p>
                <div className="cpi-overlay-actions cpi-pause-actions">
                  <button
                    type="button"
                    className="cpi-pause-resume"
                    data-cpi-overlay-primary
                    disabled={busy}
                    onClick={onPause}
                  >
                    {themeId === 'obsidian' ? (
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="m8 5 11 7-11 7V5Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <WorldNavGlyph theme={themeId} name="play" />
                    )}
                    {t('general.resume')}
                  </button>
                </div>
                {(onMysteryJournal || onMysteryLab) && (
                  <div className="cpi-overlay-actions cpi-pause-links">
                    {onMysteryJournal && (
                      <button
                        type="button"
                        className="cpi-pause-link"
                        disabled={busy}
                        onClick={onMysteryJournal}
                      >
                        {t('guide.journalTab')}
                      </button>
                    )}
                    {onMysteryLab && (
                      <button
                        type="button"
                        className="cpi-pause-link"
                        disabled={busy}
                        onClick={onMysteryLab}
                      >
                        {mysteryText(locale, 'lab')}{' '}
                        <small>{locale === 'bg' ? 'Тест' : 'Test'}</small>
                      </button>
                    )}
                  </div>
                )}
                <PauseDetails
                  progress={
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
                  }
                  reserve={resourcePanel}
                  audio={
                    <AudioSettingsControls
                      settings={settings}
                      onChange={onSettingsChange}
                      hideLegend
                    />
                  }
                />
                <div className="cpi-overlay-actions cpi-pause-exits">
                  <button type="button" disabled={busy} onClick={onExit}>
                    {t('general.saveLeave')}
                  </button>
                  <button
                    type="button"
                    className="cpi-run-danger-action"
                    disabled={busy}
                    onClick={onRequestEnd}
                  >
                    {t('general.endRun')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function makeInitialRun(testEconomy = false): RunState {
  let discoveredMysteries: EffectKind[] = [];
  try {
    discoveredMysteries = readMysteryJournal(practiceStorage());
  } catch {
    /* Optional discoveries. */
  }
  const seed = new Uint32Array(2);
  crypto.getRandomValues(seed);
  const route = (BigInt(seed[0]) << 32n) | BigInt(seed[1]);
  const mystery = route ^ 0x9e3779b97f4a7c15n;
  return createRun(
    {
      runId: 'practice-' + route.toString(16),
      rulesetVersion: nextPracticeRuleset(testEconomy),
      discoveredMysteries,
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
  onStore?: () => void;
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
  onStore,
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
  const [mysteryFeedback, setMysteryFeedback] = useState<MysteryFeedback | null>(null);
  const [resourceCues, setResourceCues] = useState<RunCues>({});
  const [labOpen, setLabOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [cinematic, setCinematic] = useState<SceneCinematic | null>(null);
  const [signals, setSignals] = useState<RunSignals>(EMPTY_RUN_SIGNALS);
  const [hintCaptionRow, setHintCaptionRow] = useState<string | null>(null);
  const [hintCaptionGate] = useState(() => createHintCaptionGate(() => practiceStorage()));
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
                ? store.recordAssistedBest(result.state.lastClearedRow, result.state.rulesetVersion)
                : recordPracticePersonalBest(
                    practiceStorage(),
                    result.state.lastClearedRow,
                    result.state.rulesetVersion,
                  );
            setPersonalBest(
              result.state.storeTest?.assisted && store
                ? store.assistedBest(result.state.rulesetVersion)
                : readPracticePersonalBest(practiceStorage(), result.state.rulesetVersion),
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
        const mysteryNotice = mysteryFeedbackFromEvents(result.events, result.state);
        if (mysteryNotice)
          setMysteryFeedback(
            result.state.discovery?.introduction && mysteryNotice.action === null
              ? null
              : mysteryNotice,
          );
        const cues = runCuesFromEvents(result.events, result.state);
        if (cues.consumption || cues.hints)
          setResourceCues((previous) => ({ ...previous, ...cues }));
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
      const heading = document.querySelector<HTMLElement>('.cpi-overlay .is-world-outcome h2');
      if (heading) {
        heading.focus({ preventScroll: true });
        const card = heading.closest('.cpi-overlay-card');
        if (card) card.scrollTop = 0;
      } else {
        document
          .querySelector<HTMLButtonElement>('.cpi-overlay [data-cpi-overlay-primary]')
          ?.focus({ preventScroll: true });
      }
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
  const exit = useCallback(
    async (destination: 'home' | 'store' = 'home') => {
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
            if (shouldFinishPracticeOnExit(latest, destination)) {
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
        if (destination === 'store' && onStore) onStore();
        else onExit();
      } finally {
        exitLock.current = false;
      }
    },
    [state.status, paused, onCheckpoint, onExit, onStore, onExitCancelled, t],
  );

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
  if (journalOpen)
    return (
      <MysteryJournal
        state={state}
        reducedMotion={settings.reducedMotion}
        onClose={() => setJournalOpen(false)}
      />
    );
  if (QA_TOOLS_ENABLED && labOpen)
    return <MysteryLab onClose={() => setLabOpen(false)} reducedMotion={settings.reducedMotion} />;
  return (
    <InfinitySceneView
      trial={trial}
      resourcePanel={
        store && state.storeTest && !trial ? (
          <RunReserves
            state={state}
            busy={busy}
            onUse={useResource}
            message={resourceMessage}
            onOpenStore={
              onStore
                ? () => {
                    void exit('store');
                  }
                : undefined
            }
          />
        ) : undefined
      }
      state={state}
      feedback={feedback}
      cinematic={cinematic}
      mysteryFeedback={mysteryFeedback}
      resourceCues={resourceCues}
      onMysteryLab={
        QA_TOOLS_ENABLED && import.meta.env.MODE !== 'production'
          ? () => setLabOpen(true)
          : undefined
      }
      onMysteryJournal={() => setJournalOpen(true)}
      onPact={(option) => {
        unlockAudio();
        void issue({ type: 'pact', option });
      }}
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
      onRestart={() => {
        if (runtimeRef.current?.getState().status === 'dead') {
          void issue({ type: 'end', forfeitGrantedReward: false }).then(() => {
            if (runtimeRef.current?.getState().status === 'finished') onRestart();
          });
        } else onRestart();
      }}
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
  onStore,
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
  onStore?: () => void;
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
        onStore={onStore}
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
