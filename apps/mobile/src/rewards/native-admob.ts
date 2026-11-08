import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, MaxAdContentRating } from '@capacitor-community/admob';
import { GOOGLE_ADS_SDK } from '../../config/native-integrations';
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
    },
  ): Promise<{ status: 'loaded' | 'no_fill' | 'error' }>;
  show(this: void, options: { key: string; customData: string }): Promise<void>;
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
const ratings = {
  G: MaxAdContentRating.General,
  PG: MaxAdContentRating.ParentalGuidance,
  T: MaxAdContentRating.Teen,
  MA: MaxAdContentRating.MatureAudience,
};

/** Google UMP and native SDK are untouched until a server permit and deliberate watch action. */
export function createNativeAdMobAdapter(options: {
  platform: 'android' | 'ios';
  adUnitId: string;
  available: boolean;
  bridge?: RewardedBridge;
  sdk?: ConsentSdk;
  now?: () => number;
  newId?: () => string;
}): NativeRewardedAdapter & { showPrivacyOptions(): Promise<void> } {
  const sdk = options.sdk ?? AdMob,
    native = options.bridge ?? bridge;
  const now = options.now ?? Date.now,
    newId = options.newId ?? (() => crypto.randomUUID().replaceAll('-', ''));
  let permit: RewardPermit | null = null,
    revision = 0;
  const adapter: NativeRewardedAdapter & { showPrivacyOptions(): Promise<void> } = {
    available: options.available && /^ca-app-pub-[0-9]{16}\/[0-9]{10}$/.test(options.adUnitId),
    inventory: {
      provider: 'admob',
      platform: options.platform,
      sdkVersion: GOOGLE_ADS_SDK[options.platform],
      mediation: [],
    },
    async initialize(next, signal) {
      const epoch = ++revision;
      permit = null;
      if (signal.aborted || !permitMatchesAdapter(next, adapter, now()))
        throw new RewardUnavailable();
      const inventory = await native.inventory();
      if (
        inventory.sdkVersion !== adapter.inventory!.sdkVersion ||
        signal.aborted ||
        epoch !== revision ||
        next.expiresAt <= now()
      )
        throw new RewardUnavailable();
      let consent = await sdk.requestConsentInfo({
        tagForUnderAgeOfConsent: next.flags.underAgeOfConsent,
      });
      if (signal.aborted || epoch !== revision || next.expiresAt <= now())
        throw new RewardUnavailable();
      if (consent.status === AdmobConsentStatus.REQUIRED) consent = await sdk.showConsentForm();
      if (!consent.canRequestAds || signal.aborted || epoch !== revision || next.expiresAt <= now())
        throw new RewardUnavailable();
      await sdk.initialize({
        tagForChildDirectedTreatment: next.flags.childDirected,
        tagForUnderAgeOfConsent: next.flags.underAgeOfConsent,
        maxAdContentRating: ratings[next.flags.maxAdContentRating],
      });
      if (signal.aborted || epoch !== revision || next.expiresAt <= now())
        throw new RewardUnavailable();
      permit = next;
    },
    async load(signal) {
      const accepted = permit,
        epoch = revision;
      if (!accepted || signal.aborted || accepted.expiresAt <= now()) throw new RewardUnavailable();
      const key = newId();
      const response = await new Promise<Awaited<ReturnType<RewardedBridge['load']>>>(
        (resolve, reject) => {
          const cancel = () => {
            cleanup();
            void native.dispose({ key }).catch(() => {});
            reject(new RewardUnavailable());
          };
          const timer = setTimeout(cancel, 20000);
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
              adUnitId: options.adUnitId,
              key,
              nonPersonalized: accepted.flags.nonPersonalized,
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
      if (signal.aborted || epoch !== revision) {
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
        status: 'loaded',
        ad: {
          async show(input, showSignal) {
            if (
              disposed ||
              shown ||
              showSignal.aborted ||
              accepted !== permit ||
              accepted.expiresAt <= now() ||
              !/^[A-Za-z0-9._~-]{24,1024}$/.test(input.customData)
            )
              throw new RewardUnavailable();
            shown = true;
            listener = await native.addListener('state', (event) => {
              if (event.key !== key || disposed || ended) return;
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
            if (disposed || showSignal.aborted || epoch !== revision) {
              await listener.remove();
              listener = null;
              throw new RewardUnavailable();
            }
            // This does not reload the ad and never sends an Auth user ID to Google.
            await native.show({ key, customData: input.customData });
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            void listener?.remove().catch(() => {});
            listener = null;
            if (!shown) void native.dispose({ key }).catch(() => {});
          },
        },
      };
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
