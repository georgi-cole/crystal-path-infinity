import { createContext, useContext, useSyncExternalStore } from 'react';
import { EMPTY_TEST_STORE } from './test-store';
import type { TestStore } from './test-store';
import type { ThemeId } from './store-catalog';
export const StoreContext = createContext<TestStore | null>(null);
export const ThemeContext = createContext<ThemeId | null>(null);
const noop = () => {};
export function useTestStore() {
  const store = useContext(StoreContext);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? (() => noop),
    store?.snapshot ?? (() => EMPTY_TEST_STORE),
    () => EMPTY_TEST_STORE,
  );
  return { store, snapshot, error: store?.error() ?? null };
}
export function useThemeId(): ThemeId {
  const override = useContext(ThemeContext);
  const { snapshot } = useTestStore();
  return override ?? snapshot.equipped;
}
