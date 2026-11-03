import type { PracticeSettings } from './practice-save';
import { useLanguage } from './language-context';

export function AudioSettingsControls({
  settings,
  onChange,
}: {
  settings: PracticeSettings;
  onChange: (next: PracticeSettings) => void;
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
      <legend>{t('settings.audioLegend')}</legend>
      {toggles.map(({ key, label }) => (
        <label className="cpi-sound-toggle" key={key}>
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(event) => onChange({ ...settings, [key]: event.target.checked })}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
