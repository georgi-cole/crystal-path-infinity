import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assertCampaignWeb } from './campaign-web';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('public browser Campaign', () => {
  it('enables the current game without QA, simulated commerce or native billing', async () => {
    vi.stubEnv('MODE', 'campaign-web');
    const profile = await import('../src/app-profile');
    expect(profile.CAMPAIGN_ENABLED).toBe(true);
    expect(profile.CAMPAIGN_WEB_BUILD).toBe(true);
    expect(profile.CAMPAIGN_COMMERCE_ENABLED).toBe(false);
    expect(profile.CAMPAIGN_TEST_BUILD).toBe(false);
    expect(profile.QA_TOOLS_ENABLED).toBe(false);
    expect(profile.SIMULATED_STORE_ENABLED).toBe(false);
    const data = new Map([
      ['cpi.player.v1:inventory', 'old-player'],
      ['cpi.campaign-qa.v1:inventory', 'free-test'],
    ]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      },
    });
    const storage = profile.practiceStorage();
    expect(storage.getItem('inventory')).toBeNull();
    storage.setItem('inventory', 'earned-browser');
    expect(data.get('cpi.campaign-web.v1:inventory')).toBe('earned-browser');
    expect(data.get('cpi.player.v1:inventory')).toBe('old-player');
    expect(data.get('cpi.campaign-qa.v1:inventory')).toBe('free-test');
  });
  it('permits production web accounts but refuses native/ad/test switches', () => {
    expect(() => assertCampaignWeb({})).not.toThrow();
    expect(() =>
      assertCampaignWeb({
        VITE_ACCOUNT_SERVICES_ENABLED: 'true',
        VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
        VITE_WEB_PROVIDER_SIGN_IN: 'true',
      }),
    ).not.toThrow();
    for (const flag of [
      'CPI_NATIVE_ADS',
      'CPI_NATIVE_PURCHASES',
      'CPI_CAMPAIGN_BETA',
      'CPI_CAMPAIGN_SERVICES',
      'VITE_PURCHASES_ENABLED',
      'VITE_NATIVE_PROVIDER_SIGN_IN',
      'VITE_IOS_PROVIDER_SIGN_IN',
      'VITE_GUEST_REWARDED_ADS_TEST',
      'VITE_GUEST_REWARDED_ADS_LIVE',
      'VITE_REWARDED_ADS_ENABLED',
      'VITE_CAMPAIGN_INTERSTITIALS_ENABLED',
      'VITE_RANKED_SERVICES_ENABLED',
    ])
      expect(() => assertCampaignWeb({ [flag]: 'true' })).toThrow();
    expect(() => assertCampaignWeb({ CPI_STORE_BUILD_NUMBER: '72' })).toThrow();
    expect(() =>
      assertCampaignWeb({
        VITE_ACCOUNT_SERVICES_ENABLED: 'true',
        VITE_ACCOUNT_API_BASE_URL: 'https://wrong.example',
      }),
    ).toThrow();
  });
  it('keeps enabled browser sign-in separate from native purchase and ad services', async () => {
    vi.stubEnv('MODE', 'campaign-web');
    vi.stubGlobal('window', { location: { origin: 'https://georgi-cole.github.io' } });
    const { createLiveServices } = await import('../src/live-services');
    const services = createLiveServices({
      VITE_ACCOUNT_SERVICES_ENABLED: 'true',
      VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
      VITE_WEB_PROVIDER_SIGN_IN: 'true',
    });
    expect(services?.account.accountEntry?.identity).toBeTruthy();
    expect(services?.commerce).toBeNull();
    expect(services?.account.campaignInterstitial).toBeUndefined();
    expect(services?.account.rewardFlowFactory).toBeUndefined();
    expect(services?.account.rankedClient).toBeUndefined();
  });
  it.each(['worlds', 'bridges', 'gear', 'supplies'] as const)(
    'renders %s without free claims, restoration or misleading billing errors',
    async (initial) => {
      vi.stubEnv('MODE', 'campaign-web');
      const { ExpeditionStore } = await import('../src/expedition-store');
      const { EMPTY_CAMPAIGN_PROGRESS } = await import('../src/campaign-test');
      const noop = () => {};
      const markup = renderToStaticMarkup(
        createElement(ExpeditionStore, {
          progress: EMPTY_CAMPAIGN_PROGRESS,
          initial,
          reducedMotion: true,
          onWorld: noop,
          onBridge: noop,
          onGear: noop,
          onClaim: noop,
          onUseSeasonChange: noop,
          onToggleClock: noop,
        }),
      );
      expect(markup).not.toMatch(
        /Add free test|Offline playtest|Restore &amp; check purchases|store could not connect/,
      );
      expect(markup).toContain('Purchases are available in the mobile app');
      if (initial === 'worlds') expect(markup).toContain('Available in the app');
    },
  );
});
