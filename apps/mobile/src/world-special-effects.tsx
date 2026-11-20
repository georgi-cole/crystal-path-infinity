import { memo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useWorldMotion, worldMomentIndex } from './world-motion';
import type { SignatureWorld } from './world-motion';
import './world-special-effects.css';

export function WorldSignatureGlyph({ world }: { world: SignatureWorld }) {
  return (
    <g className="cpi-world-signature-glyph" data-signature={world} aria-hidden="true">
      {world === 'moonpatch' ? (
        <>
          <path
            d="M-39-47C-66-30-60 6-29 14-3 21 28 5 34-19 17-5-3 1-21-8s-23-25-18-39Z"
            fill="#edbe83"
            stroke="#ffedb7"
            strokeWidth="1.6"
          />
          <path
            d="m39-71 3 7 8 2-8 3-3 8-3-8-7-3 7-2ZM-47-75l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"
            fill="#fff5d2"
          />
          <path d="M-48-35c-9 20 4 42 26 45" stroke="#fff5cc" strokeWidth="1.7" fill="none" />
        </>
      ) : (
        <>
          <path
            d="M-58-15c19-30 66-18 90-41 9-9 10-20 2-28"
            fill="none"
            stroke="#ffd295"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M-52-8c21-29 53-17 80-35 11-7 16-15 18-25"
            fill="none"
            stroke="#ffc1cb"
            strokeWidth="2.7"
            strokeLinecap="round"
          />
          <path
            d="m-52-45 7 4m-5 12 8-2m93-48 4-5m-10 22 7 3"
            stroke="#c8f4d8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}

export function SignatureStepEffect({ world, wrong }: { world: SignatureWorld; wrong: boolean }) {
  return (
    <g className="cpi-signature-step" data-landing={wrong ? 'break' : 'safe'}>
      {world === 'moonpatch' ? (
        <path
          className="cpi-world-circuit"
          d={wrong ? 'M-62 4l27-12 9 15L-6-9 8 4l34-15 20 12' : 'M-63 6Q0 34 63 6M-38-2Q0 14 38-2'}
        />
      ) : (
        <path
          className="cpi-world-circuit"
          d={
            wrong
              ? 'M-57 8l20-12 10 6 20-14L9 4l16-13 11 6 20-9'
              : 'M-57 9c14-18 27-18 39-3C-8 15 7 15 17 4 29-12 53-9 59 2'
          }
        />
      )}
      {Array.from({ length: 8 }, (_, i) => (
        <path
          className="cpi-world-step-mote"
          key={i}
          d={
            world === 'moonpatch'
              ? 'M-7 0-2-2 0-8 2-2 7 0 2 2 0 8-2 2Z'
              : wrong
                ? 'm-6-4 6-2 7 6-2 5-9 1-3-4Z'
                : 'M-6-2q0-2 3-2h6q3 0 3 2v3q0 2-3 2h-6q-3 0-3-2Z'
          }
          fill={
            world === 'moonpatch'
              ? ['#ffe5ad', '#a9ece3', '#e0cdff'][i % 3]
              : wrong
                ? ['#c68b62', '#653223', '#f1a681'][i % 3]
                : ['#ffb4c4', '#fde2a7', '#c6f4d6'][i % 3]
          }
          style={
            {
              '--dx': `${((i % 4) + 1) * (i < 4 ? -17 : 17)}px`,
              '--dy': `${(-12 - (i % 3) * 16) * (wrong && i % 2 === 0 ? -0.65 : 1)}px`,
              '--delay': `${(i % 3) * 18}ms`,
            } as CSSProperties
          }
        />
      ))}
    </g>
  );
}

const moonPhases = ['crescent', 'half', 'full'] as const;
const moonShape = {
  crescent: 'M27 5a23 23 0 1 0 23 36A26 26 0 0 1 27 5Z',
  half: 'M32 5a23 23 0 0 0 0 46Z',
  full: 'M32 5a23 23 0 1 0 0 46 23 23 0 0 0 0-46Z',
};
const sprinkles = ['#ffd0d5', '#ffe1a9', '#b4e9c5', '#e4c4fb'];

export const WorldMoments = memo(function WorldMoments({
  world,
  row,
  paused,
  reduced,
}: {
  world: SignatureWorld;
  row: string;
  paused: boolean;
  reduced: boolean;
}) {
  const motion = useWorldMotion();
  const index = worldMomentIndex(world, row);
  const [seen, setSeen] = useState({ index, play: false });
  if (seen.index !== index) setSeen({ index, play: index >= 0n && !reduced && !motion.reduced });
  if (!seen.play || reduced || motion.reduced) return null;
  const phase = moonPhases[Number(index % 3n)];
  return (
    <div
      className="cpi-world-moment"
      key={String(index)}
      data-moment={world}
      data-still={paused || motion.suspended}
      aria-hidden="true"
    >
      {world === 'moonpatch' ? (
        <svg className="cpi-moonrise" data-phase={phase} viewBox="0 0 76 64">
          <circle
            cx="32"
            cy="28"
            r="23"
            fill="#bfd4ea"
            fillOpacity=".13"
            stroke="#d1e1ef"
            strokeOpacity=".32"
          />
          <path d={moonShape[phase]} fill="#f7e3b2" />
          <path
            d="m64 15 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM60 40l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"
            fill="#fff0d3"
          />
          <circle cx="10" cy="57" r="1.7" fill="#c1e8dc" />
        </svg>
      ) : (
        Array.from({ length: 12 }, (_, i) => (
          <i
            key={i}
            className="cpi-sugar-sprinkle"
            style={{
              left: `${i < 6 ? 7 + i * 2 : 82 + (i - 6) * 2}%`,
              top: `${30 + ((i * 11) % 24)}%`,
              backgroundColor: sprinkles[(i + Number(index % 4n)) % sprinkles.length],
              animationDelay: `${(i % 6) * 0.17}s`,
            }}
          />
        ))
      )}
    </div>
  );
});
