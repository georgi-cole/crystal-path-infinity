import { useThemeId } from './store-context';
import { ThemeArtwork } from './theme-art';
import { useId } from 'react';

/** Neutral black stage with reflected edge light. No gameplay or route data. */
export function StageAtmosphere({
  subdued = false,
  emergency = false,
}: {
  subdued?: boolean;
  emergency?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const theme = useThemeId();
  if (theme !== 'obsidian')
    return (
      <div
        className={
          'cpi-theme-atmosphere' +
          (subdued ? ' is-subdued' : '') +
          (emergency ? ' is-emergency' : '')
        }
        aria-hidden="true"
      >
        <ThemeArtwork theme={theme} background />
      </div>
    );
  return (
    <div
      className={
        'cpi-stage-atmosphere' + (subdued ? ' is-subdued' : '') + (emergency ? ' is-emergency' : '')
      }
      aria-hidden="true"
    >
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
        <g className="cpi-stage-ribs" stroke="#b2b3c6" strokeOpacity=".05">
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${25 + i * 24} 150v${670 - i * 55}l${80 + i * 12} 120M${975 - i * 24} 150v${670 - i * 55}l${-80 - i * 12} 120`}
            />
          ))}
        </g>
        <g className="cpi-stage-fog">
          <ellipse cx="40" cy="400" rx="260" ry="100" fill={'url(#' + id + 'cyan)'} />
          <ellipse cx="920" cy="600" rx="280" ry="100" fill={'url(#' + id + 'pink)'} />
        </g>
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
