import { useId, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { TileSide } from '@crystal-path-infinity/game-core';
import type { SceneCinematic } from './scene-cinematics';
import type { ThemeId } from './store-catalog';
import { companionLanding, companionScale, planCompanionMotion } from './world-companion';
import type { PresentedEffect } from './infinity-presentation';
import { useWorldMotion } from './world-motion';
import { WorldAvatarAura } from './world-treasures';
import { WORLD_ASSETS, worldAsset } from './world-assets';

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
  const center = companionLanding(cinematic.feedback.side);
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

/** A companion stays on the resolved path; rescue is cosmetic and never refunds damage. */
export function WorldPathCompanion({
  theme,
  cinematic,
  standingSide,
  sp,
  effects,
  reaction,
  reduced,
  paused,
}: {
  theme: Exclude<ThemeId, 'obsidian'>;
  cinematic?: SceneCinematic | null;
  standingSide: TileSide;
  sp: number;
  effects: readonly PresentedEffect[];
  reaction: 'calm' | 'happy' | 'panic';
  reduced: boolean;
  paused: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const motionPreferences = useWorldMotion();
  const ref = useRef<SVGSVGElement>(null);
  const motion = planCompanionMotion(sp, standingSide, cinematic);
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    const resize = () => {
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const scale = companionScale(bounds.width, bounds.height);
      surface.style.setProperty('--companion-x-correction', String(scale.x));
      surface.style.setProperty('--companion-y-correction', String(scale.y));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    return () => observer.disconnect();
  }, [motion.visible]);
  const animated = !reduced && !motionPreferences.reduced && !!motion.path;
  useLayoutEffect(() => {
    ref.current?.setCurrentTime(0);
  }, [cinematic?.id, cinematic?.phase]);
  useLayoutEffect(() => {
    if (paused || motionPreferences.suspended) ref.current?.pauseAnimations();
    else ref.current?.unpauseAnimations();
  }, [paused, motionPreferences.suspended, cinematic?.id, cinematic?.phase]);
  if (!motion.visible) return null;
  // Static/reduced-motion presentation still stands on the actual intact pane.
  const anchor = animated ? motion.anchor : motion.end;
  const frame = reaction === 'happy' ? 1 : reaction === 'panic' ? 2 : 0;
  return (
    <svg
      ref={ref}
      className="cpi-world-path-companion"
      viewBox="0 0 900 700"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-companion-action={motion.action}
      data-companion-side={motion.side}
    >
      <defs>
        <clipPath id={id}>
          <rect x="-48" y="-96" width="96" height="96" />
        </clipPath>
      </defs>
      <g key={`${cinematic?.id ?? 'idle'}-${cinematic?.phase ?? 'idle'}`}>
        {animated && (
          <animateMotion
            path={motion.path}
            dur={`${motion.duration}s`}
            fill="freeze"
            calcMode={motion.action === 'travel' ? 'spline' : 'paced'}
            keyTimes={motion.action === 'travel' ? '0;1' : undefined}
            keyPoints={motion.action === 'travel' ? '0;1' : undefined}
            keySplines={motion.action === 'travel' ? '.22 .65 .3 1' : undefined}
          />
        )}
        {motion.action === 'fall' && animated && (
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;.35;1"
            dur={`${motion.duration}s`}
            fill="freeze"
          />
        )}
        <ellipse cx={anchor.x} cy={anchor.y - 2} rx="30" ry="5" fill="#020510" opacity=".4" />
        <g transform={`translate(${anchor.x} ${anchor.y})`}>
          <g className="cpi-world-actor-sprite">
            <WorldAvatarAura theme={theme} effects={effects} />
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
