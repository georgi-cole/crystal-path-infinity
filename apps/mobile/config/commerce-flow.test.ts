import { describe, expect, it, vi } from 'vitest';
import { CommerceFlow } from '../src/commerce/commerce-flow';
import type {
  CommerceGateway,
  CommerceWallet,
  NativeBillingAdapter,
  PurchaseProof,
} from '../src/commerce/commerce-types';
const token = 'ba000000-0000-4000-8000-000000000001';
const product = {
  key: 'credits.3',
  sku: 'com.example.credits3',
  consumable: true,
  displayPrice: '$0.99',
};
const initial: CommerceWallet = {
  revision: 0,
  accountToken: token,
  sp: 0,
  credits: 0,
  hints: 0,
  owned: ['obsidian'],
  equipped: 'obsidian',
};
const proof: PurchaseProof = {
  platform: 'android',
  sku: product.sku,
  transactionId: 'order1',
  purchaseToken: 'private-provider-token',
  accountToken: token,
};
function fixture() {
  let scope: object | null = {},
    listener = () => {};
  const native: NativeBillingAdapter = {
    available: true,
    platform: 'android',
    prices: vi.fn(() => Promise.resolve([product])),
    purchase: vi.fn(() => Promise.resolve({ status: 'purchased' as const, proof })),
    recover: vi.fn(() => Promise.resolve([proof])),
    finish: vi.fn(() => Promise.resolve()),
  };
  const gateway: CommerceGateway = {
    accountScope: () => scope,
    subscribeAccountScope: (observer) => {
      listener = observer;
      return () => {};
    },
    catalog: vi.fn(() => Promise.resolve([product])),
    wallet: vi.fn(() => Promise.resolve(initial)),
    begin: vi.fn(() => Promise.resolve({ accountToken: token, sku: product.sku })),
    verify: vi.fn(() =>
      Promise.resolve({
        status: 'granted' as const,
        transactionId: proof.transactionId,
        consumable: true,
        wallet: { ...initial, revision: 1, credits: 3 },
      }),
    ),
    equip: vi.fn(() => Promise.resolve(initial)),
  };
  const flow = new CommerceFlow(gateway, native);
  return {
    flow,
    gateway,
    native,
    changeAccount: (next: object | null) => {
      scope = next;
      listener();
    },
  };
}
describe('real purchase delivery and recovery ownership', () => {
  it('restores a verified purchase even when a platform price is unavailable', async () => {
    const f = fixture();
    vi.mocked(f.native.prices).mockRejectedValueOnce(new Error('product temporarily unavailable'));
    await f.flow.load();
    expect(f.flow.snapshot()).toMatchObject({
      phase: 'error',
      products: [],
      wallet: { credits: 0 },
    });
    await f.flow.recover();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'ready', wallet: { credits: 3 } });
    expect(f.native.finish).toHaveBeenCalledWith(proof, true);
  });
  it('refuses a stale product mapping before opening checkout', async () => {
    const f = fixture();
    await f.flow.load();
    vi.mocked(f.gateway.begin).mockResolvedValueOnce({ accountToken: token, sku: 'new.product' });
    await f.flow.buy(product.key);
    expect(f.native.purchase).not.toHaveBeenCalled();
    expect(f.flow.snapshot().phase).toBe('error');
  });
  it('grants nothing from a native success and finishes only after durable server delivery', async () => {
    const f = fixture();
    await f.flow.load();
    let resolve!: (value: Awaited<ReturnType<CommerceGateway['verify']>>) => void;
    vi.mocked(f.gateway.verify).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const buying = f.flow.buy(product.key);
    await vi.waitFor(() => expect(f.gateway.verify).toHaveBeenCalledOnce());
    expect(f.flow.snapshot().wallet?.credits).toBe(0);
    expect(f.native.finish).not.toHaveBeenCalled();
    resolve({
      status: 'granted',
      transactionId: proof.transactionId,
      consumable: true,
      wallet: { ...initial, revision: 1, credits: 3 },
    });
    await buying;
    expect(f.flow.snapshot().wallet?.credits).toBe(3);
    expect(f.native.finish).toHaveBeenCalledWith(proof, true);
  });
  it('recovers a lost finish without locally duplicating the grant', async () => {
    const f = fixture();
    await f.flow.load();
    vi.mocked(f.native.finish).mockRejectedValueOnce(new Error('connection lost'));
    await f.flow.buy(product.key);
    expect(f.flow.snapshot()).toMatchObject({ phase: 'error', wallet: { credits: 3 } });
    await f.flow.recover();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'ready', wallet: { credits: 3 } });
    expect(f.gateway.verify).toHaveBeenCalledTimes(2);
  });
  it('clears A immediately on logout and never gives its late checkout to B', async () => {
    const f = fixture();
    await f.flow.load();
    let resolve!: (value: Awaited<ReturnType<NativeBillingAdapter['purchase']>>) => void;
    vi.mocked(f.native.purchase).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const buying = f.flow.buy(product.key);
    await vi.waitFor(() => expect(f.native.purchase).toHaveBeenCalledOnce());
    f.changeAccount(null);
    expect(f.flow.snapshot().wallet).toBeNull();
    f.changeAccount({});
    await f.flow.buy(product.key);
    expect(f.native.purchase).toHaveBeenCalledOnce();
    resolve({ status: 'purchased', proof });
    await buying;
    expect(f.gateway.verify).not.toHaveBeenCalled();
    expect(f.native.finish).not.toHaveBeenCalled();
    expect(f.flow.snapshot().wallet).toBeNull();
  });
  it('keeps pending receipts unfinished, treats cancellation calmly, and rejects mismatched grants', async () => {
    const f = fixture();
    await f.flow.load();
    vi.mocked(f.native.purchase).mockResolvedValueOnce({ status: 'cancelled' });
    await f.flow.buy(product.key);
    expect(f.flow.snapshot().phase).toBe('ready');
    vi.mocked(f.gateway.verify).mockResolvedValueOnce({ status: 'pending' });
    await f.flow.buy(product.key);
    expect(f.flow.snapshot().phase).toBe('pending');
    expect(f.native.finish).not.toHaveBeenCalled();
    vi.mocked(f.gateway.verify).mockResolvedValueOnce({
      status: 'granted',
      transactionId: 'another-order',
      consumable: true,
      wallet: { ...initial, credits: 3 },
    });
    await f.flow.recover();
    expect(f.flow.snapshot().phase).toBe('error');
    expect(f.flow.snapshot().wallet?.credits).toBe(0);
  });
});
