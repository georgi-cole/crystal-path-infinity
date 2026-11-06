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
export const THEMES = {
  obsidian: {
    title: 'Obsidian',
    colors: ['#fa589c', '#62dfed', '#79e3af'],
    glass: '#c7dae0',
    surface: { highlight: '#e2edf0', shadow: '#101318', edge: '#ecfbff', frame: '#87828f' },
    tempo: 0,
  },
  chaos: {
    title: 'Chaos Workshop',
    colors: ['#ffbd63', '#67f3ce', '#ff9266'],
    glass: '#ffe1b2',
    surface: { highlight: '#fff0c9', shadow: '#152824', edge: '#ffe3ab', frame: '#c49458' },
    tempo: 112,
  },
  jelly: {
    title: 'Jellyverse',
    colors: ['#ed9efc', '#83dfff', '#b3a2ff'],
    glass: '#e9c9ff',
    surface: { highlight: '#f5e1ff', shadow: '#1b1535', edge: '#d3f2ff', frame: '#bba5e9' },
    tempo: 92,
  },
  wilds: {
    title: 'Prismwilds',
    colors: ['#91edb1', '#f5cf83', '#7bdde8'],
    glass: '#c6f0d2',
    surface: { highlight: '#f0ffe1', shadow: '#132b2a', edge: '#bcffe2', frame: '#9ab58b' },
    tempo: 96,
  },
  league: {
    title: 'Foldrush Circuit',
    colors: ['#ffb15f', '#7dccff', '#a7f4c1'],
    glass: '#c6e4f3',
    surface: { highlight: '#f1f9ff', shadow: '#152b42', edge: '#a4e1ff', frame: '#9bafc3' },
    tempo: 120,
  },
  puppy: {
    title: 'Skyhound Yard',
    colors: ['#dfaa75', '#92d8c9', '#edce9c'],
    glass: '#ddd4b8',
    surface: { highlight: '#fff3d7', shadow: '#253537', edge: '#f2dcb5', frame: '#b68c65' },
    tempo: 104,
  },
  kitten: {
    title: 'Moonrunner Quarter',
    colors: ['#c5b6e0', '#9eafc8', '#efc181'],
    glass: '#dfd5f3',
    surface: { highlight: '#fff0fa', shadow: '#211f3b', edge: '#e6ddff', frame: '#b5abc8' },
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
  ...(['wilds', 'league', 'puppy', 'kitten'] as const).map((theme) => ({
    id: 'test.theme.' + theme,
    kind: 'theme' as const,
    quantity: 1,
    theme,
    name: ('vault.' + theme) as MessageKey,
    price: 4.99,
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
