import type { CSSProperties } from 'react';
import chocolateAtlas from './assets/campaign/chocolate-atlas-v1.jpg?url';
import './chocolate-bridge.css';

const chocolates = [
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

export function ChocolatePaint({ id }: { id: string }) {
  return chocolates.map((chocolate) => {
    const [x, y] = chocolate.atlas;
    const key = `${id}-candy-${chocolate.id}`;
    // The slight inset prevents texture filtering from pulling in the neighbouring recipe.
    return (
      <g key={chocolate.id}>
        <pattern
          id={key}
          width="1"
          height="1"
          viewBox={`${x + 0.008} ${y + 0.008} 0.984 0.984`}
          preserveAspectRatio="none"
        >
          <image href={chocolateAtlas} width="2" height="2" preserveAspectRatio="none" />
        </pattern>
        <linearGradient id={`${key}-side`} x2="0" y2="1">
          <stop stopColor={chocolate.edge} />
          <stop offset=".22" stopColor={chocolate.body} />
          <stop offset="1" stopColor={chocolate.shade} />
        </linearGradient>
      </g>
    );
  });
}

const launches = [
  [-54, -24, -120],
  [-28, -44, 95],
  [5, -51, -75],
  [34, -39, 110],
  [58, -18, 165],
  [-43, -10, -90],
  [45, -9, 75],
] as const;

function Ingredient({ flavour, index }: { flavour: Chocolate['id']; index: number }) {
  if (flavour === 'milk')
    return (
      <path
        d="M0-7C4-3 6 0 5 3C4 7-4 7-5 3C-6 0-3-3 0-7Z"
        fill="#fff4dc"
        stroke="#f0c9a1"
        strokeWidth=".65"
      />
    );
  if (flavour === 'hazelnut')
    return (
      <>
        <path
          d="M-7 1Q-8-4-2-7Q5-8 8-2L5 5-1 7Z"
          fill={index % 2 ? '#c2793b' : '#e2a654'}
          stroke="#783d26"
          strokeWidth=".8"
        />
        <path d="M-6 0-2-6 4-5 2 0-3 4Z" fill="#ffdc92" />
      </>
    );
  const white = flavour === 'white';
  return (
    <path
      d={white ? 'M-6-3 2-5 6-1 3 5-4 3Z' : 'M-5-4 5-3 3 5-4 2Z'}
      fill={white ? (index % 2 ? '#e8a34c' : '#fff0c1') : index % 2 ? '#995e41' : '#4c271f'}
      stroke={white ? '#cc843b' : '#bf8359'}
      strokeWidth=".65"
    />
  );
}

export function ChocolateIngredients({
  chocolate,
  x,
  y,
}: {
  chocolate: Chocolate;
  x: number;
  y: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`} data-ingredient-burst={chocolate.id}>
      {chocolate.id === 'milk' && (
        <path
          className="cpi-chocolate-milk-splash"
          d="M-44 5Q-27 2-20-12Q-16-20-11-19Q-12-9-5-8Q2-9 9-27Q14-35 19-31Q17-23 18-13Q21-8 28-15Q37-24 43-20Q43-14 35-7Q29 1 48 5Q26 15 4 11Q-21 15-44 5Z"
          fill="#fff2df"
          stroke="#f7ccab"
          strokeWidth="1.2"
        />
      )}
      {launches.map(([dx, peak, rotation], i) => (
        <g
          className="cpi-chocolate-ingredient"
          key={dx}
          style={
            {
              '--ingredient-mid-x': `${dx * 0.66}px`,
              '--ingredient-end-x': `${dx}px`,
              '--ingredient-peak': `${peak}px`,
              '--ingredient-turn': `${rotation}deg`,
              '--ingredient-delay': `${(i % 3) * 20}ms`,
            } as CSSProperties
          }
        >
          <Ingredient flavour={chocolate.id} index={i} />
        </g>
      ))}
    </g>
  );
}
