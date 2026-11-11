import catalog from './adventure-catalog.json';

/** Launch references only. Real checkout must use the store's localized price. */
export function adventurePrice(offerId: string): string {
  const product = catalog.products.find((entry) => entry.offerId === offerId);
  if (!product) throw new Error(`Unknown adventure offer: ${offerId}`);
  return `€${product.referenceEur.toFixed(2)}`;
}
