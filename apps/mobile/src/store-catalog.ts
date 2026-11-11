import type { MessageKey } from './i18n/messages';

export type ThemeId = 'obsidian' | 'chaos' | 'jelly' | 'wilds' | 'league' | 'puppy' | 'kitten';
export type WorldId = Exclude<ThemeId, 'obsidian'>;
export const THEME_IDS: readonly ThemeId[] = [
  'obsidian',
  'chaos',
  'jelly',
  'wilds',
  'league',
  'puppy',
  'kitten',
];
// The glass and its rail lights have their own material palette beside the menu accents.
export const THEMES = {
  obsidian: {
    title: 'Black Metal',
    railLights: ['#fa589c', '#62dfed', '#79e3af'],
    glass: '#c7dae0',
    surface: { highlight: '#e2edf0', shadow: '#101318', edge: '#ecfbff', frame: '#87828f' },
    tempo: 0,
  },
  chaos: {
    title: 'Boltmuffin',
    railLights: ['#efae6a', '#8cd1c1', '#c88867'],
    glass: '#e5d1b4',
    surface: { highlight: '#f5e9d7', shadow: '#211c19', edge: '#f4dcad', frame: '#a98568' },
    tempo: 112,
  },
  jelly: {
    title: 'Squishphony',
    railLights: ['#8fe0ec', '#b8b9fa', '#edafda'],
    glass: '#bde2e7',
    surface: { highlight: '#eefcfa', shadow: '#1a203c', edge: '#c7eef4', frame: '#94a7c0' },
    tempo: 92,
  },
  wilds: {
    title: 'Rockmallow',
    railLights: ['#a9c1cc', '#e7b882', '#cbd7d3'],
    glass: '#bacbd2',
    surface: { highlight: '#e0e8e8', shadow: '#1a242a', edge: '#d5e7eb', frame: '#7d8480' },
    tempo: 96,
  },
  league: {
    title: 'Flipzel',
    railLights: ['#8ccaff', '#f3ac78', '#e2ebf1'],
    glass: '#cad9ec',
    surface: { highlight: '#eff4fe', shadow: '#111d31', edge: '#c4ddf5', frame: '#7f9cb6' },
    tempo: 120,
  },
  puppy: {
    title: 'Pawrachute',
    railLights: ['#eeb286', '#c1d6d9', '#f1d1aa'],
    glass: '#dcc9b7',
    surface: { highlight: '#f8ead7', shadow: '#302722', edge: '#eadbcd', frame: '#ac8d7a' },
    tempo: 104,
  },
  kitten: {
    title: 'Purralune',
    railLights: ['#e1cfac', '#b5acc9', '#dcc1a1'],
    glass: '#c4c6d1',
    surface: { highlight: '#f3efdf', shadow: '#211e2f', edge: '#e5dece', frame: '#9f94a4' },
    tempo: 90,
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
  { id: 'test.credits.5', kind: 'credit', quantity: 5, name: 'vault.encore', price: 1.49 },
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
  { id: 'test.hints.10', kind: 'hints', quantity: 10, name: 'vault.clearer', price: 1.49 },
  {
    id: 'test.theme.chaos',
    kind: 'theme',
    quantity: 1,
    theme: 'chaos',
    name: 'vault.chaos',
    price: 2.99,
  },
  {
    id: 'test.theme.jelly',
    kind: 'theme',
    quantity: 1,
    theme: 'jelly',
    name: 'vault.jelly',
    price: 2.99,
  },
  ...(['wilds', 'league', 'puppy', 'kitten'] as const).map((theme) => ({
    id: 'test.theme.' + theme,
    kind: 'theme' as const,
    quantity: 1,
    theme,
    name: ('vault.' + theme) as MessageKey,
    price: 2.99,
  })),
];
export const STORE_PAYMENT_MODE = 'test' as const;
export const STORE_KEY = 'cpi.store.test.v1';
/** getRandomValues also works in native/custom-scheme contexts without randomUUID. */
export function createTestReceiptId(): string {
  return (
    'test-' +
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
      value.toString(16).padStart(8, '0'),
    ).join('')
  );
}
export function storeProduct(id: string): StoreProduct {
  const product = STORE_PRODUCTS.find((item) => item.id === id);
  if (!product) throw new Error('Unknown test product.');
  return product;
}
