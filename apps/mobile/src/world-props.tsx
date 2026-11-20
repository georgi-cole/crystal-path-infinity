import type { WorldId } from './store-catalog';
import { WORLD_COLORS } from './world-kits';

type NewWorld = Exclude<WorldId, 'chaos' | 'jelly'>;

export function WorldRelicFrame({ theme }: { theme: NewWorld }) {
  if (theme === 'moonpatch' || theme === 'candy')
    return (
      <>
        {theme === 'candy' ? (
          <path
            className="cpi-power-setting"
            d="M12 19 5 14l1 13-3 9 10 5 7 14h24l9-14 9-4-4-10 1-13-11 7-9-12H24Z"
          />
        ) : (
          <path
            className="cpi-power-setting"
            d="M32 3c17 3 27 13 28 25 0 15-12 27-28 33C16 55 4 43 4 28 5 16 15 6 32 3Z"
          />
        )}
        <circle className="cpi-power-lens" cx="32" cy="32" r="18" />
        <path className="cpi-power-trim" d="M17 15l3-4m24 0 3 4M24 53l3 2m10 0 3-2" />
      </>
    );
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
      ) : theme === 'moonpatch' ? (
        <>
          <path
            className="cpi-rescue-canopy"
            d="M14-151c-43 3-56 56-20 73 19 9 37 0 46-11-36 10-61-37-26-62Z"
            fill={mid}
            stroke={core}
          />
          <path d="M-23-92-10-65m34-17-14 17m31-77 3 5 6 2-6 2-3 5-2-5-6-2 6-2Z" stroke={light} />
        </>
      ) : theme === 'candy' ? (
        <>
          <path
            className="cpi-rescue-canopy"
            d="M-57-127q46-45 92-10 12 8 22 10l-30 19-27-7-27 7Z"
            fill={mid}
            stroke={core}
          />
          <path
            d="M-53-125-14-60M53-125 14-60m-49-74 14 22m12-31 18 28m8-22 12 26"
            stroke={light}
          />
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
