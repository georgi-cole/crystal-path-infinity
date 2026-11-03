import { describe, expect, it } from 'vitest';
import {
  createProtectedRefreshTokenStore,
  validateRefreshToken,
} from '../src/account/secure-session';
import type { NativeSecureSessionPlugin } from '../src/account/secure-session';

const TOKEN = 'refresh-token-only-ABCDEF0123456789';

function fakeVault() {
  let value: string | null = null;
  const calls: string[] = [];
  const vault: NativeSecureSessionPlugin = {
    readRefreshToken() {
      calls.push('read');
      return Promise.resolve({ value });
    },
    writeRefreshToken(record) {
      calls.push('write');
      value = record.value;
      return Promise.resolve();
    },
    clearRefreshToken() {
      calls.push('clear');
      value = null;
      return Promise.resolve();
    },
  };
  return { vault, calls };
}

describe('CPI-018 native protected refresh-token contract', () => {
  it('does not send anything to the native bridge on web', async () => {
    const { vault, calls } = fakeVault();
    const store = createProtectedRefreshTokenStore(() => false, vault);
    expect(store.supported).toBe(false);
    expect(await store.read()).toBeNull();
    await expect(store.write(TOKEN)).rejects.toThrow('unavailable');
    await store.clear();
    expect(calls).toEqual([]);
  });

  it('round-trips a refresh credential only on native and clears on logout', async () => {
    const { vault, calls } = fakeVault();
    const store = createProtectedRefreshTokenStore(() => true, vault);
    expect(store.supported).toBe(true);
    expect(await store.read()).toBeNull();
    await store.write(TOKEN);
    expect(await store.read()).toBe(TOKEN);
    await store.clear();
    expect(await store.read()).toBeNull();
    expect(calls).toEqual(['read', 'write', 'read', 'clear', 'read']);
  });

  it.each([
    '',
    'abc',
    'has spaces and control chars',
    'new\nline'.repeat(3),
    'A'.repeat(4097),
    1,
    null,
  ])('rejects an unsafe refresh token before native write: %j', async (value) => {
    const { vault, calls } = fakeVault();
    const store = createProtectedRefreshTokenStore(() => true, vault);
    expect(() => validateRefreshToken(value)).toThrow('Invalid refresh credential');
    await expect(store.write(value as string)).rejects.toThrow('Invalid refresh credential');
    expect(calls).toEqual([]);
  });

  it('refuses malformed credentials returned by an untrusted or corrupted vault', async () => {
    const store = createProtectedRefreshTokenStore(() => true, {
      readRefreshToken() {
        return Promise.resolve({ value: 'bad' });
      },
      writeRefreshToken() {
        return Promise.resolve();
      },
      clearRefreshToken() {
        return Promise.resolve();
      },
    });
    await expect(store.read()).rejects.toThrow('Invalid refresh credential');
  });

  it('propagates storage failures without guessing a session or downgrading to plaintext', async () => {
    const store = createProtectedRefreshTokenStore(() => true, {
      readRefreshToken() {
        return Promise.reject(new Error('key invalidated'));
      },
      writeRefreshToken() {
        return Promise.reject(new Error('store failed'));
      },
      clearRefreshToken() {
        return Promise.reject(new Error('clear failed'));
      },
    });
    await expect(store.read()).rejects.toThrow('key invalidated');
    await expect(store.write(TOKEN)).rejects.toThrow('store failed');
    await expect(store.clear()).rejects.toThrow('clear failed');
  });
});
