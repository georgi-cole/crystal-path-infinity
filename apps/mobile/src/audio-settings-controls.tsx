import type { PracticeSettings } from './practice-save';

export function AudioSettingsControls({
  settings,
  onChange,
}: {
  settings: PracticeSettings;
  onChange: (next: PracticeSettings) => void;
}) {
  const toggles: { key: keyof PracticeSettings; label: string }[] = [
    { key: 'music', label: 'Music' },
    { key: 'soundEffects', label: 'Sound effects' },
    { key: 'haptics', label: 'Haptic feedback' },
    { key: 'reducedMotion', label: 'Reduce motion' },
  ];
  return (
    <fieldset className="cpi-sound-options">
      <legend>Sound and feedback</legend>
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
