import type { ThemeId } from './store-catalog';
import { ThemeScope } from './store-provider';
import { ThemeArtwork, ThemeCompanion } from './theme-art';
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
