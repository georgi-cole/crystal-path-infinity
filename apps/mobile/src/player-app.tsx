import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CAMPAIGN_COMMERCE_ENABLED, practiceStorage } from './app-profile';
import { namespacePracticeStorage } from './campaign-test';
import { App } from './App';
import { createLiveServices } from './live-services';
import { CommerceContext, useCommerce } from './commerce/commerce-context';
import { ThemeScope } from './store-provider';
import { nativeGuestAdMobAdapter } from './rewards/native-admob';
import type { GuestRewardedAd } from './rewards/native-admob';
import {
  readOfflineOwner,
  rememberOfflineOwner,
  subscribeOfflineOwner,
} from './commerce/offline-owner';

function PlayerContent({
  services,
  guestRewardedAd,
}: {
  services: ReturnType<typeof createLiveServices>;
  guestRewardedAd: GuestRewardedAd | null;
}) {
  const { snapshot, flow } = useCommerce();
  const session = services?.account.accountEntry?.session;
  const phase = useSyncExternalStore(
    (observer) => session?.subscribeAccountScope(observer) ?? (() => {}),
    () => session?.snapshot().phase ?? 'guest',
    () => 'guest',
  );
  const cachedToken = useSyncExternalStore(subscribeOfflineOwner, readOfflineOwner, () => null);
  const previousPhase = useRef(phase);
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!CAMPAIGN_COMMERCE_ENABLED) return;
    if (
      ['connecting', 'signing_out', 'blocked', 'revocation_unconfirmed'].includes(phase) ||
      (phase === 'guest' && previousPhase.current !== 'guest')
    )
      rememberOfflineOwner(null);
    previousPhase.current = phase;
  }, [phase]);
  useEffect(() => {
    if (CAMPAIGN_COMMERCE_ENABLED && snapshot.wallet)
      rememberOfflineOwner(snapshot.wallet.accountToken);
  }, [snapshot.wallet]);
  useEffect(() => {
    if (CAMPAIGN_COMMERCE_ENABLED && snapshot.phase === 'idle' && flow) void flow.load();
  }, [flow, snapshot.phase]);
  const allowCached =
    !['connecting', 'signing_out', 'blocked', 'revocation_unconfirmed'].includes(phase) &&
    (!online || phase !== 'guest');
  const accountToken = CAMPAIGN_COMMERCE_ENABLED
    ? (snapshot.wallet?.accountToken ?? (allowCached ? (cachedToken ?? undefined) : undefined))
    : undefined;
  const guestStorage = useMemo(() => practiceStorage(), []);
  const storage = useMemo(
    () => (accountToken ? namespacePracticeStorage(guestStorage, accountToken) : guestStorage),
    [accountToken, guestStorage],
  );
  const account = useMemo(
    () =>
      services?.account
        ? {
            ...services.account,
            signOut: async () => {
              if (CAMPAIGN_COMMERCE_ENABLED) rememberOfflineOwner(null);
              return (await services.account.signOut?.()) ?? true;
            },
          }
        : undefined,
    [services],
  );
  return (
    <ThemeScope theme={snapshot.wallet?.equipped ?? 'obsidian'}>
      <App
        key={accountToken ?? 'guest'}
        storage={storage}
        storageSeed={accountToken ? guestStorage : undefined}
        commerceAccountToken={accountToken}
        services={account}
        guestRewardedAd={guestRewardedAd}
      />
    </ThemeScope>
  );
}
export function PlayerApp() {
  // No network, credential restore, SDK initialization or ad request during construction.
  const [services] = useState(() =>
    import.meta.env.VITE_ACCOUNT_SERVICES_ENABLED === 'true'
      ? createLiveServices(import.meta.env)
      : null,
  );
  const [guestRewardedAd] = useState(() =>
    __CPI_GUEST_AD_UNITS__ ? nativeGuestAdMobAdapter(__CPI_GUEST_AD_UNITS__) : null,
  );
  useEffect(() => {
    const session = services?.account.accountEntry?.session;
    if (!session) return;
    const restore = () => {
      void session.restore();
    };
    if (navigator.onLine) restore();
    else window.addEventListener('online', restore, { once: true });
    return () => window.removeEventListener('online', restore);
  }, [services]);
  return (
    <CommerceContext.Provider value={services?.commerce ?? null}>
      <PlayerContent services={services} guestRewardedAd={guestRewardedAd} />
    </CommerceContext.Provider>
  );
}
