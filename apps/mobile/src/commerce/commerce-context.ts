import { createContext, useContext, useSyncExternalStore } from 'react';
import type { CommerceFlow, CommerceSnapshot } from './commerce-flow';

export const CommerceContext = createContext<CommerceFlow | null>(null);
const empty: CommerceSnapshot = Object.freeze({ phase: 'unavailable', products: [], wallet: null });
const noop = () => {};
export function useCommerce() {
  const flow = useContext(CommerceContext);
  const snapshot = useSyncExternalStore(
    flow?.subscribe ?? (() => noop),
    flow?.snapshot ?? (() => empty),
    () => empty,
  );
  return { flow, snapshot };
}
