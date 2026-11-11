import type { AppEnvironment } from './environments';
import { assertCampaignServices } from './campaign-services';

export function productionMobileSignIn(
  environment: AppEnvironment,
  values: Readonly<Record<string, string | undefined>>,
) {
  const flag = values.VITE_NATIVE_PROVIDER_SIGN_IN;
  if (flag === undefined || flag === '' || flag === 'false') return null;
  if (values.CPI_CAMPAIGN_SERVICES === 'true') {
    assertCampaignServices(values);
    if (
      environment !== 'production' ||
      !/^[1-9][0-9]{0,9}$/.test(values.VITE_CLIENT_BUILD ?? '') ||
      Number(values.VITE_CLIENT_BUILD) > 2147483647
    )
      throw new Error('Campaign services requires a registered native build identity.');
    return {
      kind: 'campaign-services-mobile',
      gateway: values.VITE_ACCOUNT_API_BASE_URL,
      providers: ['apple', 'google', 'email'],
      ranked: false,
    } as const;
  }
  if (
    flag !== 'true' ||
    environment !== 'production' ||
    values.VITE_ACCOUNT_SERVICES_ENABLED !== 'true' ||
    values.VITE_ACCOUNT_API_BASE_URL !== 'https://crystalpath-api.kolequant.xyz/cpi' ||
    values.VITE_IOS_PROVIDER_SIGN_IN === 'true' ||
    values.VITE_WEB_PROVIDER_SIGN_IN === 'true' ||
    !/^[1-9][0-9]{0,9}$/.test(values.VITE_CLIENT_BUILD ?? '') ||
    Number(values.VITE_CLIENT_BUILD) > 2147483647
  )
    throw new Error(
      'Production mobile sign-in requires the registered account gateway and an explicit native build.',
    );
  return {
    kind: 'production-mobile',
    gateway: values.VITE_ACCOUNT_API_BASE_URL,
    providers: ['apple', 'google', 'email'],
    ranked: values.VITE_RANKED_SERVICES_ENABLED === 'true',
  } as const;
}
