import { addSafeInteger, assertNonNegativeInteger } from './numbers.ts';
import { createRunSession } from './session.ts';
import type {
  BoundRunCommand,
  BeforeRunCommit,
  SessionCommand,
  SessionRejectionReason,
  SessionTime,
  SessionTransitionResult,
} from './session.ts';
import type { RandomSource, RunState } from './types.ts';

export type PauseReason =
  'user' | 'background' | 'ad' | 'verification' | 'recovery' | 'lifecycle' | 'visibility';

export interface RunClockSource {
  /** Trusted host milliseconds. Fractions and equal consecutive samples are supported. */
  readonly monotonicNow: () => number;
  /** Calendar anchor read once by the host; never used for active elapsed time. */
  readonly observedAt?: number;
  /** Optional host-owned epoch milliseconds, independent of foreground-only time. */
  readonly observationNow?: () => number;
}

export interface TimedSessionResult extends Omit<SessionTransitionResult, 'reason'> {
  readonly reason: SessionRejectionReason | 'clock-paused' | 'stale-pause' | null;
}

export interface PauseLease {
  /** Due effects are settled before the hold is installed; handle these events once. */
  readonly result: TimedSessionResult;
  /** Idempotent, and releases only this lease. Resume itself never ticks the engine. */
  readonly release: () => TimedSessionResult;
}

export interface TimedRunSession {
  readonly getState: () => RunState;
  readonly bind: (
    command: SessionCommand,
    beforeCommit?: BeforeRunCommit,
  ) => () => TimedSessionResult;
  readonly tick: () => TimedSessionResult;
  readonly hold: (reason: PauseReason) => PauseLease;
  /** Release the initial hold only after the host reconciles current lifecycle state. */
  readonly releaseRecovery: () => TimedSessionResult;
  readonly isRunning: () => boolean;
  readonly getPauseReasons: () => readonly PauseReason[];
  /** Retain the last committed checkpoint without sampling, ticking, or ending the run. */
  readonly dispose: () => RunState;
}

interface ClockSample extends SessionTime {
  readonly monotonicMs: number;
  readonly fractionMs: number;
}

const pauseReasons: readonly PauseReason[] = [
  'user',
  'background',
  'ad',
  'verification',
  'recovery',
  'lifecycle',
  'visibility',
];

function assertMonotonicSample(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Monotonic time must be finite, non-negative and safely representable.');
  }
}

/**
 * One active clock for a trusted practice/authority session. The host owns
 * lifecycle, scheduling, sound and persistence. Client elapsed time is not a
 * ranked clock authority. No timers or platform APIs live here.
 */
export function createTimedRunSession(
  initialState: RunState,
  rng: RandomSource,
  source: RunClockSource,
): TimedRunSession {
  const session = createRunSession(initialState, rng);
  const origin = source.monotonicNow();
  assertMonotonicSample(origin);
  const observedAt = source.observedAt ?? initialState.lastObservedAt;
  assertNonNegativeInteger(observedAt, 'Observation anchor');
  if (observedAt < initialState.lastObservedAt) {
    throw new RangeError('The observation anchor cannot precede the checkpoint.');
  }
  let lastRead = origin;
  let lastObservation = observedAt;
  let activeAnchor = origin;
  // Carry fractions across samples and pauses; never floor each frame's delta.
  let fractionMs = 0;
  let disposed = false;
  let pauseEpoch: object = {};
  const recovery = {};
  const holds = new Map<object, PauseReason>([[recovery, 'recovery']]);

  function unchanged(reason: TimedSessionResult['reason'] = null): TimedSessionResult {
    return { state: session.getState(), events: [], accepted: reason === null, reason };
  }

  function isRunning(): boolean {
    return !disposed && holds.size === 0 && session.getState().status === 'playing';
  }

  function sample(): ClockSample {
    const now = source.monotonicNow();
    assertMonotonicSample(now);
    if (now < lastRead) throw new RangeError('Monotonic time cannot move backwards.');
    const running = isRunning();
    const elapsed = running ? now - activeAnchor + fractionMs : fractionMs;
    const whole = Math.floor(elapsed);
    const achievedAt = source.observationNow
      ? source.observationNow()
      : addSafeInteger(observedAt, Math.floor(now - origin), 'Observation time');
    assertNonNegativeInteger(achievedAt, 'Observation time');
    if (achievedAt < lastObservation) {
      throw new RangeError('Observation time cannot move backwards.');
    }
    return {
      monotonicMs: now,
      activeTimeMs: addSafeInteger(
        session.getState().activeTimeMs,
        running ? whole : 0,
        'Active time',
      ),
      fractionMs: elapsed - whole,
      achievedAt,
    };
  }

  function deliver(bound: BoundRunCommand): TimedSessionResult {
    let sampled: ClockSample | undefined;
    const before = session.getState();
    // Lazy evaluation keeps stale/disposed/consumed actions from reading a clock.
    const result = bound(() => {
      sampled = sample();
      return sampled;
    });
    if (sampled) {
      lastRead = sampled.monotonicMs;
      lastObservation = sampled.achievedAt;
      if (result.state.status !== 'playing') {
        // A lethal pulse can precede the sample. Discard its unplayed tail before
        // revival, including any fractional residue; the returned state is final.
        activeAnchor = sampled.monotonicMs;
        fractionMs = 0;
      } else if (
        before.status !== 'playing' ||
        result.state.activeTimeMs === sampled.activeTimeMs
      ) {
        activeAnchor = sampled.monotonicMs;
        fractionMs = sampled.fractionMs;
      }
      // A rejected reward request while playing may not settle time. Retain its
      // old anchor so the next tick/input still accounts for the elapsed interval.
    }
    return result;
  }

  function bind(command: SessionCommand, beforeCommit?: BeforeRunCommit): () => TimedSessionResult {
    const bound = session.bind(command, beforeCommit);
    const epoch = pauseEpoch;
    const type = command.type;
    const scopedToPause = !('deathId' in command);
    const gameplay =
      type === 'choose' ||
      type === 'hint' ||
      type === 'journey-hint' ||
      type === 'journey-gear' ||
      type === 'journey-resource' ||
      type === 'journey-loadout' ||
      type === 'mystery' ||
      type === 'pact' ||
      type === 'tick';
    return () => {
      if (disposed) return unchanged('session-disposed');
      if (session.getState().status === 'finished') return unchanged('finished');
      if (scopedToPause && epoch !== pauseEpoch) return unchanged('stale-pause');
      if (gameplay && holds.size > 0) return unchanged('clock-paused');
      if (type === 'tick' && session.getState().status !== 'playing')
        return unchanged('not-playing');
      return deliver(bound);
    };
  }

  function release(token: object): TimedSessionResult {
    if (disposed) return unchanged('session-disposed');
    if (!holds.has(token)) return unchanged();
    const sampled = sample();
    // The lease is still installed while sampling; suspended time is excluded.
    lastRead = sampled.monotonicMs;
    lastObservation = sampled.achievedAt;
    activeAnchor = sampled.monotonicMs;
    holds.delete(token);
    pauseEpoch = {};
    return unchanged();
  }

  return {
    getState: session.getState,
    bind,
    tick: () => bind({ type: 'tick' })(),
    isRunning,
    getPauseReasons: () => [...holds.values()],
    releaseRecovery: () => release(recovery),
    hold(reason) {
      if (!pauseReasons.includes(reason)) throw new RangeError('Unknown pause reason.');
      if (disposed) {
        return {
          result: unchanged('session-disposed'),
          release: () => unchanged('session-disposed'),
        };
      }
      const result = isRunning() ? deliver(session.bind({ type: 'tick' })) : unchanged();
      const token = {};
      holds.set(token, reason);
      pauseEpoch = {};
      return { result, release: () => release(token) };
    },
    dispose() {
      disposed = true;
      holds.clear();
      pauseEpoch = {};
      return session.dispose();
    },
  };
}
