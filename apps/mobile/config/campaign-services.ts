import { STAGING_ACCOUNT_GATEWAY } from './environments.ts';

/** Full-game acceptance builds use real SDKs against isolated test services. */
export function assertCampaignServices(values: Readonly<Record<string, string | undefined>>) {
  for (const name of [
    'CPI_NATIVE_ADS',
    'CPI_NATIVE_PURCHASES',
    'VITE_ACCOUNT_SERVICES_ENABLED',
    'VITE_PURCHASES_ENABLED',
    'VITE_GUEST_REWARDED_ADS_TEST',
    'VITE_CAMPAIGN_INTERSTITIALS_ENABLED',
    'VITE_NATIVE_PROVIDER_SIGN_IN',
  ]) {
    if (values[name] !== 'true') throw new Error('Campaign services requires ' + name);
  }
  if (values.VITE_ACCOUNT_API_BASE_URL !== STAGING_ACCOUNT_GATEWAY)
    throw new Error('Campaign service testing requires the isolated staging gateway.');
  if (values.VITE_GUEST_REWARDED_ADS_LIVE === 'true' || values.VITE_GUEST_REWARDED_AD_UNIT_ID)
    throw new Error('Campaign service testing requires demonstration ad inventory.');
}
