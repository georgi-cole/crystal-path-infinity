import { describe, expect, it, vi } from 'vitest';
import { createCommerceHandler } from '../src/commerce-api.ts';
import { createMvpServer } from '../src/server-app.ts';
const user = 'fa000000-0000-4000-8000-000000000001';
function fixture(allowed = true, checkoutReady = vi.fn(() => Promise.resolve(true))) {
  const service = {
    reviewWalletsEnabled: false,
    allocate: vi.fn(() => Promise.reject(new Error('private-allocation-error'))),
    pendingAllocations: vi.fn(() => Promise.reject(new Error('private-allocation-error'))),
    acknowledgeAllocation: vi.fn(() => Promise.reject(new Error('private-allocation-error'))),
    catalog: vi.fn(() => []),
    wallet: vi.fn(() => Promise.reject(new Error('private-db-credential'))),
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
  ) =>
    server(
      new Request('https://api.example.invalid/cpi/commerce/' + route, {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          'content-type': 'application/json',
          authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
      }),
    );
  return { service, request };
}
describe('authenticated commerce routes', () => {
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
    expect(checkoutReady).toHaveBeenCalledWith('android');
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
