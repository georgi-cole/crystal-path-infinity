import type { PracticeSettings } from './practice-save';
import { useLanguage } from './language-context';

export function AudioSettingsControls({
  settings,
  onChange,
  hideLegend = false,
}: {
  settings: PracticeSettings;
  onChange: (next: PracticeSettings) => void;
  hideLegend?: boolean;
}) {
  const { t } = useLanguage();
  const toggles: { key: keyof PracticeSettings; label: string }[] = [
    { key: 'music', label: t('settings.music') },
    { key: 'soundEffects', label: t('settings.sfx') },
    { key: 'haptics', label: t('settings.haptics') },
    { key: 'reducedMotion', label: t('settings.reducedMotion') },
  ];
  return (
    <fieldset className="cpi-sound-options">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>
        {t('settings.audioLegend')}
      </legend>
      {toggles.map(({ key, label }) => (
        <label className="cpi-sound-toggle" key={key}>
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(event) => onChange({ ...settings, [key]: event.target.checked })}
          />
          <span className="cpi-setting-label">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {key === 'music' ? (
                <>
                  <path d="M9 17V5l11-2v12M9 8l11-2" />
                  <ellipse cx="6" cy="18" rx="3" ry="2" />
                  <ellipse cx="17" cy="16" rx="3" ry="2" />
                </>
              ) : key === 'soundEffects' ? (
                <>
                  <path d="M4 9h4l5-5v16l-5-5H4V9ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14" />
                </>
              ) : key === 'haptics' ? (
                <>
                  <rect x="8" y="4" width="8" height="16" rx="2" />
                  <path d="m4 7-2 5 2 5M20 7l2 5-2 5M11 17h2" />
                </>
              ) : (
                <>
                  <path d="M4 7h10M4 12h7M4 17h10M16 6l5 6-5 6" />
                </>
              )}
            </svg>
            {label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
