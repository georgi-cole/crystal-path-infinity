/** Noncredential pointer to this device's last Infinity inventory. Never authenticates an API. */
const key = 'cpi.campaign-services.offline-owner.v1';
const event = 'cpi-offline-owner';
export function readOfflineOwner(): string | null {
  try {
    const value = window.localStorage.getItem(key);
    return value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function rememberOfflineOwner(value: string | null) {
  try {
    if (value === readOfflineOwner()) return;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(event));
  } catch {
    /* Online inventory remains usable if this optional pointer cannot be saved. */
  }
}
export function subscribeOfflineOwner(observer: () => void) {
  window.addEventListener(event, observer);
  return () => window.removeEventListener(event, observer);
}
