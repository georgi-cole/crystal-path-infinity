import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import type { Product, Transaction } from '@capgo/native-purchases';
import { CommerceUnavailable } from './commerce-types';
import type {
  BillingPlatform,
  LiveProduct,
  NativeBillingAdapter,
  PurchaseProof,
} from './commerce-types';

type PurchaseSdk = Pick<
  typeof NativePurchases,
  | 'configure'
  | 'isBillingSupported'
  | 'getProducts'
  | 'purchaseProduct'
  | 'getPurchases'
  | 'getUnfinishedTransactions'
  | 'finishTransaction'
  | 'acknowledgePurchase'
  | 'consumePurchase'
> &
  Partial<Pick<typeof NativePurchases, 'getAppTransaction'>>;
const alias = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function bounded(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

/** Receipts remain native and unfinished until the server durably grants the purchase. */
export function createNativeBillingAdapter(options: {
  platform: BillingPlatform;
  available: boolean;
  sdk?: PurchaseSdk;
}): NativeBillingAdapter {
  const sdk = options.sdk ?? NativePurchases;
  let configuring: Promise<void> | null = null;
  const acknowledged = new WeakSet<PurchaseProof>();
  async function ready() {
    if (!options.available) throw new CommerceUnavailable();
    configuring ??= sdk.configure({ autoFinishTransactions: false }).catch(() => {
      configuring = null;
      throw new CommerceUnavailable();
    });
    await configuring;
    if (!(await sdk.isBillingSupported()).isBillingSupported) throw new CommerceUnavailable();
  }
  function proof(transaction: Transaction, accountToken: string): PurchaseProof | null {
    if (
      !alias.test(accountToken) ||
      transaction.appAccountToken?.toLowerCase() !== accountToken.toLowerCase() ||
      !!transaction.revocationDate ||
      !bounded(transaction.productIdentifier, 200) ||
      !bounded(transaction.transactionId, 200)
    )
      return null;
    if (options.platform === 'android') {
      if (transaction.purchaseState !== '1' || !bounded(transaction.purchaseToken, 8192))
        return null;
      const receipt: PurchaseProof = {
        platform: 'android',
        sku: transaction.productIdentifier,
        transactionId: transaction.transactionId,
        accountToken: accountToken.toLowerCase(),
        purchaseToken: transaction.purchaseToken,
      };
      if (transaction.isAcknowledged === true) acknowledged.add(receipt);
      return receipt;
    }
    if (!bounded(transaction.jwsRepresentation, 65536)) return null;
    return {
      platform: 'ios',
      sku: transaction.productIdentifier,
      transactionId: transaction.transactionId,
      accountToken: accountToken.toLowerCase(),
      signedTransaction: transaction.jwsRepresentation,
    };
  }
  return {
    available: options.available,
    platform: options.platform,
    async reviewEnvironment() {
      if (!options.available || options.platform !== 'ios' || !sdk.getAppTransaction)
        return undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          sdk.getAppTransaction(),
          new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), 5000);
          }),
        ]);
        const environment = response?.appTransaction.environment;
        return environment === 'Sandbox' ? true : environment === 'Production' ? false : undefined;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timer);
      }
    },
    async prices(products) {
      await ready();
      const requested = new Map(products.map((product) => [product.sku, product]));
      if (requested.size !== products.length || requested.size > 50)
        throw new CommerceUnavailable();
      if (!products.length) return [];
      const response = await sdk.getProducts({
        productIdentifiers: [...requested.keys()],
        productType: PURCHASE_TYPE.INAPP,
      });
      return response.products.flatMap((product: Product) => {
        const expected = requested.get(product.identifier);
        return expected && bounded(product.priceString, 120)
          ? [{ ...expected, displayPrice: product.priceString }]
          : [];
      });
    },
    async purchase(product: LiveProduct, accountToken) {
      if (!alias.test(accountToken)) throw new CommerceUnavailable();
      await ready();
      // Manual consume is essential: consuming first would lose recovery after a network failure.
      try {
        const transaction = await sdk.purchaseProduct({
          productIdentifier: product.sku,
          productType: PURCHASE_TYPE.INAPP,
          quantity: 1,
          appAccountToken: accountToken,
          isConsumable: false,
          autoAcknowledgePurchases: false,
        });
        if (transaction.productIdentifier !== product.sku) throw new CommerceUnavailable();
        if (options.platform === 'android' && transaction.purchaseState === '2')
          return { status: 'pending' };
        const receipt = proof(transaction, accountToken);
        if (!receipt) throw new CommerceUnavailable();
        return { status: 'purchased', proof: receipt };
      } catch (error) {
        const code = (error as { code?: unknown })?.code;
        const message = (error as { message?: unknown })?.message;
        if (
          code === 'USER_CANCELED' ||
          (options.platform === 'ios' && message === 'User cancelled')
        )
          return { status: 'cancelled' };
        if (options.platform === 'ios' && message === 'Transaction pending')
          return { status: 'pending' };
        throw new CommerceUnavailable();
      }
    },
    async recover(accountToken) {
      if (!alias.test(accountToken)) throw new CommerceUnavailable();
      await ready();
      const unfinished = await sdk.getUnfinishedTransactions();
      const owned = await sdk.getPurchases({
        productType: PURCHASE_TYPE.INAPP,
        appAccountToken: options.platform === 'ios' ? accountToken.toUpperCase() : accountToken,
        ...(options.platform === 'ios' ? { onlyCurrentEntitlements: true } : {}),
      });
      const unique = new Map<string, PurchaseProof>();
      for (const transaction of [...unfinished.transactions, ...owned.purchases]) {
        const receipt = proof(transaction, accountToken);
        if (receipt) unique.set(receipt.purchaseToken ?? receipt.transactionId, receipt);
      }
      return [...unique.values()];
    },
    async finish(receipt, consumable) {
      if (receipt.platform !== options.platform) throw new CommerceUnavailable();
      await ready();
      if (options.platform === 'ios')
        await sdk.finishTransaction({ transactionId: receipt.transactionId });
      else if (!receipt.purchaseToken) throw new CommerceUnavailable();
      else if (consumable) await sdk.consumePurchase({ purchaseToken: receipt.purchaseToken });
      else if (!acknowledged.has(receipt))
        await sdk.acknowledgePurchase({ purchaseToken: receipt.purchaseToken });
    },
  };
}

export function nativeBillingAdapter(): NativeBillingAdapter | null {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return null;
  return createNativeBillingAdapter({
    platform,
    available: Capacitor.isPluginAvailable('NativePurchases'),
  });
}
