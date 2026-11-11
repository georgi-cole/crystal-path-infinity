import { useId, useLayoutEffect, useRef } from 'react';
import blackMetalTraveller from './assets/world-previews/black-metal-traveller-v1.png';
import type { CSSProperties } from 'react';
import type { GearId, Season, TileSide, Weather } from '@crystal-path-infinity/game-core';
import type { SceneCinematic } from './scene-cinematics';
import type { BridgeModel } from './campaign-content';
import type { ThemeId } from './store-catalog';
import {
  companionLanding,
  companionPreviewFooting,
  companionPreviewRegistration,
  companionScale,
  planCompanionMotion,
} from './world-companion';
import type { PresentedEffect } from './infinity-presentation';
import { useWorldMotion } from './world-motion';
import { WorldAvatarAura } from './world-treasures';
import { GuardianShield } from './guardian-shield';
import { WORLD_ASSETS, worldAsset } from './world-assets';
import { WorldRescueRig } from './world-props';
import { CompanionSeasonGear, CompanionTrailGear } from './journey-atmosphere';

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
        ) : theme === 'jelly' ? (
          <>
            <ellipse className="cpi-world-ripple" rx="76" ry="23" />
            <ellipse className="cpi-world-ripple is-second" rx="52" ry="16" />
          </>
        ) : (
          <path
            className="cpi-world-circuit"
            d={
              theme === 'wilds'
                ? 'm-64 15 21-23 31 11 29-17 44 20m-64-3 8-13 10 12'
                : theme === 'league'
                  ? 'm-75 16 25-18h31l-10 18h31l25-18h42m-52 8 16-11'
                  : theme === 'puppy'
                    ? 'M-70 13q20-30 40-10l30 10L30 3q20-20 40 10m-78-12 8-9 8 9'
                    : 'M-73 14q38-36 73 0 35-36 73 0m-78-20 5-8 5 8'
            }
          />
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
  season,
  weather,
  gear,
  bridge,
  preview = false,
  shieldCharges = 0,
}: {
  theme: ThemeId;
  cinematic?: SceneCinematic | null;
  standingSide: TileSide;
  sp: number;
  effects: readonly PresentedEffect[];
  reaction: 'calm' | 'happy' | 'panic';
  reduced: boolean;
  paused: boolean;
  season?: Season;
  weather?: Weather;
  gear?: GearId;
  bridge?: BridgeModel;
  preview?: boolean;
  shieldCharges?: number;
}) {
  const id = useId().replace(/:/g, '');
  const skin = theme === 'obsidian' ? 'chaos' : theme;
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
  const anchor = preview
    ? companionPreviewFooting(standingSide)
    : animated
      ? motion.anchor
      : motion.end;
  const frame =
    theme === 'obsidian'
      ? 0
      : motion.action === 'rescue' || reaction === 'happy'
        ? 1
        : reaction === 'panic'
          ? 2
          : 0;
  const registration = companionPreviewRegistration(skin, gear);
  return (
    <svg
      ref={ref}
      className={'cpi-world-path-companion' + (motionPreferences.suspended ? ' is-still' : '')}
      viewBox="0 0 900 700"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-companion-action={motion.action}
      data-companion-side={motion.side}
      data-still={reduced || paused || motionPreferences.reduced || motionPreferences.suspended}
      data-gear={gear}
      data-companion-preview={preview || undefined}
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
        {motion.action === 'rescue' && animated && (
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;.85;1"
            dur={`${motion.duration}s`}
            fill="freeze"
          />
        )}
        {motion.action !== 'rescue' && (
          <ellipse cx={anchor.x} cy={anchor.y - 2} rx="30" ry="5" fill="#020510" opacity=".4" />
        )}
        <g transform={`translate(${anchor.x} ${anchor.y})`}>
          <g className="cpi-world-actor-sprite">
            {motion.action === 'rescue' && <WorldRescueRig theme={skin} />}
            <g
              className="cpi-surface-bounce"
              data-surface={bridge}
              data-landing={cinematic?.phase === 'impact' && cinematic.feedback?.kind === 'safe'}
            >
              <WorldAvatarAura theme={skin} effects={effects} />
              <g transform={preview ? `translate(${registration.x} ${registration.y})` : undefined}>
                {gear && (
                  <CompanionTrailGear
                    world={theme}
                    item={gear}
                    weather={weather}
                    frame={frame}
                    layer="rear"
                  />
                )}
                {theme === 'obsidian' ? (
                  <image
                    className="cpi-glass-traveller"
                    href={blackMetalTraveller}
                    x="-48"
                    y="-97"
                    width="96"
                    height="100"
                    preserveAspectRatio="xMidYMax meet"
                  />
                ) : (
                  <image
                    href={worldAsset(WORLD_ASSETS[skin].companion)}
                    x={-48 - frame * 96}
                    y="-96"
                    width="288"
                    height="96"
                    clipPath={`url(#${id})`}
                  />
                )}
                {season && theme !== 'obsidian' && (
                  <CompanionSeasonGear
                    world={skin}
                    season={season}
                    weather={weather}
                    frame={frame}
                    gear={gear}
                  />
                )}
                {gear && (
                  <CompanionTrailGear world={theme} item={gear} weather={weather} frame={frame} />
                )}
                <GuardianShield
                  charges={shieldCharges}
                  temporary={effects.some((effect) => effect.kind === 'shield_5s')}
                  impact={!!cinematic?.shielded && cinematic.phase === 'impact'}
                  linger={
                    !!cinematic?.shielded &&
                    (cinematic.phase === 'contact' || cinematic.phase === 'impact')
                  }
                />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
