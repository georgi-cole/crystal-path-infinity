import { describe, expect, it, vi } from 'vitest';
import {
  createCommerceGateway,
  parseCommerceWallet,
  parseLiveProducts,
} from '../src/commerce/commerce-gateway';
import type { AccountSessionOwner } from '../src/account/session-owner';
const wallet = {
  revision: 1,
  sp: 0,
  hints: 0,
  credits: 3,
  shields: 0,
  seasonChanges: 0,
  unlocks: [],
  accountToken: 'ba000000-0000-4000-8000-000000000001',
  owned: ['obsidian'],
  equipped: 'obsidian',
};
const session: Pick<
  AccountSessionOwner,
  'accountScope' | 'subscribeAccountScope' | 'withAccountRequest'
> = {
  accountScope: () => scope,
  subscribeAccountScope: () => () => {},
  withAccountRequest: (operation) =>
    operation({ accessToken: 'private-access-token-012345', signal: new AbortController().signal }),
};
const scope = {};
describe('commerce wire contract', () => {
  it('recognizes registered adventure purchases and rejects incorrect consumption types or invented grants', () => {
    expect(
      parseLiveProducts([
        {
          key: 'gear.umbrella',
          sku: 'com.georgicole.crystalpath.infinity.gear.umbrella',
          consumable: false,
        },
        {
          key: 'shields.10',
          sku: 'com.georgicole.crystalpath.infinity.shields.10',
          consumable: true,
        },
      ]),
    ).toHaveLength(2);
    expect(
      parseLiveProducts([{ key: 'unlock.no_clock', sku: 'real.clock', consumable: true }]),
    ).toBeNull();
    expect(
      parseCommerceWallet({
        ...wallet,
        shields: 20,
        seasonChanges: 10,
        unlocks: ['gear.umbrella', 'unlock.no_clock'],
      }),
    ).toMatchObject({ shields: 20, seasonChanges: 10 });
    for (const invalid of [
      { ...wallet, shields: -1 },
      { ...wallet, seasonChanges: 1.5 },
      { ...wallet, unlocks: ['invented.free.everything'] },
      { ...wallet, unlocks: ['gear.umbrella', 'gear.umbrella'] },
    ])
      expect(parseCommerceWallet(invalid)).toBeNull();
  });
  it('does not accept unsafe balances, unowned worlds or test products as live entitlements', () => {
    expect(parseCommerceWallet({ ...wallet, secret: 'must-drop' })).toEqual(wallet);
    for (const bad of [
      { ...wallet, sp: Number.MAX_SAFE_INTEGER + 1 },
      { ...wallet, credits: -1 },
      { ...wallet, equipped: 'chaos' },
      { ...wallet, owned: ['obsidian', 'obsidian'] },
    ])
      expect(parseCommerceWallet(bad)).toBeNull();
    expect(
      parseLiveProducts([{ key: 'credits.3', sku: 'test.credits.3', consumable: true }]),
    ).toBeNull();
    expect(
      parseLiveProducts([{ key: 'theme.chaos', sku: 'real.world', consumable: true }]),
    ).toBeNull();
  });
  it('sends credentials in the header to a fixed own HTTPS route, never in URL or wallet body', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ schemaVersion: 1, wallet }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const gateway = createCommerceGateway({
      baseUrl: 'https://api.example.invalid/cpi/',
      platform: 'android',
      session,
      fetcher,
    })!;
    expect(await gateway.wallet(new AbortController().signal)).toEqual(wallet);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.invalid/cpi/commerce/wallet');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { authorization: 'Bearer private-access-token-012345' },
    });
    expect(options?.body).toBe(JSON.stringify({ schemaVersion: 1, platform: 'android' }));
    for (const baseUrl of [
      'http://api.example.invalid/cpi',
      'https://u:p@api.example.invalid/cpi',
      'https://api.example.invalid/auth/v1',
      'https://api.example.invalid/cpi?token=unsafe',
    ])
      expect(createCommerceGateway({ baseUrl, platform: 'android', session, fetcher })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects a granted response for another native transaction', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            status: 'granted',
            transactionId: 'different-order',
            wallet,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const gateway = createCommerceGateway({
      baseUrl: 'https://api.example.invalid/cpi',
      platform: 'android',
      session,
      fetcher,
    })!;
    await expect(
      gateway.verify(
        {
          platform: 'android',
          sku: 'com.example.credits3',
          transactionId: 'order1',
          accountToken: wallet.accountToken,
          purchaseToken: 'receipt',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
});
