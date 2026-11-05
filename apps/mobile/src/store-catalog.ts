import type { MessageKey } from './i18n/messages';

export type ThemeId = 'obsidian' | 'chaos' | 'jelly';
export const THEME_IDS: readonly ThemeId[] = ['obsidian', 'chaos', 'jelly'];
export const THEMES = {
  obsidian: {
    title: 'Obsidian',
    colors: ['#fa589c', '#62dfed', '#79e3af'],
    glass: '#c7dae0',
    tempo: 0,
  },
  chaos: {
    title: 'Chaos Workshop',
    colors: ['#ffbd63', '#67f3ce', '#ff9266'],
    glass: '#ffe1b2',
    tempo: 112,
  },
  jelly: {
    title: 'Jellyverse',
    colors: ['#ed9efc', '#83dfff', '#b3a2ff'],
    glass: '#e9c9ff',
    tempo: 92,
  },
} as const;

export interface StoreProduct {
  readonly id: string;
  readonly kind: 'credit' | 'sp' | 'hints' | 'theme';
  readonly quantity: number;
  readonly name: MessageKey;
  readonly price: number;
  readonly theme?: Exclude<ThemeId, 'obsidian'>;
}

/** Reference prices for the simulator, never a billing quote or a live product identifier. */
export const STORE_PRODUCTS: readonly StoreProduct[] = [
  { id: 'test.credits.3', kind: 'credit', quantity: 3, name: 'vault.breath', price: 0.99 },
  { id: 'test.credits.10', kind: 'credit', quantity: 10, name: 'vault.notToday', price: 2.49 },
  { id: 'test.credits.25', kind: 'credit', quantity: 25, name: 'vault.stillHere', price: 4.99 },
  ...([100, 500, 1000, 2500, 5000, 10000] as const).map((quantity, i) => ({
    id: 'test.sp.' + quantity,
    kind: 'sp' as const,
    quantity,
    name: (
      [
        'vault.pocket',
        'vault.wind',
        'vault.cache',
        'vault.deep',
        'vault.crystalVault',
        'vault.infinity',
      ] as const
    )[i],
    price: [0.49, 1.49, 2.49, 4.99, 8.99, 14.99][i],
  })),
  { id: 'test.hints.3', kind: 'hints', quantity: 3, name: 'vault.foresight', price: 0.99 },
  { id: 'test.hints.10', kind: 'hints', quantity: 10, name: 'vault.clearer', price: 2.49 },
  {
    id: 'test.theme.chaos',
    kind: 'theme',
    quantity: 1,
    theme: 'chaos',
    name: 'vault.chaos',
    price: 4.99,
  },
  {
    id: 'test.theme.jelly',
    kind: 'theme',
    quantity: 1,
    theme: 'jelly',
    name: 'vault.jelly',
    price: 4.99,
  },
];
export const STORE_PAYMENT_MODE = 'test' as const;
export const STORE_KEY = 'cpi.store.test.v1';
export function storeProduct(id: string): StoreProduct {
  const product = STORE_PRODUCTS.find((item) => item.id === id);
  if (!product) throw new Error('Unknown test product.');
  return product;
}
