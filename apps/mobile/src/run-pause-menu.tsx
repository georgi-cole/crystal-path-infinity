import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { AudioSettingsControls } from './audio-settings-controls';
import { useLanguage } from './language-context';
import { mysteryText } from './mystery.messages';
import type { PracticeSettings } from './practice-save';
import type { RunDisplay } from './run-outcome';

const rowArt = {
  journal:
    'M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v14h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Zm9 3v13M6 8h3m6 0h3',
  progress: 'M5 4h14v16H5Zm3 12v-3m4 3V8m4 8v-5',
  sound: 'M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m2-10a8 8 0 0 1 0 12',
  test: 'm12 3 8 5v8l-8 5-8-5V8Zm0 0v9m8-4-8 4-8-4m8 4v9',
};

function PauseRow({
  art,
  children,
  ...button
}: ComponentProps<'button'> & {
  art: keyof typeof rowArt;
}) {
  return (
    <button type="button" className="cpi-pause-row" {...button}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={rowArt[art]} />
      </svg>
      <span>{children}</span>
      <svg className="cpi-pause-chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m6 3 5 5-5 5" />
      </svg>
    </button>
  );
}

type Section = 'progress' | 'sound' | 'test' | 'reserves';

export function RunPauseMenu({
  outcome,
  clearedRows,
  maxContinues,
  resources,
  settings,
  onSettingsChange,
  busy,
  onResume,
  onDiscoveries,
  onMysteryLab,
  onExit,
  onEnd,
}: {
  outcome: RunDisplay;
  clearedRows: string;
  maxContinues: number;
  resources?: ReactNode;
  settings: PracticeSettings;
  onSettingsChange: (next: PracticeSettings) => void;
  busy: boolean;
  onResume: () => void;
  onDiscoveries?: () => void;
  onMysteryLab?: () => void;
  onExit: () => void;
  onEnd: () => void;
}) {
  const { locale, t, number } = useLanguage();
  const [section, setSection] = useState<Section | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  const source = useRef<HTMLButtonElement>(null);
  const reserves = useRef<HTMLButtonElement>(null);
  const previousSection = useRef<Section | null>(null);
  const id = useId();
  const hasTestTools = Boolean(resources || onMysteryLab);
  const sections = [
    { id: 'progress', label: t('game.runDetails') },
    { id: 'sound', label: t('settings.audioLegend') },
    ...(hasTestTools ? [{ id: 'test', label: t('game.pauseTestTools') } as const] : []),
  ] as const;
  const active = sections.find((item) => item.id === section);
  const backToMenu = () => setSection(section === 'reserves' ? 'test' : null);

  useLayoutEffect(() => {
    const target =
      section === 'test' && previousSection.current === 'reserves'
        ? reserves
        : section
          ? back
          : source;
    target.current?.focus({ preventScroll: true });
    previousSection.current = section;
  }, [section]);

  return (
    <div
      className="cpi-pause-layout"
      onKeyDown={(event) => {
        if (section && event.key === 'Escape') {
          event.preventDefault();
          backToMenu();
        }
      }}
    >
      <div className="cpi-overlay-actions cpi-pause-actions">
        <button
          type="button"
          className="cpi-pause-resume"
          data-cpi-overlay-primary
          disabled={busy}
          onClick={onResume}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m8 5 11 7-11 7V5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          {t('general.resume')}
        </button>
      </div>
      <div className="cpi-pause-menu" hidden={section !== null}>
        <div className="cpi-pause-list">
          {onDiscoveries && (
            <PauseRow art="journal" onClick={onDiscoveries} disabled={busy}>
              {t('guide.journalTab')}
            </PauseRow>
          )}
          {sections.map((item) => (
            <PauseRow
              key={item.id}
              art={item.id}
              aria-controls={id}
              aria-expanded={section === item.id}
              disabled={busy}
              onClick={(event) => {
                source.current = event.currentTarget;
                setSection(item.id);
              }}
            >
              {item.label}
            </PauseRow>
          ))}
        </div>
        <div className="cpi-overlay-actions cpi-pause-exits">
          <button type="button" disabled={busy} onClick={onExit}>
            {t('general.saveLeave')}
          </button>
          <button type="button" className="cpi-run-danger-action" disabled={busy} onClick={onEnd}>
            {t('general.endRun')}
          </button>
        </div>
      </div>
      <section
        className="cpi-pause-subview"
        id={id}
        aria-labelledby={id + '-title'}
        hidden={section === null}
      >
        <header>
          <h3 id={id + '-title'}>{section === 'reserves' ? t('vault.manage') : active?.label}</h3>
          <button ref={back} className="cpi-pause-back" type="button" onClick={backToMenu}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m10 3-5 5 5 5" />
            </svg>
            {t(section === 'reserves' ? 'game.backToTestTools' : 'game.backToPause')}
          </button>
        </header>
        <dl className="cpi-pause-metrics" hidden={section !== 'progress'}>
          <div>
            <dt>{t('game.rowsCleared')}</dt>
            <dd>{clearedRows}</dd>
          </div>
          <div>
            <dt>{t('game.used')}</dt>
            <dd>
              {number(outcome.appliedContinues)} / {number(maxContinues)}
            </dd>
          </div>
          <div>
            <dt>{t('game.granted')}</dt>
            <dd>
              {number(outcome.grantedContinues)} / {number(maxContinues)}
            </dd>
          </div>
          <div>
            <dt>{t('game.quota')}</dt>
            <dd>{number(outcome.grantsRemaining)}</dd>
          </div>
        </dl>
        <div hidden={section !== 'sound'}>
          <AudioSettingsControls settings={settings} onChange={onSettingsChange} hideLegend />
        </div>
        {hasTestTools && (
          <div className="cpi-pause-test-tools" hidden={section !== 'test'}>
            {resources && (
              <PauseRow
                ref={reserves}
                art="progress"
                onClick={() => setSection('reserves')}
                disabled={busy}
              >
                {t('vault.manage')}
              </PauseRow>
            )}
            {onMysteryLab && (
              <PauseRow art="test" onClick={onMysteryLab} disabled={busy}>
                {mysteryText(locale, 'lab')}
              </PauseRow>
            )}
          </div>
        )}
        {resources && <div hidden={section !== 'reserves'}>{resources}</div>}
      </section>
    </div>
  );
}
