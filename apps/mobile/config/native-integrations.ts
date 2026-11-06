import type { AppEnvironment } from './environments';
import { PUBLISHER, DEMO_ADMOB } from './publisher.ts';

export const LIVE_NATIVE_PACKAGES = Object.freeze({
  '@capacitor-community/admob': '8.3.0',
  '@capgo/native-purchases': '8.9.6',
});
export const GOOGLE_ADS_SDK = Object.freeze({ android: '25.4.0', ios: '13.11.0' });
export interface NativeIntegrations {
  readonly ads: boolean;
  readonly purchases: boolean;
  readonly androidAdMobAppId: string | null;
  readonly iosAdMobAppId: string | null;
  readonly plugins: string[];
}
export function readNativeIntegrations(
  values: Readonly<Record<string, string | undefined>>,
  environment: AppEnvironment,
): NativeIntegrations {
  function flag(name: string) {
    const value = values[name];
    if (value === undefined || value === '' || value === 'false') return false;
    if (value !== 'true') throw new Error(name + ' must be true or false');
    return true;
  }
  const ads = flag('CPI_NATIVE_ADS'),
    purchases = flag('CPI_NATIVE_PURCHASES');
  function appId(name: string): string | null {
    if (!ads) return null;
    const platform = name === 'CPI_ADMOB_ANDROID_APP_ID' ? 'android' : 'ios';
    const id =
      values[name] ?? (environment === 'production' ? PUBLISHER.admob : DEMO_ADMOB)[platform].appId;
    if (!id || !/^ca-app-pub-[0-9]{16}~[0-9]{10}$/.test(id))
      throw new Error('Missing valid ' + name);
    if (environment === 'production' && id.startsWith('ca-app-pub-3940256099942544'))
      throw new Error('Production cannot use a Google demonstration application ID');
    if (environment !== 'production' && id !== DEMO_ADMOB[platform].appId)
      throw new Error('Non-production builds must use demonstration inventory');
    return id;
  }
  return {
    ads,
    purchases,
    androidAdMobAppId: appId('CPI_ADMOB_ANDROID_APP_ID'),
    iosAdMobAppId: appId('CPI_ADMOB_IOS_APP_ID'),
    plugins: [
      ...(ads ? ['@capacitor-community/admob'] : []),
      ...(purchases ? ['@capgo/native-purchases'] : []),
    ],
  };
}
