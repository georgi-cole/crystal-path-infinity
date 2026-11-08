import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createTestStore } from './test-store';
import { StoreContext, ThemeContext } from './store-context';
import type { ThemeId } from './store-catalog';
import {
  PLAYER_PREVIEW_ENABLED,
  SIMULATED_STORE_ENABLED,
  profilePracticeStorage,
} from './app-profile';
export function TestStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    if (!SIMULATED_STORE_ENABLED) return null;
    const browserStorage = {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: (key: string) => window.localStorage.removeItem(key),
    };
    return createTestStore(
      PLAYER_PREVIEW_ENABLED ? profilePracticeStorage(browserStorage, 'player') : browserStorage,
    );
  });
  useEffect(() => {
    const refresh = () => store?.reload();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
export function ThemeScope({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
