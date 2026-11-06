import { useId } from 'react';
import type { EffectKind } from '@crystal-path-infinity/game-core';
import type { PresentedEffect } from './infinity-presentation';
import type { ThemeId } from './store-catalog';
import { useLanguage } from './language-context';
import { CompanionSprite } from './theme-art';
import { WORLD_ASSETS, worldAsset } from './world-assets';
import { useWorldMotion } from './world-motion';
import './world-treasures.css';

type World = Exclude<ThemeId, 'obsidian'>;

/** Original, layered props. Their appearance never encodes the hidden reward. */
export function MysteryCache({ theme, open = false }: { theme: World; open?: boolean }) {
  const id = useId().replace(/:/g, '');
  const motion = useWorldMotion();
  return (
    <svg
      className={`cpi-world-cache world-${theme}${open ? ' is-open' : ''}${motion.reduced || motion.suspended ? ' is-still' : ''}`}
      viewBox="0 0 80 88"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={id + 'shell'}
          x1="12"
          y1="22"
          x2="67"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={theme === 'chaos' ? '#ffe0a4' : '#fff2ff'} />
          <stop offset=".4" stopColor={theme === 'chaos' ? '#a75e3b' : '#ceacf5'} />
          <stop offset="1" stopColor={theme === 'chaos' ? '#392e36' : '#5568a6'} />
        </linearGradient>
        <radialGradient id={id + 'core'}>
          <stop stopColor="#ffffff" />
          <stop offset=".35" stopColor={theme === 'chaos' ? '#baffde' : '#edc9ff'} />
          <stop offset="1" stopColor={theme === 'chaos' ? '#409a85' : '#779ee3'} />
        </radialGradient>
      </defs>
      <ellipse cx="40" cy="80" rx="25" ry="4" fill="#020718" opacity=".5" />
      {theme === 'chaos' ? (
        <>
          <path
            className="cpi-cache-core"
            d="m40 23 13 20-13 21-13-21 13-20Z"
            fill={`url(#${id}core)`}
          />
          <g className="cpi-cache-base">
            <path
              d="m13 42 27 10 27-10v25L40 80 13 67V42Z"
              fill={`url(#${id}shell)`}
              stroke="#e8b783"
            />
            <path d="M40 53v25M19 51v12l12 6M61 51v12l-12 6" stroke="#3b3437" strokeWidth="3" />
            <path d="M17 48v16l17 8M63 48v16l-17 8" stroke="#c3eeda" strokeOpacity=".7" />
            <path d="m35 49 5-3 5 3v12l-5 3-5-3V49Z" fill="#203e3d" stroke="#f1c483" />
            <circle cx="40" cy="54" r="3" fill="#baffe1" />
            {[20, 60].map((x) => (
              <circle key={x} cx={x} cy="65" r="1.8" fill="#f6cc96" />
            ))}
          </g>
          <g className="cpi-cache-lid">
            <path
              d="m40 17 29 16v12L40 58 11 45V33l29-16Z"
              fill={`url(#${id}shell)`}
              stroke="#f2c58b"
            />
            <path
              d="m12 34 28 14 28-14M40 48v10M25 25l29 15M55 25 26 40"
              stroke="#502e2d"
              strokeWidth="2"
            />
            <path d="m40 22 13 11-13 8-13-8 13-11Z" fill="#193c3b" stroke="#b1eed2" />
            <path
              d="M37 30c0-5 8-5 8 0 0 3-5 3-5 6m0 2v1"
              stroke="#d4ffe9"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M9 33v12m62-12v12" stroke="#b5bdb0" strokeWidth="4" />
          </g>
        </>
      ) : (
        <>
          <path
            className="cpi-cache-core"
            d="m40 22 5 13 14 5-14 5-5 15-5-15-14-5 14-5 5-13Z"
            fill={`url(#${id}core)`}
          />
          <g className="cpi-cache-base">
            <path
              d="M12 46c0 20 10 33 28 33s28-13 28-33L40 39 12 46Z"
              fill={`url(#${id}shell)`}
              stroke="#f2dcff"
            />
            <path
              d="M20 50c2 15 7 20 13 23M60 50c-2 15-7 20-13 23M40 49v25"
              stroke="#d5eaff"
              strokeOpacity=".6"
            />
            <ellipse cx="40" cy="47" rx="25" ry="9" fill="#514777" stroke="#f4d6ff" />
            <path d="M16 57c10 10 38 10 48 0" stroke="#fff1ff" strokeOpacity=".35" />
          </g>
          <g className="cpi-cache-lid">
            <path
              d="M11 44C9 28 22 15 40 15s31 13 29 29c-11 15-47 15-58 0Z"
              fill={`url(#${id}shell)`}
              stroke="#f8eaff"
            />
            <path
              d="M20 38c2-10 6-13 11-15M49 23c5 2 9 5 11 15M40 20v16"
              stroke="#fff2ff"
              strokeWidth="2"
              strokeLinecap="round"
              opacity=".65"
            />
            <path d="M11 44c17 11 41 11 58 0" stroke="#bcecff" strokeWidth="3" />
            <path
              d="m40 37 3 7 8 2-8 4-3 9-3-9-8-4 8-2 3-7Z"
              fill={`url(#${id}core)`}
              stroke="#fff6ff"
            />
            <circle cx="19" cy="30" r="2" fill="#ffffff" />
          </g>
          <g className="cpi-cache-satellites" stroke="#cdeeff">
            <circle cx="9" cy="61" r="2.5" />
            <circle cx="70" cy="19" r="3" />
          </g>
        </>
      )}
    </svg>
  );
}

const hostile = (kind: EffectKind) =>
  ['fragility_5s', 'drain_5s', 'inversion_5s', 'lose_hint', 'hurt_10', 'hurt_15'].includes(kind);

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
      ) : (
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

/** A shield field and two small accents use only already-active public effects. */
export function WorldAvatarAura({
  theme,
  effects,
}: {
  theme: World;
  effects: readonly PresentedEffect[];
}) {
  const shield = effects.some((effect) => effect.kind === 'shield_5s');
  const good = effects.find((effect) => effect.positive && effect.kind !== 'shield_5s');
  const bad = effects.find((effect) => !effect.positive);
  return (
    <g className={`cpi-avatar-aura world-${theme}`}>
      {shield && (
        <path
          className="cpi-avatar-shield"
          d={
            theme === 'chaos'
              ? 'm0-100 42 18v36c0 28-42 48-42 48s-42-20-42-48v-36l42-18Z'
              : 'M0-101c-34 0-49 22-47 49S-31-1 0-1s49-23 47-51-13-49-47-49Z'
          }
        />
      )}
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

export function WorldOutcomeHero({ theme, finished }: { theme: World; finished: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={`cpi-world-outcome-hero world-${theme}`}>
      <img
        src={worldAsset(WORLD_ASSETS[theme].environment)}
        alt=""
        width="1024"
        height="1536"
        aria-hidden="true"
      />
      <span className="cpi-world-outcome-orbit" aria-hidden="true" />
      <div className="cpi-world-outcome-companion" aria-hidden="true">
        <CompanionSprite theme={theme} reaction={finished ? 'happy' : 'calm'} />
      </div>
      <div className="cpi-world-outcome-label">
        <span>{t(theme === 'chaos' ? 'vault.chaos' : 'vault.jelly')}</span>
        <strong>{t(theme === 'chaos' ? 'vault.workshopJournal' : 'vault.starlightJournal')}</strong>
      </div>
    </div>
  );
}
