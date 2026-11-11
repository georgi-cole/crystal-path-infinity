import { describe, expect, it, vi, afterEach } from 'vitest';
import { assertOfflineCampaignBeta } from './campaign-beta';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe('offline signed Campaign beta isolation', () => {
  it('allows an offline profile and rejects every live service boundary', () => {
    expect(() => assertOfflineCampaignBeta({})).not.toThrow();
    for (const key of [
      'CPI_NATIVE_ADS',
      'CPI_NATIVE_PURCHASES',
      'VITE_ACCOUNT_SERVICES_ENABLED',
      'VITE_PURCHASES_ENABLED',
      'VITE_REWARDED_ADS_ENABLED',
      'VITE_GUEST_REWARDED_ADS_TEST',
      'VITE_GUEST_REWARDED_ADS_LIVE',
      'VITE_IOS_PROVIDER_SIGN_IN',
      'VITE_NATIVE_PROVIDER_SIGN_IN',
      'VITE_ACCOUNT_API_BASE_URL',
    ]) {
      expect(() => assertOfflineCampaignBeta({ [key]: 'true' })).toThrow();
    }
  });
  it.each(['production', 'staging', 'campaign-beta', 'campaign-qa'])(
    'keeps %s profile controlled at build time',
    async (mode) => {
      vi.stubEnv('MODE', mode);
      const profile = await import('../src/app-profile');
      const beta = mode.startsWith('campaign-');
      expect(profile.CAMPAIGN_TEST_BUILD).toBe(beta);
      expect(profile.SIMULATED_STORE_ENABLED).toBe(beta);
      expect(profile.QA_TOOLS_ENABLED).toBe(beta);
    },
  );
});

describe('full-game service acceptance isolation', () => {
  it('requires actual SDKs, isolated accounts and demo ads without enabling free claims', async () => {
    const { assertCampaignServices } = await import('./campaign-services');
    const values = {
      CPI_NATIVE_ADS: 'true',
      CPI_NATIVE_PURCHASES: 'true',
      VITE_ACCOUNT_SERVICES_ENABLED: 'true',
      VITE_PURCHASES_ENABLED: 'true',
      VITE_NATIVE_PROVIDER_SIGN_IN: 'true',
      VITE_GUEST_REWARDED_ADS_TEST: 'true',
      VITE_ACCOUNT_API_BASE_URL: 'https://crystal-path-staging-api.kolequant.workers.dev/cpi',
    };
    expect(() => assertCampaignServices(values)).not.toThrow();
    for (const flag of Object.keys(values))
      expect(() => assertCampaignServices({ ...values, [flag]: '' })).toThrow();
    expect(() =>
      assertCampaignServices({ ...values, VITE_GUEST_REWARDED_ADS_LIVE: 'true' }),
    ).toThrow();
    expect(() =>
      assertCampaignServices({
        ...values,
        VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
      }),
    ).toThrow();
    vi.stubEnv('MODE', 'campaign-services');
    const profile = await import('../src/app-profile');
    expect(profile.CAMPAIGN_ENABLED).toBe(true);
    expect(profile.CAMPAIGN_TEST_BUILD).toBe(false);
    expect(profile.QA_TOOLS_ENABLED).toBe(false);
    expect(profile.SIMULATED_STORE_ENABLED).toBe(false);
  });
});
