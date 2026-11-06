import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createTestStore } from '../src/test-store';
import { STORE_PRODUCTS } from '../src/store-catalog';
import { WorldShowcase } from '../src/world-experience';

describe('current store presentation and returning to Obsidian', () => {
  it('keeps the purchased world after returning to free Obsidian and uses approved prices', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    const store = createTestStore(storage);
    store.beginPurchase('test.theme.jelly', 'theme');
    store.completePurchase('theme');
    store.equip('jelly');
    expect(store.snapshot().equipped).toBe('jelly');
    store.equip('obsidian');
    expect(createTestStore(storage).snapshot().equipped).toBe('obsidian');
    expect(store.snapshot().owned).toContain('jelly');
    const worlds = STORE_PRODUCTS.filter((p) => p.kind === 'theme');
    expect(worlds).toHaveLength(6);
    expect(worlds.every((p) => p.price === 2.99)).toBe(true);
  });
  it('previews the companion portrait without starting a playable run or auditioning music', () => {
    const html = renderToStaticMarkup(createElement(WorldShowcase, { theme: 'jelly' }));
    expect(html).toContain('cpi-showcase-companion');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('cpi-bridge-pane');
    expect(html).not.toContain('<audio');
  });
});
