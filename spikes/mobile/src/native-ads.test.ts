import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginListenerHandle } from '@capacitor/core';
import { adEvent, beginAttempt } from './ad-gate';
import type { AdEvent } from './ad-gate';
import { NativeAdProbe } from './native-ads';

const admob = vi.hoisted(() => ({
  addListener: vi.fn(),
  requestConsentInfo: vi.fn(),
  initialize: vi.fn(),
  prepareRewardVideoAd: vi.fn(),
  showRewardVideoAd: vi.fn(),
}));

vi.mock('@capacitor-community/admob', () => ({
  AdMob: admob,
  MaxAdContentRating: { General: 'General' },
  RewardAdPluginEvents: {
    Loaded: 'loaded', FailedToLoad: 'load-failed', Showed: 'showed',
    Rewarded: 'earned', Dismissed: 'dismissed', FailedToShow: 'show-failed',
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
}));

function listenerHandle() {
  return { remove: vi.fn<PluginListenerHandle['remove']>().mockResolvedValue(undefined) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(() => { vi.resetAllMocks(); });

describe('native listener setup and cleanup', () => {
  it('removes partial listeners and fails the gate when registration rejects', async () => {
    const first = listenerHandle();
    const failure = new Error('Native listener registration failed');
    admob.addListener.mockResolvedValueOnce(first).mockRejectedValueOnce(failure);
    let gate = beginAttempt('attempt-1', 'intent-1', 'native');
    const events: AdEvent[] = [];
    const probe = new NativeAdProbe((attemptId, event) => {
      events.push(event);
      gate = adEvent(gate, attemptId, event);
    }, vi.fn());

    await expect(probe.prepare('attempt-1', 'opaque-user', 'opaque-intent')).rejects.toBe(failure);

    expect(first.remove).toHaveBeenCalledOnce();
    expect(events).toEqual(['load-failed']);
    expect(gate.phase).toBe('failed');
    expect(() => beginAttempt('attempt-2', 'intent-1', 'native', gate)).not.toThrow();
    expect(admob.requestConsentInfo).not.toHaveBeenCalled();
    expect(admob.initialize).not.toHaveBeenCalled();
    expect(admob.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(() => probe.show('attempt-1')).toThrow('No prepared native test ad.');

    await probe.dispose();
    expect(first.remove).toHaveBeenCalledOnce();
  });

  it('removes a late registration handle after dispose without reviving the attempt', async () => {
    const first = listenerHandle();
    const late = listenerHandle();
    const registrationStarted = deferred<void>();
    const registration = deferred<PluginListenerHandle>();
    admob.addListener.mockResolvedValueOnce(first).mockImplementationOnce(() => {
      registrationStarted.resolve();
      return registration.promise;
    });
    const emit = vi.fn();
    const probe = new NativeAdProbe(emit, vi.fn());
    const preparing = probe.prepare('attempt-1', 'opaque-user', 'opaque-intent');
    await registrationStarted.promise;

    await probe.dispose();
    expect(first.remove).toHaveBeenCalledOnce();
    registration.resolve(late);
    await preparing;

    expect(late.remove).toHaveBeenCalledOnce();
    const firstCallback = admob.addListener.mock.calls[0]![1] as () => void;
    firstCallback();
    expect(emit).not.toHaveBeenCalled();
    expect(admob.addListener).toHaveBeenCalledTimes(2);
    expect(admob.requestConsentInfo).not.toHaveBeenCalled();
    expect(admob.initialize).not.toHaveBeenCalled();
    expect(admob.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(() => probe.show('attempt-1')).toThrow('No prepared native test ad.');
  });
});
