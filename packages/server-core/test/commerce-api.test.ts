import { describe, expect, it, vi } from 'vitest';
import { createCommerceHandler } from '../src/commerce-api.ts';
import type { CommerceWallet, createCommerceService } from '../src/commerce-service.ts';
import { createMvpServer } from '../src/server-app.ts';
const user = 'fa000000-0000-4000-8000-000000000001';
function fixture(
  allowed = true,
  checkoutReady: (platform: 'android' | 'ios', reviewWallet?: boolean) => Promise<boolean> = vi.fn(
    () => Promise.resolve(true),
  ),
) {
  const service = {
    reviewWalletsEnabled: false,
    allocate: vi.fn(() => Promise.reject(new Error('private-allocation-error'))),
    pendingAllocations: vi.fn(() => Promise.reject(new Error('private-allocation-error'))),
    acknowledgeAllocation: vi.fn(() => Promise.reject(new Error('private-allocation-error'))),
    catalog: vi.fn<ReturnType<typeof createCommerceService>['catalog']>(() => []),
    wallet: vi.fn<ReturnType<typeof createCommerceService>['wallet']>(() =>
      Promise.reject(new Error('private-db-credential')),
    ),
    begin: vi.fn(() => Promise.resolve({ accountToken: user, sku: 'com.example.credits3' })),
    verify: vi.fn(() => Promise.resolve({ status: 'pending' as const })),
    equip: vi.fn(() => Promise.reject(new Error('private-provider-receipt'))),
  };
  const handler = createCommerceHandler({
    basePath: '/cpi',
    checkoutReady,
    service,
    authenticate: (token) =>
      Promise.resolve(
        token === 'valid-account-token-012345'
          ? { subject: user, purchasesAllowed: allowed, platform: 'android' as const }
          : null,
      ),
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    rateLimit: () => Promise.resolve(true),
  });
  const server = createMvpServer({ basePath: '/cpi', handlers: { commerce: handler } });
  const request = (
    route: string,
    payload: object = { schemaVersion: 1, platform: 'android' },
    token = 'valid-account-token-012345',
    accept = 'application/json',
  ) =>
    server(
      new Request('https://api.example.invalid/cpi/commerce/' + route, {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          accept,
          'content-type': 'application/json',
          authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
      }),
    );
  return { service, request };
}
describe('authenticated commerce routes', () => {
  it('projects the expanded catalog and wallet according to the app version', async () => {
    const f = fixture();
    const owned: CommerceWallet = {
      revision: 5,
      accountToken: user,
      sp: 90,
      hints: 2,
      credits: 1,
      shields: 0,
      seasonChanges: 0,
      unlocks: [],
      owned: ['obsidian', 'puppy', 'moonpatch', 'candy'],
      equipped: 'candy',
    };
    const products = [
      { key: 'theme.puppy', sku: 'com.example.puppy', consumable: false },
      { key: 'theme.candy', sku: 'com.example.candy', consumable: false },
    ];
    f.service.wallet.mockResolvedValue(owned);
    f.service.catalog.mockReturnValue(products);
    expect(await (await f.request('wallet')).json()).toEqual({
      schemaVersion: 1,
      wallet: { ...owned, owned: ['obsidian', 'puppy'], equipped: 'obsidian' },
    });
    expect(await (await f.request('catalog')).json()).toMatchObject({ products: [products[0]] });
    const body = { schemaVersion: 1, platform: 'android' };
    const v2 = (route: string, payload = body) =>
      f.request(
        route,
        payload,
        'valid-account-token-012345',
        'application/json; cpi-world-catalog=2',
      );
    expect(await (await v2('wallet')).json()).toEqual({ schemaVersion: 1, wallet: owned });
    expect(await (await v2('catalog')).json()).toMatchObject({ products });
    const purchase = { ...body, key: 'theme.candy' };
    expect((await f.request('begin', purchase)).status).toBe(400);
    expect(f.service.begin).not.toHaveBeenCalled();
    expect((await v2('begin', purchase)).status).toBe(200);
    expect(f.service.begin).toHaveBeenCalledWith(user, 'android', purchase.key, undefined);
  });
  it('checks review reconciliation independently while live checkout remains closed', async () => {
    const readiness = vi.fn((_platform: 'android' | 'ios', reviewWallet?: boolean) =>
      Promise.resolve(reviewWallet === true),
    );
    const f = fixture(true, readiness);
    f.service.reviewWalletsEnabled = true;
    expect(
      (await f.request('catalog', { schemaVersion: 1, platform: 'android', reviewWallet: true }))
        .status,
    ).toBe(200);
    expect(readiness).toHaveBeenCalledWith('android', true);
    expect(
      (await f.request('catalog', { schemaVersion: 1, platform: 'android', reviewWallet: false }))
        .status,
    ).toBe(503);
    expect((await f.request('catalog')).status).toBe(503);
  });
  it('allows only an enabled boolean review-inventory choice for the authenticated owner', async () => {
    const f = fixture();
    const body = { schemaVersion: 1, platform: 'android', key: 'credits.3', reviewWallet: true };
    expect((await f.request('begin', body)).status).toBe(400);
    f.service.reviewWalletsEnabled = true;
    expect((await f.request('begin', { ...body, reviewWallet: 'true' })).status).toBe(400);
    expect((await f.request('begin', body)).status).toBe(200);
    expect(f.service.begin).toHaveBeenCalledWith(user, 'android', 'credits.3', true);
  });
  it('uses the verified subject and never accepts a client-selected account or entitlement', async () => {
    const f = fixture();
    expect((await f.request('catalog')).status).toBe(200);
    expect(f.service.catalog).toHaveBeenCalledWith(user, 'android');
    expect(
      (
        await f.request('begin', {
          schemaVersion: 1,
          platform: 'ios',
          key: 'credits.3',
          subject: 'someone-else',
        })
      ).status,
    ).toBe(400);
    expect(f.service.begin).not.toHaveBeenCalled();
    expect((await f.request('catalog', { schemaVersion: 1, platform: 'ios' })).status).toBe(400);
    expect(f.service.catalog).not.toHaveBeenCalledWith(user, 'ios');
    expect((await fixture(false).request('catalog')).status).toBe(401);
  });
  it('blocks new checkout for the affected store and lets verified receipts be restored', async () => {
    const checkoutReady = vi.fn(() => Promise.resolve(false));
    const f = fixture(true, checkoutReady);
    expect((await f.request('catalog')).status).toBe(503);
    expect(
      (await f.request('begin', { schemaVersion: 1, platform: 'android', key: 'credits.3' }))
        .status,
    ).toBe(503);
    expect(f.service.begin).not.toHaveBeenCalled();
    expect(checkoutReady).toHaveBeenCalledWith('android', undefined);
    expect(
      (
        await f.request('verify', {
          schemaVersion: 1,
          platform: 'android',
          proof: {
            platform: 'android',
            accountToken: user,
            transactionId: 'test-order',
            purchaseToken: 'test-receipt',
            sku: 'com.example.credits3',
          },
        })
      ).status,
    ).toBe(200);
    expect(checkoutReady).toHaveBeenCalledTimes(2);
  });

  it('keeps unknown routes, credentials in queries, malformed receipts and provider details out', async () => {
    const f = fixture();
    expect((await f.request('begin?token=secret')).status).toBe(400);
    expect(
      (
        await f.request('verify', {
          schemaVersion: 1,
          platform: 'android',
          proof: { paid: true, credits: 999 },
        })
      ).status,
    ).toBe(400);
    expect(f.service.verify).not.toHaveBeenCalled();
    const result = await f.request('wallet');
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('private');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect((await f.request('invented')).status).toBe(404);
  });
});
