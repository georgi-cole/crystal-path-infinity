import { STAGING_ACCOUNT_GATEWAY } from './environments.ts';
import type { AppEnvironment } from './environments.ts';
import { readNativeIntegrations } from './native-integrations.ts';
import { DEMO_ADMOB, LIVE_GUEST_ADMOB, PUBLISHER } from './publisher.ts';

export type GuestAdUnits = Readonly<Partial<Record<'android' | 'ios', string>>>;

/** Resolve the inventory before building so only the selected IDs reach the app. */
export function selectGuestAdUnits(
  values: Readonly<Record<string, string | undefined>>,
  environment: AppEnvironment,
): GuestAdUnits | null {
  const demo = values.VITE_GUEST_REWARDED_ADS_TEST;
  const live = values.VITE_GUEST_REWARDED_ADS_LIVE;
  const unit = values.VITE_GUEST_REWARDED_AD_UNIT_ID;
  const staging = values.VITE_ACCOUNT_API_BASE_URL?.replace(/\/+$/, '') === STAGING_ACCOUNT_GATEWAY;

  if (demo !== 'true' && live !== 'true' && !unit) return null;
  if (demo === 'true' && (!live || live === 'false') && !unit) {
    if (environment === 'production' && !staging)
      throw new Error('Guest demo ads require a test build or the internal staging gateway.');
    return { android: DEMO_ADMOB.android.rewarded, ios: DEMO_ADMOB.ios.rewarded };
  }

  if (
    (demo && demo !== 'false') ||
    environment !== 'production' ||
    staging ||
    values.VITE_IOS_PROVIDER_SIGN_IN === 'true'
  )
    throw new Error('Live guest ads require a production mobile build with test ads disabled.');

  const native = readNativeIntegrations(values, environment);
  if (
    native.androidAdMobAppId !== PUBLISHER.admob.android.appId ||
    native.iosAdMobAppId !== PUBLISHER.admob.ios.appId
  )
    throw new Error(
      'Live guest ads require the registered Crystal Path AdMob apps and native SDK.',
    );

  const { android, ios } = LIVE_GUEST_ADMOB;
  if (live === 'true' && !unit) return LIVE_GUEST_ADMOB;
  if (!live || live === 'false') {
    if (unit === android) return { android };
    if (unit === ios) return { ios };
  }
  throw new Error('Select live guest ads or specify one registered guest ad unit.');
}
