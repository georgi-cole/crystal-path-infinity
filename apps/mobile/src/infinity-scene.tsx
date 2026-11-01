import { useEffect, useRef, useState } from 'react';
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
import { createPracticeRuntime, schedulePracticeTick } from './practice-runtime';
import type { PracticePauseLease, PracticeRuntime } from './practice-runtime';
import { presentInfinityScene } from './infinity-presentation';
import type { PresentedRow } from './infinity-presentation';
import './infinity-scene.css';

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
  readonly onExit: () => void;
  readonly onRestart: () => void;
  readonly onRetry: () => void;
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
  onExit,
  onRestart,
  onRetry,
}: InfinitySceneViewProps) {
  const presented = presentInfinityScene(state);
  const current = presented.rows.find((row) => row.phase === 'current');
  const interactive = ready && !busy && !paused && !error && state.status === 'playing';
  const spClass = state.sp <= 60 ? 'is-danger' : state.sp <= 140 ? 'is-warn' : 'is-safe';
  const spPct = Math.max(0, Math.min(100, (state.sp / MAX_SP) * 100));
  const notice =
    error ??
    (state.status === 'dead'
      ? 'The bridge gave way.'
      : state.status === 'finished'
        ? 'Practice ended.'
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
      className={`cps-shell ${INFINITY_SCENE_SKIN.shell} cpi-infinity-scene`}
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
      <div className="cps-content">
        <div className="cpi-scene-toolbar">
          <span className="cpi-practice-tag">∞ Infinity · Practice preview</span>
          <button
            type="button"
            onClick={onPause}
            disabled={!ready || busy || !!error || state.status !== 'playing'}
            aria-label={paused ? 'Resume game' : 'Pause game'}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
        <header className="cps-header">
          <div className="cps-header-left">
            <span className="cps-protocol-label">∞ Infinity Protocol</span>
            <span className="cps-player-name">Your path</span>
            <span className="cps-row-display">Row {presented.currentRow}</span>
          </div>
          <div className="cps-header-right">
            <span className="cps-hints-display">Hints {state.hints}</span>
            <div className="cps-sp-display">
              <span className="cps-sp-label">SP</span>
              <span className={`cps-sp-value ${spClass}`}>{state.sp}</span>
            </div>
          </div>
        </header>
        <div
          className={`cps-sp-bar-main ${state.sp <= 60 ? 'is-low' : ''}`}
          role="meter"
          aria-label="Survival points"
          aria-valuemin={0}
          aria-valuemax={MAX_SP}
          aria-valuenow={state.sp}
        >
          <div className={`cps-sp-bar-fill ${spClass}`} style={{ width: `${spPct}%` }} />
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
        <div className="cps-controls">
          <p className="cps-status" role="status" aria-live="polite">
            {notice}
          </p>
          <div className="cpi-scene-actions">
            <button
              type="button"
              onClick={() => onChoose('left')}
              disabled={!interactive}
              aria-label="Choose left step"
            >
              ← Left
            </button>
            <button
              type="button"
              onClick={() => onChoose('right')}
              disabled={!interactive}
              aria-label="Choose right step"
            >
              Right →
            </button>
          </div>
          <button
            type="button"
            className="cps-hint-btn"
            onClick={onHint}
            disabled={!interactive || state.hints === 0}
            aria-label={`Use hint, ${state.hints} remaining`}
          >
            ✧ <span className="cps-hint-count">{state.hints}</span>
          </button>
          {current?.mysteryAvailable && (
            <button
              type="button"
              className="cpi-mystery-action"
              onClick={onMystery}
              disabled={!interactive}
            >
              Risk mystery ?
            </button>
          )}
        </div>
        <p className="cpi-scene-footer">
          Local practice · Not a ranked score · No fixed finish line
        </p>
      </div>
      {(paused || state.status !== 'playing' || !!error) && (
        <div className="cpi-overlay">
          <div
            className="cpi-overlay-card"
            role="dialog"
            aria-modal="true"
            aria-label={error ? 'Gameplay unavailable' : paused ? 'Game paused' : 'Practice result'}
          >
            <h2>{error ? 'Clock needs attention' : paused ? 'Paused' : 'Practice run ended'}</h2>
            <p>
              {error ??
                (paused
                  ? 'The game clock and every timed effect are frozen.'
                  : `Cleared rows: ${state.lastClearedRow}. Practice results are not ranked.`)}
            </p>
            <div className="cpi-overlay-actions">
              {error ? (
                <button type="button" onClick={onRetry}>
                  Retry clock
                </button>
              ) : paused ? (
                <button type="button" onClick={onPause}>
                  Resume
                </button>
              ) : (
                <button type="button" onClick={onRestart}>
                  New practice
                </button>
              )}
              {state.status === 'dead' && (
                <button type="button" onClick={onEnd}>
                  End attempt
                </button>
              )}
              <button type="button" onClick={onExit}>
                Exit to intro
              </button>
            </div>
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

function InfinityRun({ onExit, onRestart }: { onExit: () => void; onRestart: () => void }) {
  const [initial] = useState(makeInitialRun);
  const [state, setState] = useState<RunState>(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SceneFeedback | null>(null);
  const runtimeRef = useRef<PracticeRuntime | null>(null);
  const pauseRef = useRef<PracticePauseLease | null>(null);
  const commandLock = useRef(false);

  useEffect(() => {
    let alive = true;
    const runtime = createPracticeRuntime({
      state: initial,
      rng: PRACTICE_RNG,
      lifecycle: getGameplayLifecycle(),
      schedule: schedulePracticeTick,
      onTransition: (result: TimedSessionResult) => {
        if (!alive) return;
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
      runtime.dispose();
    };
  }, [initial]);

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
  function exit() {
    if (
      state.status === 'playing' &&
      !window.confirm('Exit practice? Progress is not yet saved in this preview.')
    )
      return;
    onExit();
  }
  return (
    <InfinitySceneView
      state={state}
      feedback={feedback}
      ready={ready}
      busy={busy}
      paused={paused}
      error={error}
      onChoose={(side) => {
        void issue({ type: 'choose', side });
      }}
      onHint={() => {
        void issue({ type: 'hint' });
      }}
      onMystery={() => {
        void issue({ type: 'mystery' });
      }}
      onPause={() => {
        void togglePause();
      }}
      onEnd={() => {
        void issue({ type: 'end', forfeitGrantedReward: true });
      }}
      onExit={exit}
      onRestart={onRestart}
      onRetry={() => {
        void retry();
      }}
    />
  );
}

/** Preview shell only; CPI-009 will add durable checkpoint selection and recovery. */
export function InfinityPractice({ onExit }: { onExit: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return <InfinityRun key={attempt} onExit={onExit} onRestart={() => setAttempt((n) => n + 1)} />;
}
