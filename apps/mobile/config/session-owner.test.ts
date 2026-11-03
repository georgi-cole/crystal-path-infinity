import { describe, expect, it } from 'vitest';
import {
  AccountSessionOwner,
  SessionNotAvailable,
  parseAccountSession,
} from '../src/account/session-owner';
import type { ActiveAccountSession, SessionTransport } from '../src/account/session-owner';
import type { ProtectedRefreshTokenStore } from '../src/account/secure-session';

const NOW = 1_800_000_000_000;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const TICKET = 'verified-ticket-0123456789-abcdef';
const OLD = 'refresh-old-device-0123456789ABCDEF';
const NEW = 'refresh-new-device-0123456789ABCDEF';
const NEXT = 'refresh-next-device-0123456789ABCDEF';

function envelope(
  subject = USER_A,
  refreshToken = NEW,
  accessToken = 'access-token-0123456789ABCDEF',
  expiresAt = NOW + 3_600_000,
): ActiveAccountSession {
  return { status: 'active', subject, refreshToken, accessToken, expiresAt };
}

function fakeVault(initial: string | null = null): ProtectedRefreshTokenStore & {
  value(): string | null;
  events: string[];
} {
  let token = initial;
  const events: string[] = [];
  return {
    supported: true,
    value: () => token,
    events,
    read() {
      events.push('read');
      return Promise.resolve(token);
    },
    write(value) {
      events.push('write');
      token = value;
      return Promise.resolve();
    },
    clear() {
      events.push('clear');
      token = null;
      return Promise.resolve();
    },
  };
}

function fakeTransport(options: {
  exchange?: (ticket: string) => Promise<unknown>;
  refresh?: (token: string) => Promise<unknown>;
  revoke?: (token: string) => Promise<unknown>;
} = {}) {
  const calls: string[] = [];
  const transport: SessionTransport = {
    exchange(ticket) {
      calls.push('exchange');
      return options.exchange?.(ticket) ?? Promise.resolve(envelope());
    },
    refresh(token) {
      calls.push('refresh');
      return options.refresh?.(token) ?? Promise.resolve(envelope());
    },
    revoke(token) {
      calls.push('revoke');
      return options.revoke?.(token) ?? Promise.resolve({ status: 'revoked' });
    },
  };
  return { transport, calls };
}

describe('CPI-018 authenticated session ownership without a live account', () => {
  it('rejects malformed tokens, subjects, expired sessions and future expiry', () => {
    for (const invalid of [
      null,
      { status: 'verified' },
      envelope('not-a-uuid'),
      envelope(USER_A, 'short'),
      envelope(USER_A, NEW, 'tiny'),
      envelope(USER_A, NEW, 'access token has spaces'),
      envelope(USER_A, NEW, 'a'.repeat(8193)),
      envelope(USER_A, NEW, 'access-token-0123456789ABCDEF', NOW + 1_000),
      envelope(USER_A, NEW, 'access-token-0123456789ABCDEF', NOW + 26 * 3_600_000),
    ]) {
      expect(parseAccountSession(invalid, NOW)).toBeNull();
    }
    const result = parseAccountSession(
      { ...envelope(), email: 'secret@example.org', score: '9999999' },
      NOW,
    );
    expect(result).toEqual(envelope());
    expect(JSON.stringify(result)).not.toContain('secret@example.org');
    expect(JSON.stringify(result)).not.toContain('score');
  });

  it('never initiates credential operations for an unsupported web vault', async () => {
    const original = fakeVault();
    const vault: ProtectedRefreshTokenStore = { ...original, supported: false };
    const { transport, calls } = fakeTransport();
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(await owner.restore()).toBe(false);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(false);
    expect(await owner.refresh()).toBe(false);
    expect(calls).toEqual([]);
    expect(original.events).toEqual([]);
    expect(owner.snapshot()).toEqual({ phase: 'guest', canUseAccount: false, expiresAt: null });
  });

  it('requires an opaque server-issued ticket before storing an authenticated session', async () => {
    const vault = fakeVault();
    const { transport, calls } = fakeTransport();
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(await owner.exchangeVerifiedTicket('verified')).toBe(false);
    expect(owner.snapshot().canUseAccount).toBe(false);
    expect(calls).toEqual([]);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(true);
    expect(owner.snapshot()).toEqual({
      phase: 'active',
      canUseAccount: true,
      expiresAt: NOW + 3_600_000,
    });
    expect(vault.value()).toBe(NEW);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(false);
    expect(calls).toEqual(['exchange']);
    expect(JSON.stringify(owner.snapshot())).not.toContain(NEW);
    expect(JSON.stringify(owner.snapshot())).not.toContain('access-token');
    const observed = await owner.withAccountRequest(({ accessToken, signal }) =>
      Promise.resolve({ accessToken, aborted: signal.aborted }),
    );
    expect(observed).toEqual({ accessToken: envelope().accessToken, aborted: false });
  });

  it('restores an account only through a backend refresh and rotates the native credential', async () => {
    const vault = fakeVault(OLD);
    const { transport, calls } = fakeTransport({
      refresh: (token) => {
        expect(token).toBe(OLD);
        return Promise.resolve(envelope());
      },
    });
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(owner.snapshot().phase).toBe('guest');
    expect(await owner.restore()).toBe(true);
    expect(vault.value()).toBe(NEW);
    expect(owner.snapshot().canUseAccount).toBe(true);
    expect(calls).toEqual(['refresh']);
    owner.dispose();
    expect(owner.snapshot().phase).toBe('guest');
    // Disposal intentionally does not revoke durable credentials on an ordinary app close.
    expect(vault.value()).toBe(NEW);
  });

  it('shares one concurrent refresh and rejects a change of account subject', async () => {
    const vault = fakeVault();
    let count = 0;
    const { transport } = fakeTransport({
      refresh: () => {
        count++;
        return Promise.resolve(envelope(USER_A, NEXT));
      },
    });
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(true);
    expect(await Promise.all([owner.refresh(), owner.refresh()])).toEqual([true, true]);
    expect(count).toBe(1);
    expect(vault.value()).toBe(NEXT);

    const switched = fakeTransport({ refresh: () => Promise.resolve(envelope(USER_B, NEXT)) });
    const otherVault = fakeVault(OLD);
    const other = new AccountSessionOwner(otherVault, switched.transport, () => NOW);
    expect(await other.exchangeVerifiedTicket(TICKET)).toBe(true);
    expect(await other.refresh()).toBe(false);
    expect(other.snapshot().canUseAccount).toBe(false);
    expect(otherVault.value()).toBeNull();
    expect(switched.calls).toContain('revoke');
  });

  it('rejects a stale server credential instead of accepting an unrotated refresh token', async () => {
    const vault = fakeVault(OLD);
    const { transport } = fakeTransport({ refresh: () => Promise.resolve(envelope(USER_A, OLD)) });
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    // The server must issue a new refresh credential after an exchange.
    expect(await owner.restore()).toBe(false);
    expect(vault.value()).toBeNull();
    expect(owner.snapshot().canUseAccount).toBe(false);
  });

  it('fences a completed request and aborts its signal immediately on sign-out', async () => {
    const vault = fakeVault();
    const { transport, calls } = fakeTransport();
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(true);
    let settle!: (result: string) => void;
    const pending = new Promise<string>((resolve) => {
      settle = resolve;
    });
    let signal: AbortSignal | null = null;
    const operation = owner.withAccountRequest((lease) => {
      signal = lease.signal;
      return pending;
    });
    const logout = owner.signOut();
    expect(owner.snapshot().canUseAccount).toBe(false);
    expect(signal?.aborted).toBe(true);
    settle('stale result from account A');
    await expect(operation).rejects.toBeInstanceOf(SessionNotAvailable);
    expect(await logout).toBe(true);
    expect(owner.snapshot().phase).toBe('guest');
    expect(vault.value()).toBeNull();
    expect(calls).toContain('revoke');
    await expect(owner.withAccountRequest(() => Promise.resolve('wrong'))).rejects.toBeInstanceOf(
      SessionNotAvailable,
    );
  });

  it('never resurrects a late refresh after logout', async () => {
    const vault = fakeVault(OLD);
    let startRefresh!: () => void;
    const called = new Promise<void>((resolve) => {
      startRefresh = resolve;
    });
    let resolveRefresh!: (value: unknown) => void;
    const refreshed = new Promise<unknown>((resolve) => {
      resolveRefresh = resolve;
    });
    const { transport, calls } = fakeTransport({
      refresh: () => {
        startRefresh();
        return refreshed;
      },
    });
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    const restoring = owner.restore();
    await called;
    const signOut = owner.signOut();
    resolveRefresh(envelope(USER_A, NEXT));
    expect(await restoring).toBe(false);
    expect(await signOut).toBe(true);
    expect(vault.value()).toBeNull();
    expect(owner.snapshot().phase).toBe('guest');
    expect(calls.filter((name) => name === 'revoke').length).toBeGreaterThanOrEqual(1);
  });

  it('reports incomplete server revocation and permits an explicit retry only', async () => {
    const vault = fakeVault();
    let fails = true;
    const { transport } = fakeTransport({
      revoke: () =>
        fails ? Promise.reject(new Error('server unavailable')) : Promise.resolve({ status: 'revoked' }),
    });
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(true);
    expect(await owner.signOut()).toBe(false);
    expect(vault.value()).toBeNull();
    expect(owner.snapshot().phase).toBe('revocation_unconfirmed');
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(false);
    expect(await owner.restore()).toBe(false);
    fails = false;
    expect(await owner.retryRevocation()).toBe(true);
    expect(owner.snapshot().phase).toBe('guest');
  });

  it('does not trust a server result until durable protected storage accepts it', async () => {
    const vault = fakeVault();
    const failingVault: ProtectedRefreshTokenStore = {
      ...vault,
      write: () => Promise.reject(new Error('Keychain unavailable')),
    };
    const { transport, calls } = fakeTransport();
    const owner = new AccountSessionOwner(failingVault, transport, () => NOW);
    expect(await owner.exchangeVerifiedTicket(TICKET)).toBe(false);
    expect(owner.snapshot().canUseAccount).toBe(false);
    expect(vault.value()).toBeNull();
    expect(calls).toContain('revoke');
  });

  it('keeps different device identities isolated and never imports a practice result', async () => {
    const vaultA = fakeVault();
    const vaultB = fakeVault();
    const accountA = new AccountSessionOwner(
      vaultA,
      fakeTransport({ exchange: () => Promise.resolve(envelope(USER_A, OLD)) }).transport,
      () => NOW,
    );
    const accountB = new AccountSessionOwner(
      vaultB,
      fakeTransport({ exchange: () => Promise.resolve(envelope(USER_B, NEXT)) }).transport,
      () => NOW,
    );
    expect(await accountA.exchangeVerifiedTicket(TICKET)).toBe(true);
    expect(await accountB.exchangeVerifiedTicket(TICKET)).toBe(true);
    expect(vaultA.value()).toBe(OLD);
    expect(vaultB.value()).toBe(NEXT);
    expect(await accountA.signOut()).toBe(true);
    expect(vaultA.value()).toBeNull();
    expect(accountA.snapshot().canUseAccount).toBe(false);
    expect(vaultB.value()).toBe(NEXT);
    expect(accountB.snapshot().canUseAccount).toBe(true);
    await expect(accountA.withAccountRequest(() => Promise.resolve('stale'))).rejects.toThrow();
  });

  it('keeps recoverable credentials encrypted when a temporary network refresh fails', async () => {
    const vault = fakeVault(OLD);
    let online = false;
    const { transport } = fakeTransport({
      refresh: () =>
        online ? Promise.resolve(envelope()) : Promise.reject(new Error('network lost')),
    });
    const owner = new AccountSessionOwner(vault, transport, () => NOW);
    expect(await owner.restore()).toBe(false);
    expect(owner.snapshot().phase).toBe('recovery_required');
    expect(vault.value()).toBe(OLD);
    await expect(owner.withAccountRequest(() => Promise.resolve('unsafe'))).rejects.toThrow();
    online = true;
    expect(await owner.restore()).toBe(true);
    expect(vault.value()).toBe(NEW);
  });
});
