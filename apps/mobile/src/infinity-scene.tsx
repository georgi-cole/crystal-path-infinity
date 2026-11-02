import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPracticeCursor,
  createRun,
  MAX_SP,
  PRACTICE_RNG,
} from '@crystal-path-infinity/game-core';
import type {
  RunEvent,
  RunState,
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
import { formatRowLabel } from './menu-navigation';
import type { PracticeSettings } from './practice-save';
import { AudioSettingsControls } from './audio-settings-controls';
import { createPracticeRuntime, schedulePracticeTick } from './practice-runtime';
import type { PracticePauseLease, PracticeRuntime } from './practice-runtime';
import { presentInfinityScene } from './infinity-presentation';
import type { PresentedRow } from './infinity-presentation';
import './infinity-scene.css';
import './infinity-hud-premium.css';
import './run-outcome.css';

const particles = Array.from({ length: 6 }, (_, index) => index);
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

function tileClass(row: PresentedRow, side: TileSide, feedback: SceneFeedback | null): string {
  const currentFeedback = feedback?.row === row.index && feedback.side === side;
  const hint = row.phase === 'current' && row.hint === side;
  const decision = row.chosen === side;
  return [
    'cps-tile',
    `cps-tile-${side}`,
    hint ? 'is-hinted' : '',
    decision ? (row.wrong ? 'is-cracked' : 'is-cleared') : '',
    currentFeedback ? (feedback.kind === 'wrong' ? 'is-wrong' : 'is-safe') : '',
  ]
    .filter(Boolean)
    .join(' ');
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
  const presented = presentInfinityScene(state);
  const outcome = presentRunOutcome(state);
  const overlayVisible = paused || confirmEnd || outcome.phase !== 'playing' || !!error;
  const catastrophic = state.death?.cause === 'wrong_tile' && state.status !== 'playing';
  const current = presented.rows.find((row) => row.phase === 'current');
  const interactive = ready && !busy && !paused && !confirmEnd && !error && outcome.phase === 'playing';
  const spClass = state.sp <= 60 ? 'is-danger' : state.sp <= 140 ? 'is-warn' : 'is-safe';
  const spPct = Math.max(0, Math.min(100, (state.sp / MAX_SP) * 100));
  const notice =
    error ??
    (outcome.phase === 'verification-pending'
      ? 'Reward verification is pending. This attempt is not finished.'
      : outcome.phase === 'dead' || outcome.phase === 'grant-ready'
        ? 'The bridge gave way. The fatal row did not count.'
        : outcome.phase === 'finished'
          ? 'Practice ended. Your local result is ready.'
        : !ready
          ? 'Preparing the bridge…'
          : paused
            ? 'Active time is paused.'
            : current?.mysteryAvailable
              ? 'A mystery is available. Choose a side or risk the centre.'
              : state.current.mysteryOutcome
                ? 'Mystery resolved. Choose left or right.'
                : 'Choose your next step. Cracked glass stays behind you.');

  return (
    <main
      className={`cps-shell ${INFINITY_SCENE_SKIN.shell} cpi-infinity-scene${catastrophic ? ' is-catastrophe' : ''}${settings.reducedMotion ? ' cpi-reduced-motion' : ''}`}
      data-testid="infinity-scene"
      aria-label={INFINITY_SCENE_SKIN.title}
    >
      <div className="cps-infinity-void" aria-hidden="true">
        <span className="cps-void-ring cps-void-ring-outer" />
        <span className="cps-void-ring cps-void-ring-inner" />
        <span className="cps-void-event-horizon" />
      </div>
      <div className="cps-tech-frame" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="cps-depth-fog" aria-hidden="true" />
      <div className="cps-spotlight" aria-hidden="true" />
      <div className="cps-edge-light-left" aria-hidden="true" />
      <div className="cps-edge-light-right" aria-hidden="true" />
      <div className="cps-particles" aria-hidden="true">
        {particles.map((i) => (
          <span key={i} className="cps-particle" />
        ))}
      </div>
      <div className="cps-light-shafts" aria-hidden="true">
        <span className="cps-light-shaft" />
        <span className="cps-light-shaft" />
        <span className="cps-light-shaft" />
      </div>
      <div className="cps-content" inert={overlayVisible}>
        <div className="cpi-scene-toolbar">
          <span className="cpi-practice-tag">
            <span className="cpi-practice-indicator" aria-hidden="true" />
            LOCAL · INFINITY PROTOCOL
          </span>
          <div className="cpi-scene-toolbar-actions">
            <button
              type="button"
              className="cps-hint-btn cpi-hud-control cpi-hint-control"
              onClick={onHint}
              disabled={!interactive || state.hints === 0}
              aria-label={`Use hint, ${state.hints} remaining`}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.8 14.5 9.5 21.2 12 14.5 14.5 12 21.2 9.5 14.5 2.8 12 9.5 9.5Z" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              <span className="cps-hint-count">{state.hints}</span>
            </button>
            <button
              type="button"
              className="cpi-end-control cpi-hud-control"
              onClick={onRequestEnd}
              disabled={!ready || busy || !!error || !outcome.canEnd}
              aria-label="End run"
            >
              End run
            </button>
            <button
              type="button"
              className="cpi-pause-control cpi-hud-control"
              onClick={onPause}
              disabled={!ready || busy || !!error || state.status !== 'playing'}
              aria-label={paused ? 'Resume game' : 'Pause game'}
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
              <span>{paused ? 'Resume' : 'Pause'}</span>
            </button>
          </div>
        </div>
        <header className="cps-header cpi-hud-header">
          <div className="cps-header-left">
            <span className="cps-protocol-label">
              <img
                className="cpi-scene-brand-mark"
                src={`${import.meta.env.BASE_URL}brand/prism-mark.svg`}
                alt=""
                aria-hidden="true"
              />
              INFINITY / RUN
            </span>
            <span className="cps-player-name">Your path</span>
            <span className="cps-row-display">Row {formatRowLabel(presented.currentRow)}</span>
          </div>
          <div className="cps-header-right">
            <span className="cps-hints-display">
              <span className="cpi-hud-small-label">HINTS</span> {state.hints}
            </span>
            <div className="cps-sp-display">
              <span className="cps-sp-label">SURVIVAL POINTS</span>
              <span className={`cps-sp-value ${spClass}`}>
                {state.sp}
                <span className="cpi-hud-sp-unit"> SP</span>
              </span>
            </div>
          </div>
        </header>
        <div
          className={`cps-sp-bar-main cpi-energy-meter ${state.sp <= 60 ? 'is-low' : ''}`}
          role="meter"
          aria-label="Survival points"
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
          <span className="cpi-energy-marker" style={{ left: `${spPct}%` }} aria-hidden="true" />
        </div>
        <div className="cpi-run-metrics" aria-label="Run progress and continuation counters">
          <span>Cleared <strong>{outcome.clearedRows}</strong></span>
          <span>Continues used <strong>{outcome.appliedContinues} / 10</strong></span>
          <span>Grants earned <strong>{outcome.grantedContinues} / 10</strong></span>
          <span>Grant quota left <strong>{outcome.grantsRemaining}</strong></span>
        </div>
        {presented.effects.length > 0 && (
          <div className="cps-effects" aria-label="Active effects">
            {presented.effects.map((effect, i) => (
              <span
                key={effect.kind + ':' + i}
                className={`cps-effect ${effect.positive ? 'is-pos' : 'is-neg'}`}
              >
                <span className="cps-effect-name">{effect.name}</span>
                <span className="cps-effect-timer">{(effect.remainingMs / 1000).toFixed(1)}s</span>
                <span
                  className="cps-effect-bar"
                  style={{ width: `${effect.percent}%` }}
                  aria-hidden="true"
                />
              </span>
            ))}
          </div>
        )}
        <section className="cps-board" aria-label="Endless crystal bridge">
          <div className="cps-bridge-track">
            {presented.rows.map((row) => (
              <div
                key={row.index}
                className={`cps-row tone-${row.tone} ${row.phase === 'past' ? 'is-past' : row.phase === 'current' ? 'is-current' : `is-future-${row.tone}`}`}
                data-row={row.label}
              >
                <button
                  type="button"
                  className={tileClass(row, 'left', feedback)}
                  aria-label={`Row ${row.label} left tile`}
                  onClick={() => onChoose('left')}
                  disabled={!interactive || row.phase !== 'current'}
                />
                <div className="cps-center">
                  {row.hasMystery && (
                    <button
                      type="button"
                      className="cps-tile cps-tile-center"
                      aria-label={`Row ${row.label} mystery tile`}
                      onClick={onMystery}
                      disabled={!interactive || !row.mysteryAvailable}
                    >
                      ?
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className={tileClass(row, 'right', feedback)}
                  aria-label={`Row ${row.label} right tile`}
                  onClick={() => onChoose('right')}
                  disabled={!interactive || row.phase !== 'current'}
                />
                <span className="cps-row-label" aria-hidden="true">
                  {row.label}
                </span>
              </div>
            ))}
            <div className="cps-bridge-reflection" aria-hidden="true">
              {presented.rows.slice(0, 2).map((row) => (
                <div className="cps-row" key={'reflection:' + row.index}>
                  <div className="cps-tile" />
                  <div className="cps-center" />
                  <div className="cps-tile" />
                </div>
              ))}
            </div>
          </div>
        </section>
        <p className="visually-hidden" role="status" aria-live="polite">
          {notice}
        </p>
        <p className="cpi-scene-footer">
          Local practice · Not a ranked score · No fixed finish line
        </p>
      </div>
      {overlayVisible && (
        <div className="cpi-overlay">
          <div
            className="cpi-overlay-card cpi-run-outcome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cpi-run-outcome-title"
          >
            {error ? (
              <>
                <h2 id="cpi-run-outcome-title">Clock needs attention</h2>
                <p role="alert">{error}</p>
                <p>Progress remains recoverable. No final score was submitted.</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onRetry}>
                    Retry clock
                  </button>
                  <button type="button" onClick={onExit}>
                    Save and leave
                  </button>
                </div>
              </>
            ) : confirmEnd && outcome.canEnd ? (
              <>
                <h2 id="cpi-run-outcome-title">End this run?</h2>
                <p>
                  Your last cleared row is <strong>{outcome.clearedRows}</strong>.
                  {outcome.fatalRow !== null
                    ? ' The fatal row ' + outcome.fatalRow + ' will not count.'
                    : ' The current unfinished row will not count.'}
                </p>
                {outcome.forfeitsGrant && (
                  <p role="alert">
                    You have a granted but unused continuation. Ending explicitly forfeits it.
                  </p>
                )}
                <p>This permanently finishes the local attempt. It does not submit a ranked score.</p>
                <div className="cpi-overlay-actions">
                  <button
                    type="button"
                    data-cpi-overlay-primary
                    disabled={busy}
                    onClick={onCancelEnd}
                  >
                    Keep attempt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onEnd}
                    className="cpi-run-danger-action"
                  >
                    {outcome.forfeitsGrant ? 'End and forfeit grant' : 'Confirm End run'}
                  </button>
                </div>
              </>
            ) : outcome.phase === 'verification-pending' ? (
              <>
                <h2 id="cpi-run-outcome-title">Verification pending</h2>
                <p>
                  Your reward has not been verified. Row {outcome.clearedRows} is your last
                  confirmed progress, not a final result.
                </p>
                <p role="status">
                  This attempt remains recoverable and unpublished. No second reward can be
                  requested while verification is pending.
                </p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onExit}>
                    Save and leave · Pending
                  </button>
                </div>
              </>
            ) : outcome.phase === 'finished' ? (
              <>
                <p className="cpi-run-status-label">OFFLINE PRACTICE · NOT VERIFIED</p>
                <h2 id="cpi-run-outcome-title">Run complete</h2>
                <div className="cpi-result-score">
                  <span>Rows cleared</span>
                  <strong>{outcome.clearedRows}</strong>
                </div>
                <dl className="cpi-result-details">
                  <div>
                    <dt>Fatal row</dt>
                    <dd>{outcome.fatalRow ?? 'None'}</dd>
                  </div>
                  <div>
                    <dt>Active time</dt>
                    <dd>{outcome.activeTime}</dd>
                  </div>
                  <div>
                    <dt>Continues applied</dt>
                    <dd>{outcome.appliedContinues}</dd>
                  </div>
                  <div>
                    <dt>Personal best · Local</dt>
                    <dd>{personalBest === null ? 'Not saved' : formatRowLabel(personalBest)}</dd>
                  </div>
                </dl>
                {outcome.deathReason && <p>{outcome.deathReason}</p>}
                {newPersonalBest && <p className="cpi-new-best">New local personal best</p>}
                <p>Saved practice result only. Official submission and rankings are not live.</p>
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary onClick={onRestart}>
                    Next run
                  </button>
                  <button type="button" onClick={onViewRankings}>
                    Rankings (not live)
                  </button>
                  <button type="button" onClick={onExit}>
                    Return to menu
                  </button>
                </div>
              </>
            ) : outcome.phase === 'dead' || outcome.phase === 'grant-ready' ? (
              <>
                <h2 id="cpi-run-outcome-title">The bridge gave way</h2>
                {outcome.deathReason && <p>{outcome.deathReason}</p>}
                <div className="cpi-result-score">
                  <span>Rows cleared</span>
                  <strong>{outcome.clearedRows}</strong>
                </div>
                <p>Fatal row {outcome.fatalRow} does not count toward your score.</p>
                {outcome.offer ? (
                  <div className="cpi-revive-offer">
                    <strong>
                      Continue #{outcome.offer.ordinal} · Restore {outcome.offer.restoreSp} SP
                    </strong>
                    <span>
                      The restore <strong>sets</strong> SP to {outcome.offer.restoreSp}; it does
                      not add points. {outcome.offer.grantsRemaining} reward grants remain.
                    </span>
                    <span>Rewarded continue is not connected in offline practice yet.</span>
                  </div>
                ) : outcome.phase === 'grant-ready' ? (
                  <p role="status">
                    A continuation was granted but not applied. No additional ad is available for
                    this death; ending explicitly forfeits the grant.
                  </p>
                ) : (
                  <p>No further continues remain for this attempt.</p>
                )}
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary disabled={busy} onClick={onRequestEnd}>
                    End run
                  </button>
                  <button type="button" disabled={busy} onClick={onExit}>
                    Save and leave
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="cpi-run-outcome-title">Paused</h2>
                <p>The game clock and every timed effect are frozen. The run is not finished.</p>
                <p>Rows cleared: {outcome.clearedRows}</p>
                <AudioSettingsControls settings={settings} onChange={onSettingsChange} />
                <div className="cpi-overlay-actions">
                  <button type="button" data-cpi-overlay-primary disabled={busy} onClick={onPause}>
                    Resume
                  </button>
                  <button type="button" disabled={busy} onClick={onRequestEnd}>
                    End run
                  </button>
                  <button type="button" disabled={busy} onClick={onExit}>
                    Save and leave
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
    },
    PRACTICE_RNG,
  );
}

interface InfinityRunProps {
  onExit: () => void;
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
  onExitCancelled,
  exitRequest,
  onRestart,
  initialState,
  onCheckpoint,
  settings,
  onSettingsChange,
}: InfinityRunProps) {
  const [initial] = useState(() => initialState ?? makeInitialRun());
  const [initialAudioSettings] = useState(settings);
  const lastCommittedActiveMs = useRef(-500);
  const [state, setState] = useState<RunState>(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null);
  const runtimeRef = useRef<PracticeRuntime | null>(null);
  const audioRef = useRef<StandaloneAudio | null>(null);
  const pauseRef = useRef<PracticePauseLease | null>(null);
  const commandLock = useRef(false);

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
        let personalBest = false;
        if (result.events.some((event) => event.type === 'run-ended')) {
          try {
            personalBest = recordPracticePersonalBest(
              window.localStorage,
              result.state.lastClearedRow,
            );
          } catch {
            // Corrupted/unavailable local best data must not affect completion.
          }
        }
        audio.playEvents(result.events, result.state, {
          foreground: document.visibilityState !== 'hidden',
          personalBest,
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

  function unlockAudio() {
    void audioRef.current?.unlock();
  }

  async function issue(command: SessionCommand) {
    const runtime = runtimeRef.current;
    if (!runtime || !ready || paused || commandLock.current) return;
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

  async function togglePause() {
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
    if (
      state.status === 'playing' &&
      !window.confirm(
        'Exit practice? Your latest committed checkpoint will remain available to continue.',
      )
    ) {
      onExitCancelled();
      return;
    }
    const runtime = runtimeRef.current;
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
  }, [state.status, paused, onCheckpoint, onExit, onExitCancelled]);

  const handledExitRequest = useRef(0);
  useEffect(() => {
    if (exitRequest === 0 || handledExitRequest.current === exitRequest) return;
    handledExitRequest.current = exitRequest;
    void exit();
  }, [exitRequest, exit]);
  return (
    <InfinitySceneView
      state={state}
      feedback={feedback}
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
      onEnd={() => {
        void issue({ type: 'end', forfeitGrantedReward: true });
      }}
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
  onExitCancelled,
  exitRequest = 0,
  initialState = null,
  onCheckpoint,
  settings,
  onSettingsChange,
}: {
  onExit: () => void;
  onExitCancelled?: () => void;
  exitRequest?: number;
  initialState?: RunState | null;
  onCheckpoint: (state: RunState) => void;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <InfinityRun
      key={attempt}
      initialState={attempt === 0 ? initialState : null}
      onCheckpoint={onCheckpoint}
      settings={settings}
      onSettingsChange={onSettingsChange}
      onExit={onExit}
      onExitCancelled={onExitCancelled ?? (() => {})}
      exitRequest={exitRequest}
      onRestart={() => setAttempt((n) => n + 1)}
    />
  );
}
