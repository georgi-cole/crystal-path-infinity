import { describe, expect, it } from 'vitest';
import { readNativeIntegrations } from './native-integrations';
import { DEMO_ADMOB, PUBLISHER } from './publisher';

describe('native provider configuration', () => {
  it('excludes installed SDKs until enabled and never uses live inventory in development', () => {
    expect(readNativeIntegrations({}, 'production').plugins).toEqual([]);
    const test = readNativeIntegrations(
      { CPI_NATIVE_ADS: 'true', CPI_NATIVE_PURCHASES: 'true' },
      'development',
    );
    expect(test.androidAdMobAppId).toBe(DEMO_ADMOB.android.appId);
    expect(test.iosAdMobAppId).toBe(DEMO_ADMOB.ios.appId);
    expect(test.plugins).toHaveLength(2);
    expect(() => readNativeIntegrations({ CPI_NATIVE_ADS: 'yes' }, 'production')).toThrow();
    expect(() =>
      readNativeIntegrations(
        { CPI_NATIVE_ADS: 'true', CPI_ADMOB_ANDROID_APP_ID: PUBLISHER.admob.android.appId },
        'staging',
      ),
    ).toThrow();
  });
  it('uses the registered production identities and rejects demonstration inventory there', () => {
    const production = readNativeIntegrations({ CPI_NATIVE_ADS: 'true' }, 'production');
    expect(production.androidAdMobAppId).toBe('ca-app-pub-9243398419153145~7433632761');
    expect(production.iosAdMobAppId).toBe('ca-app-pub-9243398419153145~7303584917');
    expect(() =>
      readNativeIntegrations(
        { CPI_NATIVE_ADS: 'true', CPI_ADMOB_IOS_APP_ID: DEMO_ADMOB.ios.appId },
        'production',
      ),
    ).toThrow();
  });
});
