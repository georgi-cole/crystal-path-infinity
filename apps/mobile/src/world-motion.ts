import { useSyncExternalStore } from 'react';
import { getGameplayLifecycle } from './gameplay-lifecycle';

const query = '(prefers-reduced-motion: reduce)';
function subscribe(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  document.addEventListener('visibilitychange', listener);
  const unsubscribe = getGameplayLifecycle().subscribe(listener);
  return () => {
    media.removeEventListener('change', listener);
    document.removeEventListener('visibilitychange', listener);
    unsubscribe();
  };
}
function snapshot() {
  const reduced = window.matchMedia(query).matches;
  const suspended = document.hidden || getGameplayLifecycle().getSnapshot()?.active === false;
  return Number(reduced) | (Number(suspended) << 1);
}
const serverSnapshot = () => 3;

export function useWorldMotion() {
  const flags = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { reduced: !!(flags & 1), suspended: !!(flags & 2) };
}
