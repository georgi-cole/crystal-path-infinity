import { Capacitor } from '@capacitor/core';
import { getNativePageId, nativeLifecycleEvent, nativeLifecycleSnapshot } from './native-lifecycle';
import type { NativeLifecycleSnapshot } from './native-lifecycle';

export interface GameplayLifecycleSnapshot {
  readonly pageId: string;
  readonly bridgeId: string | null;
  readonly sequence: number;
  readonly active: boolean;
  /** Confirmed foreground time; never extrapolated across an OS suspend. */
  readonly monotonicMs: number;
  readonly observedAt: number;
}

export interface GameplayLifecycle {
  readonly ready: Promise<GameplayLifecycleSnapshot | null>;
  readonly sample: () => Promise<GameplayLifecycleSnapshot | null>;
  readonly getSnapshot: () => GameplayLifecycleSnapshot | null;
  readonly subscribe: (listener: (snapshot: GameplayLifecycleSnapshot) => void) => () => void;
  readonly dispose: () => void;
}

export interface GameplayLifecycleOptions {
  readonly pageId: string;
  readonly documentEvents: EventTarget;
  readonly windowEvents: EventTarget;
  readonly isVisible: () => boolean;
  readonly monotonicNow: () => number;
  readonly observedAt: number;
  /** Omit for web practice. Native reads come from the current-page plugin. */
  readonly nativeSnapshot?: () => Promise<NativeLifecycleSnapshot>;
}

function assertTime(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${name} must be finite, non-negative and safely representable.`);
  }
}

function assertNativeSnapshot(value: NativeLifecycleSnapshot): void {
  if (
    !value ||
    typeof value.pageId !== 'string' ||
    typeof value.bridgeId !== 'string' ||
    !value.bridgeId ||
    typeof value.isActive !== 'boolean' ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    throw new TypeError('Invalid native lifecycle snapshot.');
  }
  assertTime(value.nativeTimeMs, 'Native time');
  assertTime(value.foregroundTimeMs, 'Native foreground time');
}

/** Page-owned lifecycle; only acknowledged current-page snapshots advance native time. */
export function createGameplayLifecycle(options: GameplayLifecycleOptions): GameplayLifecycle {
  assertTime(options.observedAt, 'Observation anchor');
  if (!Number.isSafeInteger(options.observedAt))
    throw new RangeError('Observation anchor must be an integer.');
  const origin = options.monotonicNow();
  assertTime(origin, 'Page monotonic time');
  let disposed = false;
  let pageVisible = true;
  let unavailable = false;
  let current: GameplayLifecycleSnapshot | null = null;
  let native: NativeLifecycleSnapshot | null = null;
  let nativeOrigin: number | undefined;
  let webLast = origin;
  let webForeground = 0;
  let webActive = options.isVisible();
  let webSequence = 0;
  const listeners = new Set<(snapshot: GameplayLifecycleSnapshot) => void>();
  const cleanup: (() => void)[] = [];

  function observed(elapsed: number): number {
    const result = options.observedAt + Math.floor(elapsed);
    if (!Number.isSafeInteger(result)) throw new RangeError('Observation time overflow.');
    return result;
  }
  function publish(snapshot: GameplayLifecycleSnapshot): GameplayLifecycleSnapshot {
    current = snapshot;
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  }
  function nativeView(): GameplayLifecycleSnapshot {
    if (!native || nativeOrigin === undefined) throw new Error('Native lifecycle is not ready.');
    return {
      pageId: options.pageId,
      bridgeId: native.bridgeId,
      sequence: native.sequence,
      active: native.isActive && pageVisible && options.isVisible() && !unavailable && !disposed,
      monotonicMs: native.foregroundTimeMs,
      observedAt: observed(native.nativeTimeMs - nativeOrigin),
    };
  }
  function acceptNative(candidate: NativeLifecycleSnapshot): GameplayLifecycleSnapshot | null {
    if (disposed) return null;
    assertNativeSnapshot(candidate);
    if (candidate.pageId !== options.pageId) return current;
    if (native && candidate.bridgeId !== native.bridgeId) return current;
    if (native && candidate.sequence <= native.sequence) return current;
    if (
      native &&
      (candidate.nativeTimeMs < native.nativeTimeMs ||
        candidate.foregroundTimeMs < native.foregroundTimeMs)
    ) {
      throw new RangeError('Native lifecycle clocks cannot move backwards.');
    }
    nativeOrigin ??= candidate.nativeTimeMs;
    native = { ...candidate };
    unavailable = false;
    return publish(nativeView());
  }
  function sampleWeb(): GameplayLifecycleSnapshot | null {
    if (disposed) return null;
    const now = options.monotonicNow();
    assertTime(now, 'Page monotonic time');
    if (now < webLast) throw new RangeError('Page monotonic time cannot move backwards.');
    if (webActive) webForeground += now - webLast;
    assertTime(webForeground, 'Web foreground time');
    webLast = now;
    webActive = pageVisible && options.isVisible();
    return publish({
      pageId: options.pageId,
      bridgeId: null,
      sequence: ++webSequence,
      active: webActive,
      monotonicMs: webForeground,
      observedAt: observed(now - origin),
    });
  }
  function suspendAfterFailure(): void {
    unavailable = true;
    if (native) publish(nativeView());
    else if (current) publish({ ...current, active: false });
  }
  async function sample(): Promise<GameplayLifecycleSnapshot | null> {
    if (disposed) return null;
    try {
      if (!options.nativeSnapshot) return sampleWeb();
      const received = await options.nativeSnapshot();
      if (disposed) return null;
      assertNativeSnapshot(received);
      if (received.pageId !== options.pageId || (native && received.bridgeId !== native.bridgeId)) {
        throw new Error(
          'Native lifecycle response does not belong to the current page and bridge.',
        );
      }
      const result = acceptNative(received);
      if (!result) throw new Error('No current-page native lifecycle acknowledgement.');
      return result;
    } catch (error) {
      if (!disposed) suspendAfterFailure();
      throw error;
    }
  }
  function listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    cleanup.push(() => target.removeEventListener(type, listener));
  }
  function updateVisibility(): void {
    if (disposed) return;
    if (options.nativeSnapshot) {
      if (native) publish(nativeView());
    } else sampleWeb();
  }
  listen(options.documentEvents, 'visibilitychange', updateVisibility);
  listen(options.windowEvents, 'pagehide', () => {
    pageVisible = false;
    updateVisibility();
  });
  listen(options.windowEvents, 'pageshow', () => {
    pageVisible = true;
    updateVisibility();
  });
  if (options.nativeSnapshot)
    listen(options.documentEvents, nativeLifecycleEvent, (event) => {
      try {
        if (!('detail' in event))
          throw new TypeError('Native lifecycle event is missing its snapshot.');
        acceptNative(event.detail as NativeLifecycleSnapshot);
      } catch (error) {
        suspendAfterFailure();
        throw error;
      }
    });
  // Listener registration precedes the handshake. Late responses cannot replace newer events.
  const ready = sample();
  return {
    ready,
    sample,
    getSnapshot: () => current,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (current) publish({ ...current, active: false });
      } finally {
        listeners.clear();
        for (const remove of cleanup) remove();
      }
    },
  };
}

let pageLifecycle: GameplayLifecycle | undefined;
export function getGameplayLifecycle(): GameplayLifecycle {
  pageLifecycle ??= createGameplayLifecycle({
    pageId: getNativePageId(),
    documentEvents: document,
    windowEvents: window,
    isVisible: () => document.visibilityState === 'visible',
    monotonicNow: () => performance.now(),
    observedAt: Date.now(),
    ...(Capacitor.isNativePlatform()
      ? { nativeSnapshot: () => nativeLifecycleSnapshot(getNativePageId()) }
      : {}),
  });
  return pageLifecycle;
}
