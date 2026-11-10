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
