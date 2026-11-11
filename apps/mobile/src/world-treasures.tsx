import type { ReactNode } from 'react';
import type { EffectKind } from '@crystal-path-infinity/game-core';
import type { PresentedEffect } from './infinity-presentation';
import type { ThemeId } from './store-catalog';
import { useLanguage } from './language-context';
import { CompanionSprite } from './theme-art';
import { WORLD_ASSETS, worldAsset } from './world-assets';
import { WORLD_KITS } from './world-kits';
import { WorldRelicFrame } from './world-props';
import { RenderedMysteryCache } from './mystery-cache-art';
import './world-treasures.css';

type World = Exclude<ThemeId, 'obsidian'>;

/** The same neutral prop is used for every possible content in a World. */
export function MysteryCache({ theme, open = false }: { theme: World; open?: boolean }) {
  return <RenderedMysteryCache theme={theme} open={open} />;
}

const hostile = (kind: EffectKind) =>
  [
    'fragility_5s',
    'drain_5s',
    'bleed_3rows',
    'double_loss_21s',
    'lose_hint',
    'hurt_10',
    'hurt_15',
  ].includes(kind);

/** Shared semantics, but each world manufactures its own collectible power object. */
export function WorldPowerGlyph({ theme, kind }: { theme: World; kind: EffectKind }) {
  const bad = hostile(kind);
  return (
    <svg
      className={`cpi-world-power world-${theme}${bad ? ' is-hostile' : ''}`}
      viewBox="0 0 64 64"
      width="64"
      height="64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {theme === 'chaos' ? (
        <>
          <path
            className="cpi-power-setting"
            d="m24 5-3 5-6 1-4 8-1 6-5 3v8l5 3 1 6 8 8 6 1 3 5h8l3-5 6-1 8-8 1-6 5-3v-8l-5-3-1-6-8-8-6-1-3-5H24Z"
          />
          <circle className="cpi-power-lens" cx="32" cy="32" r="21" />
          <path className="cpi-power-trim" d="M17 19h3M44 19h3M17 45h3M44 45h3" />
        </>
      ) : theme === 'jelly' ? (
        <>
          <path
            className="cpi-power-setting"
            d="M32 5C16 4 5 17 7 33c-2 16 10 27 25 26 16 2 27-11 25-26C60 17 47 4 32 5Z"
          />
          <path
            className="cpi-power-lens"
            d="M32 11c-12 0-20 9-19 21-1 13 8 22 19 21 13 1 22-8 21-21 1-12-8-21-21-21Z"
          />
          <path className="cpi-power-trim" d="M16 21q4-7 11-7m16 35 3-3" />
          <circle cx="53" cy="10" r="2" />
          <circle cx="9" cy="53" r="1.5" />
        </>
      ) : (
        <WorldRelicFrame theme={theme} />
      )}
      <g className="cpi-power-mark">
        {kind === 'shield_5s' ? (
          <>
            <path d="m32 17 13 5v10c0 9-13 16-13 16S19 41 19 32V22l13-5Z" />
            <path d="m25 32 5 5 9-11" />
          </>
        ) : kind === 'regen_5s' || kind.startsWith('heal_') ? (
          <>
            <path d="M28 20h8v8h8v8h-8v8h-8v-8h-8v-8h8v-8Z" />
            <path d={theme === 'chaos' ? 'M23 16h18M23 48h18' : 'M18 23q-2-7 5-7m18 32q7 1 7-6'} />
          </>
        ) : kind === 'lucky_5s' ? (
          <>
            <path d="m32 16 4 11 12 5-12 4-4 12-4-12-12-4 12-5 4-11Z" />
            <path d="m32 25 2 7-2 7-2-7 2-7Z" />
          </>
        ) : kind === 'fragility_5s' ? (
          <>
            <path d="m32 17 15 15-15 16-15-16 15-15Z" />
            <path d="m33 18-6 10 9 6-9 11M27 28l-8-1M36 34l9 4" />
          </>
        ) : kind === 'drain_5s' ? (
          <>
            <path
              d={
                theme === 'chaos'
                  ? 'M24 17h16v28H24V17Zm4-3h8M28 23h8m-8 6h8'
                  : 'M32 16s-12 13-12 20a12 12 0 0 0 24 0c0-7-12-20-12-20Z'
              }
            />
            <path d="M32 31v12m-5-5 5 5 5-5" />
          </>
        ) : kind === 'inversion_5s' ? (
          <>
            <path d="M18 23h7c8 0 6 18 14 18h7m-6-6 6 6-6 6M18 41h7c3 0 5-3 7-8m4-9c1-1 2-1 3-1h7m-6-6 6 6-6 6" />
          </>
        ) : kind === 'gain_hint' || kind === 'lose_hint' ? (
          <>
            <path d="M16 32s6-11 16-11 16 11 16 11-6 11-16 11-16-11-16-11Z" />
            <circle cx="32" cy="32" r="5" />
            {kind === 'lose_hint' && <path d="m20 17 24 30" />}
          </>
        ) : (
          <>
            <path d="m34 16-14 18h11l-2 15 15-21H33l1-12Z" />
            <path d="m20 19-3-3m27 29 3 3" />
          </>
        )}
      </g>
    </svg>
  );
}

/** Small accents use only already-active public effects. The physical shield is rendered in front. */
export function WorldAvatarAura({
  theme,
  effects,
}: {
  theme: World;
  effects: readonly PresentedEffect[];
}) {
  const good = effects.find((effect) => effect.positive && effect.kind !== 'shield_5s');
  const bad = effects.find((effect) => !effect.positive);
  return (
    <g className={`cpi-avatar-aura world-${theme}`}>
      {good && (
        <g transform="translate(26 -98) scale(.37)">
          <WorldPowerGlyph theme={theme} kind={good.kind} />
        </g>
      )}
      {bad && (
        <path className="cpi-avatar-affliction" d="m-43-72 6 12-10 10 10 9m79-18-6 10 9 8-6 10" />
      )}
    </g>
  );
}

export function WorldOutcomeHero({
  theme,
  finished,
  children,
}: {
  theme: World;
  finished: boolean;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <header className={`cpi-world-outcome-hero world-${theme}`}>
      <img
        src={worldAsset(WORLD_ASSETS[theme].environment)}
        alt=""
        width="1024"
        height="1536"
        aria-hidden="true"
      />
      <div className="cpi-world-outcome-label">
        <span className="cpi-dialog-kicker">{t(WORLD_KITS[theme].title)}</span>
        {children}
      </div>
      <div className="cpi-world-outcome-companion" aria-hidden="true">
        <span className="cpi-world-outcome-orbit" />
        <CompanionSprite theme={theme} reaction={finished ? 'happy' : 'calm'} />
      </div>
    </header>
  );
}
