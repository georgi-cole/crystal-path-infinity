import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createNameReportClient } from '../src/leaderboard/name-report-client';
import type { NameReportReason } from '../src/leaderboard/name-report-client';
import { NameReportButton } from '../src/leaderboard/name-report';
import type { AccountRequestLease } from '../src/account/session-owner';
import { createModerationHandler } from '../../../packages/server-core/src/moderation-api.ts';
import type { SqlConnection } from '../../../packages/server-core/src/database.ts';
const target = '25100000-0000-4000-8000-000000000002';
const base = 'https://accounts.example.invalid/v1';
function fixture(
  fetcher: typeof fetch = () => Promise.resolve(new Response('{"status":"accepted"}')),
) {
  const controller = new AbortController();
  let accountScope: object | null = Object.freeze({});
  const observers = new Set<() => void>();
  let rejected = false;
  const withAccountRequest = vi.fn<() => void>();
  const session = {
    accountScope: () => accountScope,
    subscribeAccountScope: (observer: () => void) => {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
    withAccountRequest: <T>(operation: (lease: AccountRequestLease) => Promise<T>) => {
      withAccountRequest();
      return rejected
        ? Promise.reject(new Error('Account changed'))
        : operation({ accessToken: 'APPROVED-ACCESS-SECRET', signal: controller.signal });
    },
  };
  const client = createNameReportClient(base, session, fetcher)!;
  return {
    client,
    controller,
    withAccountRequest,
    rejectAccount: () => {
      rejected = true;
    },
    replaceAccount: (signedIn = true) => {
      accountScope = signedIn ? Object.freeze({}) : null;
      for (const observer of observers) observer();
    },
  };
}
describe('CPI-025 explicit private name-report transport', () => {
  it('round-trips the configured client prefix through the matching mounted server route', async () => {
    const query = vi
      .fn<SqlConnection['query']>()
      .mockResolvedValue({ rows: [{ result: { status: 'accepted' } }] });
    const subject = '25000000-0000-4000-8000-000000000001';
    const handler = createModerationHandler({
      basePath: '/v1',
      database: { connect: () => Promise.resolve({ query, release: () => {} }) },
      authenticateReporter: (token) =>
        Promise.resolve(
          token === 'APPROVED-ACCESS-SECRET' ? { subject, reportAllowed: true } : null,
        ),
      authenticateModerator: () => Promise.resolve(null),
      allowOrigin: (origin) => origin === 'capacitor://localhost',
      rateLimit: () => Promise.resolve(true),
    });
    const f = fixture((input, init) => {
      const request = new Request(input, init);
      request.headers.set('origin', 'capacitor://localhost');
      return handler(request);
    });
    expect(await f.client.submit(target, 'spam', new AbortController().signal)).toEqual({
      ok: true,
    });
    expect(query).toHaveBeenCalledExactlyOnceWith(
      'select cpi_private.submit_name_report($1::uuid,$2::uuid,$3::text) as result',
      [subject, target, 'spam'],
    );
  });
  it('does not configure insecure/default endpoints or start requests automatically', () => {
    const fetcher = vi.fn<typeof fetch>();
    const session = {
      accountScope: () => null,
      subscribeAccountScope: () => () => {},
      withAccountRequest: <T>(operation: (lease: AccountRequestLease) => Promise<T>) =>
        operation({ accessToken: 'secret', signal: new AbortController().signal }),
    };
    for (const invalid of [
      undefined,
      '',
      'http://api.example.invalid/v1',
      'https://api.example.invalid/',
      'https://name:password@api.example.invalid/v1',
      'https://api.example.invalid/v1?private=secret',
      'https://api.example.invalid/v1#secret',
      'https://api.example.invalid/auth/v1',
      'https://api.example.invalid/rest/v1',
    ])
      expect(createNameReportClient(invalid, session, fetcher)).toBeNull();
    expect(createNameReportClient(base, session, fetcher)).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('submits only a public target and enum reason in the fixed POST body using the account fence', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'accepted',
            reporterUserId: 'private',
            email: 'secret@example.invalid',
            accessToken: 'SECRET',
          }),
        ),
      ),
    );
    const f = fixture(fetcher);
    expect(await f.client.submit(target, 'spam', new AbortController().signal)).toEqual({
      ok: true,
    });
    expect(f.withAccountRequest).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(base + '/moderation/report');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { authorization: 'Bearer APPROVED-ACCESS-SECRET' },
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      schemaVersion: 1,
      targetPublicId: target,
      reason: 'spam',
    });
    expect(init!.body).not.toMatch(/reporter|email|username|privacy|age|ACCESS/);
  });
  it('rejects private object payloads, unsupported/free-text reasons and invalid targets before account access', async () => {
    const f = fixture();
    for (const reason of ['free text accusation', 'high_score', '', 'admin_hide'])
      expect(
        await f.client.submit(target, reason as NameReportReason, new AbortController().signal),
      ).toEqual({ ok: false, problem: 'invalid' });
    expect(await f.client.submit('not-a-public-id', 'spam', new AbortController().signal)).toEqual({
      ok: false,
      problem: 'invalid',
    });
    expect(
      await f.client.submit(
        { publicId: target, email: 'private@example.invalid' } as unknown as string,
        'spam',
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, problem: 'invalid' });
    expect(f.withAccountRequest).not.toHaveBeenCalled();
  });
  it('maps only fixed safe errors and never forwards HTTP or network secrets', async () => {
    for (const [status, problem] of [
      [429, 'rate_limited'],
      [401, 'account_required'],
      [400, 'invalid'],
      [409, 'unavailable'],
      [503, 'unavailable'],
    ] as const) {
      const f = fixture(() =>
        Promise.resolve(
          new Response('{"private":"email@example.invalid Bearer SECRET"}', { status }),
        ),
      );
      expect(await f.client.submit(target, 'spam', new AbortController().signal)).toEqual({
        ok: false,
        problem,
      });
    }
    const f = fixture(() => Promise.reject(new Error('APPROVED-ACCESS-SECRET')));
    expect(await f.client.submit(target, 'spam', new AbortController().signal)).toEqual({
      ok: false,
      problem: 'unavailable',
    });
  });
  it('rejects malformed, oversized or non-accepted success bodies', async () => {
    for (const body of [
      '{invalid',
      '{"status":"hidden"}',
      JSON.stringify({ status: 'accepted', padding: 'x'.repeat(4096) }),
    ]) {
      const f = fixture(() => Promise.resolve(new Response(body)));
      expect(await f.client.submit(target, 'spam', new AbortController().signal)).toEqual({
        ok: false,
        problem: 'unavailable',
      });
    }
  });
  it('discards account-cancelled or caller-cancelled responses and never starts an already aborted request', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"status":"accepted"}')),
    );
    const f = fixture(fetcher);
    const caller = new AbortController();
    caller.abort();
    expect(await f.client.submit(target, 'spam', caller.signal)).toEqual({
      ok: false,
      problem: 'unavailable',
    });
    expect(f.withAccountRequest).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    const cancelled = fixture(() => {
      cancelled.controller.abort();
      return Promise.resolve(new Response('{"status":"accepted"}'));
    });
    expect(await cancelled.client.submit(target, 'spam', new AbortController().signal)).toEqual({
      ok: false,
      problem: 'unavailable',
    });
    const stale = fixture();
    stale.rejectAccount();
    expect(await stale.client.submit(target, 'spam', new AbortController().signal)).toEqual({
      ok: false,
      problem: 'unavailable',
    });
  });
  it('renders no guest report affordance and labels an approved action with an escaped public pseudonym', () => {
    expect(
      renderToStaticMarkup(
        createElement(NameReportButton, {
          client: null,
          targetPublicId: target,
          username: 'player_two',
        }),
      ),
    ).toBe('');
    const f = fixture();
    const html = renderToStaticMarkup(
      createElement(NameReportButton, {
        client: f.client,
        targetPublicId: target,
        username: '<player_two>',
      }),
    );
    expect(html).toContain('Report &lt;player_two&gt;');
    expect(html).toContain('type="button"');
    expect(html).not.toMatch(/<input|<textarea|<dialog|email|birthdate|actorReference/);
    expect(f.withAccountRequest).not.toHaveBeenCalled();
    f.replaceAccount(false);
    expect(
      renderToStaticMarkup(
        createElement(NameReportButton, {
          client: f.client,
          targetPublicId: target,
          username: 'player_two',
        }),
      ),
    ).toBe('');
  });
  it('changes opaque scope synchronously and rejects a late A-account response after the same client switches to B', async () => {
    let resolve!: (response: Response) => void;
    const f = fixture(
      () =>
        new Promise<Response>((complete) => {
          resolve = complete;
        }),
    );
    const observer = vi.fn();
    const unsubscribe = f.client.subscribeAccountScope(observer);
    const scopeA = f.client.accountScope();
    const pending = f.client.submit(target, 'spam', new AbortController().signal);
    f.replaceAccount();
    expect(f.client.accountScope()).not.toBe(scopeA);
    expect(observer).toHaveBeenCalledOnce();
    resolve(new Response('{"status":"accepted"}'));
    expect(await pending).toEqual({ ok: false, problem: 'unavailable' });
    unsubscribe();
    f.replaceAccount(false);
    expect(observer).toHaveBeenCalledOnce();
    expect(await f.client.submit(target, 'spam', new AbortController().signal)).toEqual({
      ok: false,
      problem: 'account_required',
    });
  });
});
