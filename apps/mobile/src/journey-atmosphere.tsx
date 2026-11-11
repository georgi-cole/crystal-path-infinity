import { useId } from 'react';
import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { GearId, Season, Weather } from '@crystal-path-infinity/game-core';
import type { ThemeId, WorldId } from './store-catalog';
import { WORLD_COLORS } from './world-kits';
import './journey-atmosphere.css';

const light = {
  spring: ['#74d5b3', '#7eaecf'],
  summer: ['#ffc276', '#f28d64'],
  autumn: ['#ed946b', '#a281c7'],
  winter: ['#a4deff', '#8ba6ff'],
};
const drift = Array.from({ length: 14 }, (_, i) => ({
  x: i % 2 ? 83 + ((i * 7) % 17) : (i * 13) % 17,
  y: (i * 19) % 97,
  delay: -(i * 0.91),
  size: 3 + ((i * 5) % 9),
}));

const leafShapes = {
  oak: {
    outline:
      'M20 42C18 36 7 36 8 30C1 27 3 20 9 20C4 13 11 9 16 13C13 6 20 4 23 11C23 4 28 2 32 5C36 8 34 12 33 15C39 10 44 16 40 21C47 20 48 27 42 30C47 36 37 40 29 39Z',
    veins: 'M18 47 28 28 31 10M23 36l-11-6m14 0 12-4m-10-1-12-9m13 4 8-3',
  },
  birch: {
    outline:
      'M24 43 17 40 18 38 12 36 13 34 8 31 10 29 5 24 8 22 6 16 10 16 11 11 14 12 17 7 20 9 24 2 28 8 31 7 34 13 37 12 39 18 42 18 41 23 44 25 40 29 41 32 36 35 37 38 31 39 30 42Z',
    veins: 'M23 47 24 29 24 8m0 27-10-6m10 5 11-7m-11 1-11-9m11 7 11-9m-11 1-6-5',
  },
  willow: {
    outline: 'M15 44C14 34 11 27 17 18C23 9 33 6 39 2C38 14 34 24 28 33C23 39 18 40 15 44Z',
    veins: 'M12 47C17 35 26 20 35 8m-14 26-2-10m7 2 7-6m-11 10 9-3m-3-6 1-8',
  },
} as const;

const autumnFoliage = [
  ['maple', '#ffb767', '#a43e23', '0deg'],
  ['oak', '#d68746', '#843d30', '0deg'],
  ['birch', '#f3d45d', '#b77322', '0deg'],
  ['willow', '#c5a761', '#6d7033', '0deg'],
  ['maple', '#e98160', '#8f252b', '-17deg'],
  ['oak', '#b97650', '#6f3028', '0deg'],
  ['birch', '#c7be70', '#838436', '0deg'],
  ['willow', '#e2b163', '#9a5630', '0deg'],
] as const;

function AutumnDrift() {
  const id = useId();
  return (
    <div className="cpi-autumn-canopy">
      {drift.map((p, index) => {
        const [shape, bright, dark, hue] = autumnFoliage[index % autumnFoliage.length];
        const paint = `${id}-${index}`;
        return (
          <i
            className="cpi-autumn-leaf"
            data-leaf={shape}
            key={index}
            style={
              {
                '--leaf-x': `${index % 2 ? 100 - p.x : p.x}%`,
                '--leaf-y': `${p.y}%`,
                '--leaf-size': `${(shape === 'maple' ? 22 : 14) + p.size * 2.6}px`,
                '--leaf-angle': `${(index * 61) % 360}deg`,
                '--leaf-turn': index % 2 ? '-82deg' : '93deg',
                '--leaf-travel': index % 2 ? '36%' : '-36%',
                '--leaf-delay': `${p.delay}s`,
                '--leaf-speed': `${5.7 + (index % 5) * 0.65}s`,
                '--leaf-hue': hue,
              } as CSSProperties
            }
          >
            {shape !== 'maple' && (
              <svg viewBox="0 0 48 48">
                <defs>
                  <linearGradient id={paint} x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor={bright} />
                    <stop offset="1" stopColor={dark} />
                  </linearGradient>
                </defs>
                <path
                  d={leafShapes[shape].outline}
                  fill={`url(#${paint})`}
                  stroke={dark}
                  strokeWidth=".65"
                />
                <path
                  d={leafShapes[shape].veins}
                  fill="none"
                  stroke={bright}
                  strokeWidth=".95"
                  strokeOpacity=".78"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </i>
        );
      })}
    </div>
  );
}

function Rainfall({ storm }: { storm: boolean }) {
  return (
    <div className="cpi-rainfall" data-storm={storm}>
      <div className="cpi-rain-mist" />
      <svg viewBox="0 0 900 700" preserveAspectRatio="none">
        {Array.from({ length: 64 }, (_, i) => {
          const x = (i * 137 + 31) % 920;
          const y = ((i * 193) % 720) - 40;
          return (
            <line
              key={i}
              className="cpi-rain-drop"
              x1={x}
              y1={y}
              x2={x - (storm ? 10 : 3)}
              y2={y + 9 + (i % 22)}
              stroke="#d8ebf6"
              strokeWidth={0.55 + (i % 4) * 0.32}
              strokeLinecap="round"
              opacity={0.16 + (i % 4) * 0.065}
              style={
                {
                  '--rain-speed': `${0.45 + (i % 7) * 0.11}s`,
                  '--rain-delay': `${-(i % 13) * 0.13}s`,
                } as CSSProperties
              }
            />
          );
        })}
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse
            key={i}
            className="cpi-rain-splash"
            cx={65 + ((i * 163) % 780)}
            cy={425 + ((i * 31) % 235)}
            rx={3 + (i % 4)}
            ry={1 + (i % 3) * 0.35}
            stroke="#bde2eb"
            fill="none"
            strokeWidth=".8"
            style={{ '--rain-delay': `${-i * 0.19}s` } as CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}

export const JourneyAtmosphere = memo(function JourneyAtmosphere({
  season,
  weather,
  world,
  reduced = false,
}: {
  season: Season;
  weather?: Weather;
  world: ThemeId;
  reduced?: boolean;
}) {
  const [key, fill] = light[season];
  const style = {
    '--journey-key': key,
    '--journey-fill': fill,
    '--journey-world': world === 'obsidian' ? '#afc4da' : WORLD_COLORS[world][3],
  } as CSSProperties;
  const drifting = season === 'spring' || weather === 'snow';
  return (
    <div
      className="cpi-journey-air"
      data-world={world}
      data-season={season}
      data-episode={weather}
      data-still={reduced}
      style={style}
      aria-hidden="true"
    >
      <div className="cpi-journey-light" />
      <div className="cpi-season-set" />
      {(weather === 'rain' || weather === 'shower' || weather === 'squall') && (
        <Rainfall storm={weather === 'squall'} />
      )}
      {weather === 'rainbow' && <div className="cpi-journey-spectrum" />}
      {(weather === 'rain' || weather === 'shower' || weather === 'squall') && (
        <svg
          className="cpi-weather-lightning"
          data-storm={weather === 'squall'}
          viewBox="0 0 900 700"
          preserveAspectRatio="none"
        >
          <path
            d="M714 0 695 36 715 32 689 81 706 74 678 131m22-80-28-12-15 9m42-12 32 14 12-6"
            fill="none"
            stroke="#c8e6ff"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {weather === 'squall' && <div className="cpi-journey-thunder" />}
      {season === 'autumn' && <AutumnDrift />}
      {drifting &&
        drift.map((p, index) => (
          <i
            key={index}
            className="cpi-journey-drift"
            style={
              {
                '--drift-x': p.x + '%',
                '--drift-y': p.y + '%',
                '--drift-delay': p.delay + 's',
                '--drift-size': p.size + 'px',
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
});

// Three registrations per World match the calm, happy and worried sprite frames.
const eyeAnchor: Record<ThemeId, readonly (readonly [number, number, number, number])[]> = {
  obsidian: [
    [6, -64, -8, 1.04],
    [6, -64, -8, 1.04],
    [6, -64, -8, 1.04],
  ],
  chaos: [
    [7, -65, -12, 1],
    [2, -68, -13, 1],
    [4, -59, -8, 1],
  ],
  jelly: [
    [4, -62, -12, 1.4],
    [3, -64, -13, 1.5],
    [1, -62, 1, 1.45],
  ],
  wilds: [
    [10, -58, 3, 1.01],
    [12, -62, 0, 1.03],
    [14, -53, -2, 1.01],
  ],
  league: [
    [20, -61, 13, 0.87],
    [19, -68, 8, 0.84],
    [21, -58, 16, 0.87],
  ],
  puppy: [
    [12, -69, -13, 1.01],
    [12, -72, -14, 1.01],
    [16, -59, -11, 1.01],
  ],
  kitten: [
    [-15, -52, -9, 1.04],
    [-10, -63, -12, 1.06],
    [-17, -46, -17, 1.06],
  ],
};
const neckAnchor: Record<ThemeId, readonly (readonly [number, number])[]> = {
  obsidian: [
    [0, -44],
    [0, -44],
    [0, -44],
  ],
  chaos: [
    [4, -47],
    [3, -49],
    [4, -43],
  ],
  jelly: [
    [0, -43],
    [0, -43],
    [0, -44],
  ],
  wilds: [
    [9, -46],
    [12, -49],
    [13, -40],
  ],
  league: [
    [19, -49],
    [17, -55],
    [20, -46],
  ],
  puppy: [
    [6, -45],
    [7, -47],
    [10, -40],
  ],
  kitten: [
    [-11, -38],
    [-7, -45],
    [-12, -34],
  ],
};

export function CompanionSeasonGear({
  world,
  season,
  weather,
  frame,
  gear,
}: {
  world: WorldId;
  season: Season;
  weather?: Weather;
  frame: number;
  gear?: GearId;
}) {
  const [x, y, tilt, scale] = eyeAnchor[world][frame];
  const [nx, ny] = neckAnchor[world][frame];
  const [high, material, shadow, accent] = WORLD_COLORS[world];
  const wet = weather === 'rain' || weather === 'shower' || weather === 'squall';
  if (season === 'summer' && !wet && gear === 'sunshades') return null;
  if (gear === 'trail-scarf') return null;
  if (season === 'summer' && !wet)
    return (
      <g
        transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}
        className="cpi-companion-gear"
      >
        <path
          d="M-17-10q4-6 28-5l10 4-1 4q-15-4-36 2Z"
          fill={material}
          stroke={high}
          strokeWidth="1"
        />
        <path d="M-14-9q21-6 38-3l-4 4Q6-9-14-5Z" fill={accent} stroke={shadow} strokeWidth=".75" />
        <path d="m5-11 7-1" stroke="#fff" strokeOpacity=".63" strokeWidth=".7" />
      </g>
    );
  if (season === 'winter')
    return (
      <g transform={`translate(${nx} ${ny})`} className="cpi-companion-gear">
        <path d="M-13-3Q-2 3 12-2l2 6Q3 10-13 3Z" fill={material} stroke={high} strokeWidth=".9" />
        <path d="m7 3 3 12 8-2-4-13" fill={material} stroke={high} strokeWidth=".85" />
        <path d="M-10 1Q0 6 10 2m1 9 5-1" fill="none" stroke={accent} strokeWidth="1.6" />
        <path d="m-5 2 4 2m-2-4v5" stroke="#fff" strokeOpacity=".72" strokeWidth=".65" />
      </g>
    );
  if (wet)
    return (
      <g transform={`translate(${nx} ${ny})`} className="cpi-companion-gear">
        <path
          d="M-10-3Q0 5 12-2l5 12-5 6L-9 9Z"
          fill={shadow}
          fillOpacity=".91"
          stroke={accent}
          strokeWidth=".9"
        />
        <path
          d="M-7 2Q1 8 12 3M-6 7l13 4"
          fill="none"
          stroke={high}
          strokeOpacity=".65"
          strokeWidth=".8"
        />
        <path d="M2 1q5 5 0 8-5-3 0-8" fill={accent} stroke={shadow} strokeWidth=".5" />
      </g>
    );
  return (
    <g transform={`translate(${nx - 8} ${ny + 2})`} className="cpi-companion-gear">
      {season === 'autumn' ? (
        <path
          d="M-5 4q1-9 10-10Q7 3-1 6Zm2-1L3-4"
          fill={material}
          stroke={high}
          strokeWidth="1.1"
        />
      ) : (
        <path d="M0-6 2-2 6 0 2 2 0 6-2 2-6 0-2-2Z" fill={accent} stroke={high} strokeWidth=".9" />
      )}
      <circle r="1.6" fill="#fff2d6" />
    </g>
  );
}
