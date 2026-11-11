import type { WorldId } from './store-catalog';
import { WORLD_COLORS } from './world-kits';

type NewWorld = Exclude<WorldId, 'chaos' | 'jelly'>;

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
