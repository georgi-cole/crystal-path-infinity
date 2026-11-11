import { describe, expect, it } from 'vitest';
import { GEAR_IDS } from '@crystal-path-infinity/game-core';
import catalog from '../src/adventure-catalog.json';
import { adventurePrice } from '../src/adventure-prices';
import { STYLE_OFFERS } from '../src/campaign-content';
import { EXTRA_SUPPLY_OFFERS } from '../src/campaign-test';
import { GEAR_COPY } from '../src/journey-copy';
import { STORE_PRODUCTS } from '../src/store-catalog';

describe('adventure catalog purchase contracts', () => {
  it('registers each new paid offer once, with permanent gear and repeatable packs', () => {
    const newProducts = catalog.products.filter((product) => product.newProduct);
    expect(new Set(catalog.products.map((product) => product.productId)).size).toBe(
      catalog.products.length,
    );
    expect(new Set(newProducts.map((product) => product.offerId))).toEqual(
      new Set([
        ...Object.keys(STYLE_OFFERS),
        ...Object.keys(EXTRA_SUPPLY_OFFERS),
        ...GEAR_IDS.map((gear) => `gear:${gear}`),
      ]),
    );
    for (const product of newProducts) {
      expect(product.title.length).toBeLessThanOrEqual(35);
      expect(product.description.length).toBeLessThan(55);
      expect(product.productId).toMatch(/^com\.georgicole\.crystalpath\.infinity\.[a-z0-9._]+$/);
      expect(product.type).toBe(
        product.offerId.endsWith('-pack') ? 'consumable' : 'non-consumable',
      );
      expect(product.quantity).toBe(product.type === 'consumable' ? 10 : 1);
    }
  });

  it('keeps shop surfaces aligned with catalog prices and reuses the existing hint pack', () => {
    for (const gear of GEAR_IDS) expect(GEAR_COPY[gear].price).toBe(adventurePrice(`gear:${gear}`));
    for (const [id, offer] of Object.entries(STYLE_OFFERS))
      expect(offer.price).toBe(adventurePrice(id));
    for (const [id, offer] of Object.entries(EXTRA_SUPPLY_OFFERS))
      expect(offer.price).toBe(adventurePrice(id));
    const hints = catalog.products.find((product) => product.offerId === 'hint-pack')!;
    expect(hints.newProduct).toBe(false);
    expect(STORE_PRODUCTS.find((product) => product.id === 'test.hints.10')?.price).toBe(
      hints.referenceEur,
    );
    expect(() => adventurePrice('earned-only-reward')).toThrow('Unknown adventure offer');
  });
});
