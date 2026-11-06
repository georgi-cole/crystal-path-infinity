import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createTestStore } from './test-store';
import { StoreContext, ThemeContext } from './store-context';
import type { ThemeId } from './store-catalog';
import { QA_TOOLS_ENABLED } from './app-profile';
export function TestStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    QA_TOOLS_ENABLED
      ? createTestStore({
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
          removeItem: (key) => window.localStorage.removeItem(key),
        })
      : null,
  );
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
