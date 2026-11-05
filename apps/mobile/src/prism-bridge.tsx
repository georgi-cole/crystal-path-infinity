import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, SVGProps } from 'react';
import type { TileSide } from '@crystal-path-infinity/game-core';
import type { PresentedRow } from './infinity-presentation';
import { useLanguage } from './language-context';
import type { SceneFeedback } from './infinity-scene';
import { bridgePane, projectBridgePoint, advancesOneRow } from './bridge-geometry';
import { glassPattern, glassSeed, projectGlassPattern } from './glass-fracture';
import type { HintScan } from './run-signals';
import { BridgeFlight } from './bridge-flight';
import type { SceneCinematic } from './scene-cinematics';

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
const onFace = (p: Point[], u: number, v: number) =>
  blend(blend(p[0], p[1], u), blend(p[3], p[2], u), v);
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
  const pattern = useMemo(() => glassPattern(seed, detail), [seed, detail]);
  const shards = projectGlassPattern(pattern, points);
  const old = previous ? projectGlassPattern(pattern, previous) : null;
  return (
    <g className="cpi-pane-fragments">
      {shards.map((shard, i) =>
        shard.retained && !collapsed ? (
          <MovingPolygon
            key={i}
            className="cpi-glass-anchor"
            shape={[...shard.points]}
            previous={(old && [...old[i].points]) || undefined}
            step={step}
            fill={shard.glint > 0.5 ? '#c7e5ee4d' : '#9bb4bb29'}
            stroke="#d6f5ffb3"
            strokeWidth=".65"
          />
        ) : falling ? (
          <polygon
            key={i}
            className="cpi-glass-shard"
            points={coordinates([...shard.points])}
            fill={shard.glint > 0.65 ? '#e1f5ff47' : shard.glint > 0.3 ? '#839ea936' : '#cedde622'}
            stroke={i % 4 === 0 ? '#edfcffbb' : '#bddce67a'}
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
  phase,
  collapsed = false,
  eventId = '',
  fractureSeed = 'bridge',
  hintScan = null,
  showHintCaption = false,
  showStepCaptions = true,
  allowChoices = true,
  allowedSide,
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
  eventId?: string | number;
  fractureSeed?: string;
  hintScan?: HintScan | null;
  showHintCaption?: boolean;
  showStepCaptions?: boolean;
  allowChoices?: boolean;
  allowedSide?: TileSide;
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
      data-step-phase={phase ?? 'idle'}
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
            <stop stopColor="#e2edf0" stopOpacity=".32" />
            <stop offset=".36" stopColor="#98adb3" stopOpacity=".09" />
            <stop offset=".58" stopColor="#c7dae0" stopOpacity=".15" />
            <stop offset="1" stopColor="#101318" stopOpacity=".48" />
          </linearGradient>
          <linearGradient id={id + 'edge'} x2="1" y2=".3">
            <stop stopColor="#ecfbff" stopOpacity=".92" />
            <stop offset=".45" stopColor="#c3dbe1" stopOpacity=".28" />
            <stop offset="1" stopColor="#d4f0ee" stopOpacity=".8" />
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
        {[-458, 458].map((x) => {
          const a = projectBridgePoint(x, 19),
            b = projectBridgePoint(x, -0.25);
          return (
            <g key={x} className="cpi-structural-rail">
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
                const status = paneState(row, side, phase === 'contact' ? null : feedback);
                const broken = collapsed || status.includes('wrong') || status.includes('cracked');
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
                    <g className="cpi-pane-material">
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
                        strokeWidth={rowPhase === 'current' ? 1.5 : 0.8}
                      />
                      <MovingPolygon
                        className="cpi-pane-tint"
                        shape={pts}
                        previous={old}
                        step={camera.row}
                        fill={color}
                        opacity={rowPhase === 'current' ? 0.065 : 0.035}
                      />
                      <MovingPolygon
                        shape={inset(pts)}
                        previous={old && inset(old)}
                        step={camera.row}
                        fill="none"
                        stroke={color}
                        strokeWidth=".8"
                        strokeOpacity={rowPhase === 'current' ? 0.43 : 0.25}
                      />
                      <MovingPolygon
                        shape={shine(pts)}
                        previous={old && shine(old)}
                        step={camera.row}
                        fill="#ececf5"
                        opacity=".13"
                      />
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
                      shape={pts}
                      previous={old}
                      step={camera.row}
                      fill="none"
                      stroke="#a7a9ae"
                      strokeOpacity={broken ? '.45' : '.22'}
                      strokeWidth={broken ? '1.2' : '.6'}
                    />
                    {broken && (
                      <PaneFragments
                        key={eventId}
                        points={pts}
                        previous={old}
                        step={camera.row}
                        collapsed={collapsed}
                        falling={
                          !reduced && (collapsed || phase === 'impact' || phase === 'travel')
                        }
                        detail={distance > 3 ? 1 : 3}
                        seed={glassSeed(`${fractureSeed}:${absolute}:${side}`)}
                        delay={
                          collapsed ? Math.max(0, distance) * 42 + (side === 'right' ? 24 : 0) : 0
                        }
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
                'cpi-bridge-pane' + paneState(row, side, phase === 'contact' ? null : feedback)
              }
              aria-label={t(side === 'left' ? 'game.leftTile' : 'game.rightTile', {
                row: number(row.label),
              })}
              aria-description={row.hint === side ? t('game.hintedTile') : undefined}
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
              {row.phase === 'current' &&
                !phase &&
                ((row.hint === side && showHintCaption) ||
                  (row.hint !== side && row.index === '0' && showStepCaptions)) && (
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
            (row.phase !== 'current' || row.mysteryAvailable) && (
              <button
                type="button"
                className="cpi-bridge-mystery"
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
                <span className="cpi-holo-projector" aria-hidden="true" />
                <svg
                  className="cpi-holo-mystery"
                  viewBox="0 0 64 76"
                  fill="none"
                  aria-hidden="true"
                >
                  <path className="cpi-holo-shell" d="m32 6 23 13v27L32 60 9 46V19L32 6Z" />
                  <path d="m9 19 23 14 23-14M32 33v27M21 13l23 14v13M20 40l24-14" />
                  <path className="cpi-holo-core" d="m32 22 8 10-8 11-8-11 8-10Z" />
                  <path d="M16 65h32M23 70h18" />
                </svg>
                <span className="cpi-holo-scan" aria-hidden="true" />
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
