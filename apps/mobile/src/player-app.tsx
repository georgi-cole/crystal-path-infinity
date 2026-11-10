import { useEffect, useState } from 'react';
import { App } from './App';
import { createLiveServices } from './live-services';
import { CommerceContext, useCommerce } from './commerce/commerce-context';
import { ThemeScope } from './store-provider';
import { nativeGuestAdMobAdapter } from './rewards/native-admob';
import type { GuestRewardedAd } from './rewards/native-admob';

function PlayerContent({
  services,
  guestRewardedAd,
}: {
  services: ReturnType<typeof createLiveServices>;
  guestRewardedAd: GuestRewardedAd | null;
}) {
  const { snapshot } = useCommerce();
  return (
    <ThemeScope theme={snapshot.wallet?.equipped ?? 'obsidian'}>
      <App services={services?.account} guestRewardedAd={guestRewardedAd} />
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
