import { Capacitor, WebView } from '@capacitor/core';
import type { BuildInfo } from '../config/environments';
import { diagnosticPrefix } from '../config/startup-diagnostic-contract';
import type { DiagnosticEvent, StartupDiagnostic } from '../config/startup-diagnostic-contract';
import { getNativePageId, nativeLifecycleEvent, nativeLifecycleSnapshot } from './native-lifecycle';
import type { NativeLifecycleSnapshot } from './native-lifecycle';

interface DiagnosticOptions {
  buildInfo: BuildInfo;
  sessionId: string;
  windowEvents: EventTarget;
  documentEvents: EventTarget;
  documentState: () => { readyState: DocumentReadyState; visibilityState: DocumentVisibilityState };
  hasTriggerEvent: () => boolean;
  nativeRoundTrip: () => Promise<unknown>;
  clock: () => number;
  performanceClock: () => number;
  log: (message: string, error: boolean) => void;
  timeoutMs?: number;
}

function messageOf(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).slice(0, 500);
}

// Development observers do not preventDefault, replace console functions, or
// change native lifecycle behavior. The driver also retains native error logs.
export function createStartupDiagnostics(options: DiagnosticOptions) {
  let sequence = 0;
  let nativeActive: boolean | undefined;
  let active = true;
  let reactReady = false;
  const cleanup: (() => void)[] = [];
  const emit = (event: DiagnosticEvent, details?: StartupDiagnostic['details']) => {
    if (!active) return;
    const value: StartupDiagnostic = {
      schemaVersion: 1,
      buildInfo: options.buildInfo,
      sessionId: options.sessionId,
      sequence: ++sequence,
      event,
      timestamp: new Date(options.clock()).toISOString(),
      performanceMs: options.performanceClock(),
      ...options.documentState(),
      hasTriggerEvent: options.hasTriggerEvent(),
      ...(details ? { details } : {}),
    };
    options.log(
      diagnosticPrefix + JSON.stringify(value),
      ['bridge-error', 'js-error', 'unhandled-rejection'].includes(event),
    );
  };
  const listen = (target: EventTarget, event: string, listener: EventListener) => {
    target.addEventListener(event, listener);
    cleanup.push(() => target.removeEventListener(event, listener));
  };
  const checkBridge = async (reason: 'startup' | 'resume') => {
    emit('bridge-check-start', { reason });
    const startedAt = options.performanceClock();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!options.hasTriggerEvent())
        throw new Error('Native triggerEvent is unavailable at the diagnostic checkpoint');
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Native bridge round-trip timed out')),
          options.timeoutMs ?? 10_000,
        );
      });
      const result: unknown = await Promise.race([options.nativeRoundTrip(), timeout]);
      if (
        typeof result !== 'object' ||
        result === null ||
        !('path' in result) ||
        typeof result.path !== 'string'
      ) {
        throw new Error('Native WebView.getServerBasePath returned an invalid response');
      }
      const lifecycle =
        'lifecycle' in result ? (result.lifecycle as NativeLifecycleSnapshot) : undefined;
      if (lifecycle && lifecycle.pageId !== options.sessionId) {
        throw new Error('Native lifecycle snapshot belongs to another page');
      }
      if (lifecycle) nativeActive = lifecycle.isActive;
      // Keep the local path private; the evidence records only call success.
      emit('bridge-ready', {
        reason,
        durationMs: options.performanceClock() - startedAt,
        ...(lifecycle ? { lifecycle } : {}),
      });
    } catch (error) {
      emit('bridge-error', { reason, message: messageOf(error) });
    } finally {
      clearTimeout(timer);
    }
  };
  listen(options.windowEvents, 'error', (event) => {
    emit('js-error', {
      message: 'message' in event ? messageOf(event.message) : 'Page resource failed to load',
    });
  });
  listen(options.windowEvents, 'unhandledrejection', (event) => {
    emit('unhandled-rejection', {
      message: 'reason' in event ? messageOf(event.reason) : 'Unhandled promise rejection',
    });
  });
  listen(options.documentEvents, 'pause', () => emit('pause'));
  listen(options.documentEvents, 'resume', () => {
    emit('resume');
    void checkBridge('resume');
  });
  listen(options.documentEvents, 'visibilitychange', () => emit('visibility'));
  listen(options.documentEvents, nativeLifecycleEvent, (event) => {
    if (!('detail' in event)) return;
    const lifecycle = event.detail as NativeLifecycleSnapshot;
    emit('native-state', { lifecycle });
    const resumed = nativeActive === false && lifecycle.isActive;
    nativeActive = lifecycle.isActive;
    if (resumed) void checkBridge('resume');
  });
  emit('page-start');
  if (options.documentState().readyState === 'loading') {
    listen(options.documentEvents, 'DOMContentLoaded', () => emit('dom-ready'));
  } else emit('dom-ready');
  if (options.documentState().readyState === 'complete') emit('page-load');
  else listen(options.windowEvents, 'load', () => emit('page-load'));
  void checkBridge('startup');
  return {
    markReactReady() {
      if (reactReady) return;
      reactReady = true;
      emit('react-ready');
    },
    dispose() {
      active = false;
      for (const remove of cleanup) remove();
    },
  };
}

let diagnostics: ReturnType<typeof createStartupDiagnostics> | undefined;

export function startStartupDiagnostics() {
  if (
    __CPI_BUILD_INFO__.environment !== 'development' ||
    !Capacitor.isNativePlatform() ||
    diagnostics
  )
    return;
  diagnostics = createStartupDiagnostics({
    buildInfo: __CPI_BUILD_INFO__,
    sessionId: getNativePageId(),
    windowEvents: window,
    documentEvents: document,
    documentState: () => ({
      readyState: document.readyState,
      visibilityState: document.visibilityState,
    }),
    hasTriggerEvent: () => {
      const nativeWindow = window as Window & { Capacitor?: { triggerEvent?: unknown } };
      return typeof nativeWindow.Capacitor?.triggerEvent === 'function';
    },
    nativeRoundTrip: async () => {
      const [path, lifecycle] = await Promise.all([
        WebView.getServerBasePath(),
        nativeLifecycleSnapshot(getNativePageId()),
      ]);
      return { ...path, lifecycle };
    },
    clock: Date.now,
    performanceClock: () => performance.now(),
    log: (message, error) => {
      if (error) console.error(message);
      else console.info(message);
    },
  });
}

export function markDiagnosticReactReady() {
  diagnostics?.markReactReady();
}
