import { useId } from 'react';
import type { WorldId } from './store-catalog';
import { WORLD_COLORS } from './world-kits';
import { useWorldMotion } from './world-motion';

type NewWorld = Exclude<WorldId, 'chaos' | 'jelly'>;

/** Every sealed prop is neutral: its design never reveals the randomized contents. */
export function WorldRelicCache({ theme, open }: { theme: NewWorld; open: boolean }) {
  const id = useId().replace(/:/g, '');
  const motion = useWorldMotion();
  const [light, mid, dark, core] = WORLD_COLORS[theme];
  return (
    <svg
      className={`cpi-world-cache world-${theme}${open ? ' is-open' : ''}${motion.reduced || motion.suspended ? ' is-still' : ''}`}
      viewBox="0 0 80 88"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="10" y1="14" x2="68" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor={light} />
          <stop offset=".35" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="80" rx="25" ry="4" fill="#020718" opacity=".5" />
      <path
        className="cpi-cache-core"
        d="m40 20 13 19-13 24-13-24 13-19Z"
        fill={core}
        stroke={light}
      />
      {theme === 'wilds' ? (
        <>
          <g className="cpi-cache-base">
            <path
              d="m9 41 16-14 34 7 13 20-13 21-27 5L12 65 9 41Z"
              fill={`url(#${id})`}
              stroke={light}
            />
            <path d="m12 44 22 13 25-7 10 5M34 57l-2 21m27-28 1 23" stroke={dark} strokeWidth="2" />
            <path d="m21 45 18 8 17-12-5 21-15 10-15-27Z" fill={dark} stroke={core} />
            <path d="m39 53 12-10-9 19-6-3 3-6Z" fill={core} />
          </g>
          <g className="cpi-cache-lid">
            <path
              d="m9 40 8-20 27-10 24 16 4 18-20 7-13-8-10 10L9 40Z"
              fill={`url(#${id})`}
              stroke={light}
            />
            <path d="m17 21 20 11 8-20M37 32l-8 20m8-20 30-5" stroke={dark} strokeWidth="2" />
            <path d="m44 19 11 9-13 11-4-8 6-12Z" fill={dark} stroke={core} />
            <path d="m42 29 5-5-2 8" stroke={core} />
          </g>
        </>
      ) : theme === 'league' ? (
        <>
          <g className="cpi-cache-base">
            <path d="m10 39 59-8-8 42-51 8V39Z" fill={`url(#${id})`} stroke={light} />
            <path d="m10 54 53-8-3 11-50 8V54Z" fill={dark} stroke={core} />
            <path d="m22 74 8-24m20-5-8 25" stroke={light} strokeOpacity=".6" />
            <path d="m34 48 13-2-8 14-5-12Z" fill={core} />
          </g>
          <g className="cpi-cache-lid">
            <path d="m9 39 11-22 54-7-5 22-60 13v-6Z" fill={`url(#${id})`} stroke={light} />
            <path d="m20 18 17 11 36-17M37 29l-5 10" stroke={dark} strokeWidth="2" />
            <path d="m48 18 14-2-7 10-7-8Z" fill={core} />
            <path d="m52 19 6-1-3 5" stroke={dark} />
          </g>
        </>
      ) : theme === 'puppy' ? (
        <>
          <g className="cpi-cache-base">
            <path d="M15 32h45l10 13-4 30-12 5-43-8 4-40Z" fill={`url(#${id})`} stroke={light} />
            <path d="m17 47-3 20 40 8 9-5 3-23" stroke={light} strokeDasharray="2 3" />
            <path d="m24 42-2 29m29-29-1 31" stroke={dark} strokeWidth="6" />
            <path d="m21 56 7 1v9l-7-1v-9Zm25 4 9 1v9l-9-1v-9Z" fill={light} stroke={dark} />
          </g>
          <g className="cpi-cache-lid">
            <path d="m14 31 8-13h36l9 12-4 24-23 8-26-14V31Z" fill={`url(#${id})`} stroke={light} />
            <path d="M29 18v-7h17l8 7M16 35l25 12 24-13" stroke={dark} strokeWidth="3" />
            <path d="m40 38 12 7-12 15-7-12 7-10Z" fill={dark} stroke={core} />
            <path d="m40 43 6 3-6 9-3-7 3-5Z" fill={core} />
          </g>
        </>
      ) : (
        <>
          <g className="cpi-cache-base">
            <path d="m12 40 24 10 31-9 1 24-22 16-31-8-3-33Z" fill={`url(#${id})`} stroke={light} />
            <path d="m36 51 10 28m-28-9 20-7 26 3" stroke={dark} strokeWidth="2" />
            <path d="M52 52c-13-3-17 13-6 18-5-7 0-14 6-18Z" fill={core} />
            <path d="m22 52 2 11m35-13 1 10" stroke={light} />
          </g>
          <g className="cpi-cache-lid">
            <path
              d="m12 39 12-20 23-8 21 22-1 10-31 12-24-11v-5Z"
              fill={`url(#${id})`}
              stroke={light}
            />
            <path d="m25 20 11 24 29-11M36 44v10" stroke={dark} strokeWidth="2" />
            <path d="M49 17c-13-2-18 15-6 19-6-8-2-14 6-19Z" fill={core} />
            <path d="m25 31 7 4-2 7" stroke={core} />
          </g>
        </>
      )}
    </svg>
  );
}

export function WorldRelicFrame({ theme }: { theme: NewWorld }) {
  const outer =
    theme === 'wilds'
      ? 'm31 4 22 10 7 23-15 23-27-6L4 33 13 12 31 4Z'
      : theme === 'league'
        ? 'M17 5h43L47 59H4L17 5Z'
        : theme === 'puppy'
          ? 'm12 5 36 2 11 14-5 34-14 5-34-9V16l6-11Z'
          : 'm23 4 25 5 12 24-18 27-29-6L4 34 12 13 23 4Z';
  const inner =
    theme === 'league'
      ? 'M21 13h29L40 51H14l7-38Z'
      : theme === 'wilds'
        ? 'm31 12 16 8 5 15-12 17-19-5-9-15 8-14 11-6Z'
        : theme === 'puppy'
          ? 'm18 14 25 2 8 9-4 23-10 5-23-7V22l4-8Z'
          : 'm26 12 17 4 9 17-13 19-19-4-8-14 8-17 6-5Z';
  return (
    <>
      <path className="cpi-power-setting" d={outer} />
      <path className="cpi-power-lens" d={inner} />
      <path className="cpi-power-trim" d="m43 6-5 9h7l-4 7M9 43l8 3" />
    </>
  );
}

/** This equipment is always free. A rescue ends the run; it never restores SP. */
export function WorldRescueRig({ theme }: { theme: WorldId }) {
  const [light, mid, dark, core] = WORLD_COLORS[theme];
  return (
    <g
      className={`cpi-world-rescue-rig world-${theme}`}
      stroke={light}
      strokeWidth="1.5"
      fill="none"
    >
      {theme === 'puppy' ? (
        <>
          <path
            className="cpi-rescue-canopy"
            d="M-67-120Q0-183 67-120l-27-8-20 12-20-13-20 13-20-12-27 8Z"
            fill={mid}
          />
          <path d="M-67-120-24-55M67-120 24-55M-20-116-10-55m30-61L10-55M0-171v42" stroke={core} />
          <path d="m-12-63 12 9 12-9" />
        </>
      ) : theme === 'kitten' ? (
        <>
          <path
            className="cpi-rescue-canopy"
            d="m0-103-69 18 24 22 26-6L0-57l19-12 26 6 24-22-69-18Z"
            fill={dark}
          />
          <path d="m0-103-19 34m19-34 19 34M-69-85l50 16m38 0 50-16" stroke={core} />
          <path d="M9-109c-18-4-24 17-9 22-8-9-4-16 9-22Z" fill={light} />
        </>
      ) : theme === 'chaos' ? (
        <>
          <path d="M-30-128h60l9 12H-39l9-12Z" fill={mid} />
          <path
            d="M-27-135h-25m79 0h25M-27-135v12m54-12v12M0-116v40"
            stroke={core}
            strokeWidth="3"
          />
          <circle cy="-120" r="6" fill={dark} />
          <path d="m-14-75 14 8 14-8" />
        </>
      ) : theme === 'jelly' ? (
        <>
          <path
            d="M0-121c-62 0-69 108 0 117 69-9 62-117 0-117Z"
            fill={core}
            fillOpacity=".1"
            stroke={core}
          />
          <path d="M-37-91q-10 21-5 37m32-58q9-3 18 0" strokeWidth="3" />
          <path d="m-38-29 38 17 38-17" />
        </>
      ) : theme === 'wilds' ? (
        <>
          <path
            className="cpi-rescue-canopy"
            d="m0-116-60 23 19 31 24-14L0-57l17-19 24 14 19-31-60-23Z"
            fill={dark}
          />
          <path d="m0-116-17 40m17-40 17 40m-77-17 43 17m34 0 43-17" stroke={core} />
          <path d="m0-120 9 13-9 12-9-12 9-13Z" fill={core} />
        </>
      ) : (
        <>
          <path
            className="cpi-rescue-canopy"
            d="m-63-110 63 12 63-12-22 24-28 9L0-62l-13-15-28-9-22-24Z"
            fill={mid}
          />
          <path d="m-63-110 50 33m76-33L13-77M0-98v36" stroke={core} />
          <path d="m-22-126 22 5 22-5m-35-10 13 3 13-3" stroke={core} />
        </>
      )}
    </g>
  );
}
