import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ageBandFromInput,
  createProfileClient,
  parseOwnerProfile,
  profileForAccount,
} from '../src/account/profile-client';
import { ProfileEditor } from '../src/account/profile-editor';
import type { AccountRequestLease } from '../src/account/session-owner';
import { AccountSessionOwner } from '../src/account/session-owner';
import type { ProtectedRefreshTokenStore } from '../src/account/secure-session';

const response = () => ({
  config: {
    mappingVersion: 'cpi-regions-2026-11-v1',
    countries: [
      { countryCode: 'BG', continentCode: 'EU' },
      { countryCode: 'GB', continentCode: 'EU' },
    ],
  },
  owner: {
    profile: {
      public_id: '00000000-0000-4000-8000-000000000001',
      username: 'prism_1',
      country_code: 'BG',
      email: 'never-render@example.invalid',
    },
    analyticsAgeBand: null,
    ageResponseAt: null,
    analyticsAllowed: false,
    countryChangeAvailableAt: null,
  },
});
const session = {
  accountScope: () => session,
  subscribeAccountScope: () => () => undefined,
  withAccountRequest: <T>(operation: (lease: AccountRequestLease) => Promise<T>) =>
    operation({ accessToken: 'memory-only-token', signal: new AbortController().signal }),
};

describe('profile privacy and transport', () => {
  it('maps all actual schema boundaries, rejects blanks, decimals and raw DOB', () => {
    for (const [input, expected] of [
      ['0', 'under_13'],
      ['12', 'under_13'],
      ['13', '13_15'],
      ['15', '13_15'],
      ['16', '16_17'],
      ['17', '16_17'],
      ['18', '18_24'],
      ['24', '18_24'],
      ['25', '25_34'],
      ['34', '25_34'],
      ['35', '35_44'],
      ['44', '35_44'],
      ['45', '45_54'],
      ['54', '45_54'],
      ['55', '55_64'],
      ['64', '55_64'],
      ['65', '65_plus'],
      ['120', '65_plus'],
    ]) {
      expect(ageBandFromInput(input)).toBe(expected);
    }
    for (const input of ['', ' ', '13.0', '-1', '121', '01', '2000-01-01', '1e2', 'Infinity'])
      expect(ageBandFromInput(input)).toBeNull();
  });
  it('reconstructs only intended fields, rejects mismatched age timestamps and invented country', () => {
    const parsed = parseOwnerProfile(response());
    expect(parsed?.profile).toEqual({
      publicId: '00000000-0000-4000-8000-000000000001',
      username: 'prism_1',
      countryCode: 'BG',
    });
    expect(JSON.stringify(parsed)).not.toContain('email');
    expect(
      parseOwnerProfile({
        ...response(),
        owner: { ...response().owner, analyticsAgeBand: 'under_13' },
      }),
    ).toBeNull();
    const invalid = response();
    invalid.owner.profile.country_code = 'ZZ';
    expect(parseOwnerProfile(invalid)).toBeNull();
  });
  it('has no default service, rejects raw Auth/Data API and insecure targets', () => {
    for (const url of [
      undefined,
      'http://example.invalid/cpi',
      'https://example.invalid/',
      'https://user:secret@example.invalid/cpi',
      'https://example.invalid/cpi?email=x',
      'https://example.invalid/auth/v1',
      'https://example.invalid/rest/v1',
    ]) {
      expect(createProfileClient(url, session)).toBeNull();
    }
  });
  it('sends only explicit band/alias/declared country to fixed POST route with fenced bearer', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response())));
    const client = createProfileClient('https://example.invalid/cpi', session, fetcher)!;
    const result = await client.save(
      {
        username: 'Prism_1',
        countryCode: 'BG',
        analyticsAction: 'answer',
        analyticsAgeBand: '18_24',
      },
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://example.invalid/cpi/profile/save');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(JSON.parse(options?.body as string)).toEqual({
      schemaVersion: 1,
      username: 'Prism_1',
      countryCode: 'BG',
      analyticsAction: 'answer',
      analyticsAgeBand: '18_24',
    });
    expect(options?.headers).toMatchObject({ authorization: 'Bearer memory-only-token' });
    expect(url).not.toContain('token');
  });
  it('shows fixed recoverable errors without provider details and handles sign-out cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 'CPI_PROFILE_USERNAME_TAKEN', email: 'private' }), {
        status: 409,
      }),
    );
    const client = createProfileClient('https://example.invalid/cpi', session, fetcher)!;
    expect(await client.load(new AbortController().signal)).toEqual({
      ok: false,
      problem: 'username_taken',
    });
    fetcher.mockRejectedValue(new Error('private database detail'));
    expect(await client.load(new AbortController().signal)).toEqual({
      ok: false,
      problem: 'unavailable',
    });
  });
  it('fences a deferred account A response after real sign-out and account B activation', async () => {
    const now = 1_800_000_000_000;
    let credential: string | null = null;
    const vault: ProtectedRefreshTokenStore = {
      supported: true,
      read: () => Promise.resolve(credential),
      write: (value) => {
        credential = value;
        return Promise.resolve();
      },
      clear: () => {
        credential = null;
        return Promise.resolve();
      },
    };
    const envelope = (subject: string) => ({
      status: 'active',
      subject,
      refreshToken: 'refresh-private-' + subject,
      accessToken: 'access-memory-' + subject,
      expiresAt: now + 3_600_000,
    });
    const account = new AccountSessionOwner(
      vault,
      {
        exchange: vi
          .fn()
          .mockResolvedValueOnce(envelope('11111111-1111-4111-8111-111111111111'))
          .mockResolvedValueOnce(envelope('22222222-2222-4222-8222-222222222222')),
        refresh: () => Promise.reject(new Error('Unexpected refresh')),
        revoke: () => Promise.resolve({ status: 'revoked' }),
      },
      () => now,
    );
    expect(await account.exchangeVerifiedTicket('verified-opaque-ticket-0123456789')).toBe(true);
    let resolveA!: (response: Response) => void;
    const deferredA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });
    let started!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    let signalA: AbortSignal | null | undefined;
    const profileB = response();
    profileB.owner.profile.username = 'prism_b';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce((_url, options) => {
        signalA = options?.signal;
        started();
        // Deliberately ignore abort, modelling an already-delivered late response.
        return deferredA;
      })
      .mockResolvedValueOnce(new Response(JSON.stringify(profileB)));
    const clientA = createProfileClient('https://example.invalid/cpi', account, fetcher)!;
    const scopeA = clientA.accountScope!();
    const alreadyLoadedA = parseOwnerProfile(response())!;
    expect(profileForAccount(alreadyLoadedA, scopeA, clientA.accountScope!())).toBe(alreadyLoadedA);
    const observedScopes: (object | null)[] = [];
    const unsubscribe = clientA.subscribeAccountScope!(() =>
      observedScopes.push(clientA.accountScope!()),
    );
    const pendingA = clientA.load(new AbortController().signal);
    await requested;
    const signingOut = account.signOut();
    expect(signalA?.aborted).toBe(true);
    expect(profileForAccount(alreadyLoadedA, scopeA, clientA.accountScope!())).toBeNull();
    expect(await signingOut).toBe(true);
    expect(await account.exchangeVerifiedTicket('verified-second-ticket-0123456789')).toBe(true);
    const clientB = clientA;
    expect(clientB.accountScope!()).not.toBe(scopeA);
    expect(profileForAccount(alreadyLoadedA, scopeA, clientB.accountScope!())).toBeNull();
    const resultB = await clientB.load(new AbortController().signal);
    expect(resultB.ok && resultB.value.profile?.username).toBe('prism_b');
    resolveA(new Response(JSON.stringify(response())));
    expect(await pendingA).toEqual({ ok: false, problem: 'unavailable' });
    expect(resultB.ok && resultB.value.profile?.username).toBe('prism_b');
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      authorization: 'Bearer access-memory-22222222-2222-4222-8222-222222222222',
    });
    expect(observedScopes).toContain(null);
    unsubscribe();
    await account.signOut();
  });
  it('keeps guest profile view free of collection fields and preserves practice', () => {
    const markup = renderToStaticMarkup(
      createElement(ProfileEditor, { client: null, online: true }),
    );
    expect(markup).toContain('practice without a profile');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<form');
  });
});
