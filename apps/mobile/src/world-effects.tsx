import { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { TileSide } from '@crystal-path-infinity/game-core';
import type { SceneCinematic } from './scene-cinematics';
import type { ThemeId } from './store-catalog';
import { bridgePane } from './bridge-geometry';
import { WORLD_ASSETS, worldAsset } from './world-assets';

const reducedQuery = '(prefers-reduced-motion: reduce)';
function subscribeReduced(listener: () => void) {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const reducedSnapshot = () => window.matchMedia(reducedQuery).matches;
const serverReduced = () => true;

function landing(side: TileSide) {
  const points = bridgePane(0, side);
  return points.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 });
}

/** Brief material feedback uses only a choice that has already resolved. */
export function WorldStepEffect({
  theme,
  cinematic,
  reduced,
}: {
  theme: ThemeId;
  cinematic: SceneCinematic | null | undefined;
  reduced: boolean;
}) {
  if (theme === 'obsidian' || reduced || cinematic?.phase !== 'impact' || !cinematic.feedback)
    return null;
  const center = landing(cinematic.feedback.side);
  return (
    <svg
      className={'cpi-world-impact world-' + theme + ' is-' + cinematic.feedback.kind}
      viewBox="0 0 900 700"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g transform={`translate(${center.x} ${center.y})`}>
        {theme === 'chaos' ? (
          <path className="cpi-world-circuit" d="M-73 16h22V-7h31v-12h42v12h31v23h22" />
        ) : (
          <>
            <ellipse className="cpi-world-ripple" rx="76" ry="23" />
            <ellipse className="cpi-world-ripple is-second" rx="52" ry="16" />
          </>
        )}
        {Array.from({ length: 10 }, (_, i) => (
          <circle
            className="cpi-world-step-mote"
            key={i}
            r={theme === 'chaos' ? 1.4 : 2.8}
            style={
              {
                '--dx': `${Math.cos(i * 2.4) * (45 + i * 4)}px`,
                '--dy': `${-14 - i * 4}px`,
                '--delay': `${(i % 3) * 20}ms`,
              } as CSSProperties
            }
          />
        ))}
      </g>
    </svg>
  );
}

/** A cosmetic actor follows PUBLIC resolved choices. It never chooses or previews a route. */
export function WorldPathCompanion({
  theme,
  cinematic,
  previousSide,
  reaction,
  reduced,
  paused,
}: {
  theme: Exclude<ThemeId, 'obsidian'>;
  cinematic?: SceneCinematic | null;
  previousSide: TileSide | null;
  reaction: 'calm' | 'happy' | 'panic';
  reduced: boolean;
  paused: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const osReduced = useSyncExternalStore(subscribeReduced, reducedSnapshot, serverReduced);
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    // The bridge intentionally stretches its perspective to a portrait viewport.
    // Cancel that stretch for the character, keeping its feet in bridge coordinates.
    const resize = () => {
      const bounds = surface.getBoundingClientRect();
      if (bounds.width && bounds.height)
        surface.style.setProperty(
          '--companion-y-correction',
          String((bounds.width * 700) / (bounds.height * 900)),
        );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    return () => observer.disconnect();
  }, []);
  const feedback = cinematic?.feedback;
  const impact = cinematic?.phase === 'impact' && !!feedback;
  const travel = cinematic?.phase === 'travel' && !!feedback;
  const moving = !reduced && !osReduced && !paused && (impact || travel);
  const rest = previousSide
    ? { x: previousSide === 'left' ? 225 : 675, y: 664 }
    : { x: 65, y: 590 };
  const target = feedback ? landing(feedback.side) : rest;
  const dx = target.x - rest.x,
    dy = target.y - rest.y;
  const path = travel
    ? `M${dx} ${dy}L0 0`
    : feedback?.kind === 'wrong'
      ? `M0 0Q${dx * 0.7} ${dy - 70} ${dx * 0.85} ${dy}Q${dx * 0.3} ${dy - 55} 0 0`
      : `M0 0Q${dx * 0.5} ${dy - 90} ${dx} ${dy}`;
  useLayoutEffect(() => {
    if (moving) ref.current?.setCurrentTime(0);
  }, [cinematic?.id, cinematic?.phase, moving]);
  const frame = reaction === 'happy' ? 1 : reaction === 'panic' ? 2 : 0;
  return (
    <svg
      ref={ref}
      className="cpi-world-path-companion"
      viewBox="0 0 900 700"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id}>
          <rect x="-48" y="-96" width="96" height="96" />
        </clipPath>
      </defs>
      <g key={`${cinematic?.id ?? 'idle'}-${cinematic?.phase ?? 'idle'}`}>
        {moving && (
          <animateMotion
            path={path}
            dur={travel ? '.46s' : feedback?.kind === 'wrong' ? '.62s' : '.42s'}
            fill="freeze"
            calcMode="paced"
          />
        )}
        <ellipse cx={rest.x} cy={rest.y - 2} rx="25" ry="5" fill="#020510" opacity=".4" />
        <g transform={`translate(${rest.x} ${rest.y})`}>
          <g className="cpi-world-actor-sprite">
            <image
              href={worldAsset(WORLD_ASSETS[theme].companion)}
              x={-48 - frame * 96}
              y="-96"
              width="288"
              height="96"
              clipPath={`url(#${id})`}
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
