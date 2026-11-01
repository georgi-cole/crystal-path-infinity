import { describe, expect, it, vi } from 'vitest';
import { createRun } from '@crystal-path-infinity/game-core';
import type { RandomSource, RunState, TimedSessionResult } from '@crystal-path-infinity/game-core';
import { createGameplayLifecycle } from '../src/gameplay-lifecycle';
import { nativeLifecycleEvent } from '../src/native-lifecycle';
import type { NativeLifecycleSnapshot } from '../src/native-lifecycle';
import { createPracticeRuntime } from '../src/practice-runtime';

const rng: RandomSource = {
  algorithm: 'practice-runtime-test-v1',
  next(cursor) {
    return { value: 0, cursor: { ...cursor, draws: String(BigInt(cursor.draws) + 1n) } };
  },
};

function fresh(): RunState {
  const cursor = { algorithm: rng.algorithm, state: '0', draws: '0' };
  return {
    ...createRun(
      {
        runId: 'practice-runtime-test',
        observedAt: 1_000_000,
        routeRng: cursor,
        mysteryRng: cursor,
      },
      rng,
    ),
    effects: [{ kind: 'regen_5s', startedAt: 0, expiresAt: 5_000, nextTickAt: 500 }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// The runtime owns promises rather than test timers. Drain their deterministic
// microtask chains; native queries and wakeups are always resolved explicitly.
async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function scheduler() {
  const pending = new Set<() => void>();
  const all: (() => void)[] = [];
  const schedule = vi.fn((callback: () => void) => {
    const fire = () => {
      pending.delete(fire);
      callback();
    };
    all.push(fire);
    pending.add(fire);
    return () => {
      pending.delete(fire);
    };
  });
  return {
    schedule,
    pending,
    all,
    fire() {
      expect(pending.size).toBe(1);
      const next = [...pending][0];
      next();
      return next;
    },
  };
}

function setup(state = fresh(), firstRead?: Promise<NativeLifecycleSnapshot>) {
  const host = { foreground: 100, native: 10_000, active: true, visible: true, sequence: 0 };
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  function snapshot(changes: Partial<NativeLifecycleSnapshot> = {}): NativeLifecycleSnapshot {
    return {
      pageId: 'practice-page',
      bridgeId: 'practice-bridge',
      sequence: ++host.sequence,
      isActive: host.active,
      nativeTimeMs: host.native,
      foregroundTimeMs: host.foreground,
      ...changes,
    };
  }
  const read = vi.fn<() => Promise<NativeLifecycleSnapshot>>(() => Promise.resolve(snapshot()));
  if (firstRead) read.mockReturnValueOnce(firstRead);
  const lifecycle = createGameplayLifecycle({
    pageId: 'practice-page',
    documentEvents,
    windowEvents,
    isVisible: () => host.visible,
    monotonicNow: () => 0,
    observedAt: 1_000_000,
    nativeSnapshot: read,
  });
  const wakeups = scheduler();
  const transitions: TimedSessionResult[] = [];
  const onTransition = vi.fn((result: TimedSessionResult) => {
    transitions.push(result);
  });
  const onError = vi.fn();
  const playback = { setActive: vi.fn(), dispose: vi.fn() };
  const runtime = createPracticeRuntime({
    state,
    rng,
    lifecycle,
    schedule: wakeups.schedule,
    onTransition,
    onError,
    playback,
  });
  return {
    host,
    read,
    snapshot,
    lifecycle,
    runtime,
    wakeups,
    transitions,
    onTransition,
    onError,
    playback,
    event() {
      documentEvents.dispatchEvent(new CustomEvent(nativeLifecycleEvent, { detail: snapshot() }));
    },
    visibility(visible: boolean) {
      host.visible = visible;
      documentEvents.dispatchEvent(new Event('visibilitychange'));
    },
    dispose() {
      runtime.dispose();
      lifecycle.dispose();
    },
  };
}

describe('practice runtime and acknowledged native time', () => {
  it('does not schedule gameplay or sound before current-page readiness, including a background start', async () => {
    const initial = deferred<NativeLifecycleSnapshot>();
    const f = setup(fresh(), initial.promise);
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    expect(f.playback.setActive.mock.calls).toEqual([[false]]);
    f.host.active = false;
    f.host.foreground = 599;
    f.host.native = 60_000;
    initial.resolve(f.snapshot());
    await f.runtime.ready;
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.runtime.getState().activeTimeMs).toBe(0);
    expect(f.wakeups.pending.size).toBe(0);
    f.host.active = true;
    f.host.native += 60_000;
    f.event();
    expect(f.runtime.isRunning()).toBe(true);
    expect(f.wakeups.pending.size).toBe(1);
    expect(f.playback.setActive.mock.calls).toEqual([[false], [true]]);
    f.host.foreground += 500;
    f.host.native += 500;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 500, sp: 302 });
    f.dispose();
  });

  it('freezes confirmed foreground at499 through long OS suspension and applies only the next pulse at500', async () => {
    const f = setup();
    await f.runtime.ready;
    f.host.foreground = 599;
    f.host.native = 10_499;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 499, sp: 300, lastClearedRow: '0' });
    f.host.active = false;
    f.event();
    expect(f.wakeups.pending.size).toBe(0);
    f.host.native += 86_400_000;
    f.host.active = true;
    f.event();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 499, sp: 300 });
    f.host.foreground += 1;
    f.host.native += 1;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 500, sp: 302, lastClearedRow: '0' });
    f.wakeups.fire();
    await flushMicrotasks();
    expect(
      f.transitions.flatMap(({ events }) => events).filter(({ type }) => type === 'effects-ticked'),
    ).toHaveLength(1);
    expect(f.wakeups.pending.size).toBe(1);
    expect(f.onError).not.toHaveBeenCalled();
    f.dispose();
  });

  it('requires user, ad and background owners to release before restarting one wakeup and sound', async () => {
    const f = setup();
    await f.runtime.ready;
    f.host.foreground = 350;
    f.host.native = 10_250;
    const user = await f.runtime.hold('user');
    const ad = await f.runtime.hold('ad');
    f.host.active = false;
    f.event();
    f.host.native += 60_000;
    await user.release();
    await ad.release();
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    expect(f.runtime.getState().activeTimeMs).toBe(250);
    f.host.active = true;
    f.event();
    expect(f.wakeups.pending.size).toBe(1);
    await ad.release();
    expect(f.wakeups.pending.size).toBe(1);
    f.host.foreground += 250;
    f.host.native += 250;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 500, sp: 302 });
    expect(f.playback.setActive.mock.calls).toEqual([[false], [true], [false], [true]]);
    f.dispose();
  });

  it('accounts for a late native pause boundary after an earlier visibility event without losing foreground time', async () => {
    const f = setup();
    await f.runtime.ready;
    f.host.foreground = 500;
    f.host.native = 10_400;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState().activeTimeMs).toBe(400);
    f.visibility(false);
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    f.host.foreground = 599;
    f.host.native = 10_499;
    f.host.active = false;
    f.event();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 499, sp: 300 });
    f.host.native += 60_000;
    f.visibility(true);
    expect(f.runtime.isRunning()).toBe(false);
    f.host.active = true;
    f.event();
    expect(f.wakeups.pending.size).toBe(1);
    f.host.foreground += 1;
    f.host.native += 1;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 500, sp: 302 });
    expect(
      f.transitions.flatMap(({ events }) => events).filter(({ type }) => type === 'effects-ticked'),
    ).toHaveLength(1);
    f.dispose();
  });

  it('serializes a double tap and an independently bound old-row action into one progress event', async () => {
    const f = setup();
    await f.runtime.ready;
    const choice = f.runtime.bind({ type: 'choose', side: 'left' });
    const oldOther = f.runtime.bind({ type: 'choose', side: 'right' });
    const results = await Promise.all([choice(), choice(), oldOther()]);
    expect(results.map(({ reason }) => reason)).toEqual([
      null,
      'command-consumed',
      'stale-command',
    ]);
    expect(f.runtime.getState()).toMatchObject({ lastClearedRow: '1', sp: 300 });
    expect(
      f.transitions.flatMap(({ events }) => events).filter(({ type }) => type === 'row-cleared'),
    ).toHaveLength(1);
    expect(f.wakeups.pending.size).toBe(1);
    f.dispose();
  });

  it('rejects an input awaiting a native query when a newer background event invalidates it', async () => {
    const f = setup();
    await f.runtime.ready;
    const pending = deferred<NativeLifecycleSnapshot>();
    const oldSnapshot = f.snapshot();
    f.read.mockReturnValueOnce(pending.promise);
    const choice = f.runtime.bind({ type: 'choose', side: 'left' });
    const result = choice();
    await flushMicrotasks();
    f.host.foreground = 599;
    f.host.native = 10_499;
    f.host.active = false;
    f.event();
    pending.resolve(oldSnapshot);
    expect((await result).reason).toBe('stale-pause');
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 499, sp: 300, lastClearedRow: '0' });
    expect(f.wakeups.pending.size).toBe(0);
    f.dispose();
  });

  it('ignores a cancelled wakeup delivered after pause/resume without querying native or emitting events', async () => {
    const f = setup();
    await f.runtime.ready;
    const obsolete = f.wakeups.all[0];
    const pause = await f.runtime.hold('user');
    await pause.release();
    expect(f.wakeups.pending.size).toBe(1);
    const calls = f.read.mock.calls.length;
    const results = f.transitions.length;
    obsolete();
    await flushMicrotasks();
    expect(f.read).toHaveBeenCalledTimes(calls);
    expect(f.transitions).toHaveLength(results);
    expect(f.wakeups.pending.size).toBe(1);
    f.dispose();
  });

  it('stops on a fatal pulse and cannot reuse its old scheduler callback after revive', async () => {
    const initial: RunState = {
      ...fresh(),
      sp: 2,
      effects: [{ kind: 'drain_5s', startedAt: 0, expiresAt: 5_000, nextTickAt: 500 }],
    };
    const f = setup(initial);
    await f.runtime.ready;
    f.host.foreground = 1_000;
    f.host.native = 10_900;
    const obsolete = f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ status: 'dead', activeTimeMs: 500, sp: 0 });
    expect(f.wakeups.pending.size).toBe(0);
    const death = f.runtime.getState().death;
    if (!death) throw new Error('Fixture did not die');
    const identity = { deathId: death.id, ordinal: 1, grantId: 'grant-1' };
    f.host.native += 60_000;
    await f.runtime.bind({ type: 'grant-revive', ...identity })();
    await f.runtime.bind({ type: 'apply-revive', ...identity })();
    expect(f.runtime.getState()).toMatchObject({
      status: 'playing',
      activeTimeMs: 500,
      sp: 200,
      effects: [],
    });
    expect(f.wakeups.pending.size).toBe(1);
    const calls = f.read.mock.calls.length;
    obsolete();
    await flushMicrotasks();
    expect(f.read).toHaveBeenCalledTimes(calls);
    f.host.foreground += 500;
    f.host.native += 500;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState().activeTimeMs).toBe(1_000);
    f.dispose();
  });
});

describe('practice runtime failures and cleanup', () => {
  it('latches a wakeup failure, stops sound, and requires explicit refresh after native service recovers', async () => {
    const f = setup();
    await f.runtime.ready;
    f.read.mockRejectedValueOnce(new Error('Native sample failed'));
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.onError).toHaveBeenCalledTimes(1);
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    expect(f.playback.setActive).toHaveBeenLastCalledWith(false);
    f.host.foreground = 600;
    f.host.native = 10_500;
    f.event();
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    await f.runtime.refresh();
    expect(f.runtime.isRunning()).toBe(true);
    expect(f.wakeups.pending.size).toBe(1);
    expect(f.runtime.getState().activeTimeMs).toBe(0);
    f.host.foreground += 500;
    f.host.native += 500;
    f.wakeups.fire();
    await flushMicrotasks();
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 500, sp: 302 });
    f.dispose();
  });

  it('also requires explicit recovery after a native query fails during player input', async () => {
    const f = setup();
    await f.runtime.ready;
    const choice = f.runtime.bind({ type: 'choose', side: 'left' });
    f.read.mockRejectedValueOnce(new Error('Input sample failed'));
    await expect(choice()).rejects.toThrow('Input sample failed');
    expect(f.runtime.isRunning()).toBe(false);
    f.host.foreground = 600;
    f.host.native = 10_500;
    f.event();
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    await f.runtime.refresh();
    expect(f.runtime.isRunning()).toBe(true);
    expect(f.runtime.getState()).toMatchObject({ activeTimeMs: 0, lastClearedRow: '0' });
    f.dispose();
  });

  it('can explicitly retry failed initial readiness while keeping recovery time frozen', async () => {
    const initial = deferred<NativeLifecycleSnapshot>();
    const f = setup(fresh(), initial.promise);
    const failure = expect(f.runtime.ready).rejects.toThrow('Initial handshake failed');
    initial.reject(new Error('Initial handshake failed'));
    await failure;
    expect(f.wakeups.pending.size).toBe(0);
    expect(f.runtime.isRunning()).toBe(false);
    f.host.foreground = 60_000;
    f.host.native = 70_000;
    await f.runtime.refresh();
    expect(f.runtime.isRunning()).toBe(true);
    expect(f.runtime.getState().activeTimeMs).toBe(0);
    f.dispose();
  });

  it('retains a user-owned lease when its asynchronous release fails, even after fault recovery', async () => {
    const f = setup();
    await f.runtime.ready;
    const ad = await f.runtime.hold('ad');
    f.read.mockRejectedValueOnce(new Error('Release sample failed'));
    await expect(ad.release()).rejects.toThrow('Release sample failed');
    f.host.foreground = 600;
    f.host.native = 10_500;
    f.event();
    expect(f.runtime.isRunning()).toBe(false);
    await f.runtime.refresh();
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.wakeups.pending.size).toBe(0);
    await ad.release();
    expect(f.runtime.isRunning()).toBe(true);
    expect(f.wakeups.pending.size).toBe(1);
    expect(f.runtime.getState().activeTimeMs).toBe(0);
    f.dispose();
  });

  it('invalidates input and completes remaining cleanup even if stopping playback throws', async () => {
    const f = setup();
    await f.runtime.ready;
    const choice = f.runtime.bind({ type: 'choose', side: 'left' });
    f.playback.setActive.mockImplementation((active: boolean) => {
      if (!active) throw new Error('Playback stop failed');
    });
    expect(f.runtime.dispose).toThrow(AggregateError);
    expect(f.playback.dispose).toHaveBeenCalledTimes(1);
    expect(f.wakeups.pending.size).toBe(0);
    const readCalls = f.read.mock.calls.length;
    const transitions = f.transitions.length;
    expect((await choice()).reason).toBe('session-disposed');
    expect(f.read).toHaveBeenCalledTimes(readCalls);
    f.event();
    expect(f.transitions).toHaveLength(transitions);
    expect(f.runtime.isRunning()).toBe(false);
    f.lifecycle.dispose();
  });

  it('disposes pending input and callbacks without late transitions or playback in a replacement owner', async () => {
    const f = setup();
    await f.runtime.ready;
    const obsoleteWake = f.wakeups.all[0];
    const pending = deferred<NativeLifecycleSnapshot>();
    f.read.mockReturnValueOnce(pending.promise);
    const result = f.runtime.bind({ type: 'choose', side: 'left' })();
    await flushMicrotasks();
    const checkpoint = f.runtime.dispose();
    f.runtime.dispose();
    const transitions = f.transitions.length;
    const playbackCalls = f.playback.setActive.mock.calls.length;
    expect(f.playback.dispose).toHaveBeenCalledTimes(1);
    expect(f.wakeups.pending.size).toBe(0);
    const replacement = setup(checkpoint);
    await replacement.runtime.ready;
    f.host.foreground = 50_000;
    f.host.native = 60_000;
    pending.resolve(f.snapshot());
    expect((await result).reason).toBe('session-disposed');
    obsoleteWake();
    f.event();
    await flushMicrotasks();
    expect(f.transitions).toHaveLength(transitions);
    expect(f.playback.setActive).toHaveBeenCalledTimes(playbackCalls);
    expect(replacement.runtime.getState()).toBe(checkpoint);
    expect(replacement.runtime.isRunning()).toBe(true);
    f.lifecycle.dispose();
    replacement.dispose();
  });

  it('disposes while readiness is pending and never starts a scheduler on its late resolution', async () => {
    const initial = deferred<NativeLifecycleSnapshot>();
    const f = setup(fresh(), initial.promise);
    const checkpoint = f.runtime.dispose();
    initial.resolve(f.snapshot());
    await f.runtime.ready;
    expect(f.runtime.getState()).toBe(checkpoint);
    expect(f.runtime.isRunning()).toBe(false);
    expect(f.transitions).toEqual([]);
    expect(f.wakeups.schedule).not.toHaveBeenCalled();
    expect(f.playback.setActive.mock.calls).toEqual([[false], [false]]);
    expect(f.playback.dispose).toHaveBeenCalledTimes(1);
    f.lifecycle.dispose();
  });
});
