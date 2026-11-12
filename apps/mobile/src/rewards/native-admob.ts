import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
} from '@capacitor-community/admob';
import { GOOGLE_ADS_SDK } from '../../config/native-integrations';
import type { GuestAdUnits } from '../../config/guest-ad-inventory';
import { permitMatchesAdapter } from './reward-flow';
import type { NativeRewardedAdapter } from './reward-flow';
import type { RewardPermit } from './reward-client';
import { RewardUnavailable } from './reward-client';

export interface RewardedBridge {
  inventory(this: void): Promise<{ sdkVersion: string }>;
  load(
    this: void,
    options: {
      adUnitId: string;
      key: string;
      nonPersonalized: boolean;
      childDirected: boolean;
      underAgeOfConsent: boolean;
      localPractice: boolean;
    },
  ): Promise<{ status: 'loaded' | 'no_fill' | 'error' }>;
  show(this: void, options: { key: string; customData?: string }): Promise<void>;
  dispose(this: void, options?: { key: string }): Promise<void>;
  addListener(
    this: void,
    event: 'state',
    callback: (event: { type: 'earned' | 'closed' | 'failed'; key: string }) => void,
  ): Promise<PluginListenerHandle>;
}
const bridge = registerPlugin<RewardedBridge>('CpiRewardedAds');
type ConsentSdk = Pick<
  typeof AdMob,
  'requestConsentInfo' | 'showConsentForm' | 'showPrivacyOptionsForm' | 'initialize'
>;
type CampaignInterstitialSdk = ConsentSdk &
  Pick<typeof AdMob, 'prepareInterstitial' | 'showInterstitial' | 'addListener'>;
const ratings = {
  G: MaxAdContentRating.General,
  PG: MaxAdContentRating.ParentalGuidance,
  T: MaxAdContentRating.Teen,
  MA: MaxAdContentRating.MatureAudience,
};

type AdPrivacy = Pick<
  RewardPermit['flags'],
  'childDirected' | 'underAgeOfConsent' | 'nonPersonalized' | 'maxAdContentRating'
>;
interface AdMobOptions {
  platform: 'android' | 'ios';
  adUnitId: string;
  available: boolean;
  bridge?: RewardedBridge;
  sdk?: ConsentSdk;
  newId?: () => string;
}
const unitPattern = /^ca-app-pub-[0-9]{16}\/[0-9]{10}$/;
const noncePattern = /^[A-Za-z0-9._~-]{24,1024}$/;
const guestPrivacy: AdPrivacy = {
  childDirected: true,
  underAgeOfConsent: false,
  nonPersonalized: true,
  maxAdContentRating: 'G',
};

async function initializeAdMob(
  sdk: ConsentSdk,
  privacy: AdPrivacy,
  check: () => void,
  consentUnderAge = privacy.underAgeOfConsent,
) {
  let consent = await sdk.requestConsentInfo({
    tagForUnderAgeOfConsent: consentUnderAge,
  });
  check();
  if (consent.status === AdmobConsentStatus.REQUIRED) consent = await sdk.showConsentForm();
  if (!consent.canRequestAds) throw new RewardUnavailable();
  check();
  await sdk.initialize({
    tagForChildDirectedTreatment: privacy.childDirected,
    tagForUnderAgeOfConsent: privacy.underAgeOfConsent,
    maxAdContentRating: ratings[privacy.maxAdContentRating],
  });
  check();
}

async function loadRewardedAd(
  native: RewardedBridge,
  adUnitId: string,
  key: string,
  privacy: AdPrivacy,
  localPractice: boolean,
  signal: AbortSignal,
  current: () => boolean,
) {
  if (signal.aborted || !current()) throw new RewardUnavailable();
  const response = await new Promise<Awaited<ReturnType<RewardedBridge['load']>>>(
    (resolve, reject) => {
      const cancel = () => {
        cleanup();
        void native.dispose({ key }).catch(() => {});
        reject(new RewardUnavailable());
      };
      const timer = setTimeout(cancel, 20_000);
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
      };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }
      void native
        .load({
          adUnitId,
          key,
          nonPersonalized: privacy.nonPersonalized,
          childDirected: privacy.childDirected,
          underAgeOfConsent: privacy.underAgeOfConsent,
          localPractice,
        })
        .then(
          (value) => {
            cleanup();
            resolve(value);
          },
          () => {
            cleanup();
            reject(new RewardUnavailable());
          },
        );
    },
  );
  if (signal.aborted || !current()) {
    await native.dispose({ key });
    throw new RewardUnavailable();
  }
  if (response.status !== 'loaded') return { status: response.status };
  let listener: PluginListenerHandle | null = null,
    disposed = false,
    shown = false,
    ended = false,
    earned = false;
  return {
    status: 'loaded' as const,
    ad: {
      async show(
        input: { customData?: string; onEarned(): void; onClosed(): void; onError(): void },
        showSignal: AbortSignal,
      ) {
        if (
          disposed ||
          shown ||
          showSignal.aborted ||
          !current() ||
          (localPractice
            ? input.customData !== undefined
            : !noncePattern.test(input.customData ?? ''))
        )
          throw new RewardUnavailable();
        shown = true;
        const handle = await native.addListener('state', (event) => {
          if (event.key !== key || disposed || ended || showSignal.aborted) return;
          if (event.type === 'earned') {
            if (!earned) {
              earned = true;
              input.onEarned();
            }
          } else {
            ended = true;
            if (event.type === 'failed') input.onError();
            input.onClosed();
          }
        });
        if (disposed || showSignal.aborted || !current()) {
          await handle.remove();
          throw new RewardUnavailable();
        }
        listener = handle;
        // The verified path sends only its server nonce. Practice sends only the ad owner key.
        await native.show(localPractice ? { key } : { key, customData: input.customData });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        void listener?.remove().catch(() => {});
        listener = null;
        void native.dispose({ key }).catch(() => {});
      },
    },
  };
}

const newAdId = () => crypto.randomUUID().replaceAll('-', '');

/** Google UMP and the native SDK wait for a server permit and deliberate watch action. */
export function createNativeAdMobAdapter(
  options: AdMobOptions & { now?: () => number },
): NativeRewardedAdapter & { showPrivacyOptions(): Promise<void> } {
  const sdk = options.sdk ?? AdMob,
    native = options.bridge ?? bridge,
    now = options.now ?? Date.now,
    newId = options.newId ?? newAdId;
  let permit: RewardPermit | null = null,
    revision = 0;
  const adapter: NativeRewardedAdapter & { showPrivacyOptions(): Promise<void> } = {
    available: options.available && unitPattern.test(options.adUnitId),
    inventory: {
      provider: 'admob',
      platform: options.platform,
      sdkVersion: GOOGLE_ADS_SDK[options.platform],
      mediation: [],
    },
    async initialize(next, signal) {
      const epoch = ++revision;
      permit = null;
      const check = () => {
        if (signal.aborted || epoch !== revision || !permitMatchesAdapter(next, adapter, now()))
          throw new RewardUnavailable();
      };
      check();
      const inventory = await native.inventory();
      if (inventory.sdkVersion !== adapter.inventory!.sdkVersion) throw new RewardUnavailable();
      check();
      await initializeAdMob(sdk, next.flags, check);
      permit = next;
    },
    async load(signal) {
      const accepted = permit,
        epoch = revision;
      if (!accepted) throw new RewardUnavailable();
      return loadRewardedAd(
        native,
        options.adUnitId,
        newId(),
        accepted.flags,
        false,
        signal,
        () => accepted === permit && epoch === revision && accepted.expiresAt > now(),
      );
    },
    async showPrivacyOptions() {
      revision++;
      permit = null;
      await native.dispose();
      await sdk.showPrivacyOptionsForm();
    },
  };
  return adapter;
}

export interface GuestRewardedAd {
  watch(
    this: void,
    signal: AbortSignal,
    onEarned: () => void,
  ): Promise<'closed' | 'no_fill' | 'error'>;
  showPrivacyOptions(this: void): Promise<void>;
}

/** Local practice has a separate ad unit and never requests a server grant. */
export function createGuestAdMobAdapter(options: AdMobOptions): GuestRewardedAd | null {
  if (!options.available || !unitPattern.test(options.adUnitId)) return null;
  const native = options.bridge ?? bridge,
    sdk = options.sdk ?? AdMob;
  let watching = false;
  return {
    async watch(signal, onEarned) {
      if (watching || signal.aborted) return 'error';
      watching = true;
      try {
        const check = () => {
          if (signal.aborted) throw new RewardUnavailable();
        };
        const inventory = await native.inventory();
        check();
        if (inventory.sdkVersion !== GOOGLE_ADS_SDK[options.platform]) return 'error';
        // UMP protects guests of unknown age. Ad requests use the child-directed tag.
        await initializeAdMob(sdk, guestPrivacy, check, true);
        const loaded = await loadRewardedAd(
          native,
          options.adUnitId,
          (options.newId ?? newAdId)(),
          guestPrivacy,
          true,
          signal,
          () => watching,
        );
        if (loaded.status !== 'loaded') return loaded.status;
        try {
          const { ad } = loaded;
          return await new Promise<'closed' | 'error'>((resolve) => {
            const presentation = new AbortController();
            let failed = false;
            const finish = (result: 'closed' | 'error') => {
              clearTimeout(timer);
              signal.removeEventListener('abort', abort);
              presentation.abort();
              resolve(result);
            };
            const abort = () => finish('error');
            const timer = setTimeout(abort, 180_000);
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) {
              abort();
              return;
            }
            void ad
              .show(
                {
                  onEarned,
                  onClosed: () => finish(failed ? 'error' : 'closed'),
                  onError: () => {
                    failed = true;
                  },
                },
                presentation.signal,
              )
              .catch(abort);
          });
        } finally {
          loaded.ad.dispose();
        }
      } catch {
        return 'error';
      } finally {
        watching = false;
      }
    },
    async showPrivacyOptions() {
      if (!watching) await sdk.showPrivacyOptionsForm();
    },
  };
}

export function nativeGuestAdMobAdapter(units: GuestAdUnits) {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return null;
  const adUnitId = units[platform];
  return adUnitId
    ? createGuestAdMobAdapter({
        platform,
        adUnitId,
        available:
          Capacitor.isPluginAvailable('AdMob') && Capacitor.isPluginAvailable('CpiRewardedAds'),
      })
    : null;
}

export function nativeAdMobAdapter(adUnitId: string) {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return null;
  return createNativeAdMobAdapter({
    platform,
    adUnitId,
    available:
      Capacitor.isPluginAvailable('AdMob') && Capacitor.isPluginAvailable('CpiRewardedAds'),
  });
}

export interface CampaignInterstitialAd {
  readonly available: boolean;
  show(signal: AbortSignal): Promise<'closed' | 'unavailable' | 'error'>;
}

function waitForCampaignAd<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new RewardUnavailable());
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Campaign ads are optional, non-rewarded, and use the same conservative UMP defaults as guests. */
export function createCampaignInterstitialAdapter(options: {
  platform: 'android' | 'ios';
  adUnitId: string;
  available: boolean;
  sdk?: CampaignInterstitialSdk;
}): CampaignInterstitialAd {
  const sdk = options.sdk ?? AdMob;
  let presenting = false;
  return {
    available: options.available && unitPattern.test(options.adUnitId),
    async show(signal) {
      if (!options.available || !unitPattern.test(options.adUnitId)) return 'unavailable';
      if (presenting || signal.aborted) return 'error';
      presenting = true;
      let dismissed: PluginListenerHandle | null = null;
      let failedToShow: PluginListenerHandle | null = null;
      try {
        const loading = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
        const check = () => {
          if (loading.aborted) throw new RewardUnavailable();
        };
        await waitForCampaignAd(initializeAdMob(sdk, guestPrivacy, check, true), loading);
        check();
        const loaded = await waitForCampaignAd(
          sdk.prepareInterstitial({ adId: options.adUnitId, npa: true }),
          loading,
        );
        check();
        if (!loaded.adUnitId) return 'error';

        let settle!: (result: 'closed' | 'error') => void;
        const outcome = new Promise<'closed' | 'error'>((resolve) => {
          settle = resolve;
        });
        let finished = false;
        const finish = (result: 'closed' | 'error') => {
          if (finished) return;
          finished = true;
          settle(result);
        };
        dismissed = await sdk.addListener(InterstitialAdPluginEvents.Dismissed, () =>
          finish('closed'),
        );
        failedToShow = await sdk.addListener(InterstitialAdPluginEvents.FailedToShow, () =>
          finish('error'),
        );
        check();
        const showing = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
        await waitForCampaignAd(sdk.showInterstitial({ adId: loaded.adUnitId }), showing);
        return await waitForCampaignAd(outcome, showing);
      } catch {
        return signal.aborted ? 'unavailable' : 'error';
      } finally {
        await dismissed?.remove().catch(() => {});
        await failedToShow?.remove().catch(() => {});
        presenting = false;
      }
    },
  };
}

export function nativeCampaignInterstitialAdapter(adUnitId: string | undefined) {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return null;
  if (!adUnitId) return null;
  return createCampaignInterstitialAdapter({
    platform,
    adUnitId,
    available: Capacitor.isPluginAvailable('AdMob'),
  });
}
