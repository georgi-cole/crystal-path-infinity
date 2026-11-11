import { PrismBridge } from './prism-bridge';
import { ThemeScope } from './store-provider';

/** A still material display; the home screen keeps the travelling camera. */
export function BlackMetalShowcase({ still }: { still: boolean }) {
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
          {[1, 3, 5].map((row, i) => {
            const z = 0.45 + row * 1.15;
            const side = i % 2 === 0 ? -1 : 1;
            return (
              <polyline
                key={row}
                points={`${point(side < 0 ? -420 : 34, z + 0.82)} ${point(side < 0 ? -34 : 420, z + 0.82)} ${point(side < 0 ? -34 : 420, z + 0.12)}`}
              />
            );
          })}
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
