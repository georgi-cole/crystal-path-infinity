import { describe, expect, it, vi } from 'vitest';
import { createGameplayLifecycle } from '../src/gameplay-lifecycle';
import type { GameplayLifecycleSnapshot } from '../src/gameplay-lifecycle';
import { nativeLifecycleEvent } from '../src/native-lifecycle';
import type { NativeLifecycleSnapshot } from '../src/native-lifecycle';

// Invoke injected listeners synchronously so malformed-event tests can assert
// the propagated exception without Node rethrowing it on another turn.
class TestEvents extends EventTarget {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
    if (!callback) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
    if (callback) this.listeners.get(type)?.delete(callback);
  }
  override dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
    return !event.defaultPrevented;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function native(changes: Partial<NativeLifecycleSnapshot> = {}): NativeLifecycleSnapshot {
  return {
    pageId: 'current-page',
    bridgeId: 'current-bridge',
    sequence: 1,
    isActive: true,
    nativeTimeMs: 10_000,
    foregroundTimeMs: 100,
    ...changes,
  };
}

function setup(nativeSnapshot?: () => Promise<NativeLifecycleSnapshot>) {
  const host = { now: 0, visible: true };
  const documentEvents = new TestEvents();
  const windowEvents = new TestEvents();
  const read = vi.fn(() => host.now);
  const lifecycle = createGameplayLifecycle({
    pageId: 'current-page',
    documentEvents,
    windowEvents,
    isVisible: () => host.visible,
    monotonicNow: read,
    observedAt: 1_000_000,
    ...(nativeSnapshot ? { nativeSnapshot } : {}),
  });
  return {
    lifecycle,
    host,
    documentEvents,
    windowEvents,
    read,
    event(snapshot: NativeLifecycleSnapshot) {
      documentEvents.dispatchEvent(new CustomEvent(nativeLifecycleEvent, { detail: snapshot }));
    },
    visibility(visible: boolean) {
      host.visible = visible;
      documentEvents.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

describe('current-page native gameplay lifecycle', () => {
  it('waits for the native handshake and retains its current page and bridge identity', async () => {
    const initial = deferred<NativeLifecycleSnapshot>();
    const f = setup(() => initial.promise);
    expect(f.lifecycle.getSnapshot()).toBeNull();
    initial.resolve(native());
    expect(await f.lifecycle.ready).toEqual({
      pageId: 'current-page',
      bridgeId: 'current-bridge',
      sequence: 1,
      active: true,
      monotonicMs: 100,
      observedAt: 1_000_000,
    });
    f.lifecycle.dispose();
  });

  it('keeps a newer native event when the original handshake response arrives afterwards', async () => {
    const initial = deferred<NativeLifecycleSnapshot>();
    const f = setup(() => initial.promise);
    const received: GameplayLifecycleSnapshot[] = [];
    f.lifecycle.subscribe((snapshot) => received.push(snapshot));
    f.event(native({ sequence: 2, isActive: false, nativeTimeMs: 10_499, foregroundTimeMs: 599 }));
    initial.resolve(native());
    expect(await f.lifecycle.ready).toBe(received[0]);
    expect(received).toHaveLength(1);
    expect(f.lifecycle.getSnapshot()).toMatchObject({
      sequence: 2,
      active: false,
      monotonicMs: 599,
    });
    f.lifecycle.dispose();
  });

  it('ignores foreign-page, foreign-bridge, duplicate and old events', async () => {
    const f = setup(() => Promise.resolve(native({ sequence: 4 })));
    const initial = await f.lifecycle.ready;
    const listener = vi.fn();
    f.lifecycle.subscribe(listener);
    for (const candidate of [
      native({ sequence: 8, pageId: 'removed-page' }),
      native({ sequence: 8, bridgeId: 'removed-bridge' }),
      native({ sequence: 4 }),
      native({ sequence: 3 }),
    ])
      f.event(candidate);
    expect(f.lifecycle.getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    f.lifecycle.dispose();
  });

  it('does not regress when concurrent current-page samples resolve out of order', async () => {
    const second = deferred<NativeLifecycleSnapshot>();
    const third = deferred<NativeLifecycleSnapshot>();
    const request = vi
      .fn<() => Promise<NativeLifecycleSnapshot>>()
      .mockResolvedValueOnce(native())
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const f = setup(request);
    await f.lifecycle.ready;
    const oldRequest = f.lifecycle.sample();
    const newRequest = f.lifecycle.sample();
    third.resolve(native({ sequence: 3, nativeTimeMs: 11_000, foregroundTimeMs: 1_100 }));
    const newest = await newRequest;
    second.resolve(native({ sequence: 2, nativeTimeMs: 10_500, foregroundTimeMs: 600 }));
    expect(await oldRequest).toBe(newest);
    expect(f.lifecycle.getSnapshot()).toBe(newest);
    f.lifecycle.dispose();
  });

  it('uses cumulative native foreground time across long suspend regardless of the JS clock', async () => {
    let snapshot = native();
    const f = setup(() => Promise.resolve(snapshot));
    await f.lifecycle.ready;
    snapshot = native({
      sequence: 2,
      isActive: false,
      nativeTimeMs: 10_499,
      foregroundTimeMs: 599,
    });
    expect(await f.lifecycle.sample()).toMatchObject({ active: false, monotonicMs: 599 });
    f.host.now = 8_640_000_000;
    snapshot = native({
      sequence: 3,
      isActive: false,
      nativeTimeMs: 86_410_499,
      foregroundTimeMs: 599,
    });
    expect(await f.lifecycle.sample()).toMatchObject({
      active: false,
      monotonicMs: 599,
      observedAt: 87_400_499,
    });
    snapshot = native({ sequence: 4, nativeTimeMs: 86_410_499, foregroundTimeMs: 599 });
    expect(await f.lifecycle.sample()).toMatchObject({ active: true, monotonicMs: 599 });
    snapshot = native({ sequence: 5, nativeTimeMs: 86_410_500, foregroundTimeMs: 600 });
    expect(await f.lifecycle.sample()).toMatchObject({ active: true, monotonicMs: 600 });
    expect(f.read).toHaveBeenCalledOnce();
    f.lifecycle.dispose();
  });

  it('keeps an initially backgrounded native page inactive even if the DOM is visible', async () => {
    const f = setup(() => Promise.resolve(native({ isActive: false })));
    expect(await f.lifecycle.ready).toMatchObject({ active: false });
    f.visibility(true);
    expect(f.lifecycle.getSnapshot()?.active).toBe(false);
    f.lifecycle.dispose();
  });

  it.each([{ pageId: 'another-page' }, { bridgeId: 'another-bridge' }])(
    'fails closed for a wrong-identity native sample %j and requires a valid acknowledgement',
    async (identity) => {
      let snapshot = native();
      const f = setup(() => Promise.resolve(snapshot));
      await f.lifecycle.ready;
      snapshot = native({ ...identity, sequence: 2 });
      await expect(f.lifecycle.sample()).rejects.toThrow();
      expect(f.lifecycle.getSnapshot()).toMatchObject({ active: false, monotonicMs: 100 });
      snapshot = native({ sequence: 3, nativeTimeMs: 10_250, foregroundTimeMs: 350 });
      expect(await f.lifecycle.sample()).toMatchObject({ active: true, monotonicMs: 350 });
      f.lifecycle.dispose();
    },
  );

  it.each([
    { sequence: 0 },
    { nativeTimeMs: Number.NaN },
    { foregroundTimeMs: -1 },
    { nativeTimeMs: 9_999 },
    { foregroundTimeMs: 99 },
  ])('propagates invalid native data %j and freezes the last valid snapshot', async (invalid) => {
    let snapshot = native();
    const f = setup(() => Promise.resolve(snapshot));
    await f.lifecycle.ready;
    snapshot = native({ sequence: 2, ...invalid });
    await expect(f.lifecycle.sample()).rejects.toThrow();
    expect(f.lifecycle.getSnapshot()).toMatchObject({
      active: false,
      monotonicMs: 100,
      sequence: 1,
    });
    f.lifecycle.dispose();
  });

  it('propagates a missing native event payload and freezes before further gameplay', async () => {
    const f = setup(() => Promise.resolve(native()));
    await f.lifecycle.ready;
    expect(() => f.documentEvents.dispatchEvent(new Event(nativeLifecycleEvent))).toThrow();
    expect(f.lifecycle.getSnapshot()?.active).toBe(false);
    f.lifecycle.dispose();
  });

  it('propagates a malformed native event payload and freezes the previous snapshot', async () => {
    const f = setup(() => Promise.resolve(native()));
    await f.lifecycle.ready;
    expect(() => f.event(native({ sequence: 2, foregroundTimeMs: -1 }))).toThrow();
    expect(f.lifecycle.getSnapshot()?.active).toBe(false);
    f.lifecycle.dispose();
  });

  it('keeps DOM visibility and pagehide independent until both permit activity', async () => {
    const f = setup(() => Promise.resolve(native()));
    await f.lifecycle.ready;
    f.visibility(false);
    f.windowEvents.dispatchEvent(new Event('pagehide'));
    f.visibility(true);
    expect(f.lifecycle.getSnapshot()?.active).toBe(false);
    f.host.now = 50_000;
    f.windowEvents.dispatchEvent(new Event('pageshow'));
    expect(f.lifecycle.getSnapshot()).toMatchObject({ active: true, monotonicMs: 100 });
    f.lifecycle.dispose();
  });

  it('ignores legacy pause/resume events instead of replaying them into the gameplay clock', async () => {
    const f = setup(() => Promise.resolve(native()));
    const initial = await f.lifecycle.ready;
    f.documentEvents.dispatchEvent(new Event('pause'));
    f.documentEvents.dispatchEvent(new Event('resume'));
    expect(f.lifecycle.getSnapshot()).toBe(initial);
    f.lifecycle.dispose();
  });

  it('removes listeners and discards an asynchronous sample after disposal', async () => {
    const late = deferred<NativeLifecycleSnapshot>();
    const request = vi
      .fn<() => Promise<NativeLifecycleSnapshot>>()
      .mockResolvedValueOnce(native())
      .mockReturnValueOnce(late.promise);
    const f = setup(request);
    await f.lifecycle.ready;
    const listener = vi.fn();
    f.lifecycle.subscribe(listener);
    const sample = f.lifecycle.sample();
    f.lifecycle.dispose();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({ active: false });
    const disposedSnapshot = f.lifecycle.getSnapshot();
    late.resolve(native({ sequence: 2, nativeTimeMs: 10_500, foregroundTimeMs: 600 }));
    expect(await sample).toBeNull();
    expect(f.lifecycle.getSnapshot()).toBe(disposedSnapshot);
    f.event(native({ sequence: 3 }));
    f.windowEvents.dispatchEvent(new Event('pageshow'));
    f.lifecycle.dispose();
    expect(listener).toHaveBeenCalledOnce();
    expect([...f.documentEvents.listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect([...f.windowEvents.listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect(await f.lifecycle.sample()).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('web practice lifecycle', () => {
  it('removes host listeners even when a subscriber throws during disposal', async () => {
    const f = setup();
    await f.lifecycle.ready;
    const listener = vi.fn(() => {
      throw new Error('Subscriber disposal failure');
    });
    f.lifecycle.subscribe(listener);
    expect(() => f.lifecycle.dispose()).toThrow('Subscriber disposal failure');
    expect([...f.documentEvents.listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect([...f.windowEvents.listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect(() => f.lifecycle.dispose()).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('freezes at visibility loss, excludes hidden time and resumes without a duplicate interval', async () => {
    const f = setup();
    await f.lifecycle.ready;
    f.host.now = 499;
    f.visibility(false);
    expect(f.lifecycle.getSnapshot()).toMatchObject({ active: false, monotonicMs: 499 });
    f.host.now = 60_499;
    expect(await f.lifecycle.sample()).toMatchObject({ active: false, monotonicMs: 499 });
    f.visibility(true);
    f.visibility(true);
    expect(f.lifecycle.getSnapshot()).toMatchObject({ active: true, monotonicMs: 499 });
    f.host.now = 60_500;
    expect(await f.lifecycle.sample()).toMatchObject({ active: true, monotonicMs: 500 });
    expect(await f.lifecycle.sample()).toMatchObject({ active: true, monotonicMs: 500 });
    f.lifecycle.dispose();
  });

  it('excludes a pagehide/BFcache interval even if document visibility never changes', async () => {
    const f = setup();
    await f.lifecycle.ready;
    f.host.now = 250;
    f.windowEvents.dispatchEvent(new Event('pagehide'));
    f.host.now = 86_400_250;
    expect(await f.lifecycle.sample()).toMatchObject({ active: false, monotonicMs: 250 });
    f.windowEvents.dispatchEvent(new Event('pageshow'));
    expect(f.lifecycle.getSnapshot()).toMatchObject({ active: true, monotonicMs: 250 });
    f.host.now = 86_400_500;
    expect(await f.lifecycle.sample()).toMatchObject({ active: true, monotonicMs: 500 });
    f.lifecycle.dispose();
  });

  it('does not read device wall-clock changes after the observation anchor', async () => {
    const wall = vi.spyOn(Date, 'now');
    try {
      const f = setup();
      await f.lifecycle.ready;
      wall.mockReturnValue(1);
      f.host.now = 499;
      expect(await f.lifecycle.sample()).toMatchObject({ monotonicMs: 499, observedAt: 1_000_499 });
      wall.mockReturnValue(8_000_000_000_000);
      f.host.now = 500;
      expect(await f.lifecycle.sample()).toMatchObject({ monotonicMs: 500, observedAt: 1_000_500 });
      expect(wall).not.toHaveBeenCalled();
      f.lifecycle.dispose();
    } finally {
      wall.mockRestore();
    }
  });
});
