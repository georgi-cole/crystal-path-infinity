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
