import { describe, expect, it, vi } from 'vitest';
import { CommerceFlow } from '../src/commerce/commerce-flow';
import type {
  CommerceGateway,
  CommerceWallet,
  NativeBillingAdapter,
  PurchaseProof,
} from '../src/commerce/commerce-types';
import { EMPTY_CAMPAIGN_PROGRESS } from '../src/campaign-test';
import { receiveOfflineSupplies, offlineSupplyCapacity } from '../src/commerce/campaign-inventory';
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
  shields: 0,
  seasonChanges: 0,
  unlocks: [],
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
function fixture(pending = false) {
  let scope: object | null = {},
    listener = () => {};
  const native: NativeBillingAdapter = {
    available: true,
    platform: 'android',
    prices: vi.fn(() => Promise.resolve([product])),
    purchase: vi.fn(() => Promise.resolve({ status: 'purchased' as const, proof })),
    recover: vi.fn(() => Promise.resolve(pending ? [proof] : [])),
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
  it('does not deliver an old account transfer after the account changes during recovery', async () => {
    const f = fixture();
    await f.flow.load();
    const allocation = {
      operationId: 'bb000000-0000-4000-8000-000000000001',
      sp: 0,
      hints: 10,
      credits: 0,
      shields: 0,
      seasonChanges: 0,
    };
    let resolve!: (value: { allocations: (typeof allocation)[]; wallet: CommerceWallet }) => void;
    const offline = {
      pending: vi.fn(
        () =>
          new Promise<{ allocations: (typeof allocation)[]; wallet: CommerceWallet }>((done) => {
            resolve = done;
          }),
      ),
      allocate: vi.fn(() => Promise.reject(new Error('unused'))),
      acknowledge: vi.fn(() => Promise.resolve()),
    };
    Object.assign(f.gateway, { offlineSupplies: offline });
    const receive = vi.fn();
    const pending = f.flow.transferOfflineSupplies({
      capacity: () => ({ sp: 0, hints: 0, credits: 0, shields: 0, seasonChanges: 0 }),
      receive,
      acknowledged: () => {},
    });
    await vi.waitFor(() => expect(offline.pending).toHaveBeenCalledOnce());
    f.changeAccount(null);
    resolve({ allocations: [allocation], wallet: initial });
    await pending;
    expect(receive).not.toHaveBeenCalled();
    expect(offline.acknowledge).not.toHaveBeenCalled();
    expect(f.flow.snapshot().wallet).toBeNull();
  });
  it('recovers a lost allocation acknowledgement without adding supplies twice', async () => {
    const f = fixture();
    await f.flow.load();
    const allocation = {
      operationId: 'bb000000-0000-4000-8000-000000000001',
      sp: 0,
      hints: 10,
      credits: 0,
      shields: 0,
      seasonChanges: 0,
    };
    const acknowledge = vi.fn(() => Promise.resolve());
    acknowledge.mockRejectedValueOnce(new Error('connection lost'));
    const offline = {
      pending: vi.fn(() =>
        Promise.resolve({ allocations: [allocation], wallet: { ...initial, revision: 1 } }),
      ),
      allocate: vi.fn(() => Promise.reject(new Error('no new transfer'))),
      acknowledge,
    };
    Object.assign(f.gateway, { offlineSupplies: offline });
    let progress = EMPTY_CAMPAIGN_PROGRESS;
    const receive = vi.fn((grant: typeof allocation) => {
      progress = receiveOfflineSupplies(progress, grant);
    });
    const receiver = {
      capacity: (wallet: CommerceWallet) => offlineSupplyCapacity(progress, wallet),
      receive,
      acknowledged: (id: string) => {
        progress = {
          ...progress,
          supplyAllocations: progress.supplyAllocations?.filter((value) => value !== id),
        };
      },
    };
    await f.flow.transferOfflineSupplies(receiver);
    expect(f.flow.snapshot().phase).toBe('error');
    expect(progress.reserveHints).toBe(10);
    await f.flow.transferOfflineSupplies(receiver);
    expect(f.flow.snapshot().phase).toBe('ready');
    expect(progress.reserveHints).toBe(10);
    expect(progress.supplyAllocations).toEqual([]);
    expect(offline.allocate).not.toHaveBeenCalled();
  });
  it('does not acknowledge a transfer that the local inventory could not save', async () => {
    const f = fixture();
    await f.flow.load();
    const allocation = {
      operationId: 'bb000000-0000-4000-8000-000000000001',
      sp: 0,
      hints: 10,
      credits: 0,
      shields: 0,
      seasonChanges: 0,
    };
    const offline = {
      pending: vi.fn(() => Promise.resolve({ allocations: [allocation], wallet: initial })),
      allocate: vi.fn(() => Promise.reject(new Error('unused'))),
      acknowledge: vi.fn(() => Promise.resolve()),
    };
    Object.assign(f.gateway, { offlineSupplies: offline });
    await f.flow.transferOfflineSupplies({
      capacity: () => ({ sp: 0, hints: 0, credits: 0, shields: 0, seasonChanges: 0 }),
      receive: () => {
        throw new Error('Storage full');
      },
      acknowledged: () => {},
    });
    expect(offline.acknowledge).not.toHaveBeenCalled();
    expect(f.flow.snapshot().phase).toBe('error');
  });
  it('restores a verified purchase even when a platform price is unavailable', async () => {
    const f = fixture(true);
    vi.mocked(f.native.prices).mockRejectedValueOnce(new Error('product temporarily unavailable'));
    await f.flow.load();
    expect(f.flow.snapshot()).toMatchObject({
      phase: 'error',
      products: [],
      wallet: { credits: 3 },
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
    vi.mocked(f.native.recover).mockResolvedValue([proof]);
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
    vi.mocked(f.native.recover).mockResolvedValue([proof]);
    await f.flow.recover();
    expect(f.flow.snapshot().phase).toBe('error');
    expect(f.flow.snapshot().wallet?.credits).toBe(0);
  });
});
