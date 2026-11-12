import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { CompanionSprite } from './theme-art';
import type { ThemeId } from './store-catalog';
import type { CampaignMissionSnapshot } from './campaign-test';
import traveller from './assets/world-previews/black-metal-traveller-v1.png';
import { CampaignRewardArt } from './campaign-reward-art';
import { missionRewardItems } from './campaign-reward-presentation';
import { equippedCompanionAsset } from './equipped-companions';
import { worldAsset } from './world-assets';
import vortex from './assets/campaign/escape-vortex-v2.webp';
import './campaign-celebration.css';
export const CLEAR_FILM_MS = 7800;
/** Shared by the actual mission result and the storage-free local screening room. */
export function CampaignClearCelebration({
  mission,
  world,
  portalOnly = false,
  onComplete,
  paused = false,
  seekMs = null,
}: {
  mission: CampaignMissionSnapshot;
  world: ThemeId;
  portalOnly?: boolean;
  onComplete?: () => void;
  paused?: boolean;
  seekMs?: number | null;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const rewards = missionRewardItems(mission);
  const primary = rewards[0];
  const bonuses = rewards.slice(1).map((item) => item.label);
  const companions = rewards.slice(1).filter((item) => item.art.type !== 'landmark');
  const art = primary.art.type === 'supply' ? primary.art.offer : primary.art.type;
  const collectionWord =
    primary.art.type === 'supply'
      ? 'Saved!'
      : primary.art.type === 'landmark'
        ? 'Restored!'
        : 'Unlocked!';
  const collectionTitle =
    primary.art.type === 'style'
      ? 'New bridge style'
      : primary.art.type === 'season'
        ? 'New season'
        : primary.art.type === 'weather'
          ? 'New weather'
          : primary.art.type === 'landmark'
            ? 'Landmark'
            : 'Reward';
  const caption =
    primary.art.type === 'supply'
      ? 'Added to your Campaign supplies'
      : primary.art.type === 'style'
        ? 'Ready to equip in the Store'
        : primary.art.type === 'landmark'
          ? 'A new light on your route'
          : 'Now part of your Infinity adventures';
  const story =
    mission.id === 'lost-lens'
      ? 'lens'
      : mission.id === 'focus-the-beam'
        ? 'focus'
        : mission.id === 'light-the-lighthouse'
          ? 'keeper'
          : 'supply';
  useLayoutEffect(() => {
    const animations = scene.current?.getAnimations({ subtree: true }) ?? [];
    for (const animation of animations) {
      if (!started.current && portalOnly) animation.currentTime = 4400;
      if (seekMs !== null) animation.currentTime = seekMs;
      if (paused || seekMs !== null) animation.pause();
      else animation.play();
    }
    started.current = true;
  }, [paused, seekMs, portalOnly]);
  useEffect(() => {
    if (!onComplete) return;
    const timer = window.setTimeout(onComplete, portalOnly ? CLEAR_FILM_MS - 4400 : CLEAR_FILM_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete, portalOnly]);
  return (
    <div
      className="cpi-clear-film"
      ref={scene}
      data-story={story}
      data-art={art}
      data-collection="morph"
      data-reward-kind={primary.art.type}
      data-long-label={primary.label.length > 24}
      data-world={world}
      data-gear={mission.gear}
    >
      <h1 className="visually-hidden" id="cpi-campaign-result-title">
        Crossing complete
      </h1>
      <p className="visually-hidden" role="status">
        {portalOnly
          ? 'The way ahead opens.'
          : 'Reward earned: ' + rewards.map((item) => item.label).join(', ')}
      </p>
      <div className="cpi-film-floor" aria-hidden="true" />
      <div className="cpi-film-light" aria-hidden="true" />
      <div className="cpi-film-dust" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <i
            key={i}
            style={
              {
                '--i': i,
                '--x': ((i * 37) % 100) + '%',
                '--y': 22 + ((i * 17) % 36) + '%',
              } as CSSProperties
            }
          />
        ))}
      </div>
      {!portalOnly && (
        <>
          <div className="cpi-film-reward">
            <div className="cpi-film-reward-light" aria-hidden="true" />
            <svg className="cpi-film-ribbons" viewBox="0 0 400 300" aria-hidden="true">
              <path d="M20 270Q35 100 200 135" />
              <path d="M380 270Q365 100 200 135" />
            </svg>
            <div className="cpi-film-object" data-bundle={companions.length > 0} aria-hidden="true">
              <div className="cpi-film-hero-art">
                <CampaignRewardArt art={primary.art} />
              </div>
              {companions.map((item, i) => (
                <div
                  className="cpi-film-bonus-art"
                  key={item.label}
                  style={{ '--bonus-index': i } as CSSProperties}
                >
                  <CampaignRewardArt art={item.art} />
                </div>
              ))}
            </div>
          </div>
          <div className="cpi-film-copy">
            <p>Crossing complete</p>
            <h2>{primary.label}</h2>
            <span>{bonuses.length ? bonuses.join(' · ') : caption}</span>
          </div>
          <div className="cpi-film-morph-light" aria-hidden="true" />
          <div className="cpi-film-collected is-morph" aria-hidden="true">
            <small>{collectionTitle}</small>
            <div className="cpi-film-saved-word" data-long={collectionWord.length > 6}>
              <span>{collectionWord}</span>
              <strong>{collectionWord}</strong>
            </div>
            <em>{rewards.map((item) => item.label).join(' · ')}</em>
          </div>
        </>
      )}
      <div className="cpi-film-portal" aria-hidden="true">
        <div className="cpi-film-portal-shadow" />
        <img src={vortex} alt="" />
        <span />
      </div>
      <div className="cpi-film-traveller" aria-hidden="true">
        {mission.gear ? (
          <span
            className="cpi-companion-sprite is-happy"
            style={
              {
                '--companion-sheet': `url("${worldAsset(equippedCompanionAsset(world, mission.gear))}")`,
              } as CSSProperties
            }
          />
        ) : world === 'obsidian' ? (
          <img src={traveller} alt="" />
        ) : (
          <CompanionSprite theme={world} reaction="happy" />
        )}
      </div>
    </div>
  );
}
