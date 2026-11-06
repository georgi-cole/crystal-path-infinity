import { mysteryFeedbackFromEvents, runCuesFromEvents } from './mystery-feedback';
import { StageAtmosphere } from './stage-atmosphere';
import { PrismBridge } from './prism-bridge';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPracticeCursor,
  createRun,
  getRuleset,
  STARTING_SP,
  PRACTICE_RNG,
  RELIC_RULESET_VERSION,
  getDeathClock,
  isPactKind,
} from '@crystal-path-infinity/game-core';
import type {
  RunEvent,
  RunState,
  PactOption,
  SessionCommand,
  TileSide,
  TimedSessionResult,
} from '@crystal-path-infinity/game-core';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import { createStandaloneAudio } from './standalone-audio';
import type { StandaloneAudio } from './standalone-audio';
import { optionalHaptic } from './optional-haptic';
import { readPracticePersonalBest, recordPracticePersonalBest } from './practice-save';
import { presentRunOutcome } from './run-outcome';
import { useLanguage } from './language-context';
import type { PracticeSettings } from './practice-save';
import { AudioSettingsControls } from './audio-settings-controls';
import { createPracticeRuntime, schedulePracticeTick } from './practice-runtime';
import type { PracticePauseLease, PracticeRuntime } from './practice-runtime';
import { presentInfinityScene } from './infinity-presentation';
import { MysteryEffects, MysteryFeedbackView, PactPanel } from './mystery-effects';
import type { MysteryFeedback, RunCues } from './mystery-feedback';
import { EffectConsumption, HintCounter } from './resource-feedback';
import { MysteryRhythmBadge, DeathClockBadge } from './mystery-box';
import { MysteryLab } from './mystery-lab';
import { mysteryText } from './mystery.messages';
import './infinity-scene.css';
import './infinity-hud-premium.css';
import './run-outcome.css';

const DEFAULT_VISUAL_SKIN = {
  id: 'infinity-glass-v1',
  shell: 'cps-shell--premium',
  title: 'Crystal Path: Infinity',
} as const;
// Visual choice is not stored inside the reducer or checkpoint. Future skins
// can replace this map without changing route, hints, SP or a ranked response.
export const INFINITY_SCENE_SKIN = DEFAULT_VISUAL_SKIN;

export interface SceneFeedback {
  readonly row: string;
  readonly side: TileSide;
  readonly kind: 'safe' | 'wrong';
}
export interface InfinitySceneViewProps {
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
}

/** No game-core mutations or timers. All callbacks are externally owned events. */
export function InfinitySceneView({
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
}: InfinitySceneViewProps) {
  const { t, number, locale } = useLanguage();
  const presented = presentInfinityScene(state);
  const outcome = presentRunOutcome(state);
  const clearedRows = number(state.result?.lastClearedRow ?? state.lastClearedRow);
  const rawFatalRow = state.result?.fatalRow ?? state.death?.fatalRow ?? null;
  const fatalRow = rawFatalRow === null ? null : number(rawFatalRow);
  const deathCause = state.result?.deathCause ?? state.death?.cause ?? null;
  const localizedDeathReason =
    deathCause === 'death_clock'
      ? locale === 'bg'
        ? 'Death clock изтече преди следващия избор.'
        : 'The death clock expired before the next choice.'
      : deathCause
        ? t(
            deathCause === 'wrong_tile'
              ? 'game.deathWrong'
              : deathCause === 'mystery'
                ? 'game.deathMystery'
                : 'game.deathDrain',
          )
        : null;
  const overlayVisible = paused || confirmEnd || outcome.phase !== 'playing' || !!error;
  const catastrophic =
    (state.death?.cause === 'wrong_tile' || state.death?.cause === 'death_clock') &&
    state.status !== 'playing';
  const deathClock = getDeathClock(state);
  const clockActive = deathClock !== null && state.activeTimeMs >= deathClock.warningAt;
  const current = presented.rows.find((row) => row.phase === 'current');
  const interactive =
    ready && !busy && !paused && !confirmEnd && !error && outcome.phase === 'playing';
  const pactOffered = state.pact?.phase === 'offered';
  const oracleActive = state.pact?.kind === 'false_oracle' && state.pact.phase === 'active';
  const maxSp = getRuleset(state.rulesetVersion).maxSp;
  const criticalSp = maxSp === null ? 10 : 60;
  const warningSp = maxSp === null ? 30 : 140;
  const spClass =
    state.sp <= criticalSp ? 'is-danger' : state.sp <= warningSp ? 'is-warn' : 'is-safe';
  const spPct =
    maxSp === null
      ? (state.sp / (state.sp + STARTING_SP)) * 100
      : Math.max(0, Math.min(100, (state.sp / maxSp) * 100));
  const notice =
    error ??
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
              : pactOffered
                ? mysteryText(locale, 'contract')
                : current?.mysteryAvailable
                  ? t('game.noticeMystery')
                  : state.current.mysteryOutcome
                    ? t('game.noticeMysteryDone')
                    : t('game.noticeChoose'));

  return (
    <main
      className={`cps-shell ${INFINITY_SCENE_SKIN.shell} cpi-infinity-scene${catastrophic ? ' is-catastrophe' : ''}${clockActive ? ' is-death-clock' : ''}${settings.reducedMotion ? ' cpi-reduced-motion' : ''}`}
      data-testid="infinity-scene"
      aria-label={INFINITY_SCENE_SKIN.title}
    >
      <StageAtmosphere />
      <div className="cps-content" inert={overlayVisible}>
        <header className="cpi-hud-header">
          <div className="cpi-hud-position">
            <span className="cpi-hud-wordmark">Infinity</span>
            <strong className="cps-row-display">
              {t('general.row', { row: number(presented.currentRow) })}
            </strong>
            <span className="cpi-hud-cleared">
              {t('game.cleared')} <b>{clearedRows}</b>
            </span>
          </div>
          <div className="cpi-hud-stability">
            <div className="cps-sp-display">
              <span className="cps-sp-label">{t('game.stabilityShort')}</span>
              <span className={`cps-sp-value ${spClass}`}>
                {state.sp}
                {maxSp !== null && <small> / {maxSp}</small>}
              </span>
            </div>
            <div
              className={`cps-sp-bar-main cpi-energy-meter ${state.sp <= criticalSp ? 'is-low' : ''}`}
              role={maxSp === null ? 'img' : 'meter'}
              aria-label={
                maxSp === null
                  ? `${t('game.spAccessible')}: ${state.sp} SP · ${mysteryText(locale, 'noLimit')}`
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
                pactOffered ||
                oracleActive ||
                state.hints === 0 ||
                state.current.revealedSafeSide !== null ||
                state.current.noSafeTile
              }
              aria-label={t('game.hintButton', { count: number(state.hints) })}
            >
              <HintCounter count={state.hints} cue={resourceCues.hints} />
            </button>
            <button
              type="button"
              className="cpi-pause-control cpi-hud-control"
              onClick={onPause}
              disabled={!ready || busy || !!error || state.status !== 'playing'}
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
        {state.sp <= warningSp && state.status === 'playing' && (
          <p
            className={'cpi-sp-danger-copy ' + (state.sp <= criticalSp ? 'is-critical' : 'is-low')}
            role="status"
          >
            {t(state.sp <= criticalSp ? 'game.spCritical' : 'game.spLow', { sp: number(state.sp) })}
          </p>
        )}
        <MysteryEffects
          effects={state.effects}
          activeTimeMs={state.activeTimeMs}
          rulesetVersion={state.rulesetVersion}
        />
        <MysteryRhythmBadge
          rhythm={state.mysteryDirector?.rhythm}
          activeTimeMs={state.activeTimeMs}
        />
        <DeathClockBadge
          clock={getDeathClock(state)}
          activeTimeMs={state.activeTimeMs}
          offered={pactOffered}
        />
        {state.current.noSafeTile && (
          <p className="cpi-sp-danger-copy is-low" role="status">
            {locale === 'bg'
              ? 'И двете плочки са счупени. Подсказката е запазена; защитата може да помогне.'
              : 'Both tiles are broken. Your hint was kept; protection can help.'}
          </p>
        )}
        <section className="cps-board" aria-label={t('game.bridge')} dir="ltr">
          <PactPanel
            sp={state.sp}
            rulesetVersion={state.rulesetVersion}
            activeTimeMs={state.activeTimeMs}
            pact={state.pact}
            hints={state.hints}
            revealed={state.current.revealedSafeSide !== null || !!state.current.noSafeTile}
            disabled={!interactive || !onPact}
            onChoose={(option) => onPact?.(option)}
          />
          <PrismBridge
            rows={presented.rows}
            feedback={feedback}
            interactive={interactive && !pactOffered}
            omen={oracleActive ? (state.pact?.omen ?? null) : null}
            onChoose={onChoose}
            onMystery={onMystery}
            reducedMotion={settings.reducedMotion}
          />
          <div className="cpi-bridge-guidance" aria-hidden="true">
            <span />
            {t('game.bridgeGuidance')}
            <span />
          </div>
        </section>
        <p className="visually-hidden" role="status" aria-live="polite">
          {notice}
        </p>
        <p className="cpi-scene-footer">
          <img src={import.meta.env.BASE_URL + 'brand/prism-mark.svg'} alt="" aria-hidden="true" />
          {t('general.practice')}
          <span>∞</span>
          <span className="visually-hidden">{t('game.footer')}</span>
        </p>
      </div>
      <EffectConsumption cue={resourceCues.consumption} hidden={overlayVisible} />
      {!overlayVisible && (
        <MysteryFeedbackView
          rulesetVersion={state.rulesetVersion}
          feedback={
            mysteryFeedback &&
            !(isPactKind(mysteryFeedback.kind) && mysteryFeedback.action === null)
              ? mysteryFeedback
              : null
          }
        />
      )}
      {overlayVisible && (
        <div className="cpi-overlay">
          <div
            className="cpi-overlay-card cpi-run-outcome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cpi-run-outcome-title"
          >
            <div className="cpi-dialog-emblem" data-phase={outcome.phase} aria-hidden="true">
              {error
                ? '!'
                : outcome.phase === 'finished'
                  ? '✓'
                  : outcome.phase === 'dead'
                    ? '×'
                    : paused && !confirmEnd
                      ? 'Ⅱ'
                      : '↗'}
            </div>
            {error ? (
              <>
                <h2 id="cpi-run-outcome-title">{t('game.clockTitle')}</h2>
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
                <h2 id="cpi-run-outcome-title">{t('game.confirmTitle')}</h2>
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
                <h2 id="cpi-run-outcome-title">{t('game.pendingTitle')}</h2>
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
                <p className="cpi-run-status-label">{t('game.practiceUnverified')}</p>
                <h2 id="cpi-run-outcome-title">{t('game.complete')}</h2>
                <div className="cpi-result-score">
                  <span>{t('game.rowsCleared')}</span>
                  <strong>{clearedRows}</strong>
                </div>
                <dl className="cpi-result-details">
                  <div>
                    <dt>{t('game.fatalRow')}</dt>
                    <dd>{fatalRow ?? t('general.none')}</dd>
                  </div>
                  <div>
                    <dt>{t('game.activeTime')}</dt>
                    <dd>{outcome.activeTime}</dd>
                  </div>
                  <div>
                    <dt>{t('game.revivesApplied')}</dt>
                    <dd>{outcome.appliedContinues}</dd>
                  </div>
                  <div>
                    <dt>{t('game.bestLocal')}</dt>
                    <dd>{personalBest === null ? t('general.notSaved') : number(personalBest)}</dd>
                  </div>
                </dl>
                {localizedDeathReason && <p>{localizedDeathReason}</p>}
                {newPersonalBest && <p className="cpi-new-best">{t('game.bestNew')}</p>}
                <p>{t('game.resultLocal')}</p>
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
                <h2 id="cpi-run-outcome-title">{t('game.deathTitle')}</h2>
                {localizedDeathReason && <p>{localizedDeathReason}</p>}
                <div className="cpi-result-score">
                  <span>{t('game.rowsCleared')}</span>
                  <strong>{clearedRows}</strong>
                </div>
                <p>{t('game.fatalNotCounted', { row: fatalRow ?? t('general.none') })}</p>
                {outcome.offer ? (
                  <div className="cpi-revive-offer">
                    <strong>
                      {t('game.offerTitle', {
                        index: number(outcome.offer.ordinal),
                        sp: number(outcome.offer.restoreSp),
                      })}
                    </strong>
                    <span>
                      {t('game.offerDetail', {
                        sp: number(outcome.offer.restoreSp),
                        remaining: number(outcome.offer.grantsRemaining),
                      })}
                    </span>
                    <span>{t('game.offerUnavailable')}</span>
                  </div>
                ) : outcome.phase === 'grant-ready' ? (
                  <p role="status">{t('game.grantReady')}</p>
                ) : (
                  <p>{t('game.noContinues')}</p>
                )}
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
                    {t('general.saveLeave')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="cpi-run-outcome-title">{t('game.paused')}</h2>
                <p>{t('game.pausedExplanation')}</p>
                <p>{t('game.pausedRows', { row: clearedRows })}</p>
                <details className="cpi-run-ledger">
                  <summary>{t('game.runDetails')}</summary>
                  <div className="cpi-run-metrics" aria-label={t('menu.progress')}>
                    <span>
                      {t('game.cleared')} <strong>{clearedRows}</strong>
                    </span>
                    <span>
                      {t('game.used')} <strong>{number(outcome.appliedContinues)} / 10</strong>
                    </span>
                    <span>
                      {t('game.granted')} <strong>{number(outcome.grantedContinues)} / 10</strong>
                    </span>
                    <span>
                      {t('game.quota')} <strong>{number(outcome.grantsRemaining)}</strong>
                    </span>
                  </div>
                </details>
                <AudioSettingsControls settings={settings} onChange={onSettingsChange} />
                <div className="cpi-overlay-actions">
                  {onMysteryLab && (
                    <button type="button" disabled={busy} onClick={onMysteryLab}>
                      {mysteryText(locale, 'lab')}
                    </button>
                  )}
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

function makeInitialRun(): RunState {
  const seed = new Uint32Array(2);
  crypto.getRandomValues(seed);
  const route = (BigInt(seed[0]) << 32n) | BigInt(seed[1]);
  const mystery = route ^ 0x9e3779b97f4a7c15n;
  return createRun(
    {
      runId: 'practice-' + route.toString(16),
      routeRng: createPracticeCursor(route),
      mysteryRng: createPracticeCursor(mystery),
      observedAt: Date.now(),
      buffer: { ahead: 8, history: 2 },
      rulesetVersion: RELIC_RULESET_VERSION,
    },
    PRACTICE_RNG,
  );
}

interface InfinityRunProps {
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
  const [initial] = useState(() => initialState ?? makeInitialRun());
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
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [personalBest, setPersonalBest] = useState<string | null>(null);
  const [newPersonalBest, setNewPersonalBest] = useState(false);
  const runtimeRef = useRef<PracticeRuntime | null>(null);
  const audioRef = useRef<StandaloneAudio | null>(null);
  const pauseRef = useRef<PracticePauseLease | null>(null);
  const commandLock = useRef(false);
  const exitLock = useRef(false);

  useEffect(() => {
    let alive = true;
    const lifecycle = getGameplayLifecycle();
    const audio = createStandaloneAudio(
      {
        createMedia: (source) => new Audio(source),
        haptic: optionalHaptic,
      },
      initialAudioSettings,
    );
    audioRef.current = audio;
    audio.setForeground(document.visibilityState !== 'hidden');
    const runtime = createPracticeRuntime({
      state: initial,
      rng: PRACTICE_RNG,
      lifecycle,
      schedule: schedulePracticeTick,
      playback: audio,
      onTransition: (result: TimedSessionResult) => {
        if (!alive) return;
        let earnedNewBest = false;
        if (result.events.some((event) => event.type === 'run-ended')) {
          try {
            earnedNewBest = recordPracticePersonalBest(
              window.localStorage,
              result.state.lastClearedRow,
              result.state.rulesetVersion,
            );
            setPersonalBest(
              readPracticePersonalBest(window.localStorage, result.state.rulesetVersion),
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
        if (mysteryNotice) setMysteryFeedback(mysteryNotice);
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
      unsubscribeCheckpoint();
      runtime.dispose();
    };
  }, [initial, onCheckpoint, initialAudioSettings]);

  useEffect(() => {
    audioRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (paused || confirmEnd || state.status !== 'playing' || error) {
      document.querySelector<HTMLButtonElement>('.cpi-overlay [data-cpi-overlay-primary]')?.focus();
    }
  }, [paused, confirmEnd, state.status, state.pendingReward, error]);

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
    if (!runtime || !ready || (paused && command.type !== 'end') || commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    try {
      const result = await runtime.bind(command)();
      setState(result.state);
      if (
        !result.accepted &&
        result.reason &&
        !['clock-paused', 'stale-command', 'stale-pause', 'command-consumed'].includes(
          result.reason,
        )
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
    if (!runtime || commandLock.current) return;
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
        !window.confirm(t('app.saveLeaveConfirm'))
      ) {
        onExitCancelled();
        return;
      }
      if (runtime) {
        try {
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

  const handledExitRequest = useRef(0);
  useEffect(() => {
    if (exitRequest === 0 || handledExitRequest.current === exitRequest) return;
    handledExitRequest.current = exitRequest;
    void exit();
  }, [exitRequest, exit]);
  if (labOpen)
    return <MysteryLab onClose={() => setLabOpen(false)} reducedMotion={settings.reducedMotion} />;
  return (
    <InfinitySceneView
      state={state}
      feedback={feedback}
      mysteryFeedback={mysteryFeedback}
      resourceCues={resourceCues}
      onMysteryLab={() => setLabOpen(true)}
      onPact={(option) => {
        unlockAudio();
        void issue({ type: 'pact', option });
      }}
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
  onExit,
  onViewRankings,
  onExitCancelled,
  exitRequest = 0,
  initialState = null,
  onCheckpoint,
  settings,
  onSettingsChange,
}: {
  onExit: () => void;
  onViewRankings: () => void;
  onExitCancelled?: () => void;
  exitRequest?: number;
  initialState?: RunState | null;
  onCheckpoint: (state: RunState) => void;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const restartLock = useRef(false);
  useEffect(() => {
    restartLock.current = false;
  }, [attempt]);
  return (
    <InfinityRun
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
  );
}
