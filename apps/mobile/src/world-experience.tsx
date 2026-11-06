import { useState } from 'react';
import { useLanguage } from './language-context';
import { WORLD_KITS } from './world-kits';
import type { ThemeId } from './store-catalog';
import { ThemeScope } from './store-provider';
import { ThemeArtwork, ThemeCompanion, CompanionSprite } from './theme-art';
import { PrismBridge } from './prism-bridge';

/** Shared renderers preview the scenery with the path in front of it. */
export function WorldExperience({ theme }: { theme: Exclude<ThemeId, 'obsidian'> }) {
  return (
    <ThemeScope theme={theme}>
      <div className="cpi-world-experience" data-world={theme} aria-hidden="true">
        <ThemeArtwork theme={theme} background />
        <PrismBridge preview />
        <ThemeCompanion theme={theme} reaction="calm" />
      </div>
    </ThemeScope>
  );
}

/** A touchable world portrait; no playable session or audio preview. */
export function WorldShowcase({ theme }: { theme: Exclude<ThemeId, 'obsidian'> }) {
  const { t } = useLanguage();
  const [happy, setHappy] = useState(false);
  return (
    <ThemeScope theme={theme}>
      <div className="cpi-world-showcase" data-world={theme}>
        <ThemeArtwork theme={theme} background />
        <button
          type="button"
          className="cpi-showcase-companion"
          aria-label={t('vault.greet', { name: t(WORLD_KITS[theme].title) })}
          aria-pressed={happy}
          onClick={() => setHappy((value) => !value)}
        >
          <CompanionSprite theme={theme} reaction={happy ? 'happy' : 'calm'} />
        </button>
        <span className="cpi-showcase-hint">{t('vault.tapCompanion')}</span>
      </div>
    </ThemeScope>
  );
}
