import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountSessionOwner } from '../src/account/session-owner';
import type { ActiveAccountSession } from '../src/account/session-owner';
import {
  createSavedPendingClient,
  parseSavedPendingPage,
  savedPendingForAccount,
} from '../src/ranked/saved-pending-client';
import type { SavedPendingEntry, SavedPendingPage } from '../src/ranked/saved-pending-client';
import { SavedPendingView } from '../src/ranked/saved-pending-view';
import { createPendingRunsHandler } from '../../../packages/server-core/src/pending-runs-api';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const NOW = 1_800_000_000_000;
function row(index = 3): SavedPendingEntry {
  return {
    runId: '33333333-3333-4333-8333-' + String(index).padStart(12, '0'),
    rulesetVersion: 'infinity-v1',
    status: 'verification_pending',
    lastClearedRow: '9007199254740993',
    revivesGranted: 1,
    revivesApplied: 0,
    rewardPending: true,
    createdAt: '2026-11-04T00:00:00.123456Z',
  };
}
function page(runs = [row()]): SavedPendingPage {
  return { status: 'saved', runs, next: null };
}
function envelope(subject: string): ActiveAccountSession {
  return {
    status: 'active',
    subject,
    accessToken: 'access-token-0123456789' + subject,
    refreshToken: 'refresh-token-0123456789' + subject,
    expiresAt: NOW + 3_600_000,
  };
}
function owner() {
  let active = A;
  const session = new AccountSessionOwner(
    {
      supported: true,
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    {
      exchange: () => Promise.resolve(envelope(active)),
      refresh: () => Promise.resolve(envelope(active)),
      revoke: () => Promise.resolve({ status: 'revoked' }),
    },
    () => NOW,
  );
  return {
    session,
    setAccount: (subject: string) => {
      active = subject;
    },
  };
}

describe('CPI-030 saved pending attempt discovery', () => {
  it('preserves huge progress and microsecond keysets, and rejects private or malformed summaries', () => {
    const value = {
      ...page([row(3), { ...row(2), lastClearedRow: '9'.repeat(1000) }]),
      next: { createdAt: row().createdAt, runId: row(2).runId },
    };
    expect(parseSavedPendingPage(value)).toEqual(value);
    expect(
      parseSavedPendingPage(page([{ ...row(), createdAt: '2026-11-04T00:00:00.123455Z' }]), {
        createdAt: row().createdAt,
        runId: row(1).runId,
      }),
    ).not.toBeNull();
    for (const bad of [
      { ...value, checkpoint: { seed: 'private' } },
      page([{ ...row(), leaseToken: 'private' } as SavedPendingEntry]),
      page([{ ...row(), createdAt: '2026-02-31T00:00:00Z' }]),
      page([{ ...row(), lastClearedRow: 9007199254740992 } as unknown as SavedPendingEntry]),
      page([{ ...row(), rewardPending: false }]),
      page([row(2), row(3)]),
      page(Array.from({ length: 21 }, (_, index) => row(100 - index))),
      { ...value, next: { createdAt: row().createdAt, runId: row(1).runId } },
    ])
      expect(parseSavedPendingPage(bad)).toBeNull();
    expect(
      parseSavedPendingPage(page(), { createdAt: row().createdAt, runId: row().runId }),
    ).toBeNull();
  });
  it('performs the actual client-to-mounted-handler roundtrip without owner IDs or private data', async () => {
    const { session } = owner();
    await session.exchangeVerifiedTicket('verified-ticket-0123456789');
    const saved = vi.fn().mockResolvedValue(page());
    const handler = createPendingRunsHandler({
      basePath: '/cpi',
      service: { saved, archive: () => Promise.reject(new Error()) },
      authenticate: () =>
        Promise.resolve({
          subject: A,
          deviceId: 'trusted-device',
          rankedAllowed: true,
          clientBuild: 1,
        }),
      allowOrigin: () => true,
      rateLimit: () => Promise.resolve(true),
    });
    const fetcher = vi.fn<typeof fetch>((input, init) => handler(new Request(input, init)));
    const client = createSavedPendingClient('https://api.example.invalid/cpi', session, fetcher)!;
    expect(await client.read(null, new AbortController().signal)).toEqual(page());
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.invalid/cpi/ranked/saved',
      expect.objectContaining({
        body: '{"after":null}',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      }),
    );
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ subject: A }), { after: null });
    expect(JSON.stringify(await client.read(null, new AbortController().signal))).not.toMatch(
      /subject|lease|checkpoint|seed|token/i,
    );
  });
  it('aborts and hides an old private list when the same real session owner changes A to signed out to B', async () => {
    const f = owner();
    await f.session.exchangeVerifiedTicket('verified-ticket-0123456789');
    let release: (response: Response) => void = () => undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(new Response(JSON.stringify(page([]))));
    const client = createSavedPendingClient('https://api.example.invalid', f.session, fetcher)!;
    const scopeA = client.accountScope();
    const pending = client.read(null, new AbortController().signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await f.session.signOut();
    expect(client.accountScope()).toBeNull();
    expect(savedPendingForAccount(page(), scopeA, client.accountScope())).toBeNull();
    f.setAccount(B);
    await f.session.exchangeVerifiedTicket('verified-ticket-abcdefghijk');
    expect(client.accountScope()).not.toBe(scopeA);
    release(new Response(JSON.stringify(page())));
    await expect(pending).rejects.toThrow('Saved attempts unavailable');
    expect(savedPendingForAccount(page(), scopeA, client.accountScope())).toBeNull();
    expect((await client.read(null, new AbortController().signal)).runs).toEqual([]);
  });
  it('keeps guests independent and bounds hostile or unavailable responses', async () => {
    const { session } = owner();
    const fetcher = vi.fn<typeof fetch>();
    expect(createSavedPendingClient(undefined, session, fetcher)).toBeNull();
    expect(createSavedPendingClient('http://api.example.invalid', session, fetcher)).toBeNull();
    expect(
      createSavedPendingClient('https://api.example.invalid/auth/v1', session, fetcher),
    ).toBeNull();
    const html = renderToStaticMarkup(
      createElement(SavedPendingView, {
        client: null,
        online: true,
        onRecover: () => Promise.resolve(),
      }),
    );
    expect(html).not.toContain('input');
    expect(fetcher).not.toHaveBeenCalled();
    await session.exchangeVerifiedTicket('verified-ticket-0123456789');
    fetcher.mockResolvedValue(new Response('x'.repeat(65537)));
    const client = createSavedPendingClient('https://api.example.invalid', session, fetcher)!;
    await expect(client.read(null, new AbortController().signal)).rejects.toThrow(
      'Saved attempts unavailable',
    );
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ...page(), routeSeed: 'private' })));
    await expect(client.read(null, new AbortController().signal)).rejects.toThrow(
      'Saved attempts unavailable',
    );
  });
});
