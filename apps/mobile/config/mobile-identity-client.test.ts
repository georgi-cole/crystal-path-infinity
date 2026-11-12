import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSessionOwner } from '../src/account/session-owner';
const { openProduction } = vi.hoisted(() => ({ openProduction: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
  registerPlugin: () => ({ openProduction }),
}));
import { createMobileIdentityClient } from '../src/account/mobile-identity-client';
const base = 'https://crystalpath-api.kolequant.xyz/cpi';
const state = 's'.repeat(43),
  flowToken = 'f'.repeat(43),
  permit = 'p'.repeat(43),
  ticket = 't'.repeat(43);
const url =
  'https://accounts.google.com/o/oauth2/v2/auth?state=' +
  state +
  '&redirect_uri=' +
  encodeURIComponent(base + '/identity/mobile/callback');
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  openProduction.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe('mobile provider handoff', () => {
  it('recovers a failed OS return only through the server-bound provider proof', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ status: 'ready', url, state, flowToken }))
      .mockResolvedValueOnce(Response.json({ status: 'verified', verifiedTicket: ticket }));
    openProduction.mockRejectedValueOnce(new Error('OS return failed'));
    const client = createMobileIdentityClient(base, {} as AccountSessionOwner)!;
    expect(await client.signIn('google', new AbortController().signal, permit)).toMatchObject({
      status: 'verified',
      ticket,
    });
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({
      flowToken,
      eligibilityPermit: permit,
    });
  });
  it('cannot recover an OS failure without a server proof or after cancellation', async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ status: 'ready', url, state, flowToken }))
      .mockResolvedValueOnce(Response.json({ code: 'expired' }, { status: 410 }));
    openProduction.mockRejectedValueOnce(new Error('OS return failed'));
    const client = createMobileIdentityClient(base, {} as AccountSessionOwner)!;
    await expect(
      client.signIn('google', new AbortController().signal, permit),
    ).rejects.toMatchObject({ kind: 'expired' });
    fetcher.mockReset();
    fetcher.mockResolvedValueOnce(Response.json({ status: 'ready', url, state, flowToken }));
    const controller = new AbortController();
    openProduction.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new Error('cancelled'));
    });
    await expect(client.signIn('google', controller.signal, permit)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps sandbox sign-in on its explicitly enabled staging callback', async () => {
    const staging = 'https://crystal-path-staging-api.kolequant.workers.dev/cpi';
    expect(createMobileIdentityClient(staging, {} as AccountSessionOwner)).toBeNull();
    const stagingUrl = url.replace(
      encodeURIComponent(base + '/identity/mobile/callback'),
      encodeURIComponent(staging + '/identity/mobile/callback'),
    );
    fetcher
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ready', url: stagingUrl, state, flowToken })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'verified', verifiedTicket: ticket })),
      );
    openProduction.mockResolvedValue({ status: 'returned' });
    await createMobileIdentityClient(staging, {} as AccountSessionOwner, {
      allowStaging: true,
    })!.signIn('google', new AbortController().signal, permit);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      staging + '/identity/mobile/begin',
      staging + '/identity/mobile/complete',
    ]);
    expect(openProduction).toHaveBeenCalledWith({ url: stagingUrl, state });
  });
  it('rejects a production callback in a sandbox flow before opening a provider', async () => {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ready', url, state, flowToken })),
    );
    await expect(
      createMobileIdentityClient(
        'https://crystal-path-staging-api.kolequant.workers.dev/cpi',
        {} as AccountSessionOwner,
        { allowStaging: true },
      )!.signIn('google', new AbortController().signal, permit),
    ).rejects.toThrow();
    expect(openProduction).not.toHaveBeenCalled();
  });
  it('claims the result with the app-held token and permit, then returns the session ticket', async () => {
    fetcher
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ready', url, state, flowToken })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'verified', verifiedTicket: ticket, offerProfile: true }),
        ),
      );
    openProduction.mockResolvedValue({ status: 'returned' });
    const client = createMobileIdentityClient(base, {} as AccountSessionOwner)!;
    expect(client.requiresEligibility).toBe(true);
    expect(await client.signIn('google', new AbortController().signal, permit)).toEqual({
      status: 'verified',
      ticket,
      offerProfile: true,
    });
    expect(openProduction).toHaveBeenCalledWith({ url, state });
    const sent = fetcher.mock.calls.at(1)?.[1]?.body;
    if (typeof sent !== 'string') throw new Error('JSON request expected');
    expect(JSON.parse(sent)).toEqual({
      flowToken,
      eligibilityPermit: permit,
    });
    expect(url).not.toContain(flowToken);
  });
  it('does not claim or create an account when the player cancels', async () => {
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ready', url, state, flowToken })),
    );
    openProduction.mockResolvedValue({ status: 'cancelled' });
    expect(
      await createMobileIdentityClient(base, {} as AccountSessionOwner)!.signIn(
        'google',
        new AbortController().signal,
        permit,
      ),
    ).toEqual({ status: 'cancelled' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects another environment or an unexpected provider destination', async () => {
    expect(createMobileIdentityClient('https://example.com', {} as AccountSessionOwner)).toBeNull();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'ready', url: 'https://example.com/signin', state, flowToken }),
      ),
    );
    await expect(
      createMobileIdentityClient(base, {} as AccountSessionOwner)!.signIn(
        'google',
        new AbortController().signal,
        permit,
      ),
    ).rejects.toThrow();
    expect(openProduction).not.toHaveBeenCalled();
  });
});
