import { useId } from 'react';
import type { CSSProperties } from 'react';
import guardianArt from './assets/campaign/guardian-shield-v1.png?url';
import { companionLanding } from './world-companion';
import type { TileSide } from '@crystal-path-infinity/game-core';
import './guardian-shield.css';

/** A material object carried below the face; never an outline over the companion. */
export function GuardianShield({
  charges = 0,
  temporary = false,
  impact = false,
  linger = false,
}: {
  charges?: number;
  temporary?: boolean;
  impact?: boolean;
  linger?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  if (!charges && !temporary && !linger) return null;
  return (
    <g className="cpi-guardian-shield" data-hit={impact}>
      <defs>
        <radialGradient id={'guardian-' + id}>
          <stop stopColor="#b8ffdf" stopOpacity=".42" />
          <stop offset="1" stopColor="#25bead" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="34" cy="-21" rx="35" ry="40" fill={`url(#guardian-${id})`} />
      {charges > 2 && (
        <image href={guardianArt} x="22" y="-53" width="43" height="52" opacity=".28" />
      )}
      {charges > 1 && (
        <image href={guardianArt} x="19" y="-51" width="43" height="52" opacity=".45" />
      )}
      <image
        className="cpi-guardian-material"
        href={guardianArt}
        x="15"
        y="-49"
        width="43"
        height="52"
      />
      {charges > 1 && (
        <g className="cpi-guardian-pips">
          {Array.from({ length: Math.min(5, charges) }, (_, i) => (
            <circle key={i} cx={23 + i * 6} cy="5" r="1.7" />
          ))}
        </g>
      )}
      {impact && (
        <g className="cpi-guardian-flash">
          {Array.from({ length: 7 }, (_, i) => (
            <path
              key={i}
              d="m0-4 2 4-2 4-2-4Z"
              style={
                {
                  '--shield-dx': `${Math.cos(i * 0.9) * 36}px`,
                  '--shield-dy': `${Math.sin(i * 0.9) * 32}px`,
                  '--shield-turn': `${i * 47}deg`,
                } as CSSProperties
              }
              transform="translate(36 -23)"
            />
          ))}
        </g>
      )}
    </g>
  );
}

export function GuardianShieldMarker({
  side,
  charges,
  temporary,
  impact,
  linger,
}: {
  side: TileSide;
  charges: number;
  temporary: boolean;
  impact: boolean;
  linger: boolean;
}) {
  if (!charges && !temporary && !linger) return null;
  const anchor = companionLanding(side);
  return (
    <div
      className="cpi-default-guardian"
      data-hit={impact}
      style={{ left: `${anchor.x / 9}%`, top: `${anchor.y / 7}%` }}
      aria-hidden="true"
    >
      <GlassGuardianShield charges={charges} />
    </div>
  );
}

export function GlassGuardianShield({ charges = 0 }: { charges?: number }) {
  const id = 'glass-guardian-' + useId().replace(/:/g, '');
  return (
    <svg className="cpi-glass-guardian" viewBox="0 0 100 124" fill="none">
      <defs>
        <linearGradient
          id={id + '-rim'}
          x1="12"
          y1="12"
          x2="87"
          y2="105"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#e8fcff" />
          <stop offset=".34" stopColor="#81cddd" />
          <stop offset=".67" stopColor="#a688b4" />
          <stop offset="1" stopColor="#effaff" />
        </linearGradient>
        <linearGradient
          id={id + '-pane'}
          x1="20"
          y1="10"
          x2="80"
          y2="111"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b6e8f7" stopOpacity=".22" />
          <stop offset=".48" stopColor="#829da9" stopOpacity=".04" />
          <stop offset="1" stopColor="#b39ace" stopOpacity=".18" />
        </linearGradient>
        <clipPath id={id + '-cut'}>
          <path d="M50 10 87 24 83 65Q78 91 50 110 22 91 17 65L13 24Z" />
        </clipPath>
      </defs>
      {charges > 1 && (
        <path
          d="m57 8 37 14-4 41q-5 26-33 45"
          stroke="#9acdd9"
          strokeOpacity=".2"
          strokeWidth="2"
        />
      )}
      <path
        d="M50 10 87 24 83 65Q78 91 50 110 22 91 17 65L13 24Z"
        fill={`url(#${id}-pane)`}
        stroke={`url(#${id}-rim)`}
        strokeWidth="2"
      />
      <path
        d="m50 16 31 12-4 36q-4 22-27 39-23-17-27-39l-4-36Z"
        stroke="#cbe8f2"
        strokeOpacity=".22"
      />
      <g clipPath={`url(#${id}-cut)`}>
        <path d="m11 5 13-4 56 116-13 4Z" fill="#d8f8ff" opacity=".13" />
        <path d="m41-5 5-2 53 112-5 2Z" fill="#e9faff" opacity=".12" />
        <path d="m16 36 64 46" stroke="#c8e5ed" strokeOpacity=".16" />
      </g>
      <path
        d="m18 29 3 30M50 11l32 12M52 108q23-16 29-37"
        stroke="#f0fbff"
        strokeOpacity=".65"
        strokeLinecap="round"
      />
      <path d="m50 43 3 11 11 3-11 3-3 11-3-11-11-3 11-3Z" fill="#d5f2ff" fillOpacity=".42" />
      {charges > 1 &&
        Array.from({ length: Math.min(5, charges) }, (_, i) => (
          <circle key={i} cx={38 + i * 6} cy="119" r="1.4" fill="#cdebf2" fillOpacity=".7" />
        ))}
    </svg>
  );
}
