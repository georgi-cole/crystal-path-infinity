import { describe, expect, it, vi } from 'vitest';
import { AdmobConsentStatus, MaxAdContentRating } from '@capacitor-community/admob';
import {
  createGuestAdMobAdapter,
  createNativeAdMobAdapter,
  resolveGuestAdUnit,
} from '../src/rewards/native-admob';
import { STAGING_ACCOUNT_GATEWAY } from '../src/account/native-identity-client';
import { DEMO_ADMOB, PUBLISHER } from './publisher';
import type { RewardedBridge } from '../src/rewards/native-admob';
import type { RewardPermit } from '../src/rewards/reward-client';
const now = 1800000000000,
  key = '0123456789abcdef0123456789abcdef';
function fixture() {
  let notify: Parameters<RewardedBridge['addListener']>[1] = () => {};
  const remove = vi.fn(() => Promise.resolve());
  const native: RewardedBridge = {
    inventory: vi.fn(() => Promise.resolve({ sdkVersion: '25.4.0' })),
    load: vi.fn(() => Promise.resolve({ status: 'loaded' as const })),
    show: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(() => Promise.resolve()),
    addListener: vi.fn<RewardedBridge['addListener']>((_event, callback) => {
      notify = callback;
      return Promise.resolve({ remove });
    }),
  };
  const sdk = {
    requestConsentInfo: vi.fn(() =>
      Promise.resolve({
        status: AdmobConsentStatus.REQUIRED,
        canRequestAds: false,
      }),
    ),
    showConsentForm: vi.fn(() =>
      Promise.resolve({
        status: AdmobConsentStatus.OBTAINED,
        canRequestAds: true,
      }),
    ),
    initialize: vi.fn(() => Promise.resolve()),
    showPrivacyOptionsForm: vi.fn(() => Promise.resolve()),
  };
  const options = {
    platform: 'android' as const,
    available: true,
    adUnitId: 'ca-app-pub-3940256099942544/5224354917',
    bridge: native,
    sdk: sdk as unknown as NonNullable<Parameters<typeof createNativeAdMobAdapter>[0]['sdk']>,
    newId: () => key,
  };
  const adapter = createNativeAdMobAdapter({ ...options, now: () => now });
  const guest = createGuestAdMobAdapter(options);
  if (!guest) throw new Error('Expected a guest adapter.');
  const permit: RewardPermit = {
    id: 'permit',
    policyVersion: 'v1',
    expiresAt: now + 60000,
    inventory: adapter.inventory!,
    context: 'unknown',
    contextSupported: true,
    prerequisitesSatisfied: true,
    flags: {
      canRequestAds: true,
      childDirected: true,
      underAgeOfConsent: true,
      nonPersonalized: true,
      maxAdContentRating: 'G',
    },
  };
  return {
    adapter,
    guest,
    permit,
    native,
    sdk,
    remove,
    emit: (type: 'earned' | 'closed' | 'failed', owner = key) => notify({ type, key: owner }),
  };
}
describe('native rewarded adapter and privacy boundary', () => {
  it('does nothing at construction and refuses missing protection for unknown/child context', async () => {
    const f = fixture(),
      signal = new AbortController().signal;
    expect(f.native.inventory).not.toHaveBeenCalled();
    expect(f.sdk.initialize).not.toHaveBeenCalled();
    await expect(
      f.adapter.initialize(
        { ...f.permit, flags: { ...f.permit.flags, childDirected: false } },
        signal,
      ),
    ).rejects.toThrow();
    expect(f.sdk.requestConsentInfo).not.toHaveBeenCalled();
  });
  it('waits for UMP, applies protected flags, loads once, and binds only the nonce at show time', async () => {
    const f = fixture(),
      signal = new AbortController().signal;
    await f.adapter.initialize(f.permit, signal);
    expect(f.sdk.showConsentForm).toHaveBeenCalledOnce();
    expect(f.sdk.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        tagForChildDirectedTreatment: true,
        tagForUnderAgeOfConsent: true,
      }),
    );
    const loaded = await f.adapter.load(signal);
    if (loaded.status !== 'loaded') throw new Error('fixture');
    expect(f.native.show).not.toHaveBeenCalled();
    const input = {
      customData: 'server-nonce-0123456789abcdef',
      onEarned: vi.fn(),
      onClosed: vi.fn(),
      onError: vi.fn(),
    };
    await loaded.ad.show(input, signal);
    expect(f.native.load).toHaveBeenCalledOnce();
    expect(f.native.show).toHaveBeenCalledWith({ key, customData: input.customData });
    f.emit('earned', 'old-ad');
    expect(input.onEarned).not.toHaveBeenCalled();
    f.emit('earned');
    f.emit('earned');
    expect(input.onEarned).toHaveBeenCalledOnce();
    f.emit('closed');
    f.emit('closed');
    expect(input.onClosed).toHaveBeenCalledOnce();
    loaded.ad.dispose();
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it('releases the fullscreen owner after a native presentation failure', async () => {
    const f = fixture(),
      signal = new AbortController().signal;
    await f.adapter.initialize(f.permit, signal);
    const loaded = await f.adapter.load(signal);
    if (loaded.status !== 'loaded') throw new Error('fixture');
    const input = {
      customData: 'server-nonce-0123456789abcdef',
      onEarned: vi.fn(),
      onClosed: vi.fn(),
      onError: vi.fn(),
    };
    await loaded.ad.show(input, signal);
    f.emit('failed');
    expect(input.onError).toHaveBeenCalledOnce();
    expect(input.onClosed).toHaveBeenCalledOnce();
    expect(input.onEarned).not.toHaveBeenCalled();
  });
  it('cancels an unresponsive load without disposing another ad owner', async () => {
    const f = fixture(),
      controller = new AbortController();
    await f.adapter.initialize(f.permit, controller.signal);
    vi.mocked(f.native.load).mockImplementationOnce(() => new Promise(() => {}));
    const loading = f.adapter.load(controller.signal);
    controller.abort();
    await expect(loading).rejects.toThrow();
    expect(f.native.dispose).toHaveBeenCalledWith({ key });
    expect(f.native.show).not.toHaveBeenCalled();
  });
  it('never initializes or loads when the consent form cannot authorize ad requests', async () => {
    const f = fixture();
    f.sdk.showConsentForm.mockResolvedValueOnce({
      status: AdmobConsentStatus.OBTAINED,
      canRequestAds: false,
    });
    await expect(f.adapter.initialize(f.permit, new AbortController().signal)).rejects.toThrow();
    expect(f.sdk.initialize).not.toHaveBeenCalled();
    expect(f.native.load).not.toHaveBeenCalled();
  });
});

describe('native guest ad inventory', () => {
  it('allows demonstration units only in test builds and excludes live units from staging', () => {
    const flags = { VITE_GUEST_REWARDED_ADS_TEST: 'true' };
    const staging = { VITE_ACCOUNT_API_BASE_URL: STAGING_ACCOUNT_GATEWAY };
    const live = { VITE_GUEST_REWARDED_AD_UNIT_ID: 'ca-app-pub-9243398419153145/0000000001' };
    expect(resolveGuestAdUnit(flags, 'staging', 'android')).toBe(DEMO_ADMOB.android.rewarded);
    expect(resolveGuestAdUnit({ ...flags, ...staging }, 'production', 'ios')).toBe(
      DEMO_ADMOB.ios.rewarded,
    );
    expect(resolveGuestAdUnit(flags, 'production', 'ios')).toBeNull();
    expect(resolveGuestAdUnit({ ...flags, ...staging, ...live }, 'production', 'ios')).toBeNull();
    expect(resolveGuestAdUnit(live, 'staging', 'android')).toBeNull();
    expect(resolveGuestAdUnit({ ...staging, ...live }, 'production', 'ios')).toBeNull();
    expect(resolveGuestAdUnit(live, 'production', 'ios')).toBe(live.VITE_GUEST_REWARDED_AD_UNIT_ID);
    expect(
      resolveGuestAdUnit(
        { VITE_GUEST_REWARDED_AD_UNIT_ID: PUBLISHER.admob.ios.rewarded },
        'production',
        'ios',
      ),
    ).toBeNull();
    expect(
      resolveGuestAdUnit(
        { VITE_GUEST_REWARDED_AD_UNIT_ID: DEMO_ADMOB.ios.rewarded },
        'production',
        'ios',
      ),
    ).toBeNull();
  });

  it('loads protected inventory with consent, sends no verification nonce, and waits for dismissal', async () => {
    const f = fixture();
    const earned = vi.fn();
    expect(f.native.inventory).not.toHaveBeenCalled();
    expect(f.sdk.initialize).not.toHaveBeenCalled();
    const closed = vi.fn();
    const watching = f.guest.watch(new AbortController().signal, earned).then(closed);
    await vi.waitFor(() => expect(f.native.show).toHaveBeenCalledWith({ key }));
    expect(f.sdk.requestConsentInfo).toHaveBeenCalledWith({ tagForUnderAgeOfConsent: true });
    expect(f.sdk.showConsentForm).toHaveBeenCalledOnce();
    expect(f.sdk.initialize).toHaveBeenCalledWith({
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      maxAdContentRating: MaxAdContentRating.General,
    });
    expect(f.native.load).toHaveBeenCalledWith({
      adUnitId: DEMO_ADMOB.android.rewarded,
      key,
      localPractice: true,
      childDirected: true,
      underAgeOfConsent: true,
      nonPersonalized: true,
    });
    f.emit('earned', 'previous-ad');
    expect(earned).not.toHaveBeenCalled();
    f.emit('earned');
    f.emit('earned');
    expect(earned).toHaveBeenCalledOnce();
    expect(closed).not.toHaveBeenCalled();
    f.emit('closed');
    await watching;
    expect(closed).toHaveBeenCalledWith('closed');
    expect(f.remove).toHaveBeenCalledOnce();
    expect(f.native.dispose).toHaveBeenCalledWith({ key });
  });

  it('loads no guest ad when UMP does not authorize ads and ignores rewards after abort', async () => {
    const f = fixture();
    const request = new AbortController();
    const earned = vi.fn();
    f.sdk.showConsentForm.mockResolvedValueOnce({
      status: AdmobConsentStatus.OBTAINED,
      canRequestAds: false,
    });
    await expect(f.guest.watch(request.signal, earned)).resolves.toBe('error');
    expect(f.native.load).not.toHaveBeenCalled();
    const watching = f.guest.watch(request.signal, earned);
    await vi.waitFor(() => expect(f.native.show).toHaveBeenCalledOnce());
    request.abort();
    f.emit('earned');
    f.emit('closed');
    await expect(watching).resolves.toBe('error');
    expect(earned).not.toHaveBeenCalled();
  });
});
