import { useLanguage } from './language-context';
import { useThemeId } from './store-context';
import { WorldNavGlyph } from './world-navigation';

export function BackButton({ onBack, label }: { onBack: () => void; label?: string }) {
  const { t } = useLanguage();
  const theme = useThemeId();
  return (
    <button className="cpi-menu-back" type="button" onClick={onBack}>
      {theme === 'obsidian' ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m10 5-7 7 7 7M3 12h18" />
        </svg>
      ) : (
        <WorldNavGlyph theme={theme} name="arrow" />
      )}
      <span>{label ?? t('general.back')}</span>
    </button>
  );
}
