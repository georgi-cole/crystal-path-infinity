import { AdMob, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AdEvent } from './ad-gate';

export const DEMO_AD_UNITS = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
} as const;

/** Google demo units only. There is deliberately no live-unit override. */
export class NativeAdProbe {
  private handles: PluginListenerHandle[] = [];
  private initialized = false;
  private disposed = false;
  private generation = 0;
  private readyToShow = false;
  constructor(private emit: (attemptId: string, event: AdEvent) => void, private note: (message: string) => void) {}

  async prepare(attemptId: string, userId: string, customData: string): Promise<void> {
    const platform = Capacitor.getPlatform();
    if (!Capacitor.isNativePlatform() || (platform !== 'android' && platform !== 'ios')) {
      throw new Error('Native test ads require the Android or iOS test build.');
    }
    const generation = ++this.generation;
    this.readyToShow = false;
    const alive = () => !this.disposed && generation === this.generation;
    const entries: [RewardAdPluginEvents, AdEvent][] = [
      [RewardAdPluginEvents.Loaded, 'loaded'], [RewardAdPluginEvents.FailedToLoad, 'load-failed'],
      [RewardAdPluginEvents.Showed, 'showed'], [RewardAdPluginEvents.Rewarded, 'earned'],
      [RewardAdPluginEvents.Dismissed, 'dismissed'], [RewardAdPluginEvents.FailedToShow, 'show-failed'],
    ];
    try {
      await this.removeListeners();
      if (!alive()) return;
      for (const [nativeEvent, event] of entries) {
        const handle = await AdMob.addListener(nativeEvent as RewardAdPluginEvents.Dismissed, () => {
          if (alive()) this.emit(attemptId, event);
        });
        if (!alive()) { await handle.remove(); return; }
        this.handles.push(handle);
      }
      if (!this.initialized) {
        // Fixed child/unknown test context. UMP and GMA flags are separate.
        const consent = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: true });
        if (!alive()) return;
        this.note(`UMP: ${consent.status}; canRequestAds=${consent.canRequestAds}`);
        if (!consent.canRequestAds) throw new Error('UMP has not permitted an ad request in this test configuration.');
        await AdMob.initialize({ initializeForTesting: true, tagForChildDirectedTreatment: true, tagForUnderAgeOfConsent: true, maxAdContentRating: MaxAdContentRating.General });
        if (!alive()) return;
        this.initialized = true;
      }
      await AdMob.prepareRewardVideoAd({ adId: DEMO_AD_UNITS[platform], isTesting: true, npa: true, ssv: { userId, customData } });
      if (alive()) { this.readyToShow = true; this.emit(attemptId, 'loaded'); }
    } catch (error) {
      if (alive()) {
        await this.removeListeners();
        if (alive()) this.emit(attemptId, 'load-failed');
      }
      throw error;
    }
  }

  show(attemptId: string): void {
    if (!this.readyToShow || this.disposed) throw new Error('No prepared native test ad.');
    this.readyToShow = false;
    const generation = this.generation;
    this.emit(attemptId, 'show-requested');
    // The promise settles on earned reward, NOT on dismiss. Do not await it as a close signal.
    // The Rewarded listener is the sole client signal; neither path grants server SP.
    void AdMob.showRewardVideoAd().catch(() => {
      if (!this.disposed && generation === this.generation) this.emit(attemptId, 'show-failed');
    });
  }

  private async removeListeners() {
    const handles = this.handles.splice(0);
    await Promise.allSettled(handles.map(handle => handle.remove()));
  }
  async dispose() { this.disposed = true; this.generation++; this.readyToShow = false; await this.removeListeners(); }
}
