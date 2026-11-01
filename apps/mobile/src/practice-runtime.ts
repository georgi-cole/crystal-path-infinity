import { createTimedRunSession } from '@crystal-path-infinity/game-core';
import type {
  PauseReason,
  RandomSource,
  RunState,
  SessionCommand,
  TimedSessionResult,
  PauseLease,
} from '@crystal-path-infinity/game-core';
import type { GameplayLifecycle, GameplayLifecycleSnapshot } from './gameplay-lifecycle';

export interface PracticeRuntimeOptions {
  readonly state: RunState;
  readonly rng: RandomSource;
  readonly lifecycle: GameplayLifecycle;
  /** Wakeups request samples; their frequency never determines elapsed game time. */
  readonly schedule: (callback: () => void) => () => void;
  readonly onTransition: (result: TimedSessionResult) => void;
  readonly onError: (error: unknown) => void;
  readonly playback?: { setActive: (active: boolean) => void; dispose: () => void };
}

export interface PracticePauseLease {
  readonly result: TimedSessionResult;
  readonly release: () => Promise<TimedSessionResult>;
}

export interface PracticeRuntime {
  readonly ready: Promise<void>;
  readonly getState: () => RunState;
  readonly isRunning: () => boolean;
  readonly bind: (command: SessionCommand) => () => Promise<TimedSessionResult>;
  readonly hold: (reason: PauseReason) => Promise<PracticePauseLease>;
  readonly refresh: () => Promise<void>;
  /** Synchronous cleanup retains the last acknowledged checkpoint. */
  readonly dispose: () => RunState;
}

/** Local practice only. Ranked actions/time go through the future server authority. */
export function createPracticeRuntime(options: PracticeRuntimeOptions): PracticeRuntime {
  let current = options.lifecycle.getSnapshot();
  let observationOffset: number | undefined;
  const session = createTimedRunSession(options.state, options.rng, {
    monotonicNow: () => current?.monotonicMs ?? 0,
    observationNow: () =>
      current
        ? Math.max(options.state.lastObservedAt, current.observedAt + (observationOffset ?? 0))
        : options.state.lastObservedAt,
  });
  let disposed = false;
  let initialized = false;
  let fault: PauseLease | undefined;
  let cancelWake: (() => void) | undefined;
  let waking = false;
  let loopEpoch: object = {};
  let lifecycleEpoch: object = {};
  let playbackActive: boolean | undefined;
  let queue: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    // Keep the ordering chain usable after failure; the returned promise still rejects.
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  function emit(result: TimedSessionResult): TimedSessionResult {
    if (!disposed) {
      try {
        options.onTransition(result);
      } finally {
        if (!disposed) syncResources();
      }
    }
    return result;
  }
  function isRunning(): boolean {
    return !disposed && initialized && current?.active === true && session.isRunning();
  }
  function stopWake(): void {
    loopEpoch = {};
    const cancel = cancelWake;
    cancelWake = undefined;
    cancel?.();
  }
  function syncResources(): void {
    const active = isRunning();
    if (active !== playbackActive) {
      playbackActive = active;
      options.playback?.setActive(active);
    }
    if (!active) {
      stopWake();
      return;
    }
    if (cancelWake || waking) return;
    const epoch = loopEpoch;
    const tick = session.bind({ type: 'tick' });
    cancelWake = options.schedule(() => {
      if (disposed || epoch !== loopEpoch) return;
      cancelWake = undefined;
      waking = true;
      void enqueue(async () => {
        if (disposed || epoch !== loopEpoch) return;
        await read();
        if (disposed || epoch !== loopEpoch) return;
        emit(tick());
      })
        .catch((error: unknown) => {
          if (!disposed) {
            latchFailure();
            options.onError(error);
          }
        })
        .finally(() => {
          waking = false;
          if (!disposed) syncResources();
        });
    });
  }
  function accept(snapshot: GameplayLifecycleSnapshot): void {
    if (disposed) return;
    if (current?.active !== snapshot.active) lifecycleEpoch = {};
    current = snapshot;
    if (!initialized) return;
    // Source time already excludes background. Settle its confirmed native
    // boundary even if visibility arrived first with an older sample. A second
    // clock hold would discard that last foreground interval.
    if (!snapshot.active && session.isRunning()) emit(session.tick());
    syncResources();
  }
  async function read(): Promise<void> {
    try {
      const snapshot = await options.lifecycle.sample();
      if (disposed) return;
      if (!snapshot) throw new Error('The gameplay lifecycle is disposed.');
      accept(snapshot);
    } catch (error) {
      if (!disposed) latchFailure();
      throw error;
    }
  }
  function latchFailure(): void {
    if (!fault) {
      fault = session.hold('recovery');
      emit(fault.result);
    }
    syncResources();
  }
  const unsubscribe = options.lifecycle.subscribe(accept);

  async function initialize(): Promise<void> {
    const snapshot = await options.lifecycle.ready;
    if (disposed) return;
    if (!snapshot) throw new Error('The gameplay lifecycle is disposed.');
    // The page may have waited on a menu long after its original ready promise.
    // Start from a fresh native boundary, never from that cached page snapshot.
    await read();
    if (disposed) return;
    finishRecovery();
  }
  function finishRecovery(): void {
    if (initialized) return;
    if (!current) throw new Error('The gameplay lifecycle is not ready.');
    observationOffset = Math.max(0, options.state.lastObservedAt - current.observedAt);
    initialized = true;
    emit(session.releaseRecovery());
    syncResources();
  }
  options.playback?.setActive(false);
  playbackActive = false;
  const ready = initialize();

  return {
    ready,
    getState: session.getState,
    isRunning,
    bind(command) {
      const bound = session.bind(command);
      const epoch = lifecycleEpoch;
      const gameplay = ['choose', 'hint', 'mystery', 'tick'].includes(command.type);
      const scoped = !('deathId' in command);
      function blocked(): TimedSessionResult | undefined {
        if (disposed) return bound();
        if (scoped && epoch !== lifecycleEpoch)
          return { state: session.getState(), events: [], accepted: false, reason: 'stale-pause' };
        if (!initialized || (gameplay && !current?.active))
          return { state: session.getState(), events: [], accepted: false, reason: 'clock-paused' };
        return undefined;
      }
      return () =>
        enqueue(async () => {
          const ignored = blocked();
          if (ignored) return ignored;
          await read();
          const result = emit(blocked() ?? bound());
          if (!disposed) syncResources();
          return result;
        });
    },
    hold(reason) {
      return enqueue(async () => {
        if (!disposed) await read();
        const lease = session.hold(reason);
        emit(lease.result);
        if (!disposed) syncResources();
        return {
          result: lease.result,
          release: () =>
            enqueue(async () => {
              if (!disposed) await read();
              const result = emit(lease.release());
              if (!disposed) syncResources();
              return result;
            }),
        };
      });
    },
    refresh() {
      return enqueue(async () => {
        if (disposed) return;
        await read();
        if (disposed) return;
        finishRecovery();
        if (fault) {
          const lease = fault;
          fault = undefined;
          emit(lease.release());
        }
        syncResources();
      });
    },
    dispose() {
      if (disposed) return session.getState();
      disposed = true;
      const checkpoint = session.dispose();
      const errors: unknown[] = [];
      for (const cleanup of [
        stopWake,
        unsubscribe,
        () => options.playback?.setActive(false),
        () => options.playback?.dispose(),
      ]) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, 'Practice runtime cleanup failed.');
      return checkpoint;
    },
  };
}

/** One bounded wakeup scheduler, separate from animation frames and native time. */
export function schedulePracticeTick(callback: () => void): () => void {
  const timer = window.setTimeout(callback, 100);
  return () => window.clearTimeout(timer);
}
