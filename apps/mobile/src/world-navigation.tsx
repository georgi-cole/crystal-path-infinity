import type { ReactNode } from 'react';
import type { WorldId } from './store-catalog';
import { WORLD_KITS } from './world-kits';
import { useLanguage } from './language-context';
import { CompanionSprite } from './theme-art';
import './world-navigation.css';

export type WorldNavAction =
  | 'play'
  | 'practice'
  | 'guide'
  | 'ranking'
  | 'profile'
  | 'settings'
  | 'store'
  | 'arrow'
  | 'music'
  | 'sound';

export function WorldNavGlyph({ theme, name }: { theme: WorldId; name: WorldNavAction }) {
  const material = WORLD_KITS[theme].material;
  const art: Record<WorldNavAction, ReactNode> = {
    play: <path d="m8 5 11 7-11 7V5Z" />,
    practice: (
      <>
        <path d="m12 2 7 8-7 12-7-12 7-8Z" />
        <path d="m6 10 6 4 6-4M12 3v7m0 4v7" />
      </>
    ),
    guide: <path d="M12 6c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v13" />,
    ranking: (
      <>
        <path d="M5 4h14v6a7 7 0 0 1-14 0V4Zm3 16h8m-4-3v3M5 6H2v3c0 3 3 4 4 4M19 6h3v3c0 3-3 4-4 4" />
        <path d="m12 7 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
      </>
    ),
    settings: (
      <>
        <path d="m9 2-1 4-4 2-2 4 3 3v4l5 3 3-2 4 1 4-4-1-4 2-3-3-5h-4l-3-3H9Z" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    store: (
      <>
        <path d="m3 9 9 4 9-4v10l-9 4-9-4V9Zm0 0V5l9-4 9 4v4M3 5l9 4 9-4M12 13v10" />
        <path d="m9 11 3 2 3-2v5l-3 2-3-2v-5Z" />
      </>
    ),
    arrow: (
      <>
        <path d="m14 5-7 7 7 7M8 12h13" />
      </>
    ),
    music: (
      <>
        <path d="M9 17V5l12-3v12M9 8l12-3" />
        <ellipse cx="6" cy="18" rx="3" ry="3" />
        <ellipse cx="18" cy="15" rx="3" ry="3" />
      </>
    ),
    sound: (
      <>
        <path d="M3 9h4l6-5v16l-6-5H3V9Z" />
        <path d="M17 8c3 3 3 5 0 8m3-11c5 5 5 9 0 14" />
      </>
    ),
  };
  const frame =
    material === 'copper'
      ? 'M9 3h22l6 6v22l-6 6H9l-6-6V9l6-6Z'
      : material === 'opal'
        ? 'M20 3C7 1 0 12 4 23c-1 13 14 18 24 12 12-4 13-20 3-27L20 3Z'
        : material === 'jade'
          ? 'm20 2 15 7 3 18-15 11L5 31 2 15 20 2Z'
          : material === 'enamel'
            ? 'M10 3h28l-8 34H2L10 3Z'
            : material === 'canvas'
              ? 'M7 3h24l6 6v25l-6 3H3V9l4-6Z'
              : 'M13 3h21l4 12-8 22H9L2 25 6 8l7-5Z';
  return (
    <svg
      className={'cpi-menu-glyph cpi-world-nav-glyph world-' + theme}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className="cpi-world-icon-setting" d={frame} />
      <path className="cpi-world-icon-seam" d="m26 3-5 9h7l-4 8M5 30l6-2" />
      <g className="cpi-world-icon-mark" transform="translate(8 8)">
        {art[name]}
      </g>
    </svg>
  );
}

export function WorldHomeIdentity({ theme }: { theme: WorldId }) {
  const { t } = useLanguage();
  const kit = WORLD_KITS[theme];
  return (
    <div className={'cpi-world-home-identity world-' + theme}>
      <div className="cpi-world-home-friend" aria-hidden="true">
        <CompanionSprite theme={theme} reaction="calm" />
      </div>
      <div className="cpi-world-home-copy">
        <span>{t('vault.activeWorld')}</span>
        <strong>{t(kit.title)}</strong>
        <p>{t(kit.mood)}</p>
      </div>
    </div>
  );
}
