import { useId } from 'react';
import { projectBridgePoint } from './bridge-geometry';
import type { BridgeModel } from './campaign-content';

const point = (x: number, z: number, y = 0) => {
  const p = projectBridgePoint(x, z, y);
  return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
};
const positions = [15, 11.4, 8.3, 5.5, 3.15, 1.3];
const sides = [-1, 1] as const;

/** Scenic structures share the perspective of the deck and sit behind the tile artwork. */
export function BridgeArchitecture({ model }: { model: BridgeModel }) {
  const pond = useId();
  if (
    model === 'original' ||
    model === 'jelly' ||
    model === 'cookie' ||
    model === 'aurora' ||
    model === 'prism'
  )
    return null;
  if (model === 'lily')
    return (
      <g className="cpi-bridge-architecture" data-architecture={model}>
        <defs>
          <radialGradient id={pond} cy=".68" r=".58">
            <stop stopColor="#205552" stopOpacity=".72" />
            <stop offset=".64" stopColor="#103b3d" stopOpacity=".49" />
            <stop offset="1" stopColor="#102e35" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="450" cy="543" rx="519" ry="252" fill={`url(#${pond})`} />
        {positions.map((z, i) => {
          const center = projectBridgePoint(0, z, -19);
          const bank = projectBridgePoint(560, z, -19);
          const width = bank.x - center.x;
          return (
            <g key={z} opacity={0.25 + i * 0.04}>
              <ellipse
                cx={center.x}
                cy={center.y}
                rx={width}
                ry={width / 8}
                fill="none"
                stroke="#78b7a2"
                strokeWidth="1.25"
                strokeDasharray={`${width * 0.4} ${width * 0.15} ${width * 0.26} ${width * 0.12}`}
              />
              {sides.map((side) => (
                <path
                  key={side}
                  d={`M${point(side * 492, z, -12)}Q${point(side * 535, z, 40)} ${point(side * 566, z, 75)}M${point(side * 520, z, -9)}Q${point(side * 575, z, 63)} ${point(side * 550, z, 115)}`}
                  fill="none"
                  stroke="#a3b472"
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}
      </g>
    );
  return (
    <g className="cpi-bridge-architecture" data-architecture={model} strokeLinejoin="round">
      {positions.map((z, index) => {
        const near = positions[index + 1] ?? 0.26;
        const shade = Math.min(0.96, 0.37 + index * 0.12);
        return (
          <g key={z} opacity={shade}>
            {model === 'trestle' && (
              <>
                <polygon
                  points={`${point(-487, z, -8)} ${point(487, z, -8)} ${point(487, z, -46)} ${point(-487, z, -46)}`}
                  fill="#583528"
                  stroke="#d99760"
                  strokeWidth="1.8"
                />
                {sides.map((side) => (
                  <g key={side}>
                    <path
                      d={`M${point(side * 495, z, 85)} ${point(side * 495, near, 12)}M${point(side * 495, z, 12)} ${point(side * 495, near, 85)}`}
                      stroke="#8e5b41"
                      strokeWidth="6"
                    />
                    <path
                      d={`M${point(side * 495, z, 90)} ${point(side * 495, near, 90)}`}
                      stroke="#d59a69"
                      strokeWidth="3.3"
                    />
                    <polygon
                      points={`${point(side * 470, z, 111)} ${point(side * 511, z, 100)} ${point(side * 529, z, -161)} ${point(side * 461, z, -140)}`}
                      fill="#40241d"
                      stroke="#e6a978"
                      strokeWidth="1.8"
                    />
                    <path
                      d={`M${point(side * 487, z, 102)} ${point(side * 495, z, -148)}`}
                      stroke="#9b654b"
                      strokeWidth="2.3"
                    />
                    <path
                      d={`M${point(side * 472, z, 84)} ${point(side * 502, z, 84)}`}
                      stroke="#f9c794"
                      strokeWidth="2.3"
                    />
                  </g>
                ))}
              </>
            )}
            {model === 'frost' && (
              <>
                <polygon
                  points={`${point(-492, z, -7)} ${point(492, z, -7)} ${point(382, z, -75)} ${point(-382, z, -75)}`}
                  fill="#29486a"
                  stroke="#b3e3f7"
                  strokeWidth="1.65"
                />
                {sides.map((side) => (
                  <g key={side}>
                    <polygon
                      points={`${point(side * 411, z, 10)} ${point(side * 498, z, 18)} ${point(side * 531, z, -63)} ${point(side * 454, z, -165)} ${point(side * 409, z, -85)}`}
                      fill="#486c92"
                      stroke="#9bc6e6"
                      strokeWidth="1.5"
                    />
                    <polygon
                      points={`${point(side * 410, z, 12)} ${point(side * 496, z, 22)} ${point(side * 512, z, -13)} ${point(side * 438, z, -3)}`}
                      fill="#d7ecf4"
                    />
                    <path
                      d={`M${point(side * 495, z, -14)} ${point(side * 470, z, -58)} ${point(side * 498, z, -72)} ${point(side * 454, z, -151)}`}
                      stroke="#bdf4ff"
                      strokeWidth="1.25"
                    />
                  </g>
                ))}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
