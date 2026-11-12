import { describe, expect, it, vi } from 'vitest';
import {
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
} from '@capacitor-community/admob';
import { createCampaignInterstitialAdapter } from '../src/rewards/native-admob';
import { createCampaignInterstitialCadence } from '../src/rewards/campaign-interstitial-policy';
import { DEMO_ADMOB, PUBLISHER } from './publisher';

const adUnitId = 'ca-app-pub-3940256099942544/1033173712';
type InterstitialSdk = NonNullable<Parameters<typeof createCampaignInterstitialAdapter>[0]['sdk']>;

function fixture() {
  const listeners = new Map<string, () => void>();
  const sdk = {
    requestConsentInfo: vi.fn(() =>
      Promise.resolve({ status: AdmobConsentStatus.OBTAINED, canRequestAds: true }),
    ),
    showConsentForm: vi.fn(() =>
      Promise.resolve({ status: AdmobConsentStatus.OBTAINED, canRequestAds: true }),
    ),
    initialize: vi.fn(() => Promise.resolve()),
    showPrivacyOptionsForm: vi.fn(() => Promise.resolve()),
    prepareInterstitial: vi.fn(({ adId: id }: { adId: string }) =>
      Promise.resolve({ adUnitId: id }),
    ),
    showInterstitial: vi.fn(() => {
      listeners.get(InterstitialAdPluginEvents.Dismissed)?.();
      return Promise.resolve();
    }),
    addListener: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return Promise.resolve({ remove: vi.fn(() => Promise.resolve()) });
    }),
  } as unknown as InterstitialSdk;
  return { sdk, listeners };
}

describe('Campaign interstitial adapter', () => {
  it('leaves a stalled load on cancellation and never shows a late ad', async () => {
    const { sdk } = fixture();
    let loaded!: (value: { adUnitId: string }) => void;
    vi.mocked(sdk.prepareInterstitial).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          loaded = resolve;
        }),
    );
    const controller = new AbortController();
    const adapter = createCampaignInterstitialAdapter({
      platform: 'android',
      adUnitId,
      available: true,
      sdk,
    });
    const pending = adapter.show(controller.signal);
    await vi.waitFor(() => expect(sdk.prepareInterstitial).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).resolves.toBe('unavailable');
    loaded({ adUnitId });
    await Promise.resolve();
    expect(sdk.showInterstitial).not.toHaveBeenCalled();
  });
  it('requests consent, prepares a non-personalized ad, and waits until it closes', async () => {
    const { sdk } = fixture();
    const adapter = createCampaignInterstitialAdapter({
      platform: 'android',
      adUnitId,
      available: true,
      sdk,
    });
    await expect(adapter.show(new AbortController().signal)).resolves.toBe('closed');
    expect(sdk.requestConsentInfo).toHaveBeenCalledWith({ tagForUnderAgeOfConsent: true });
    expect(sdk.initialize).toHaveBeenCalledWith({
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: false,
      maxAdContentRating: MaxAdContentRating.General,
    });
    expect(sdk.prepareInterstitial).toHaveBeenCalledWith({ adId: adUnitId, npa: true });
    expect(sdk.showInterstitial).toHaveBeenCalledWith({ adId: adUnitId });
  });

  it('fails open when consent does not permit requests or inventory cannot load', async () => {
    const denied = fixture();
    vi.mocked(denied.sdk.requestConsentInfo).mockResolvedValueOnce({
      status: AdmobConsentStatus.OBTAINED,
      canRequestAds: false,
      privacyOptionsRequirementStatus: 'NOT_REQUIRED' as never,
    });
    const blockedAdapter = createCampaignInterstitialAdapter({
      platform: 'ios',
      adUnitId,
      available: true,
      sdk: denied.sdk,
    });
    await expect(blockedAdapter.show(new AbortController().signal)).resolves.toBe('error');
    expect(denied.sdk.prepareInterstitial).not.toHaveBeenCalled();
    expect(denied.sdk.showInterstitial).not.toHaveBeenCalled();

    const failed = fixture();
    vi.mocked(failed.sdk.prepareInterstitial).mockRejectedValueOnce(new Error('no fill'));
    const failedAdapter = createCampaignInterstitialAdapter({
      platform: 'android',
      adUnitId,
      available: true,
      sdk: failed.sdk,
    });
    await expect(failedAdapter.show(new AbortController().signal)).resolves.toBe('error');
    expect(failed.sdk.showInterstitial).not.toHaveBeenCalled();
  });
});

describe('Campaign interstitial cadence', () => {
  it('keeps the first two first-clears free and caps a session at two ads', () => {
    const cadence = createCampaignInterstitialCadence();
    expect(Array.from({ length: 9 }, () => cadence.recordFirstClear())).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('validates cadence settings', () => {
    expect(() => createCampaignInterstitialCadence({ everyClears: 0 })).toThrow();
    expect(() => createCampaignInterstitialCadence({ sessionLimit: -1 })).toThrow();
  });

  it('keeps internal tests on demo inventory and registers separate live units', () => {
    expect(DEMO_ADMOB.android.interstitial).toBe('ca-app-pub-3940256099942544/1033173712');
    expect(DEMO_ADMOB.ios.interstitial).toBe('ca-app-pub-3940256099942544/4411468910');
    expect(PUBLISHER.admob.android.interstitial).toMatch(/^ca-app-pub-\d+\/\d+$/);
    expect(PUBLISHER.admob.ios.interstitial).toMatch(/^ca-app-pub-\d+\/\d+$/);
    expect(PUBLISHER.admob.android.interstitial).not.toBe(DEMO_ADMOB.android.interstitial);
    expect(PUBLISHER.admob.ios.interstitial).not.toBe(DEMO_ADMOB.ios.interstitial);
  });
});
