/** Public web play has no native checkout, simulated wallet or ad inventory. */
export function assertCampaignWeb(values: Readonly<Record<string, string | undefined>>) {
  for (const name of [
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
  ]) {
    if (values[name] === 'true') throw new Error('Browser Campaign cannot enable ' + name);
  }
  if (
    values.CPI_STORE_BUILD_NUMBER ||
    values.CPI_RELEASE_BUILD_NUMBER ||
    values.VITE_GUEST_REWARDED_AD_UNIT_ID
  )
    throw new Error('Browser Campaign cannot include native release metadata or ad units.');
  if (
    values.VITE_ACCOUNT_SERVICES_ENABLED === 'true' &&
    values.VITE_ACCOUNT_API_BASE_URL !== 'https://crystalpath-api.kolequant.xyz/cpi'
  )
    throw new Error('Browser Campaign requires the production account gateway.');
}
