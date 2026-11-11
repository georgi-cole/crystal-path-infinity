import { sameBridgePresentation } from './bridge-render';
import { MysteryCube } from './mystery-box';
import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, SVGProps } from 'react';
import type { Season, TileSide, Weather } from '@crystal-path-infinity/game-core';
import type { PresentedRow } from './infinity-presentation';
import { useLanguage } from './language-context';
import type { SceneFeedback } from './infinity-scene';
import {
  bridgePane,
  bridgeTileThickness,
  projectBridgePoint,
  advancesOneRow,
} from './bridge-geometry';
import { glassPattern, glassSeed, projectGlassPattern } from './glass-fracture';
import type { HintScan } from './run-signals';
import { BridgeFlight } from './bridge-flight';
import { MysteryCache } from './world-treasures';
import type { SceneCinematic } from './scene-cinematics';

const WIDTH = 900,
  HEIGHT = 700;
import { useThemeId } from './store-context';
import { THEMES } from './store-catalog';
import type { WorldId } from './store-catalog';
import { bridgeModel } from './campaign-content';
import type { BridgeModel, BridgeStyle } from './campaign-content';
import { BridgeArchitecture } from './bridge-architecture';
import playfulMaterials from './assets/campaign/playful-material-atlas.webp?url';
import bridgeMaterials from './assets/campaign/bridge-material-atlas.webp?url';
import cosmicMaterial from './assets/campaign/cosmic-material-v2.webp?url';

const TILE_FINISHES = {
  frost: ['#deefff', '#7fb5df', '#355e86', '#c6edff'],
  aurora: ['#e5fff7', '#79d9ca', '#554089', '#c3b7ff'],
  'prism-glass': ['#fff0ff', '#df9be9', '#614281', '#fdc6e7'],
} as const;
const CUE_NAMES = {
  echo: 'Echo. Land here',
  mirror: 'Mirror. Land on the opposite side',
  prism: 'Rainbow. Land here',
  gust: 'Gust. Land here',
  crack: 'Both tiles are cracked',
  beacon: 'Beacon. Land here',
  lens: 'Sunshades. Land here',
} as const;
const CUE_GLYPHS = {
  echo: '◎',
  mirror: '↔',
  prism: '◇',
  gust: '⌁',
  crack: 'ϟ',
  beacon: '✦',
  lens: '◒',
} as const;
type Point = { x: number; y: number };
const coordinates = (points: Point[]) =>
  points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const blend = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function front(points: Point[], distance: number, thickness = 8) {
  const depth = Math.max(2, thickness / (1 + Math.max(0, distance) * 0.4));
  return [
    points[3],
    points[2],
    { ...points[2], y: points[2].y + depth },
    { ...points[3], y: points[3].y + depth },
  ];
}
function blockFront(points: Point[], distance: number, thickness: number) {
  const lip = points.length === 6 ? points.slice(2, 6) : points.slice(3, 7);
  const depth = thickness / (1 + Math.max(0, distance) * 0.4);
  return [...lip, ...[...lip].reverse().map((p) => ({ x: p.x, y: p.y + depth }))];
}
function shine(points: Point[]) {
  return [
    blend(points[0], points[1], 0.2),
    blend(points[0], points[1], 0.25),
    blend(points[3], points[2], 0.62),
    blend(points[3], points[2], 0.55),
  ];
}
const onFace = (p: Point[], u: number, v: number) =>
  blend(blend(p[0], p[1], u), blend(p[3], p[2], u), v);
function deckFace(points: Point[], model: BridgeModel) {
  if (model === 'aurora')
    return Array.from({ length: 40 }, (_, i) => {
      const angle = (i / 40) * Math.PI * 2;
      return onFace(points, 0.5 + Math.cos(angle) * 0.48, 0.5 + Math.sin(angle) * 0.48);
    });
  if (model === 'lily')
    return Array.from({ length: 26 }, (_, i) => {
      const angle = Math.PI / 2 + (i / 26) * Math.PI * 2;
      const radius = i === 0 ? 0.12 : 0.48;
      return onFace(points, 0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius);
    });
  const cut =
    model === 'jelly' || model === 'cookie'
      ? [
          [0.13, 0],
          [0.87, 0],
          [1, 0.16],
          [1, 0.84],
          [0.87, 1],
          [0.13, 1],
          [0, 0.84],
          [0, 0.16],
        ]
      : model === 'trestle'
        ? [
            [0.035, 0],
            [0.965, 0],
            [1, 0.04],
            [1, 0.96],
            [0.965, 1],
            [0.035, 1],
            [0, 0.96],
            [0, 0.04],
          ]
        : model === 'frost'
          ? [
              [0.14, 0],
              [0.83, 0.02],
              [1, 0.16],
              [1, 0.82],
              [0.88, 1],
              [0.13, 0.97],
              [0, 0.84],
              [0, 0.14],
            ]
          : model === 'prism'
            ? [
                [0.17, 0],
                [0.82, 0],
                [1, 0.45],
                [0.82, 1],
                [0.17, 1],
                [0, 0.45],
              ]
            : null;
  return cut ? cut.map(([u, v]) => onFace(points, u, v)) : points;
}
const materialTiles = {
  trestle: [0, 0],
  frost: [0, -1],
  lily: [-1, -1],
} as const;
type PaintedModel = keyof typeof materialTiles;

/** A fragment clips the original face, preserving its texture scale across the fracture. */
function CutSurface({ piece, face, paint }: { piece: Point[]; face: Point[]; paint: string }) {
  const clip = useId().replaceAll(':', '');
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <polygon points={coordinates(piece)} />
        </clipPath>
      </defs>
      <polygon points={coordinates(face)} fill={paint} clipPath={`url(#${clip})`} />
    </>
  );
}

function TrampolineFrame({
  pane,
  distance = 0,
  torn = false,
}: {
  pane: Point[];
  distance?: number;
  torn?: boolean;
}) {
  const finishId = useId().replaceAll(':', '');
  const ring = (radius: number) =>
    Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return onFace(pane, 0.5 + Math.cos(a) * radius, 0.5 + Math.sin(a) * radius);
    });
  const width = Math.max(0.65, 5 / (1 + Math.max(0, distance) * 0.4));
  const lip = ring(0.48).slice(0, 21);
  const depth = width * 2.5;
  return (
    <g className="cpi-trampoline-hardware">
      <defs>
        <linearGradient id={finishId + 'pad'} x1="0" y1="0" x2=".7" y2="1">
          <stop stopColor="#75a6ac" />
          <stop offset=".3" stopColor="#315f71" />
          <stop offset=".72" stopColor="#183d51" />
          <stop offset="1" stopColor="#496d79" />
        </linearGradient>
        <linearGradient id={finishId + 'side'} x2="0" y2="1">
          <stop stopColor="#315c6c" />
          <stop offset=".35" stopColor="#173343" />
          <stop offset="1" stopColor="#071723" />
        </linearGradient>
        <radialGradient id={finishId + 'fabric'}>
          <stop stopColor="#17263a" />
          <stop offset=".8" stopColor="#263c52" />
          <stop offset="1" stopColor="#344f65" />
        </radialGradient>
      </defs>
      {distance < 5 &&
        [0.2, 0.8].map((u) => {
          const p = onFace(pane, u, 0.78);
          return (
            <path
              key={u}
              d={`M${p.x} ${p.y}v${depth * 1.8}l${u < 0.5 ? -depth * 0.5 : depth * 0.5} 2`}
              stroke="#73848b"
              strokeWidth={width * 0.65}
              fill="none"
            />
          );
        })}
      <polygon
        points={coordinates([
          ...lip,
          ...[...lip].reverse().map((p) => ({ x: p.x, y: p.y + depth })),
        ])}
        fill={`url(#${finishId}side)`}
        stroke="#648592"
        strokeWidth={width * 0.2}
      />
      <polygon
        points={coordinates(ring(0.48))}
        fill={`url(#${finishId}pad)`}
        stroke="#e7c685"
        strokeWidth={width}
      />
      <g className="cpi-trampoline-bed">
        <polygon
          points={coordinates(ring(0.4))}
          fill={torn ? '#060e1b' : `url(#${finishId}fabric)`}
          stroke="#a9bdc7"
          strokeWidth={width * 0.35}
        />
        {!torn && (
          <polygon
            points={coordinates(ring(0.35))}
            fill="none"
            stroke="#668295"
            strokeOpacity=".65"
            strokeDasharray="2 3"
            strokeWidth={width * 0.22}
          />
        )}
      </g>
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        const at = (r: number, offset = 0) =>
          onFace(pane, 0.5 + Math.cos(a + offset) * r, 0.5 + Math.sin(a + offset) * r);
        const coil = [at(0.405), at(0.425, 0.018), at(0.438, -0.018), at(0.46)];
        return (
          <polyline
            key={i}
            points={coordinates(coil)}
            stroke="#c0cfce"
            strokeWidth={width * 0.24}
            fill="none"
          />
        );
      })}
    </g>
  );
}

function MaterialBreak({
  model,
  face,
  pane,
  paint,
  distance,
  tint,
}: {
  model: PaintedModel | 'jelly' | 'cookie' | 'aurora' | 'prism';
  face: Point[];
  pane: Point[];
  paint: string;
  distance: number;
  tint?: number;
}) {
  const middle = onFace(pane, 0.5, 0.5);
  const depth = (value: number) => value / (1 + Math.max(0, distance) * 0.4);
  const thickness = bridgeTileThickness(model);
  if (model === 'lily') {
    const radius = Math.abs(pane[2].x - pane[3].x) * 0.34;
    return (
      <g className="cpi-material-break" data-material="lily">
        <ellipse
          className="cpi-lily-ripple"
          cx={middle.x}
          cy={middle.y + 4}
          rx={radius}
          ry={radius * 0.2}
          fill="none"
          stroke="#83e6cb"
          strokeWidth="2.1"
        />
        <ellipse
          className="cpi-lily-ripple is-afterwave"
          cx={middle.x}
          cy={middle.y + 4}
          rx={radius * 0.77}
          ry={radius * 0.154}
          fill="none"
          stroke="#c2e7c7"
          strokeWidth="1"
        />
        <g className="cpi-lily-plunge">
          <polygon
            points={coordinates(face.map((p) => ({ x: p.x, y: p.y + depth(4) })))}
            fill="#32583b"
          />
          <polygon points={coordinates(face)} fill={paint} />
          <path
            d={`M${middle.x} ${middle.y}L${face[10].x} ${face[10].y}`}
            stroke="#b8d78c"
            strokeOpacity=".65"
            strokeWidth="1"
          />
        </g>
        {[-0.65, -0.28, 0.34, 0.73].map((offset, i) => (
          <ellipse
            key={offset}
            className="cpi-water-drop"
            cx={middle.x + radius * offset}
            cy={middle.y + 2}
            rx={2.1 + (i % 2)}
            ry={3.4 + (i % 2)}
            fill="#a9e0d0"
            style={
              {
                '--drop-x': `${offset * 35}px`,
                '--drop-rise': `${-13 - (i % 2) * 8}px`,
              } as CSSProperties
            }
          />
        ))}
      </g>
    );
  }
  if (model === 'jelly')
    return (
      <g
        className="cpi-material-break"
        data-material="jelly"
        style={{ filter: `hue-rotate(${tint ?? 0}deg)` }}
      >
        <g className="cpi-jelly-sag">
          <polygon
            points={coordinates(blockFront(face, distance, thickness))}
            fill="#bc56be"
            stroke="#f3a3dd"
            strokeWidth="1.2"
          />
          <polygon points={coordinates(face)} fill={paint} stroke="#ffe4f4" strokeWidth="1.5" />
          <path
            d={`M${face[4].x} ${face[4].y + depth(5)}L${face[5].x} ${face[5].y + depth(5)}`}
            stroke="#fff5fc"
            strokeWidth="2"
            opacity=".65"
          />
        </g>
        {[-0.6, -0.2, 0.35, 0.7].map((offset, i) => (
          <ellipse
            key={offset}
            className="cpi-jelly-blob"
            cx={middle.x + Math.abs(pane[2].x - pane[3].x) * offset * 0.35}
            cy={middle.y}
            rx={8 + (i % 2) * 7}
            ry={5 + (i % 2) * 4}
            fill={i % 2 ? '#ff9ac6' : '#c979e6'}
            style={
              {
                '--blob-x': `${offset * 72}px`,
                '--blob-delay': `${130 + i * 32}ms`,
              } as CSSProperties
            }
          />
        ))}
      </g>
    );
  if (model === 'aurora')
    return (
      <g className="cpi-material-break" data-material="trampoline">
        <TrampolineFrame pane={pane} distance={distance} torn />
        {[false, true].map((right) => (
          <g
            key={String(right)}
            className="cpi-trampoline-tear"
            style={{ '--tear-direction': right ? '14deg' : '-14deg' } as CSSProperties}
          >
            <polygon
              points={coordinates(
                (right
                  ? [
                      [0.51, 0.13],
                      [0.83, 0.28],
                      [0.88, 0.63],
                      [0.66, 0.86],
                      [0.55, 0.65],
                      [0.62, 0.54],
                      [0.48, 0.43],
                      [0.56, 0.31],
                    ]
                  : [
                      [0.49, 0.13],
                      [0.17, 0.28],
                      [0.12, 0.63],
                      [0.34, 0.86],
                      [0.45, 0.65],
                      [0.38, 0.54],
                      [0.52, 0.43],
                      [0.44, 0.31],
                    ]
                ).map(([u, v]) => onFace(pane, u, v)),
              )}
              fill="#263b53"
              stroke="#96b4c0"
              strokeWidth="1.2"
            />
            {[0.32, 0.44, 0.57, 0.68].map((v) => {
              const p = onFace(pane, 0.5, v);
              return (
                <path
                  key={v}
                  d={`M${p.x} ${p.y}l${right ? 8 : -8} 5`}
                  stroke="#b4c4cc"
                  strokeWidth=".9"
                />
              );
            })}
          </g>
        ))}
      </g>
    );
  if (model === 'prism')
    return (
      <g className="cpi-material-break" data-material="cosmic">
        <ellipse
          className="cpi-cosmic-ring"
          cx={middle.x}
          cy={middle.y}
          rx={Math.abs(pane[2].x - pane[3].x) * 0.42}
          ry={depth(17)}
          stroke="#c7a7ff"
          strokeWidth="2"
          fill="none"
        />
        <polygon className="cpi-cosmic-vanish" points={coordinates(face)} fill={paint} />
        {Array.from({ length: 12 }, (_, i) => (
          <circle
            key={i}
            className="cpi-cosmic-dust"
            cx={middle.x + ((i % 4) - 1.5) * 15}
            cy={middle.y + ((i % 3) - 1) * 8}
            r={1.5 + (i % 3)}
            fill={i % 2 ? '#9ee9ee' : '#deb8ff'}
            style={
              {
                '--dust-x': `${((i % 4) - 1.5) * 45}px`,
                '--dust-y': `${-25 - (i % 5) * 16}px`,
                '--break-delay': `${(i % 4) * 30}ms`,
              } as CSSProperties
            }
          />
        ))}
      </g>
    );
  if (model === 'cookie')
    return (
      <g className="cpi-material-break" data-material="cookie">
        {[0, 0.48].map((u, i) => {
          const piece = (
            i
              ? [
                  [0.48, 0.02],
                  [0.87, 0],
                  [1, 0.16],
                  [1, 0.84],
                  [0.87, 1],
                  [0.51, 1],
                  [0.55, 0.77],
                  [0.44, 0.61],
                  [0.55, 0.4],
                  [0.46, 0.23],
                ]
              : [
                  [0.13, 0],
                  [0.48, 0.02],
                  [0.46, 0.23],
                  [0.55, 0.4],
                  [0.44, 0.61],
                  [0.55, 0.77],
                  [0.51, 1],
                  [0.13, 1],
                  [0, 0.84],
                  [0, 0.16],
                ]
          ).map(([x, y]) => onFace(pane, x, y));
          const lip = i ? piece.slice(3, 7) : piece.slice(5, 9);
          const edge = [
            ...lip,
            ...[...lip].reverse().map((p) => ({ x: p.x, y: p.y + depth(thickness) })),
          ];
          const fracture = [
            [0.48, 0.02],
            [0.46, 0.23],
            [0.55, 0.4],
            [0.44, 0.61],
            [0.55, 0.77],
            [0.51, 1],
          ].map(([x, y]) => onFace(pane, x, y));
          const filling = [
            ...fracture,
            ...[...fracture].reverse().map((p) => ({ x: p.x, y: p.y + depth(thickness) })),
          ];
          return (
            <g
              className="cpi-cookie-half"
              key={u}
              style={
                {
                  '--break-x': `${i ? 28 : -28}px`,
                  '--break-direction': `${i ? 15 : -18}deg`,
                } as CSSProperties
              }
            >
              <polygon
                points={coordinates(edge)}
                fill="#9d582b"
                stroke="#d18d47"
                strokeWidth="1.4"
              />
              <polygon
                points={coordinates(filling)}
                fill="#ad642f"
                stroke="#d79b5d"
                strokeWidth="1"
              />
              <polyline
                points={coordinates(
                  fracture.map((p) => ({ x: p.x, y: p.y + depth(thickness * 0.5) })),
                )}
                stroke="#ffe7b8"
                strokeWidth={depth(thickness * 0.28)}
                fill="none"
                strokeLinejoin="round"
              />
              <polyline
                points={coordinates(lip.map((p) => ({ x: p.x, y: p.y + depth(thickness * 0.5) })))}
                stroke="#ffe5aa"
                strokeWidth={depth(thickness * 0.26)}
                fill="none"
              />
              <CutSurface piece={piece} face={face} paint={paint} />
              <polygon points={coordinates(piece)} fill="none" stroke="#efc47b" strokeWidth="1.7" />
            </g>
          );
        })}
        {Array.from({ length: 9 }, (_, i) => (
          <circle
            className="cpi-cookie-crumb"
            key={i}
            cx={middle.x + ((i % 3) - 1) * 9}
            cy={middle.y + (i % 3) * 3}
            r={2 + (i % 3)}
            fill={i % 2 ? '#ecc178' : '#704024'}
            style={
              {
                '--dust-x': `${((i % 3) - 1) * 43}px`,
                '--dust-y': `${35 + i * 8}px`,
                '--break-delay': `${(i % 3) * 35}ms`,
              } as CSSProperties
            }
          />
        ))}
      </g>
    );
  const splits = model === 'trestle' ? [0, 0.28, 0.59, 1] : [0, 0.32, 0.67, 1];
  return (
    <g className="cpi-material-break" data-material={model}>
      {splits.slice(0, -1).map((start, i) => {
        const end = splits[i + 1];
        const piece =
          model === 'trestle'
            ? [
                onFace(pane, 0, start),
                onFace(pane, 0.48, start + 0.035),
                onFace(pane, 0.54, start),
                onFace(pane, 1, start + 0.025),
                onFace(pane, 0.99, end),
                onFace(pane, 0.51, end - 0.04),
                onFace(pane, 0.45, end),
                onFace(pane, 0, end - 0.02),
              ]
            : [
                onFace(pane, start, 0.05),
                onFace(pane, end, 0),
                onFace(pane, end - 0.09, 0.56),
                onFace(pane, end, 0.94),
                onFace(pane, start + 0.08, 1),
                onFace(pane, start, 0.47),
              ];
        const lip = model === 'trestle' ? piece.slice(4) : piece.slice(2, 6);
        const edge = [
          ...lip,
          ...[...lip].reverse().map((p) => ({ x: p.x, y: p.y + depth(thickness) })),
        ];
        return (
          <g
            key={start}
            className="cpi-material-piece"
            style={
              {
                '--break-direction': i % 2 ? '14deg' : '-12deg',
                '--break-delay': `${i * 48}ms`,
                '--break-x': `${(i - 1) * 29}px`,
              } as CSSProperties
            }
          >
            <polygon
              points={coordinates(edge)}
              fill={model === 'trestle' ? '#5b341c' : '#4e96c2'}
              stroke={model === 'trestle' ? '#be8555' : '#a6e0f1'}
              strokeWidth="1"
            />
            <CutSurface piece={piece} face={face} paint={paint} />
            <polygon
              points={coordinates(piece)}
              fill="none"
              stroke={model === 'trestle' ? '#d0a271' : '#ddfbff'}
              strokeWidth="1.5"
            />
            {model === 'frost' && (
              <polygon
                points={coordinates([piece[0], piece[2], piece[4]])}
                fill="#eaffff"
                fillOpacity=".24"
                stroke="#ecffff"
                strokeOpacity=".6"
                strokeWidth=".8"
              />
            )}
            {model === 'trestle' && (
              <path
                d={`M${piece[4].x} ${piece[4].y}l-9 7 5-2-3 8m-7-12-5 10`}
                stroke="#dfb78b"
                strokeWidth="1.4"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
function reflectedLight(points: Point[], kind: 'rail' | 'strip') {
  return (
    kind === 'rail'
      ? [
          [0.91, 0.02],
          [0.955, 0.02],
          [0.955, 0.98],
          [0.91, 0.98],
        ]
      : [
          [0.03, 0.16],
          [0.97, 0.16],
          [0.97, 0.19],
          [0.03, 0.19],
        ]
  ).map(([u, v]) => onFace(points, u, v));
}
function inset(points: Point[]) {
  const center = points.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
  return points.map((p) => blend(p, center, 0.045));
}
function worldInlay(points: Point[], theme: WorldId) {
  const motifs: Record<WorldId, number[][]> = {
    chaos: [
      [0.1, 0.25],
      [0.1, 0.72],
      [0.28, 0.72],
      [0.28, 0.78],
      [0.06, 0.78],
      [0.06, 0.25],
    ],
    jelly: [
      [0.48, 0.19],
      [0.57, 0.5],
      [0.48, 0.8],
      [0.39, 0.5],
    ],
    wilds: [
      [0.09, 0.27],
      [0.23, 0.35],
      [0.18, 0.61],
      [0.12, 0.48],
      [0.07, 0.65],
      [0.04, 0.39],
    ],
    league: [
      [0.09, 0.25],
      [0.26, 0.25],
      [0.17, 0.5],
      [0.26, 0.5],
      [0.09, 0.78],
      [0.15, 0.54],
      [0.04, 0.54],
    ],
    puppy: [
      [0.07, 0.24],
      [0.24, 0.31],
      [0.21, 0.55],
      [0.15, 0.48],
      [0.12, 0.7],
      [0.04, 0.61],
    ],
    kitten: [
      [0.2, 0.22],
      [0.1, 0.45],
      [0.19, 0.72],
      [0.08, 0.62],
      [0.04, 0.43],
      [0.1, 0.28],
    ],
  };
  return motifs[theme].map(([u, v]) => onFace(points, u, v));
}
function MovingPolygon({
  shape,
  previous,
  step,
  ...props
}: Omit<SVGProps<SVGPolygonElement>, 'points'> & {
  shape: Point[];
  previous?: Point[];
  step: string;
}) {
  return (
    <polygon {...props} points={coordinates(shape)}>
      {previous && (
        <animate
          key={step}
          attributeName="points"
          from={coordinates(previous)}
          to={coordinates(shape)}
          dur=".28s"
          calcMode="spline"
          keyTimes="0;1"
          keySplines=".22 .65 .3 1"
          fill="freeze"
        />
      )}
    </polygon>
  );
}
function MovingLamp({
  x,
  z,
  color,
  previous,
  step,
  flame,
  pearl = false,
}: {
  x: number;
  z: number;
  color: string;
  previous: boolean;
  step: string;
  flame?: boolean;
  pearl?: boolean;
}) {
  const p = projectBridgePoint(x, z),
    old = previous ? projectBridgePoint(x, z + 1.15) : null;
  const scale = 1 / (1 + z * 0.65),
    oldScale = 1 / (1 + (z + 1.15) * 0.65);
  return (
    <g
      className="cpi-rail-lamp"
      style={{ '--lamp-delay': `${-z * 0.37}s` } as CSSProperties}
      transform={`translate(${p.x} ${p.y - 4 * scale})`}
    >
      {old && (
        <animateTransform
          key={step + 'position'}
          attributeName="transform"
          type="translate"
          from={`${old.x} ${old.y - 4 * oldScale}`}
          to={`${p.x} ${p.y - 4 * scale}`}
          dur=".28s"
          fill="freeze"
          calcMode="spline"
          keyTimes="0;1"
          keySplines=".22 .65 .3 1"
        />
      )}
      <g transform={`scale(${scale})`}>
        {old && (
          <animateTransform
            key={step + 'scale'}
            attributeName="transform"
            type="scale"
            from={oldScale}
            to={scale}
            dur=".28s"
            fill="freeze"
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".22 .65 .3 1"
          />
        )}
        {pearl ? (
          <g className="cpi-pearl-lantern">
            <path d="M0 8V-25q0-12 11-12h6m-4-2v8" fill="none" stroke="#e6c78e" strokeWidth="2.5" />
            <ellipse cx="13" cy="-15" rx="14" ry="20" fill="#fff2bb" opacity=".13" />
            <ellipse
              cx="13"
              cy="-17"
              rx="7"
              ry="9"
              fill="#fff0bf"
              stroke="#c09b60"
              strokeWidth="1.4"
            />
            <path d="M8-24h10m-10 14h10m-5-13v12" stroke="#d3aa6e" strokeWidth="1" />
            <path d="m13-8 0 5" stroke="#e6c78e" strokeWidth="1.7" />
          </g>
        ) : (
          [
            { r: 12, opacity: 0.1, fill: color },
            { r: 6, opacity: 0.16, fill: color },
            { r: 2.9, opacity: 0.95, fill: color },
            { r: 1.15, opacity: 0.95, fill: '#ffffff' },
          ].map((layer, i) => (
            <circle key={i} r={layer.r} fill={layer.fill} opacity={layer.opacity} />
          ))
        )}
        {flame && (
          <g className="cpi-rail-flame">
            <path d="M-2 8h4v9h-4z" fill="#633b26" stroke="#efb77a" strokeWidth=".8" />
            <path d="M0 6c-7-3-4-8 1-14-1 6 5 7 3 11C3 5 2 6 0 6Z" fill="#ffb454" />
            <path d="M0 5c-3-2-1-4 1-7 1 4 1 6-1 7Z" fill="#fff2ce" />
          </g>
        )}
      </g>
    </g>
  );
}
function PaneFragments({
  points,
  seed,
  delay = 0,
  detail = 3,
  previous,
  step,
  collapsed,
  falling,
}: {
  points: Point[];
  seed: number;
  delay?: number;
  detail?: 1 | 3;
  previous?: Point[];
  step: string;
  collapsed: boolean;
  falling: boolean;
}) {
  const material = THEMES[useThemeId()];
  const pattern = useMemo(() => glassPattern(seed, detail), [seed, detail]);
  const shards = projectGlassPattern(pattern, points);
  const old = previous ? projectGlassPattern(pattern, previous) : null;
  const impact = onFace(points, 0.5, 0.5);
  return (
    <g className="cpi-pane-fragments">
      {falling &&
        detail === 3 &&
        Array.from({ length: 7 }, (_, i) => (
          <path
            key={'glint-' + i}
            className="cpi-glass-impact-glint"
            d={`M${impact.x + ((i % 3) - 1) * 6} ${impact.y}l2-3 2 3-2 3Z`}
            fill={i % 2 ? '#e4f8ff' : material.surface.edge}
            style={
              {
                '--dust-x': `${(i - 3) * 14}px`,
                '--dust-y': `${-14 - (i % 3) * 18}px`,
              } as CSSProperties
            }
          />
        ))}
      {shards.map((shard, i) =>
        shard.retained && !collapsed ? (
          <MovingPolygon
            key={i}
            className="cpi-glass-anchor"
            shape={[...shard.points]}
            previous={(old && [...old[i].points]) || undefined}
            step={step}
            fill={material.glass + (shard.glint > 0.5 ? '4d' : '29')}
            stroke={material.surface.edge + 'b3'}
            strokeWidth=".65"
          />
        ) : falling ? (
          <polygon
            key={i}
            className="cpi-glass-shard"
            points={coordinates([...shard.points])}
            fill={material.glass + (shard.glint > 0.65 ? '47' : shard.glint > 0.3 ? '36' : '22')}
            stroke={material.surface.edge + (i % 4 === 0 ? 'bb' : '7a')}
            strokeWidth={i % 3 === 0 ? 0.9 : 0.5}
            style={
              {
                '--shard-x': `${shard.drift}px`,
                '--shard-turn': `${shard.turn}deg`,
                '--shard-delay': `${delay + shard.delay}ms`,
                '--shard-fall': `${540 * shard.fall}px`,
              } as CSSProperties
            }
          />
        ) : null,
      )}
    </g>
  );
}
function hitRegion(points: Point[]): CSSProperties {
  const left = Math.min(...points.map((p) => p.x)),
    top = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - left,
    height = Math.max(...points.map((p) => p.y)) - top;
  return {
    left: `${(left / WIDTH) * 100}%`,
    top: `${(top / HEIGHT) * 100}%`,
    width: `${(width / WIDTH) * 100}%`,
    height: `${(height / HEIGHT) * 100}%`,
    clipPath: `polygon(${points.map((p) => `${((p.x - left) / width) * 100}% ${((p.y - top) / height) * 100}%`).join(',')})`,
  };
}
function paneState(row: PresentedRow | undefined, side: TileSide, feedback?: SceneFeedback | null) {
  if (!row) return '';
  if (feedback?.row === row.index && feedback.side === side)
    return feedback.kind === 'safe' ? ' is-safe' : ' is-wrong';
  if (row.hint === side) return ' is-hinted';
  if (row.noSafeTile) return ' is-cracked';
  if (row.chosen === side) return row.wrong ? ' is-cracked' : ' is-cleared';
  return '';
}
function subscribeMotion(listener: () => void) {
  const q = window.matchMedia('(prefers-reduced-motion: reduce)');
  q.addEventListener('change', listener);
  return () => q.removeEventListener('change', listener);
}
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const serverMotionSnapshot = () => false;

/** Camera movement is a bounded visual transition. It never owns the game clock. */
export const PrismBridge = memo(function PrismBridge({
  rows,
  feedback,
  interactive = false,
  onChoose,
  onMystery,
  preview = false,
  reducedMotion = false,
  phase,
  collapsed = false,
  fractureSeed = 'bridge',
  hintScan = null,
  showHintCaption = false,
  showStepCaptions = true,
  allowChoices = true,
  allowedSide,
  omen,
  mysteryReveal = false,
  bridgeStyle,
  season,
  weather,
}: {
  rows?: readonly PresentedRow[];
  feedback?: SceneFeedback | null;
  interactive?: boolean;
  onChoose?: (side: TileSide) => void;
  onMystery?: () => void;
  preview?: boolean;
  reducedMotion?: boolean;
  phase?: SceneCinematic['phase'];
  collapsed?: boolean;
  fractureSeed?: string;
  hintScan?: HintScan | null;
  showHintCaption?: boolean;
  showStepCaptions?: boolean;
  allowChoices?: boolean;
  allowedSide?: TileSide;
  omen?: TileSide | null;
  mysteryReveal?: boolean;
  bridgeStyle?: BridgeStyle;
  season?: Season;
  weather?: Weather;
}) {
  const id = useId().replace(/:/g, ''),
    { t, number, locale } = useLanguage();
  const themeId = useThemeId();
  const theme = THEMES[themeId];
  const { railLights } = theme;
  const finish =
    bridgeStyle?.tiles && TILE_FINISHES[bridgeStyle.tiles as keyof typeof TILE_FINISHES];
  const copper = bridgeStyle?.rails === 'copper';
  const lighting = bridgeStyle?.lighting;
  const model = bridgeModel(bridgeStyle);
  const playful =
    model === 'cookie' || model === 'aurora' || model === 'prism' || model === 'jelly';
  const material = Object.hasOwn(materialTiles, model)
    ? materialTiles[model as PaintedModel]
    : null;
  const surfacePaint =
    'url(#' +
    id +
    (model === 'prism' ? 'cosmic' : playful ? 'playful' : material ? 'material' : 'glass') +
    ')';

  const thickness = bridgeTileThickness(model);
  const osReduced = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const reduced = reducedMotion || osReduced;
  const currentIndex = rows?.find((r) => r.phase === 'current')?.index ?? '0';
  const [camera, setCamera] = useState({ row: currentIndex, moving: false });
  if (camera.row !== currentIndex)
    setCamera({ row: currentIndex, moving: !reduced && advancesOneRow(camera.row, currentIndex) });
  const moving = camera.moving && !reduced;
  const artwork = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    // A newly inserted SMIL animation otherwise uses the old SVG document time.
    // Reset only this renderer's timeline; never the gameplay clock.
    if (moving) artwork.current?.setCurrentTime(0);
  }, [camera.row, moving]);
  useEffect(() => {
    if (!camera.moving) return;
    const timer = window.setTimeout(
      () =>
        setCamera((previous) =>
          previous.row === camera.row ? { ...previous, moving: false } : previous,
        ),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [camera.row, camera.moving]);
  if (preview)
    return (
      <div className="cpi-prism-bridge is-preview">
        <BridgeFlight reduced={reduced} />
      </div>
    );
  const distances = Array.from({ length: 17 }, (_, i) => 15 - i);
  return (
    <div
      className={
        'cpi-prism-bridge' +
        (moving ? ' is-advancing' : '') +
        (collapsed ? ' is-collapsing' : '') +
        (phase === 'contact' ? ' is-contacting' : '') +
        (hintScan ? ' is-scanning' : '')
      }
      data-camera-moving={moving ? 'true' : 'false'}
      data-static-art={reduced ? 'true' : undefined}
      data-step-phase={phase ?? 'idle'}
      data-tile-finish={bridgeStyle?.tiles}
      data-bridge-model={model}
      data-season={season}
      data-episode={weather}
    >
      <svg
        ref={artwork}
        className="cpi-bridge-art"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={id + 'cosmic'}
            width="1"
            height="1"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <image href={cosmicMaterial} width="1" height="1" preserveAspectRatio="none" />
          </pattern>
          <linearGradient id={id + 'cosmic-edge'} x2=".6" y2="1">
            <stop stopColor="#f2dcac" />
            <stop offset=".32" stopColor="#7cbed4" />
            <stop offset=".72" stopColor="#64769e" />
            <stop offset="1" stopColor="#c8e8e9" />
          </linearGradient>
          <pattern
            id={id + 'playful'}
            width="1"
            height="1"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <image
              href={playfulMaterials}
              x={model === 'cookie' || model === 'jelly' ? -1 : 0}
              y={model === 'aurora' || model === 'jelly' ? -1 : 0}
              width="2"
              height="2"
              preserveAspectRatio="none"
            />
          </pattern>
          <linearGradient id={id + 'block-side'} x2=".1" y2="1">
            <stop
              stopColor={
                model === 'prism'
                  ? '#62759c'
                  : model === 'frost'
                    ? '#b0eaf4'
                    : model === 'jelly'
                      ? '#fbc8f1'
                      : '#bb8353'
              }
            />
            <stop
              offset=".35"
              stopColor={
                model === 'prism'
                  ? '#27334e'
                  : model === 'frost'
                    ? '#5fb1d1'
                    : model === 'jelly'
                      ? '#d17ddf'
                      : '#80502f'
              }
            />
            <stop
              offset="1"
              stopColor={
                model === 'prism'
                  ? '#0b1226'
                  : model === 'frost'
                    ? '#285984'
                    : model === 'jelly'
                      ? '#8438a1'
                      : '#402617'
              }
            />
          </linearGradient>
          {material && (
            <pattern
              id={id + 'material'}
              width="1"
              height="1"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <image
                href={bridgeMaterials}
                x={material[0]}
                y={material[1]}
                width="2"
                height="2"
                preserveAspectRatio="none"
              />
            </pattern>
          )}

          <linearGradient id={id + 'glass'} x1="0" y1="0" x2=".8" y2="1">
            <stop
              stopColor={finish ? finish[0] : theme.surface.highlight}
              stopOpacity={finish ? '.60' : '.32'}
            />
            <stop
              offset=".36"
              stopColor={finish ? finish[1] : '#98adb3'}
              stopOpacity={finish ? '.31' : '.09'}
            />
            <stop
              offset=".58"
              stopColor={finish ? finish[1] : theme.glass}
              stopOpacity={finish ? '.39' : '.15'}
            />
            <stop
              offset="1"
              stopColor={finish ? finish[2] : theme.surface.shadow}
              stopOpacity=".48"
            />
          </linearGradient>
          <linearGradient id={id + 'edge'} x2="1" y2=".3">
            <stop stopColor={finish ? finish[3] : theme.surface.edge} stopOpacity=".92" />
            <stop offset=".45" stopColor="#c3dbe1" stopOpacity=".28" />
            <stop offset="1" stopColor="#d4f0ee" stopOpacity=".8" />
          </linearGradient>
          <linearGradient id={id + 'rail'} x2="0" y2="1">
            <stop stopColor="#bfb8ce" stopOpacity="0" />
            <stop offset=".3" stopColor="#a9a7af" stopOpacity=".2" />
            <stop
              offset=".65"
              stopColor={copper ? '#ffbc84' : '#ddd6e7'}
              stopOpacity={copper ? '.9' : '.6'}
            />
            <stop
              offset="1"
              stopColor={copper ? '#aa593f' : theme.surface.frame}
              stopOpacity={copper ? '.9' : '.4'}
            />
          </linearGradient>
          <radialGradient id={id + 'under'}>
            <stop stopColor="#a9469c" stopOpacity=".1" />
            <stop offset="1" stopColor="#c65aa6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id + 'scan'} x2="0" y2="1">
            <stop stopColor="#bafff0" stopOpacity="0" />
            <stop offset=".55" stopColor="#73d8db" stopOpacity=".08" />
            <stop offset=".86" stopColor="#a5fff2" stopOpacity=".36" />
            <stop offset=".94" stopColor="#e2fff9" stopOpacity=".95" />
            <stop offset="1" stopColor="#e2fff9" stopOpacity="0" />
          </linearGradient>
          <clipPath id={id + 'scan-row'}>
            {(['left', 'right'] as const).map((side) => (
              <polygon key={side} points={coordinates(bridgePane(0, side))} />
            ))}
          </clipPath>
        </defs>
        <ellipse cx="450" cy="580" rx="440" ry="200" fill={'url(#' + id + 'under)'} />
        <BridgeArchitecture model={model} />
        {model !== 'lily' &&
          model !== 'jelly' &&
          model !== 'cookie' &&
          model !== 'aurora' &&
          model !== 'prism' &&
          [-458, 458].map((x) => {
            const a = projectBridgePoint(x, 19),
              b = projectBridgePoint(x, -0.25);
            return (
              <g key={x} className="cpi-structural-rail">
                <path d={`M${a.x} ${a.y} ${b.x} ${b.y}`} stroke="#0d0d11" strokeWidth="9" />
                <path
                  d={`M${a.x} ${a.y} ${b.x} ${b.y}`}
                  stroke={'url(#' + id + 'rail)'}
                  strokeWidth={copper ? '5' : '3'}
                />
                <path
                  d={`M${a.x + 3} ${a.y} ${b.x + 3} ${b.y}`}
                  stroke="#b5b1c8"
                  strokeOpacity=".08"
                  strokeWidth="1"
                />
              </g>
            );
          })}
        {distances.map((distance) => {
          const row = rows?.find((r) => r.distance === distance);
          const absolute = BigInt(currentIndex) + BigInt(distance);
          const tone = row?.tone ?? Number(((absolute % 3n) + 3n) % 3n);
          const color = railLights[tone],
            rowPhase = row?.phase ?? 'future';
          const key = absolute.toString();
          return (
            <g
              key={key}
              className={'cpi-bridge-row-art is-' + rowPhase}
              data-visual-row={key}
              style={
                {
                  '--pane-color': color,
                  '--frame-delay': `${Math.max(0, distance) * 42}ms`,
                } as CSSProperties
              }
              opacity={
                distance > 4
                  ? Math.max(0.12, 0.7 - distance * 0.035)
                  : rowPhase === 'past'
                    ? 0.42
                    : 1
              }
            >
              {(['left', 'right'] as const).map((side) => {
                const pts = bridgePane(distance, side),
                  old = moving ? bridgePane(distance + 1, side) : undefined;
                const deck = deckFace(pts, model);
                const priorDeck = old && deckFace(old, model);
                const block =
                  model === 'trestle' ||
                  model === 'frost' ||
                  model === 'jelly' ||
                  model === 'cookie' ||
                  model === 'prism';
                const fascia = block
                  ? blockFront(deck, distance, thickness)
                  : front(pts, distance, thickness);
                const priorFascia =
                  old &&
                  (block
                    ? blockFront(priorDeck!, distance + 1, thickness)
                    : front(old, distance + 1, thickness));
                const isBreakingNow =
                  feedback?.kind === 'wrong' &&
                  feedback.row === row?.index &&
                  feedback.side === side;
                const status = paneState(row, side, phase === 'contact' ? null : feedback);
                const broken = collapsed || status.includes('wrong') || status.includes('cracked');
                const falling =
                  !reduced &&
                  (collapsed || (isBreakingNow && (phase === 'impact' || phase === 'travel')));
                const corner = pts[side === 'left' ? 0 : 1];
                const nearCorner = pts[side === 'left' ? 3 : 2];
                const decal =
                  distance >= 0 && distance < 5 && (tone + (side === 'left' ? 0 : 1)) % 3 === 0;
                return (
                  <g
                    key={side}
                    className={
                      'cpi-glass-pane' +
                      status +
                      (broken ? ' is-shattered' : '') +
                      (phase === 'contact' &&
                      feedback?.row === row?.index &&
                      feedback?.side === side
                        ? ' is-contact'
                        : '')
                    }
                  >
                    <g
                      className="cpi-pane-material"
                      style={
                        model === 'jelly'
                          ? {
                              filter: `hue-rotate(${[0, 70, 140, 235, 300][Number(BigInt(row?.index ?? String(distance + 2)) % 5n)]}deg)`,
                            }
                          : undefined
                      }
                    >
                      {model === 'lily' && (
                        <MovingPolygon
                          className="cpi-lily-pad-edge"
                          shape={deck}
                          previous={priorDeck}
                          step={camera.row}
                          fill="#2f5526"
                          stroke="#517440"
                          strokeWidth="1.3"
                        />
                      )}
                      <MovingPolygon
                        className="cpi-pane-depth"
                        shape={fascia}
                        previous={priorFascia}
                        step={camera.row}
                        fill={block ? 'url(#' + id + 'block-side)' : '#1a191f'}
                        stroke="#8c8799"
                        strokeOpacity=".35"
                        strokeWidth=".7"
                      />
                      <MovingPolygon
                        className="cpi-pane-underglow"
                        shape={front(pts, distance, thickness)}
                        previous={old && front(old, distance + 1, thickness)}
                        step={camera.row}
                        fill={color}
                        opacity=".23"
                      />
                      <MovingPolygon
                        className="cpi-pane-face"
                        shape={deck}
                        previous={priorDeck}
                        step={camera.row}
                        fill={model === 'aurora' ? '#233248' : surfacePaint}
                        stroke={
                          model === 'lily'
                            ? '#a2b970'
                            : 'url(#' + id + (model === 'prism' ? 'cosmic-edge)' : 'edge)')
                        }
                        strokeWidth={
                          model === 'prism'
                            ? Math.max(0.7, 3 / (1 + distance * 0.4))
                            : rowPhase === 'current'
                              ? 1.5
                              : 0.8
                        }
                      />
                      {block && model !== 'prism' && distance <= 6 && (
                        <path
                          d={`M${deck[4].x} ${deck[4].y + 2}L${deck[5].x} ${deck[5].y + 2}`}
                          stroke={
                            model === 'frost'
                              ? '#e4ffff'
                              : model === 'jelly'
                                ? '#fff0f9'
                                : '#e1b583'
                          }
                          strokeWidth="1.7"
                          strokeOpacity=".72"
                        />
                      )}
                      {model === 'cookie' && distance <= 6 && (
                        <path
                          d={`M${deck[4].x} ${deck[4].y + (thickness * 0.5) / (1 + Math.max(0, distance) * 0.4)}L${deck[5].x} ${deck[5].y + (thickness * 0.5) / (1 + Math.max(0, distance) * 0.4)}`}
                          stroke="#ffedc1"
                          strokeWidth={Math.max(
                            1,
                            (thickness * 0.26) / (1 + Math.max(0, distance) * 0.4),
                          )}
                          strokeLinecap="round"
                        />
                      )}
                      {model === 'aurora' && <TrampolineFrame pane={pts} distance={distance} />}
                      {model === 'prism' && distance <= 5 && (
                        <g className="cpi-cosmic-inlay">
                          <polygon
                            points={coordinates(
                              deck.map((p) => blend(p, onFace(pts, 0.5, 0.5), 0.065)),
                            )}
                            fill="none"
                            stroke="#b0dcf0"
                            strokeOpacity=".35"
                            strokeWidth={Math.max(0.4, 1.2 / (1 + distance * 0.4))}
                          />
                          <polyline
                            points={coordinates(
                              [
                                [0.26, 0.43],
                                [0.43, 0.25],
                                [0.7, 0.36],
                                [0.58, 0.65],
                              ].map(([u, v]) => onFace(pts, u, v)),
                            )}
                            fill="none"
                            stroke="#b7dfe8"
                            strokeOpacity=".38"
                            strokeWidth={Math.max(0.4, 1 / (1 + distance * 0.4))}
                          />
                          {[
                            [0.26, 0.43],
                            [0.43, 0.25],
                            [0.7, 0.36],
                            [0.58, 0.65],
                          ].map(([u, v], i) => {
                            const star = onFace(pts, u, v),
                              r = (i === 1 ? 3.8 : 2) / (1 + Math.max(0, distance) * 0.4);
                            return (
                              <path
                                key={u}
                                d={`M${star.x - r} ${star.y}l${r} ${-r * 1.6} ${r} ${r * 1.6} ${-r} ${r * 1.6}Z`}
                                fill={i === 1 ? '#fff0bd' : '#b3e7ef'}
                              />
                            );
                          })}
                        </g>
                      )}
                      {model === 'jelly' && distance <= 5 && (
                        <g fill="#ffe9f9" opacity=".64">
                          {[0.24, 0.64, 0.78].map((u, i) => {
                            const dot = onFace(pts, u, 0.22 + i * 0.13);
                            const radius = Math.max(1, 6 / (1 + distance * 0.6));
                            return (
                              <ellipse
                                key={u}
                                cx={dot.x}
                                cy={dot.y}
                                rx={radius}
                                ry={radius * 0.48}
                              />
                            );
                          })}
                        </g>
                      )}
                      <MovingPolygon
                        className="cpi-pane-tint"
                        shape={deck}
                        previous={priorDeck}
                        step={camera.row}
                        fill={color}
                        opacity={rowPhase === 'current' ? 0.065 : 0.035}
                      />
                      <MovingPolygon
                        className="cpi-pane-inner-frame"
                        shape={inset(pts)}
                        previous={old && inset(old)}
                        step={camera.row}
                        fill="none"
                        stroke={color}
                        strokeWidth=".8"
                        strokeOpacity={rowPhase === 'current' ? 0.43 : 0.25}
                      />
                      <MovingPolygon
                        className="cpi-pane-shine"
                        shape={shine(pts)}
                        previous={old && shine(old)}
                        step={camera.row}
                        fill="#ececf5"
                        opacity=".13"
                      />
                      {finish && distance <= 6 && (
                        <MovingPolygon
                          className="cpi-finish-inlay"
                          shape={worldInlay(
                            pts,
                            bridgeStyle?.tiles === 'frost' ? 'wilds' : 'jelly',
                          )}
                          previous={
                            old &&
                            worldInlay(old, bridgeStyle?.tiles === 'frost' ? 'wilds' : 'jelly')
                          }
                          step={camera.row}
                          fill={finish[1]}
                          fillOpacity=".13"
                          stroke={finish[3]}
                          strokeOpacity=".38"
                          strokeWidth=".9"
                        />
                      )}
                      {!broken && distance >= 0 && distance < 6 && season === 'winter' && (
                        <path
                          d={`M${corner.x} ${corner.y} ${nearCorner.x} ${nearCorner.y}`}
                          stroke={weather === 'thaw' ? '#adcee6' : '#d7f4ff'}
                          strokeWidth={weather === 'snow' ? '3.2' : '1.4'}
                          opacity={weather === 'thaw' ? '.35' : '.67'}
                        />
                      )}
                      {!broken && decal && (season === 'autumn' || season === 'spring') && (
                        <g
                          transform={`translate(${corner.x + (side === 'left' ? 10 : -10)} ${corner.y + 4}) scale(${1 / (1 + distance * 0.4)})`}
                          opacity=".6"
                        >
                          {season === 'autumn' ? (
                            <path
                              d="M-8 4Q-4-7 8-4Q7 3-2 6Zm4 0L6-3"
                              fill="#cf8257"
                              stroke="#f3ba84"
                              strokeWidth=".7"
                            />
                          ) : (
                            <path
                              d="M-5 2q2-6 8-4 3 6-8 4Z"
                              fill="#ffd2e2"
                              stroke="#fff4ee"
                              strokeWidth=".7"
                            />
                          )}
                        </g>
                      )}
                      {themeId !== 'obsidian' && distance <= 5 && (
                        <MovingPolygon
                          className="cpi-world-pane-inlay"
                          shape={worldInlay(pts, themeId)}
                          previous={old && worldInlay(old, themeId)}
                          step={camera.row}
                          fill={themeId === 'chaos' ? theme.surface.frame : theme.glass}
                          fillOpacity=".1"
                          stroke={theme.surface.edge}
                          strokeOpacity=".22"
                          strokeWidth=".6"
                        />
                      )}
                      {distance <= 6 && (
                        <>
                          <MovingPolygon
                            className="cpi-glass-reflection"
                            shape={reflectedLight(pts, 'rail')}
                            previous={old && reflectedLight(old, 'rail')}
                            step={camera.row}
                            fill={color}
                            opacity=".14"
                          />
                          <MovingPolygon
                            className="cpi-glass-reflection"
                            shape={reflectedLight(pts, 'strip')}
                            previous={old && reflectedLight(old, 'strip')}
                            step={camera.row}
                            fill="#f1fcff"
                            opacity=".16"
                          />
                        </>
                      )}
                    </g>
                    <MovingPolygon
                      className="cpi-pane-frame"
                      shape={deck}
                      previous={priorDeck}
                      step={camera.row}
                      fill="none"
                      stroke="#a7a9ae"
                      strokeOpacity={broken ? '.45' : '.22'}
                      strokeWidth={broken ? '1.2' : '.6'}
                    />
                    {broken &&
                    (model === 'lily' ||
                      model === 'trestle' ||
                      model === 'frost' ||
                      model === 'jelly' ||
                      model === 'cookie' ||
                      model === 'aurora' ||
                      model === 'prism')
                      ? falling && (
                          <MaterialBreak
                            model={model}
                            face={deck}
                            pane={pts}
                            paint={surfacePaint}
                            distance={distance}
                            tint={
                              model === 'jelly'
                                ? [0, 70, 140, 235, 300][
                                    Number(BigInt(row?.index ?? String(distance + 2)) % 5n)
                                  ]
                                : undefined
                            }
                          />
                        )
                      : broken && (
                          <PaneFragments
                            key={`${absolute}:${side}`}
                            points={pts}
                            previous={old}
                            step={camera.row}
                            collapsed={collapsed}
                            falling={falling}
                            detail={distance > 3 ? 1 : 3}
                            seed={glassSeed(`${fractureSeed}:${absolute}:${side}`)}
                            delay={
                              collapsed
                                ? Math.max(0, distance) * 42 + (side === 'right' ? 24 : 0)
                                : 0
                            }
                          />
                        )}
                    {!broken &&
                      row?.phase === 'past' &&
                      row.chosen === side &&
                      bridgeStyle?.trail && (
                        <g
                          className="cpi-bridge-step-trail"
                          transform={`translate(${pts.reduce((sum, point) => sum + point.x / 4, 0)} ${pts.reduce((sum, point) => sum + point.y / 4, 0)})`}
                          stroke={
                            bridgeStyle.trail === 'comet-trail'
                              ? '#ffe1a0'
                              : bridgeStyle.trail === 'echo'
                                ? '#baecff'
                                : '#f4a4ff'
                          }
                          fill="none"
                        >
                          {bridgeStyle.trail === 'comet-trail' ? (
                            <>
                              <path
                                d="M-30 8Q-5-10 23-5m-47 17Q-1-2 18 1m-31 13Q2 5 15 6"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                              <path
                                d="m23-12 3 5 6 2-6 2-3 5-2-5-5-2 5-2Z"
                                fill="#fff1bc"
                                stroke="#fff5d8"
                              />
                            </>
                          ) : (
                            <>
                              <ellipse rx="32" ry="10" strokeWidth="2" />
                              <ellipse rx="20" ry="6" strokeWidth="1" />
                            </>
                          )}
                          {bridgeStyle.trail === 'prism-trail' && (
                            <path d="m-30-8 4-8 4 8-4 7Zm53 4 3-6 3 6-3 6Z" stroke="#95fff4" />
                          )}
                        </g>
                      )}
                  </g>
                );
              })}
              {((model !== 'lily' &&
                model !== 'jelly' &&
                model !== 'cookie' &&
                model !== 'aurora' &&
                model !== 'prism') ||
                lighting === 'harbour-lanterns' ||
                lighting === 'torches') &&
                [-472, 472].flatMap((x) =>
                  (lighting === 'torches' || lighting === 'harbour-lanterns'
                    ? [0.45]
                    : distance > 5
                      ? [0, 0.65]
                      : [0, 0.28, 0.56, 0.84]
                  ).map((offset, i) => (
                    <MovingLamp
                      key={x + ':' + i}
                      x={x}
                      z={0.45 + distance * 1.15 + offset}
                      color={
                        lighting === 'torches' ||
                        lighting === 'amber' ||
                        lighting === 'harbour-lanterns'
                          ? '#ffbc6d'
                          : lighting === 'prism-lights'
                            ? ['#8de8ff', '#f8abff', '#a994ff'][(tone + i) % 3]
                            : railLights[(tone + i) % railLights.length]
                      }
                      flame={lighting === 'torches' && distance <= 6}
                      pearl={lighting === 'harbour-lanterns'}
                      previous={moving}
                      step={camera.row}
                    />
                  )),
                )}
            </g>
          );
        })}
        {hintScan && !reduced && (
          <g key={hintScan.id} className="cpi-row-scan" data-hint-scan="row" aria-hidden="true">
            <g clipPath={'url(#' + id + 'scan-row)'}>
              {(['left', 'right'] as const).map((side) => {
                const pane = bridgePane(0, side);
                return (
                  <g
                    key={side}
                    className="cpi-scan-matrix"
                    stroke="#a7eee0"
                    strokeWidth=".65"
                    fill="none"
                  >
                    {Array.from({ length: 7 }, (_, i) => (
                      <g key={i} style={{ '--matrix-delay': `${i * 12}ms` } as CSSProperties}>
                        <path
                          d={`M${onFace(pane, (i + 1) / 8, 0).x} ${onFace(pane, (i + 1) / 8, 0).y}L${onFace(pane, (i + 1) / 8, 1).x} ${onFace(pane, (i + 1) / 8, 1).y}`}
                        />
                        <path
                          d={`M${onFace(pane, 0, (i + 1) / 8).x} ${onFace(pane, 0, (i + 1) / 8).y}L${onFace(pane, 1, (i + 1) / 8).x} ${onFace(pane, 1, (i + 1) / 8).y}`}
                        />
                      </g>
                    ))}
                  </g>
                );
              })}
              <rect
                className="cpi-scan-band"
                x="0"
                y="0"
                width="900"
                height="40"
                fill={'url(#' + id + 'scan)'}
                style={
                  {
                    '--scan-from': `${bridgePane(0, 'left')[0].y - 40}px`,
                    '--scan-to': `${bridgePane(0, 'left')[3].y}px`,
                  } as CSSProperties
                }
              />
            </g>
            <g className="cpi-scan-lock" fill="none" stroke="#d1ffeb" strokeWidth="1.6">
              {[
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ].map(([u, v], index) => {
                const pane = bridgePane(0, hintScan.side);
                const x = u ? 0.965 : 0.035,
                  y = v ? 0.965 : 0.035;
                return (
                  <g key={index}>
                    <polyline
                      points={coordinates([
                        onFace(pane, u ? 0.83 : 0.17, y),
                        onFace(pane, x, y),
                        onFace(pane, x, v ? 0.83 : 0.17),
                      ])}
                    />
                    <circle
                      cx={onFace(pane, x, y).x}
                      cy={onFace(pane, x, y).y}
                      r="1.9"
                      fill="#d1ffeb"
                      stroke="none"
                    />
                  </g>
                );
              })}
            </g>
          </g>
        )}
      </svg>
      {feedback && phase !== 'contact' && feedback.kind === 'safe' && (
        <div
          key={feedback.row + feedback.kind}
          className={'cpi-bridge-impact is-' + feedback.kind}
          style={{ left: feedback.side === 'left' ? '28%' : '72%' }}
          aria-hidden="true"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              style={
                {
                  '--spark-angle': `${i * 45}deg`,
                  '--spark-distance': `${28 + (i % 3) * 14}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {rows?.map((row) => (
        <div key={row.index} className={'cpi-bridge-row is-' + row.phase} data-row={row.label}>
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={
                'cpi-bridge-pane' +
                (omen === side && row.phase === 'current' ? ' has-omen' : '') +
                paneState(row, side, phase === 'contact' ? null : feedback)
              }
              aria-label={t(side === 'left' ? 'game.leftTile' : 'game.rightTile', {
                row: number(row.label),
              })}
              aria-description={
                row.hint === side
                  ? t('game.hintedTile')
                  : row.cue && (row.cue.side === side || row.cue.side === null)
                    ? row.cue.side === null
                      ? CUE_NAMES.crack
                      : CUE_NAMES[row.cue.kind]
                    : undefined
              }
              style={hitRegion(bridgePane(row.distance, side))}
              onClick={() => onChoose?.(side)}
              disabled={
                !interactive ||
                !allowChoices ||
                (!!allowedSide && allowedSide !== side) ||
                moving ||
                (!!phase && phase !== 'reveal') ||
                collapsed ||
                row.phase !== 'current'
              }
            >
              {row.phase === 'current' && omen === side && (
                <span className="cpi-omen-hint">◈ 70%</span>
              )}
              {row.phase === 'current' &&
                row.cue &&
                (row.cue.side === side || row.cue.side === null) && (
                  <span
                    className="cpi-journey-pane-cue"
                    data-cue={row.cue.side === null ? 'crack' : row.cue.kind}
                    aria-hidden="true"
                  >
                    {CUE_GLYPHS[row.cue.side === null ? 'crack' : row.cue.kind]}
                  </span>
                )}
              {row.phase === 'current' &&
                !phase &&
                ((row.hint === side && showHintCaption) ||
                  (row.hint === null && row.index === '0' && showStepCaptions)) && (
                  <>
                    <span className="cpi-pane-direction" aria-hidden="true">
                      {side === 'left' ? '↖' : '↗'}
                    </span>
                    <span className="cpi-pane-caption">
                      {row.hint === side
                        ? t('game.hintedTile')
                        : t(side === 'left' ? 'game.stepLeft' : 'game.stepRight')}
                    </span>
                  </>
                )}
            </button>
          ))}
          {row.hasMystery &&
            row.phase !== 'past' &&
            (row.phase !== 'current' || row.mysteryAvailable || mysteryReveal) && (
              <button
                type="button"
                className={
                  'cpi-bridge-mystery' +
                  (row.mysteryTier ? ' is-tiered' : '') +
                  (mysteryReveal && row.phase === 'current' && !row.mysteryAvailable
                    ? ' is-revealing'
                    : '')
                }
                data-tier={row.mysteryTier}
                style={{
                  top: `${(projectBridgePoint(0, 0.8 + row.distance * 1.15).y / HEIGHT) * 100}%`,
                }}
                aria-label={t('game.mysteryTile', { row: number(row.label) })}
                onClick={onMystery}
                disabled={
                  !interactive ||
                  moving ||
                  (!!phase && phase !== 'reveal') ||
                  collapsed ||
                  !row.mysteryAvailable
                }
              >
                <span className="cpi-mystery-material" aria-hidden="true">
                  {themeId !== 'obsidian' ? (
                    <MysteryCache
                      theme={themeId}
                      open={mysteryReveal && row.phase === 'current' && !row.mysteryAvailable}
                    />
                  ) : (
                    <MysteryCube
                      tier={row.mysteryTier ?? 'standard'}
                      opened={mysteryReveal && row.phase === 'current' && !row.mysteryAvailable}
                    />
                  )}
                </span>
                {themeId === 'obsidian' && (
                  <span className="cpi-box-tier-label" aria-hidden="true">
                    {locale === 'bg'
                      ? {
                          standard: 'ИСКРА',
                          choice: 'СДЕЛКА',
                          major: 'РИТУАЛ',
                          anomaly: '50/50',
                        }[row.mysteryTier ?? 'standard']
                      : { standard: 'SPARK', choice: 'TRADE', major: 'RITUAL', anomaly: '50/50' }[
                          row.mysteryTier ?? 'standard'
                        ]}
                  </span>
                )}
              </button>
            )}
        </div>
      ))}
    </div>
  );
}, sameBridgePresentation);
