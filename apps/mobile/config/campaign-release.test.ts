import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCampaignRelease } from './campaign-release';
const values = {
  CPI_NATIVE_ADS: 'true',
  CPI_NATIVE_PURCHASES: 'true',
  VITE_ACCOUNT_SERVICES_ENABLED: 'true',
  VITE_PURCHASES_ENABLED: 'true',
  VITE_NATIVE_PROVIDER_SIGN_IN: 'true',
  VITE_GUEST_REWARDED_ADS_LIVE: 'true',
  VITE_CAMPAIGN_INTERSTITIALS_ENABLED: 'true',
  VITE_RANKED_SERVICES_ENABLED: 'true',
  VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
  CPI_STORE_VERSION: '1.0.1',
  CPI_STORE_BUILD_NUMBER: '60',
  VITE_CLIENT_BUILD: '60',
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe('public Campaign boundary', () => {
  it('requires complete real services and rejects test settings', () => {
    expect(() => assertCampaignRelease(values)).not.toThrow();
    for (const name of Object.keys(values))
      expect(() => assertCampaignRelease({ ...values, [name]: '' })).toThrow();
    for (const name of [
      'CPI_CAMPAIGN_BETA',
      'CPI_CAMPAIGN_SERVICES',
      'VITE_GUEST_REWARDED_ADS_TEST',
      'VITE_IOS_PROVIDER_SIGN_IN',
      'VITE_WEB_PROVIDER_SIGN_IN',
    ])
      expect(() => assertCampaignRelease({ ...values, [name]: 'true' })).toThrow();
    expect(() =>
      assertCampaignRelease({
        ...values,
        VITE_ACCOUNT_API_BASE_URL: 'https://crystal-path-staging-api.kolequant.workers.dev/cpi',
      }),
    ).toThrow();
    expect(() => assertCampaignRelease({ ...values, VITE_CLIENT_BUILD: '59' })).toThrow();
  });
  it('keeps paid public stock separate from sandbox and free-claim saves', async () => {
    vi.stubEnv('MODE', 'campaign-release');
    const release = await import('../src/app-profile');
    expect(release.CAMPAIGN_ENABLED).toBe(true);
    expect(release.CAMPAIGN_COMMERCE_ENABLED).toBe(true);
    expect(release.CAMPAIGN_TEST_BUILD).toBe(false);
    expect(release.QA_TOOLS_ENABLED).toBe(false);
    expect(release.SIMULATED_STORE_ENABLED).toBe(false);
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      },
    });
    try {
      release.practiceStorage().setItem('inventory', 'paid-production');
      vi.resetModules();
      vi.stubEnv('MODE', 'campaign-services');
      const sandbox = await import('../src/app-profile');
      expect(sandbox.practiceStorage().getItem('inventory')).toBeNull();
      sandbox.practiceStorage().setItem('inventory', 'sandbox');
      expect(release.practiceStorage().getItem('inventory')).toBe('paid-production');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
