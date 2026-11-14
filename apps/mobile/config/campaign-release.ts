import { PUBLISHER } from './publisher.ts';

/** Public Campaign builds use real commerce and the separate production account server. */
export function assertCampaignRelease(values: Readonly<Record<string, string | undefined>>) {
  for (const name of [
    'CPI_NATIVE_ADS',
    'CPI_NATIVE_PURCHASES',
    'VITE_ACCOUNT_SERVICES_ENABLED',
    'VITE_PURCHASES_ENABLED',
    'VITE_NATIVE_PROVIDER_SIGN_IN',
    'VITE_GUEST_REWARDED_ADS_LIVE',
    'VITE_CAMPAIGN_INTERSTITIALS_ENABLED',
    'VITE_RANKED_SERVICES_ENABLED',
  ]) {
    if (values[name] !== 'true') throw new Error('Public Campaign requires ' + name);
  }
  if (values.VITE_ACCOUNT_API_BASE_URL !== 'https://crystalpath-api.kolequant.xyz/cpi')
    throw new Error('Public Campaign requires the production account gateway.');
  if (
    !/^ca-app-pub-\d+\/\d+$/.test(PUBLISHER.admob.android.interstitial ?? '') ||
    !/^ca-app-pub-\d+\/\d+$/.test(PUBLISHER.admob.ios.interstitial ?? '')
  )
    throw new Error('Public Campaign requires a registered interstitial unit for each platform.');
  if (
    [
      'CPI_CAMPAIGN_BETA',
      'CPI_CAMPAIGN_SERVICES',
      'VITE_GUEST_REWARDED_ADS_TEST',
      'VITE_IOS_PROVIDER_SIGN_IN',
      'VITE_WEB_PROVIDER_SIGN_IN',
    ].some((name) => values[name] === 'true') ||
    values.VITE_GUEST_REWARDED_AD_UNIT_ID
  )
    throw new Error(
      'Public Campaign cannot include review profiles, simulated purchases or demonstration ads.',
    );
  if (
    !values.CPI_STORE_VERSION ||
    !values.CPI_STORE_BUILD_NUMBER ||
    values.VITE_CLIENT_BUILD !== values.CPI_STORE_BUILD_NUMBER
  )
    throw new Error('Public Campaign requires matching store and native build identities.');
}
