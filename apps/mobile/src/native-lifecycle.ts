import { registerPlugin } from '@capacitor/core';

export const nativeLifecycleEvent = 'cpi-native-state';

/** One native bridge's monotonic foreground clock, sampled on its UI thread. */
export interface NativeLifecycleSnapshot {
  readonly pageId: string;
  readonly bridgeId: string;
  readonly sequence: number;
  readonly isActive: boolean;
  readonly nativeTimeMs: number;
  readonly foregroundTimeMs: number;
}

interface NativeLifecyclePlugin {
  getSnapshot(options: { pageId: string }): Promise<NativeLifecycleSnapshot>;
}

const lifecycle = registerPlugin<NativeLifecyclePlugin>('CpiLifecycle');

let pageId: string | undefined;

export function getNativePageId(): string {
  if (!pageId) {
    pageId = crypto.randomUUID();
    identifyNativePage(pageId);
  }
  return pageId;
}

/** Set before requesting the handshake; native delivery checks this exact page identity. */
export function identifyNativePage(pageId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pageId)) throw new TypeError('Invalid native page identity');
  const page = window as Window & { __CPI_NATIVE_PAGE_ID__?: string };
  if (page.__CPI_NATIVE_PAGE_ID__ && page.__CPI_NATIVE_PAGE_ID__ !== pageId) {
    throw new Error('Another owner has already identified this page');
  }
  page.__CPI_NATIVE_PAGE_ID__ = pageId;
}

export function nativeLifecycleSnapshot(pageId: string): Promise<NativeLifecycleSnapshot> {
  return lifecycle.getSnapshot({ pageId });
}
