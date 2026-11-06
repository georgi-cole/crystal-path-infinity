import { useState } from 'react';
import { App } from './App';
import { createLiveServices } from './live-services';
import { CommerceContext, useCommerce } from './commerce/commerce-context';
import { ThemeScope } from './store-provider';

function PlayerContent({ services }: { services: ReturnType<typeof createLiveServices> }) {
  const { snapshot } = useCommerce();
  return (
    <ThemeScope theme={snapshot.wallet?.equipped ?? 'obsidian'}>
      <App services={services?.account} />
    </ThemeScope>
  );
}
export function PlayerApp() {
  // No network, credential restore, SDK initialization or ad request during construction.
  const [services] = useState(() => createLiveServices(import.meta.env));
  return (
    <CommerceContext.Provider value={services?.commerce ?? null}>
      <PlayerContent services={services} />
    </CommerceContext.Provider>
  );
}
