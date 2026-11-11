import adventure from '../adventure-catalog.json';
import { STORE_PRODUCTS } from '../store-catalog';

const prefix = 'com.georgicole.crystalpath.infinity.';
export const ADVENTURE_COMMERCE_PRODUCTS = adventure.products.map((product) => ({
  offerId: product.offerId,
  key: product.productId.slice(prefix.length),
  consumable: product.type === 'consumable',
}));
export const COMMERCE_PRODUCTS = new Map([
  ...STORE_PRODUCTS.map(
    (product) =>
      [product.id.replace(/^test\./, ''), { consumable: product.kind !== 'theme' }] as const,
  ),
  ...ADVENTURE_COMMERCE_PRODUCTS.map(
    (product) => [product.key, { consumable: product.consumable }] as const,
  ),
]);
export const ADVENTURE_COMMERCE_UNLOCKS = ADVENTURE_COMMERCE_PRODUCTS.filter(
  (p) => !p.consumable,
).map((p) => p.key);

export function commerceKeyForOffer(offerId: string) {
  return ADVENTURE_COMMERCE_PRODUCTS.find((p) => p.offerId === offerId)?.key ?? null;
}
