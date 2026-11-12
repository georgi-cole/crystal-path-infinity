import { describe, expect, it } from 'vitest';
import { STAGING_ACCOUNT_GATEWAY } from './environments';
import { resolveStoreBuild } from './store-build';

const store = {
  CPI_STORE_VERSION: '1.0.0',
  CPI_STORE_BUILD_NUMBER: '43',
  CPI_NATIVE_ADS: 'true',
  VITE_GUEST_REWARDED_ADS_LIVE: 'true',
};

describe('store build identity', () => {
  it('uses an explicit isolated full-game sandbox identity without enabling live ads', () => {
    const values = {
      CPI_STORE_VERSION: '1.0.1',
      CPI_STORE_BUILD_NUMBER: '59',
      VITE_CLIENT_BUILD: '59',
      CPI_CAMPAIGN_SERVICES: 'true',
      CPI_NATIVE_ADS: 'true',
      CPI_NATIVE_PURCHASES: 'true',
      VITE_ACCOUNT_SERVICES_ENABLED: 'true',
      VITE_PURCHASES_ENABLED: 'true',
      VITE_GUEST_REWARDED_ADS_TEST: 'true',
      VITE_CAMPAIGN_INTERSTITIALS_ENABLED: 'true',
      VITE_NATIVE_PROVIDER_SIGN_IN: 'true',
      VITE_ACCOUNT_API_BASE_URL: STAGING_ACCOUNT_GATEWAY,
    };
    expect(resolveStoreBuild('production', values)).toEqual({ version: '1.0.1', buildNumber: 59 });
    expect(() =>
      resolveStoreBuild('production', {
        ...values,
        VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
      }),
    ).toThrow();
    expect(() => resolveStoreBuild('production', { ...values, VITE_CLIENT_BUILD: '58' })).toThrow();
    expect(() =>
      resolveStoreBuild('production', { ...values, VITE_GUEST_REWARDED_ADS_LIVE: 'true' }),
    ).toThrow();
  });
  it('leaves regular web and internal builds on their existing metadata', () => {
    expect(resolveStoreBuild('production', {})).toBeNull();
  });

  it('uses the requested release metadata with registered live guest units', () => {
    expect(resolveStoreBuild('production', store)).toEqual({ version: '1.0.0', buildNumber: 43 });
  });

  it.each([
    { CPI_STORE_VERSION: '1.0' },
    { CPI_STORE_BUILD_NUMBER: '0' },
    { VITE_GUEST_REWARDED_ADS_LIVE: 'false' },
    { VITE_GUEST_REWARDED_ADS_TEST: 'true' },
    { VITE_ACCOUNT_API_BASE_URL: STAGING_ACCOUNT_GATEWAY },
  ])('rejects incompatible store settings %o', (overrides) => {
    expect(() => resolveStoreBuild('production', { ...store, ...overrides })).toThrow();
  });
});
