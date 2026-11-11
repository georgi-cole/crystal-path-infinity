/** Signed TestFlight review profile; never a live-service or store-release build. */
export function assertOfflineCampaignBeta(values: Record<string, string | undefined>) {
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
  ]) {
    if (values[key] && values[key] !== 'false')
      throw new Error('Campaign beta requires offline services: ' + key);
  }
  if (values.VITE_ACCOUNT_API_BASE_URL)
    throw new Error('Campaign beta cannot target an account gateway.');
}
