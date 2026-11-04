import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, SVGProps } from 'react';
import type { TileSide } from '@crystal-path-infinity/game-core';
import type { PresentedRow } from './infinity-presentation';
import { useLanguage } from './language-context';
import type { SceneFeedback } from './infinity-scene';
import { bridgePane, projectBridgePoint, advancesOneRow } from './bridge-geometry';

const WIDTH = 900,
  HEIGHT = 700;
const COLORS = ['#fa589c', '#62dfed', '#79e3af'];
type Point = { x: number; y: number };
const coordinates = (points: Point[]) =>
  points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const blend = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function front(points: Point[], distance: number) {
  const depth = Math.max(2, 8 / (1 + Math.max(0, distance) * 0.4));
  return [
    points[3],
    points[2],
    { ...points[2], y: points[2].y + depth },
    { ...points[3], y: points[3].y + depth },
  ];
}
function shine(points: Point[]) {
  return [
    blend(points[0], points[1], 0.2),
    blend(points[0], points[1], 0.25),
    blend(points[3], points[2], 0.62),
    blend(points[3], points[2], 0.55),
  ];
}
function inset(points: Point[]) {
  const center = points.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
  return points.map((p) => blend(p, center, 0.045));
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
          dur=".42s"
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
}: {
  x: number;
  z: number;
  color: string;
  previous: boolean;
  step: string;
}) {
  const p = projectBridgePoint(x, z),
    old = previous ? projectBridgePoint(x, z + 1.15) : null;
  const scale = 1 / (1 + z * 0.65),
    oldScale = 1 / (1 + (z + 1.15) * 0.65);
  return (
    <g transform={`translate(${p.x} ${p.y - 4 * scale})`}>
      {old && (
        <animateTransform
          key={step + 'position'}
          attributeName="transform"
          type="translate"
          from={`${old.x} ${old.y - 4 * oldScale}`}
          to={`${p.x} ${p.y - 4 * scale}`}
          dur=".42s"
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
            dur=".42s"
            fill="freeze"
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".22 .65 .3 1"
          />
        )}
        {[
          { r: 12, opacity: 0.1, fill: color },
          { r: 6, opacity: 0.16, fill: color },
          { r: 2.9, opacity: 0.95, fill: color },
          { r: 1.15, opacity: 0.95, fill: '#ffffff' },
        ].map((layer, i) => (
          <circle key={i} r={layer.r} fill={layer.fill} opacity={layer.opacity} />
        ))}
      </g>
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
export function PrismBridge({
  rows,
  feedback,
  interactive = false,
  onChoose,
  onMystery,
  preview = false,
  reducedMotion = false,
}: {
  rows?: readonly PresentedRow[];
  feedback?: SceneFeedback | null;
  interactive?: boolean;
  onChoose?: (side: TileSide) => void;
  onMystery?: () => void;
  preview?: boolean;
  reducedMotion?: boolean;
}) {
  const id = useId().replace(/:/g, ''),
    { t, number } = useLanguage();
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
      440,
    );
    return () => window.clearTimeout(timer);
  }, [camera.row, camera.moving]);
  const distances = Array.from({ length: 17 }, (_, i) => 15 - i);
  return (
    <div
      className={
        'cpi-prism-bridge' + (preview ? ' is-preview' : '') + (moving ? ' is-advancing' : '')
      }
      data-camera-moving={moving ? 'true' : 'false'}
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
          <linearGradient id={id + 'glass'} x1="0" y1="0" x2=".8" y2="1">
            <stop stopColor="#d9dbe6" stopOpacity=".22" />
            <stop offset=".42" stopColor="#646570" stopOpacity=".14" />
            <stop offset="1" stopColor="#141419" stopOpacity=".66" />
          </linearGradient>
          <linearGradient id={id + 'edge'} x2="1" y2=".3">
            <stop stopColor="#d7d9e6" stopOpacity=".75" />
            <stop offset=".45" stopColor="#83838e" stopOpacity=".18" />
            <stop offset="1" stopColor="#c4c5d4" stopOpacity=".6" />
          </linearGradient>
          <linearGradient id={id + 'rail'} x2="0" y2="1">
            <stop stopColor="#bfb8ce" stopOpacity="0" />
            <stop offset=".3" stopColor="#a9a7af" stopOpacity=".2" />
            <stop offset=".65" stopColor="#ddd6e7" stopOpacity=".6" />
            <stop offset="1" stopColor="#87828f" stopOpacity=".4" />
          </linearGradient>
          <radialGradient id={id + 'under'}>
            <stop stopColor="#a9469c" stopOpacity=".1" />
            <stop offset="1" stopColor="#c65aa6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="450" cy="580" rx="440" ry="200" fill={'url(#' + id + 'under)'} />
        {[-458, 458].map((x) => {
          const a = projectBridgePoint(x, 19),
            b = projectBridgePoint(x, -0.25);
          return (
            <g key={x}>
              <path d={`M${a.x} ${a.y} ${b.x} ${b.y}`} stroke="#0d0d11" strokeWidth="9" />
              <path
                d={`M${a.x} ${a.y} ${b.x} ${b.y}`}
                stroke={'url(#' + id + 'rail)'}
                strokeWidth="3"
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
          const color = COLORS[tone],
            phase = row?.phase ?? 'future';
          const key = preview ? 'preview-' + distance : absolute.toString();
          return (
            <g
              key={key}
              className={'cpi-bridge-row-art is-' + phase}
              data-visual-row={key}
              style={{ '--pane-color': color } as CSSProperties}
              opacity={
                distance > 4 ? Math.max(0.12, 0.7 - distance * 0.035) : phase === 'past' ? 0.42 : 1
              }
            >
              {(['left', 'right'] as const).map((side) => {
                const pts = bridgePane(distance, side),
                  old = moving ? bridgePane(distance + 1, side) : undefined;
                const status = paneState(row, side, feedback);
                return (
                  <g key={side} className={'cpi-glass-pane' + status}>
                    <MovingPolygon
                      shape={front(pts, distance)}
                      previous={old && front(old, distance + 1)}
                      step={camera.row}
                      fill="#1a191f"
                      stroke="#8c8799"
                      strokeOpacity=".35"
                      strokeWidth=".7"
                    />
                    <MovingPolygon
                      className="cpi-pane-underglow"
                      shape={front(pts, distance)}
                      previous={old && front(old, distance + 1)}
                      step={camera.row}
                      fill={color}
                      opacity=".23"
                    />
                    <MovingPolygon
                      className="cpi-pane-face"
                      shape={pts}
                      previous={old}
                      step={camera.row}
                      fill={'url(#' + id + 'glass)'}
                      stroke={'url(#' + id + 'edge)'}
                      strokeWidth={phase === 'current' ? 1.5 : 0.8}
                    />
                    <MovingPolygon
                      className="cpi-pane-tint"
                      shape={pts}
                      previous={old}
                      step={camera.row}
                      fill={color}
                      opacity={phase === 'current' ? 0.065 : 0.035}
                    />
                    <MovingPolygon
                      shape={inset(pts)}
                      previous={old && inset(old)}
                      step={camera.row}
                      fill="none"
                      stroke={color}
                      strokeWidth=".8"
                      strokeOpacity={phase === 'current' ? 0.43 : 0.25}
                    />
                    <MovingPolygon
                      shape={shine(pts)}
                      previous={old && shine(old)}
                      step={camera.row}
                      fill="#ececf5"
                      opacity=".07"
                    />
                    {(status.includes('wrong') || status.includes('cracked')) && (
                      <path
                        className="cpi-pane-fracture"
                        d={`M${(pts[0].x + pts[1].x) / 2} ${pts[0].y}l-12 30 29 16-20 38 16 40m-16-40-45-13m36-41 37-15`}
                        stroke="#f6a8cb"
                        strokeWidth="1.2"
                      />
                    )}
                  </g>
                );
              })}
              {[-472, 472].flatMap((x) =>
                (distance > 5 ? [0, 0.65] : [0, 0.28, 0.56, 0.84]).map((offset, i) => (
                  <MovingLamp
                    key={x + ':' + i}
                    x={x}
                    z={0.45 + distance * 1.15 + offset}
                    color={COLORS[(tone + i) % 3]}
                    previous={moving}
                    step={camera.row}
                  />
                )),
              )}
            </g>
          );
        })}
      </svg>
      {!preview && feedback && (
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
      {!preview &&
        rows?.map((row) => (
          <div key={row.index} className={'cpi-bridge-row is-' + row.phase} data-row={row.label}>
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={'cpi-bridge-pane' + paneState(row, side, feedback)}
                aria-label={t(side === 'left' ? 'game.leftTile' : 'game.rightTile', {
                  row: number(row.label),
                })}
                style={hitRegion(bridgePane(row.distance, side))}
                onClick={() => onChoose?.(side)}
                disabled={!interactive || moving || row.phase !== 'current'}
              >
                {row.phase === 'current' && (
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
                {row.phase === 'past' && row.chosen === side && (
                  <span className="cpi-pane-caption">
                    {t(row.wrong ? 'game.wrongTile' : 'game.safeTile')}
                  </span>
                )}
              </button>
            ))}
            {row.hasMystery && (
              <button
                type="button"
                className="cpi-bridge-mystery"
                style={{
                  top: `${(projectBridgePoint(0, 0.8 + row.distance * 1.15).y / HEIGHT) * 100}%`,
                }}
                aria-label={t('game.mysteryTile', { row: number(row.label) })}
                onClick={onMystery}
                disabled={!interactive || moving || !row.mysteryAvailable}
              >
                <span>?</span>
              </button>
            )}
            {row.phase === 'current' && (
              <span
                className="cpi-current-row-label"
                style={{ top: `${(projectBridgePoint(0, 1.3).y / HEIGHT) * 100 - 5}%` }}
                aria-hidden="true"
              >
                {number(row.label).padStart(2, '0')}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}
