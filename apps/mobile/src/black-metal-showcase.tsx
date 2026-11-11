import { PrismBridge } from './prism-bridge';
import { ThemeScope } from './store-provider';
import { useId } from 'react';

/** A still material display; the home screen keeps the travelling camera. */
export function BlackMetalShowcase({ still }: { still: boolean }) {
  const id = 'metal-display-' + useId().replace(/:/g, '');
  const point = (x: number, z: number) => {
    const scale = 1 / (1 + z * 0.65);
    const bend = Math.sin(z * 0.12) * 125 * (1 - Math.exp(-z * 0.3));
    return `${450 + x * scale + bend},${72 + 628 * scale}`;
  };
  return (
    <ThemeScope theme="obsidian">
      <div
        className="cpi-market-original-bridge cpi-metal-showcase"
        data-still={still}
        aria-hidden="true"
      >
        <PrismBridge preview reducedMotion />
        <svg
          className="cpi-metal-glints"
          viewBox="0 0 900 700"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <clipPath id={id + '-panes'}>
              {Array.from({ length: 19 }, (_, row) =>
                [-1, 1].map((side) => {
                  const z = 0.45 + row * 1.15;
                  const left = side < 0 ? -430 : 24,
                    right = side < 0 ? -24 : 430;
                  return (
                    <polygon
                      key={`${row}-${side}`}
                      points={`${point(left, z + 0.85)} ${point(right, z + 0.85)} ${point(right, z)} ${point(left, z)}`}
                    />
                  );
                }),
              )}
            </clipPath>
            <linearGradient id={id + '-reflection'} x1="0" y1="0" x2="1" y2=".25">
              <stop stopColor="#e9f5ff" stopOpacity="0" />
              <stop offset=".3" stopColor="#d7e9f3" stopOpacity=".03" />
              <stop offset=".52" stopColor="#eef9ff" stopOpacity=".24" />
              <stop offset=".7" stopColor="#d7e9f3" stopOpacity=".07" />
              <stop offset="1" stopColor="#e9f5ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g clipPath={`url(#${id}-panes)`}>
            <rect
              className="cpi-metal-reflection"
              x="-380"
              y="0"
              width="380"
              height="700"
              fill={`url(#${id}-reflection)`}
            />
          </g>
        </svg>
        <i className="cpi-metal-mist" />
        <i className="cpi-metal-mist is-far" />
        <span className="cpi-metal-motes">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </ThemeScope>
  );
}
