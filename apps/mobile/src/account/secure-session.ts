import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Only a refresh credential may survive a native app restart.
 * Access tokens, email, user records, and ranked state are never stored here.
 */
export interface NativeSecureSessionPlugin {
  readRefreshToken(): Promise<{ value: string | null }>;
  writeRefreshToken(options: { value: string }): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

export interface ProtectedRefreshTokenStore {
  readonly supported: boolean;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

const nativeVault = registerPlugin<NativeSecureSessionPlugin>('CpiSecureSession');

/** Reject empty, oversized, whitespace, control and non-ASCII credentials. */
export function validateRefreshToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{16,4096}$/.test(value)) {
    throw new TypeError('Invalid refresh credential');
  }
}

/**
 * Web has no equivalent device-bound protected keystore: fail closed instead
 * of silently falling back to localStorage, IndexedDB or plain Preferences.
 * Tests inject the platform and plugin; production uses the native bridge.
 */
export function createProtectedRefreshTokenStore(
  isNative: () => boolean,
  vault: NativeSecureSessionPlugin,
): ProtectedRefreshTokenStore {
  return {
    get supported() {
      return isNative();
    },
    async read() {
      if (!isNative()) return null;
      const record = await vault.readRefreshToken();
      if (record.value === null) return null;
      validateRefreshToken(record.value);
      return record.value;
    },
    async write(value) {
      validateRefreshToken(value);
      if (!isNative()) throw new Error('Protected credential storage is unavailable.');
      await vault.writeRefreshToken({ value });
    },
    async clear() {
      if (!isNative()) return;
      await vault.clearRefreshToken();
    },
  };
}

export const protectedRefreshTokenStore = createProtectedRefreshTokenStore(
  () => Capacitor.isNativePlatform(),
  nativeVault,
);

/** A browser tab can refresh its session in memory for as long as it is open. */
export function createInMemoryRefreshTokenStore(): ProtectedRefreshTokenStore {
  let credential: string | null = null;
  return {
    supported: true,
    read: () => Promise.resolve(credential),
    write: (value) => {
      validateRefreshToken(value);
      credential = value;
      return Promise.resolve();
    },
    clear: () => {
      credential = null;
      return Promise.resolve();
    },
  };
}
