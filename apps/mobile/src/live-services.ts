import { Capacitor } from '@capacitor/core';
import type { ApprovedAccountServices } from './App';
import { AccountSessionOwner } from './account/session-owner';
import {
  createInMemoryRefreshTokenStore,
  protectedRefreshTokenStore,
} from './account/secure-session';
import { createSessionTransport } from './account/session-gateway';
import { createAccountControlsClient } from './account/account-controls-client';
import { createOtpGateway } from './account/otp-gateway';
import {
  createNativeIdentityClient,
  STAGING_ACCOUNT_GATEWAY,
} from './account/native-identity-client';
import { createProfileClient } from './account/profile-client';
import { createRankedClient } from './ranked/ranked-client';
import { createSavedPendingClient } from './ranked/saved-pending-client';
import { createLeaderboardClient } from './leaderboard/leaderboard-client';
import { createNameReportClient } from './leaderboard/name-report-client';
import { createRewardClient } from './rewards/reward-client';
import { createRankedRewardFlowFactory } from './rewards/reward-flow-factory';
import { nativeAdMobAdapter } from './rewards/native-admob';
import { nativeBillingAdapter } from './commerce/native-billing';
import { createCommerceGateway } from './commerce/commerce-gateway';
import { CommerceFlow } from './commerce/commerce-flow';
import { PUBLISHER, DEMO_ADMOB } from '../config/publisher';
import { SIMULATED_STORE_ENABLED } from './app-profile';

export interface LiveServices {
  readonly account: ApprovedAccountServices;
  readonly commerce: CommerceFlow | null;
}
/** Configuration alone never authorizes an account or ad: the server checks each operation. */
export function createLiveServices(values: Readonly<Record<string, unknown>>): LiveServices | null {
  if (SIMULATED_STORE_ENABLED || values.VITE_ACCOUNT_SERVICES_ENABLED !== 'true') return null;
  const base =
    typeof values.VITE_ACCOUNT_API_BASE_URL === 'string'
      ? values.VITE_ACCOUNT_API_BASE_URL
      : undefined;
  const nativePlatform = Capacitor.getPlatform();
  const gateway = createOtpGateway(base, fetch, {
      platform: nativePlatform === 'ios' ? 'ios' : nativePlatform === 'android' ? 'android' : 'web',
      build: Number(values.VITE_CLIENT_BUILD ?? 1),
    }),
    transport = createSessionTransport(base);
  if (!base || !gateway || !transport) return null;
  const native = protectedRefreshTokenStore.supported;
  const session = new AccountSessionOwner(
    native ? protectedRefreshTokenStore : createInMemoryRefreshTokenStore(),
    transport,
  );
  const account: ApprovedAccountServices = {
    session,
    accountEntry: {
      gateway,
      session,
      staging: base === STAGING_ACCOUNT_GATEWAY,
      identity:
        native && values.VITE_IOS_PROVIDER_SIGN_IN === 'true'
          ? createNativeIdentityClient(base, session, Number(values.VITE_CLIENT_BUILD ?? 1))
          : null,
    },
    signOut: () => session.signOut(),
    accountControlsClient: createAccountControlsClient(base, session),
    profileClient: createProfileClient(base, session),
  };
  if (!native) return { account, commerce: null };

  const ranked = createRankedClient({ baseUrl: base, session });
  const platform = Capacitor.getPlatform();
  const inventory = import.meta.env.MODE === 'production' ? PUBLISHER.admob : DEMO_ADMOB;
  const ad =
    values.VITE_REWARDED_ADS_ENABLED === 'true' && (platform === 'android' || platform === 'ios')
      ? nativeAdMobAdapter(inventory[platform].rewarded)
      : null;
  const reward = ad
    ? createRewardClient({
        baseUrl: base,
        session,
        applyGrant: async (runId, grantId) => ranked?.applyVerifiedGrant(grantId, runId) ?? false,
      })
    : null;
  const nativeBilling = values.VITE_PURCHASES_ENABLED === 'true' ? nativeBillingAdapter() : null;
  const commerceGateway = nativeBilling
    ? createCommerceGateway({ baseUrl: base, platform: nativeBilling.platform, session })
    : null;
  return {
    account: {
      ...account,
      adPrivacyOptions: ad?.available ? () => ad.showPrivacyOptions() : undefined,
      rankedClient: ranked,
      leaderboardClient: createLeaderboardClient(base, session),
      nameReportClient: createNameReportClient(base, session),
      savedPendingClient: createSavedPendingClient(base, session),
      rewardFlowFactory: ad?.available
        ? createRankedRewardFlowFactory({ client: reward, rankedClient: ranked, adapter: ad })
        : null,
    },
    commerce:
      commerceGateway && nativeBilling?.available
        ? new CommerceFlow(commerceGateway, nativeBilling)
        : null,
  };
}
