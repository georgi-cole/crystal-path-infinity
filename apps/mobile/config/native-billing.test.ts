import { describe, expect, it, vi } from 'vitest';
import type { NativePurchases } from '@capgo/native-purchases';
import { createNativeBillingAdapter } from '../src/commerce/native-billing';
const token = 'ba000000-0000-4000-8000-000000000001';
const product = { key: 'theme.chaos', sku: 'com.example.chaos', consumable: false };
const transaction = {
  transactionId: 'order1',
  productIdentifier: product.sku,
  appAccountToken: token.toUpperCase(),
  jwsRepresentation: 'signed-jws',
  purchaseState: '1',
  purchaseToken: 'receipt-token',
};
function fixture(platform: 'android' | 'ios') {
  const sdk = {
    configure: vi.fn(() => Promise.resolve()),
    isBillingSupported: vi.fn(() => Promise.resolve({ isBillingSupported: true })),
    getProducts: vi.fn(() =>
      Promise.resolve({
        products: [{ identifier: product.sku, priceString: '2,99 €' }],
      }),
    ),
    purchaseProduct: vi.fn(() => Promise.resolve(transaction)),
    getPurchases: vi.fn(() => Promise.resolve({ purchases: [transaction] })),
    getUnfinishedTransactions: vi.fn(() => Promise.resolve({ transactions: [transaction] })),
    finishTransaction: vi.fn(() => Promise.resolve()),
    acknowledgePurchase: vi.fn(() => Promise.resolve()),
    consumePurchase: vi.fn(() => Promise.resolve()),
  };
  const adapter = createNativeBillingAdapter({
    platform,
    available: true,
    sdk: sdk as unknown as typeof NativePurchases,
  });
  return { sdk, adapter };
}
describe('platform checkout adapter', () => {
  it('restores a server-acknowledged world without acknowledging twice, while still consuming resources', async () => {
    const f = fixture('android'),
      acknowledged = { ...transaction, isAcknowledged: true };
    f.sdk.getPurchases.mockResolvedValue({ purchases: [acknowledged] });
    f.sdk.getUnfinishedTransactions.mockResolvedValue({ transactions: [] });
    const receipts = await f.adapter.recover(token);
    await f.adapter.finish(receipts[0], false);
    expect(f.sdk.acknowledgePurchase).not.toHaveBeenCalled();
    await f.adapter.finish(receipts[0], true);
    expect(f.sdk.consumePurchase).toHaveBeenCalledOnce();
  });
  it('uses localized prices, handles iOS uppercase UUIDs, and never auto-finishes', async () => {
    const { sdk, adapter } = fixture('ios');
    expect((await adapter.prices([product]))[0].displayPrice).toBe('2,99 €');
    expect(await adapter.purchase(product, token)).toMatchObject({
      status: 'purchased',
      proof: { accountToken: token },
    });
    expect(sdk.configure).toHaveBeenCalledWith({ autoFinishTransactions: false });
    expect(sdk.purchaseProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        isConsumable: false,
        autoAcknowledgePurchases: false,
        quantity: 1,
      }),
    );
    expect(sdk.finishTransaction).not.toHaveBeenCalled();
    expect(await adapter.recover(token)).toHaveLength(1);
    expect(sdk.getPurchases).toHaveBeenCalledWith(
      expect.objectContaining({ appAccountToken: token.toUpperCase() }),
    );
  });
  it('does not finish pending, cancelled or foreign-account purchases', async () => {
    const { sdk, adapter } = fixture('android');
    sdk.purchaseProduct.mockRejectedValueOnce({ code: 'USER_CANCELED' });
    expect(await adapter.purchase(product, token)).toEqual({ status: 'cancelled' });
    sdk.purchaseProduct.mockResolvedValueOnce({ ...transaction, purchaseState: '2' });
    expect(await adapter.purchase(product, token)).toEqual({ status: 'pending' });
    sdk.purchaseProduct.mockResolvedValueOnce({ ...transaction, appAccountToken: 'another-user' });
    await expect(adapter.purchase(product, token)).rejects.toThrow();
    expect(sdk.consumePurchase).not.toHaveBeenCalled();
    expect(sdk.acknowledgePurchase).not.toHaveBeenCalled();
  });
  it('uses consume for Android resources, acknowledge for worlds and finish for iOS only on explicit delivery', async () => {
    const f = fixture('android');
    const outcome = await f.adapter.purchase(product, token);
    if (outcome.status !== 'purchased') throw new Error('fixture');
    await f.adapter.finish(outcome.proof, true);
    expect(f.sdk.consumePurchase).toHaveBeenCalledOnce();
    await f.adapter.finish(outcome.proof, false);
    expect(f.sdk.acknowledgePurchase).toHaveBeenCalledOnce();
    expect(f.sdk.finishTransaction).not.toHaveBeenCalled();
  });
});
