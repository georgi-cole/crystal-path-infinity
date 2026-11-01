import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStartupDiagnostics } from '../src/startup-diagnostics';
import { getBuildInfo } from './environments';
import { diagnosticPrefix } from './startup-diagnostic-contract';
import type { StartupDiagnostic } from './startup-diagnostic-contract';

function fixture(
  roundTrip: () => Promise<unknown> = () => Promise.resolve({ path: 'private-native-path' }),
  available = true,
) {
  const events: StartupDiagnostic[] = [];
  const lines: string[] = [];
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const nativeRoundTrip = vi.fn(roundTrip);
  const observer = createStartupDiagnostics({
    buildInfo: getBuildInfo('development', '0.1.0'),
    sessionId: 'test-page',
    windowEvents,
    documentEvents,
    documentState: () => ({ readyState: 'complete', visibilityState: 'visible' }),
    hasTriggerEvent: () => available,
    nativeRoundTrip,
    clock: () => Date.parse('2026-11-01T17:56:03.737Z'),
    performanceClock: () => 10,
    log: (line) => {
      lines.push(line);
      events.push(JSON.parse(line.slice(diagnosticPrefix.length)) as StartupDiagnostic);
    },
    timeoutMs: 100,
  });
  return { observer, events, lines, windowEvents, documentEvents, nativeRoundTrip };
}
afterEach(() => vi.useRealTimers());

describe('development startup observers', () => {
  it('acknowledges a real native call and keeps its returned path out of logs', async () => {
    const f = fixture();
    await vi.waitFor(() =>
      expect(f.events.some((event) => event.event === 'bridge-ready')).toBe(true),
    );
    expect(f.nativeRoundTrip).toHaveBeenCalledOnce();
    expect(f.lines.join('\n')).not.toContain('private-native-path');
    f.observer.markReactReady();
    f.observer.markReactReady();
    expect(f.events.filter((event) => event.event === 'react-ready')).toHaveLength(1);
    f.observer.dispose();
  });
  it('does not manufacture readiness without the native bridge', () => {
    const f = fixture(undefined, false);
    expect(f.nativeRoundTrip).not.toHaveBeenCalled();
    expect(f.events.some((event) => event.event === 'bridge-error')).toBe(true);
    expect(f.events.some((event) => event.event === 'bridge-ready')).toBe(false);
    f.observer.dispose();
  });
  it('rejects malformed native responses', async () => {
    const f = fixture(() => Promise.resolve({ unexpected: true }));
    await vi.waitFor(() =>
      expect(f.events.some((event) => event.event === 'bridge-error')).toBe(true),
    );
    expect(f.events.some((event) => event.event === 'bridge-ready')).toBe(false);
    f.observer.dispose();
  });
  it('bounds and reports a stalled native call', async () => {
    vi.useFakeTimers();
    const f = fixture(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(101);
    expect(
      f.events.some(
        (event) => event.event === 'bridge-error' && event.details?.message?.includes('timed out'),
      ),
    ).toBe(true);
    f.observer.dispose();
  });
  it('observes exceptions and rejections without cancelling default reporting', async () => {
    const f = fixture();
    await vi.waitFor(() =>
      expect(f.events.some((event) => event.event === 'bridge-ready')).toBe(true),
    );
    for (const [type, field] of [
      ['error', 'message'],
      ['unhandledrejection', 'reason'],
    ]) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, field, { value: 'original failure' });
      f.windowEvents.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(f.events.some((event) => event.event === 'js-error')).toBe(true);
    expect(f.events.some((event) => event.event === 'unhandled-rejection')).toBe(true);
    f.observer.dispose();
  });
  it('uses actual received lifecycle events and rechecks the bridge on resume', async () => {
    const f = fixture();
    await vi.waitFor(() => expect(f.nativeRoundTrip).toHaveBeenCalledOnce());
    f.documentEvents.dispatchEvent(new Event('pause'));
    f.documentEvents.dispatchEvent(new Event('resume'));
    await vi.waitFor(() =>
      expect(
        f.events.some(
          (event) => event.event === 'bridge-ready' && event.details?.reason === 'resume',
        ),
      ).toBe(true),
    );
    expect(f.nativeRoundTrip).toHaveBeenCalledTimes(2);
    f.observer.dispose();
    f.documentEvents.dispatchEvent(new Event('resume'));
    expect(f.nativeRoundTrip).toHaveBeenCalledTimes(2);
  });
});
