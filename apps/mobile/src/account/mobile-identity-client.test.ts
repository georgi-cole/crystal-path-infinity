import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSessionOwner } from './session-owner';
const { openProduction } = vi.hoisted(() => ({ openProduction: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
  registerPlugin: () => ({ openProduction }),
}));
import { createMobileIdentityClient } from './mobile-identity-client';
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
