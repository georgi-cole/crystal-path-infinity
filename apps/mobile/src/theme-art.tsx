import { useId } from 'react';
import type { ThemeId } from './store-catalog';

function Robot({
  x,
  y,
  scale = 1,
  tilt = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  tilt?: number;
}) {
  return (
    <g
      className="cpi-theme-robot"
      transform={`translate(${x} ${y}) scale(${scale}) rotate(${tilt})`}
    >
      <ellipse cx="0" cy="82" rx="48" ry="10" fill="#000" opacity=".4" />
      <path
        d="M-19 58v17h-12m50-17v17h12M-36 20l-18 12-8-10m98-2 18-14 9 10"
        fill="none"
        stroke="#b7d9ce"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect
        x="-29"
        y="9"
        width="58"
        height="52"
        rx="15"
        fill="#db8452"
        stroke="#ffce92"
        strokeWidth="2"
      />
      <path d="M-12 21h24v21h-24Z" fill="#263e39" />
      <path d="m-4 25-5 8h8l-5 7" fill="none" stroke="#99ffd7" strokeWidth="2" />
      <rect
        x="-38"
        y="-45"
        width="76"
        height="57"
        rx="19"
        fill="#f2b47d"
        stroke="#ffe3b0"
        strokeWidth="2"
      />
      <path d="M0-45v-16" stroke="#adcbbf" strokeWidth="5" />
      <circle cy="-66" r="7" fill="#91ffcf" />
      <rect x="-30" y="-34" width="60" height="29" rx="10" fill="#153b39" />
      <g className="cpi-theme-eyes" fill="#a9ffe3">
        <rect x="-20" y="-27" width="10" height="15" rx="5" />
        <rect x="10" y="-27" width="10" height="15" rx="5" />
      </g>
      <path d="M-8 1q8 7 16 0" stroke="#8c553c" strokeWidth="3" fill="none" />
      <circle cx="-27" cy="37" r="3" fill="#ffdc9e" />
      <circle cx="27" cy="37" r="3" fill="#ffdc9e" />
    </g>
  );
}
function Jelly({
  x,
  y,
  scale = 1,
  color = '#d28bfd',
}: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
}) {
  return (
    <g className="cpi-theme-jelly" transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="65" rx="50" ry="9" fill="#111238" opacity=".4" />
      <path
        d="M-47 35C-56 2-32-52 0-54S55-8 48 31Q48 63 30 48Q17 68 2 49Q-13 69-25 48Q-43 61-47 35Z"
        fill={color}
        fillOpacity=".67"
        stroke="#fff"
        strokeOpacity=".65"
        strokeWidth="2"
      />
      <path
        d="M-31-13Q-26-35-9-37"
        fill="none"
        stroke="#fff"
        strokeOpacity=".65"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="-29" cy="32" rx="13" ry="6" fill="#ffb4d8" opacity=".75" />
      <ellipse cx="29" cy="32" rx="13" ry="6" fill="#ffb4d8" opacity=".75" />
      <g className="cpi-theme-eyes" fill="#263052">
        <ellipse cx="-15" cy="17" rx="6" ry="10" />
        <ellipse cx="15" cy="17" rx="6" ry="10" />
      </g>
      <path
        d="M-6 31q6 8 12 0"
        fill="none"
        stroke="#55315f"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="25" cy="-18" r="6" fill="#fff" fillOpacity=".35" />
    </g>
  );
}

/** Original vector worlds. No third-party characters, remote images or route information. */
export function ThemeArtwork({
  theme,
  background = false,
}: {
  theme: ThemeId;
  background?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const chaos = theme === 'chaos';
  return (
    <svg
      className={'cpi-world-art world-' + theme}
      viewBox="0 0 720 450"
      preserveAspectRatio={background ? 'xMidYMid slice' : 'xMidYMid meet'}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id + 'sky'} cx={chaos ? '.3' : '.7'} cy=".3" r=".85">
          <stop stopColor={chaos ? '#30514a' : '#604580'} />
          <stop offset=".55" stopColor={chaos ? '#151f25' : '#202447'} />
          <stop offset="1" stopColor="#090b17" />
        </radialGradient>
        <linearGradient id={id + 'pane'} x2=".7" y2="1">
          <stop stopColor={chaos ? '#ffd6a8' : '#e6d2ff'} stopOpacity=".7" />
          <stop offset=".4" stopColor={chaos ? '#d9995e' : '#9badff'} stopOpacity=".12" />
          <stop offset="1" stopColor={chaos ? '#8adfc5' : '#edb7ef'} stopOpacity=".5" />
        </linearGradient>
        <radialGradient id={id + 'moon'} cx=".35" cy=".3">
          <stop stopColor="#ffe6ff" />
          <stop offset=".5" stopColor="#c2a7f8" />
          <stop offset="1" stopColor="#655894" />
        </radialGradient>
        <linearGradient id={id + 'mist'} x2="1" y2="1">
          <stop stopColor={chaos ? '#72d5b2' : '#c3b0ff'} stopOpacity=".2" />
          <stop offset="1" stopColor="#9ec1f7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="720" height="450" fill={'url(#' + id + 'sky)'} />
      <ellipse
        cx="475"
        cy="310"
        rx="400"
        ry="80"
        fill={'url(#' + id + 'mist)'}
        transform="rotate(-22 475 310)"
      />
      {Array.from({ length: 35 }, (_, i) => (
        <circle
          key={i}
          cx={(i * 137 + 31) % 720}
          cy={(i * 79 + 22) % 380}
          r={i % 5 === 0 ? 2 : 0.8}
          fill={chaos ? '#b5ffd8' : '#e7d5ff'}
          opacity={0.15 + (i % 4) * 0.12}
        />
      ))}
      {chaos ? (
        <g fill="none" stroke="#f3bb83" strokeOpacity=".23">
          <path
            d="M0 83h120v125h-37v242M720 60H580v148h72v242M35 0v53h226v-53M680 0v116h-91"
            strokeWidth="13"
          />
          {[100, 610].map((x) => (
            <g key={x} className="cpi-theme-gear" style={{ transformOrigin: `${x}px 164px` }}>
              <circle cx={x} cy="164" r="54" strokeWidth="13" strokeDasharray="12 7" />
              <circle cx={x} cy="164" r="32" strokeWidth="3" />
              <path d={`M${x - 32} 164h64m-32-32v64`} strokeWidth="8" />
            </g>
          ))}
          <path d="M168 300h-77v96M571 280h71v130" stroke="#78e3bf" strokeWidth="2" />
          <circle cx="168" cy="300" r="5" fill="#96fbd3" />
          <circle cx="571" cy="280" r="5" fill="#96fbd3" />
        </g>
      ) : (
        <g>
          <circle cx="550" cy="109" r="65" fill={'url(#' + id + 'moon)'} />
          <ellipse
            cx="550"
            cy="109"
            rx="111"
            ry="21"
            fill="none"
            stroke="#e8caff"
            strokeOpacity=".65"
            strokeWidth="6"
            transform="rotate(-24 550 109)"
          />
          <circle cx="123" cy="126" r="25" fill="#8ccde5" opacity=".6" />
          <circle cx="390" cy="44" r="9" fill="#c3bfff" opacity=".55" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              className="cpi-theme-bubble"
              cx={65 + i * 147}
              cy={210 + (i % 3) * 60}
              r={8 + i * 3}
              fill="#c0c4ff"
              fillOpacity=".08"
              stroke="#e8d5ff"
              strokeOpacity=".22"
              style={{ animationDelay: `${i * -0.8}s` }}
            />
          ))}
        </g>
      )}
      {!background && (
        <>
          <g stroke={chaos ? '#a8e6ca' : '#c7b9f0'} strokeOpacity=".65">
            <path d="m327 200-231 250m297-250 231 250" strokeWidth="3" />
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const top = 211 + i * i * 5.7,
                bottom = 220 + (i + 1) * (i + 1) * 5.7;
              const half = (top - 160) * 0.87,
                halfBottom = (bottom - 160) * 0.87;
              return (
                <g key={i} fill={'url(#' + id + 'pane)'}>
                  <path d={`M${360 - half} ${top}H352v${bottom - top}H${360 - halfBottom}Z`} />
                  <path d={`M368 ${top}H${360 + half}L${360 + halfBottom} ${bottom}H368Z`} />
                </g>
              );
            })}
          </g>
          {chaos ? (
            <>
              <Robot x={166} y={293} scale={1.15} tilt={-8} />
              <Robot x={559} y={320} scale={0.74} tilt={10} />
            </>
          ) : (
            <>
              <Jelly x={174} y={320} scale={1.28} />
              <Jelly x={570} y={335} scale={0.8} color="#8cdbe8" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

export function ThemeCompanion({
  theme,
  reaction,
}: {
  theme: ThemeId;
  reaction: 'calm' | 'happy' | 'panic';
}) {
  if (theme === 'obsidian') return null;
  return (
    <div className={'cpi-theme-companion is-' + reaction} aria-hidden="true">
      <svg viewBox="-90 -90 180 185">
        {theme === 'chaos' ? (
          <Robot x={0} y={-5} scale={0.95} />
        ) : (
          <Jelly x={0} y={0} scale={1.15} />
        )}
      </svg>
    </div>
  );
}
