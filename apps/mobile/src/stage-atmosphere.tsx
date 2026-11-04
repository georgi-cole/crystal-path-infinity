import { useId } from 'react';

/** Neutral black stage with reflected edge light. No gameplay or route data. */
export function StageAtmosphere({ subdued = false }: { subdued?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={'cpi-stage-atmosphere' + (subdued ? ' is-subdued' : '')} aria-hidden="true">
      <svg viewBox="0 0 1000 1000" fill="none" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={id + 'pink'}>
            <stop stopColor="#c02d73" stopOpacity=".12" />
            <stop offset="1" stopColor="#090909" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id + 'cyan'}>
            <stop stopColor="#42c2d1" stopOpacity=".08" />
            <stop offset="1" stopColor="#090909" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id + 'beam'} x2="0" y2="1">
            <stop stopColor="#f8f4ed" stopOpacity=".045" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="650" rx="340" ry="470" fill={'url(#' + id + 'pink)'} />
        <ellipse cx="1000" cy="720" rx="360" ry="470" fill={'url(#' + id + 'cyan)'} />
        <path
          d="m190 0-110 800h500L190 0ZM810 0 420 800h500L810 0Z"
          fill={'url(#' + id + 'beam)'}
        />
        {[110, 890].map((x, i) => (
          <g key={x}>
            <path
              d={`M${x} 0v1000M${x + (i ? -16 : 16)} 0v1000`}
              stroke="#d1d1d1"
              strokeOpacity=".035"
            />
            {Array.from({ length: 15 }, (_, k) => (
              <circle
                key={k}
                cx={x}
                cy={36 + k * 68}
                r={1.1}
                fill={k % 3 === 0 ? '#ed68ab' : k % 3 === 1 ? '#77e3e4' : '#9ce9b1'}
                opacity={0.08 + (k % 4) * 0.025}
              />
            ))}
          </g>
        ))}
        {Array.from({ length: 30 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 137.2 + 23) % 1000}
            cy={(i * 91.7 + 84) % 1000}
            r={0.55 + (i % 3) * 0.2}
            fill="#dcdcdc"
            opacity={0.035 + (i % 5) * 0.012}
          />
        ))}
      </svg>
    </div>
  );
}
