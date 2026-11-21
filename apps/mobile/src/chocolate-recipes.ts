export const chocolates = [
  { id: 'milk', atlas: [0, 0], edge: '#b47551', body: '#6c3424', shade: '#351816', cut: '#ce9472' },
  { id: 'dark', atlas: [1, 0], edge: '#83554a', body: '#462822', shade: '#21121a', cut: '#a46e58' },
  {
    id: 'hazelnut',
    atlas: [0, 1],
    edge: '#d68c4d',
    body: '#925026',
    shade: '#48231b',
    cut: '#eab36c',
  },
  {
    id: 'white',
    atlas: [1, 1],
    edge: '#e7cb96',
    body: '#bc925d',
    shade: '#6d482f',
    cut: '#f9e0a8',
  },
] as const;

export type Chocolate = (typeof chocolates)[number];

/** Both lanes use the same cosmetic row recipe, independent of safe-side and run RNG. */
export function chocolateForRow(row: bigint): Chocolate {
  const count = BigInt(chocolates.length);
  return chocolates[Number(((row % count) + count) % count)];
}

export const chocolateSurface = (id: string, chocolate: Chocolate) =>
  `url(#${id}-candy-${chocolate.id})`;

export const chocolateSide = (id: string, chocolate: Chocolate) =>
  `url(#${id}-candy-${chocolate.id}-side)`;
