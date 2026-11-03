import type { ReactNode } from 'react';
import { AudioSettingsControls } from './audio-settings-controls';
import { LanguageSettings, PrivacyAccountSupport } from './locale-settings';
import { useLanguage } from './i18n';
import { BridgeTutorial } from './bridge-tutorial';
import type { TutorialProgress } from './tutorial-progress';
import type { PracticeLoad, PracticeSettings } from './practice-save';
import { canResumePractice, rankedServiceState } from './menu-navigation';
import type { MenuView } from './menu-navigation';
import './main-menu.css';
import './intro-hub-premium.css';

const INTRO_HUB_BASE = import.meta.env.BASE_URL + 'intro-hub/';

type GlyphName = 'play' | 'practice' | 'ranking' | 'profile' | 'settings' | 'arrow';

function Glyph({ name }: { name: GlyphName }) {
  const art: Record<GlyphName, ReactNode> = {
    play: <path d="m9 5 11 7-11 7V5Z" />,
    practice: (
      <>
        <path d="M12 2 5 11l7 11 7-11-7-9Z" />
        <path d="M8 11h8M12 4v16" />
      </>
    ),
    ranking: (
      <>
        <path d="M4 20V9h5v11M10 20V4h5v16M16 20v-7h4v7" />
        <path d="M2 21h20" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.5 3-7 8-7s8 2.5 8 7" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="17" r="2" />
      </>
    ),
    arrow: <path d="m14 5-7 7 7 7" />,
  };
  return (
    <svg
      className="cpi-menu-glyph"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {art[name]}
    </svg>
  );
}

/** Original Big Eye IntroHub button silhouettes and icons; standalone navigation owns the click. */
export function MenuAction({
  label,
  description,
  icon,
  variant = 'secondary',
  onClick,
}: {
  label: string;
  description?: string;
  icon?: GlyphName;
  variant?: 'primary' | 'secondary' | 'quiet';
  onClick: () => void;
}) {
  const buttonFace =
    variant === 'primary'
      ? 'primary_large_normal.svg'
      : icon === 'practice'
        ? 'secondary_wide_normal.svg'
        : icon === 'settings'
          ? 'secondary_small_normal.svg'
          : 'secondary_medium_normal.svg';
  const sourceIcon =
    icon === 'play'
      ? 'icons/play.svg'
      : icon === 'practice'
        ? 'icons/rules.svg'
        : icon === 'ranking'
          ? 'icons/leaderboard.svg'
          : icon === 'profile'
            ? 'icons/profile.svg'
            : icon === 'settings'
              ? 'utilities/settings_v2.svg'
              : null;
  return (
    <button
      className={'cpi-menu-action cpi-menu-action--' + variant}
      type="button"
      onClick={onClick}
    >
      <img
        className="cpi-menu-action-art"
        src={INTRO_HUB_BASE + 'buttons/' + buttonFace}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {icon && (
        <span className="cpi-menu-action-icon">
          {sourceIcon ? (
            <img src={INTRO_HUB_BASE + sourceIcon} alt="" aria-hidden="true" />
          ) : (
            <Glyph name={icon} />
          )}
        </span>
      )}
      <span className="cpi-menu-action-copy">
        <span className="cpi-menu-action-title">{label}</span>
        {description && <span className="cpi-menu-action-description">{description}</span>}
      </span>
      <span className="cpi-menu-action-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function HubUtilityControls({
  settings,
  onSettingsChange,
  onOpen,
}: Pick<MainMenuProps, 'settings' | 'onSettingsChange' | 'onOpen'>) {
  const { t } = useLanguage();
  return (
    <div className="cpi-hub-utilities" aria-label={t('settings.audioLegend')}>
      <div className="cpi-hub-utility-stack">
        {(
          [
            { key: 'music', icon: 'music_v2.svg', label: t('settings.music') },
            { key: 'soundEffects', icon: 'sound_v2.svg', label: t('settings.sfx') },
          ] as const
        ).map(({ key, icon, label }) => (
          <button
            key={key}
            type="button"
            className={'cpi-hub-chip' + (settings[key] ? '' : ' cpi-hub-chip--inactive')}
            aria-label={t(settings[key] ? 'settings.disable' : 'settings.enable', { setting: label.toLowerCase() })}
            aria-pressed={settings[key]}
            onClick={() => onSettingsChange({ ...settings, [key]: !settings[key] })}
          >
            <img
              className="cpi-hub-chip-shell"
              src={INTRO_HUB_BASE + 'utilities/side_utility_shell_normal.svg'}
              alt=""
              aria-hidden="true"
            />
            <img
              className="cpi-hub-chip-glyph"
              src={INTRO_HUB_BASE + 'utilities/' + icon}
              alt=""
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        className="cpi-hub-chip"
        aria-label={t('settings.open')}
        onClick={() => onOpen('settings')}
      >
        <img
          className="cpi-hub-chip-shell"
          src={INTRO_HUB_BASE + 'utilities/side_utility_shell_normal.svg'}
          alt=""
          aria-hidden="true"
        />
        <img
          className="cpi-hub-chip-glyph"
          src={INTRO_HUB_BASE + 'utilities/settings_v2.svg'}
          alt=""
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/** Semantic compact status inspired by GameTopChip; no season/Redux dependency. */
function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'offline';
}) {
  return <span className={'cpi-menu-pill cpi-menu-pill--' + tone}>{children}</span>;
}

export interface MainMenuProps {
  view: MenuView;
  saved: PracticeLoad;
  best: string | null;
  online: boolean;
  settings: PracticeSettings;
  onOpen: (view: MenuView) => void;
  onBack: () => void;
  onResume: () => void;
  onNew: () => void;
  onSettingsChange: (settings: PracticeSettings) => void;
  onRetryConnection: () => void;
  tutorialProgress: TutorialProgress;
  onTutorialProgress: (progress: Exclude<TutorialProgress, 'unseen'>) => void;
  buildLabel?: string;
  warning?: string | null;
}

function MenuHeader({
  view,
  online,
  onBack,
}: {
  view: MenuView;
  online: boolean;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  return (
    <header className="cpi-menu-header">
      {view !== 'home' ? (
        <button className="cpi-menu-back" type="button" onClick={onBack} aria-label={t('general.back')}>
          <Glyph name="arrow" />
          <span>{t('general.back')}</span>
        </button>
      ) : (
        <span className="cpi-menu-series">
          Crystal Path <span aria-hidden="true">/</span> Infinity
        </span>
      )}
      <div className="cpi-menu-status" aria-label={t('menu.status')}>
        <StatusPill>{t('general.guest')}</StatusPill>
        <StatusPill tone={online ? 'neutral' : 'offline'}>
          {online ? t('general.rankedUnavailable') : t('general.offline')}
        </StatusPill>
      </div>
    </header>
  );
}

function MenuHome({
  saved,
  best,
  onOpen,
  onResume,
  onNew,
  tutorialProgress,
}: Pick<MainMenuProps, 'saved' | 'best' | 'onOpen' | 'onResume' | 'onNew' | 'tutorialProgress'>) {
  const canResume = canResumePractice(saved);
  const { t, number } = useLanguage();
  return (
    <>
      <section className="cpi-menu-hero" aria-labelledby="menu-title">
        <div className="cpi-hub-emblem" aria-hidden="true">
          <span className="cpi-hub-emblem-orbit" />
          <img
            className="cpi-menu-mark"
            src={import.meta.env.BASE_URL + 'brand/prism-mark.svg'}
            alt=""
          />
        </div>
        <p className="cpi-menu-kicker">{t('menu.kicker')}</p>
        <h1 id="menu-title" data-menu-heading tabIndex={-1}>
          Infinity
        </h1>
        <p className="cpi-menu-tagline">{t('menu.tagline')}</p>
      </section>

      <section className="cpi-menu-scoreboard" aria-label={t('menu.progress')}>
        <div>
          <span className="cpi-menu-eyebrow">{t('menu.personalBest')}</span>
          <strong className="cpi-menu-score">{t('general.row', { row: number(best) })}</strong>
        </div>
        <span className="cpi-menu-score-caption">{t('menu.notRanked')}</span>
      </section>

      <nav className="cpi-menu-actions" aria-label={t('menu.main')}>
        <MenuAction
          label={t('general.play')}
          description={t('menu.playDescription')}
          icon="play"
          variant="primary"
          onClick={() => onOpen('play')}
        />
        <MenuAction
          label={t('general.practice')}
          description={t('menu.practiceDescription')}
          icon="practice"
          onClick={() => onOpen('practice')}
        />
        <MenuAction
          label={tutorialProgress === 'completed' ? t('menu.replay') : t('menu.learn')}
          description={t('menu.tutorialDescription')}
          icon="practice"
          variant="quiet"
          onClick={() => onOpen('tutorial')}
        />
        {canResume && saved.status === 'ready' && (
          <div className="cpi-menu-resume">
            <span className="cpi-menu-resume-copy">
              {t('menu.savedPractice', { row: number(saved.state.currentRow) })}
            </span>
            <button type="button" onClick={onResume}>
              {t('general.resume')}
            </button>
            <button className="cpi-menu-resume-new" type="button" onClick={onNew}>
              {t('general.new')}
            </button>
          </div>
        )}
        <div className="cpi-menu-grid">
          <MenuAction label={t('general.rankings')} icon="ranking" onClick={() => onOpen('rankings')} />
          <MenuAction label={t('general.profile')} icon="profile" onClick={() => onOpen('profile')} />
          <MenuAction label={t('general.settings')} icon="settings" onClick={() => onOpen('settings')} />
        </div>
      </nav>
    </>
  );
}

function MenuPanel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="cpi-menu-panel" aria-labelledby="cpi-panel-title">
      <p className="cpi-menu-eyebrow">{eyebrow}</p>
      <h1 id="cpi-panel-title" tabIndex={-1} data-menu-heading>
        {title}
      </h1>
      {children}
    </section>
  );
}

export function ConfirmNewPractice({
  saved,
  onCancel,
  onConfirm,
}: {
  saved: PracticeLoad;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const damaged = saved.status === 'corrupt';
  const { t } = useLanguage();
  return (
    <div className="cpi-menu-modal" role="presentation">
      <section
        className="cpi-menu-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cpi-new-title"
        aria-describedby="cpi-new-copy"
      >
        <p className="cpi-menu-eyebrow">{t('menu.confirmTitle')}</p>
        <h2 id="cpi-new-title">{damaged ? t('menu.confirmDiscard') : t('menu.confirmReplace')}</h2>
        <p id="cpi-new-copy">
          {damaged ? t('menu.discardExplained') : t('menu.replaceExplained')}
        </p>
        <div className="cpi-menu-dialog-actions">
          <button className="cpi-menu-dialog-cancel" type="button" onClick={onCancel}>
            {t('menu.keepSaved')}
          </button>
          <button className="cpi-menu-dialog-confirm" type="button" onClick={onConfirm}>
            {t('menu.startFresh')}
          </button>
        </div>
      </section>
    </div>
  );
}

export function MainMenu({
  view,
  saved,
  best,
  online,
  settings,
  onOpen,
  onBack,
  onResume,
  onNew,
  onSettingsChange,
  onRetryConnection,
  tutorialProgress,
  onTutorialProgress,
  warning,
  buildLabel,
}: MainMenuProps) {
  const service = rankedServiceState(online);
  const { t, number } = useLanguage();
  return (
    <main className="cpi-menu-shell" data-testid="app-ready">
      <div className="cpi-menu-orbit" aria-hidden="true" />
      <div className="cpi-menu-inner">
        <MenuHeader view={view} online={online} onBack={onBack} />
        {view === 'home' ? (
          <>
            <HubUtilityControls
              settings={settings}
              onSettingsChange={onSettingsChange}
              onOpen={onOpen}
            />
            <MenuHome
              saved={saved}
              best={best}
              onOpen={onOpen}
              onResume={onResume}
              onNew={onNew}
              tutorialProgress={tutorialProgress}
            />
          </>
        ) : view === 'practice' ? (
          <MenuPanel title={t('general.practice')} eyebrow={t('menu.practiceEyebrow')}>
            <p>{t('menu.practiceIntro')}</p>
            <MenuAction
              label={tutorialProgress === 'completed' ? t('menu.replay') : t('menu.learn')}
              description={t('menu.tutorialExercise')}"
              icon="practice"
              onClick={() => onOpen('tutorial')}
            />
            {canResumePractice(saved) && saved.status === 'ready' && (
              <MenuAction
                label={t('menu.resumeSaved', { row: number(saved.state.currentRow) })}
                description={t('menu.resumeDescription')}
                icon="play"
                variant="primary"
                onClick={onResume}
              />
            )}
            {saved.status === 'corrupt' && <p role="alert">{saved.message}</p>}
            <MenuAction
              label={t('menu.newPractice')}
              description={t('menu.startRow1')}
              icon="practice"
              onClick={onNew}
            />
            <p className="cpi-menu-fine-print">{t('menu.practiceLocal')}</p>
          </MenuPanel>
        ) : view === 'tutorial' ? (
          <BridgeTutorial
            onComplete={() => onTutorialProgress('completed')}
            onSkip={() => {
              onTutorialProgress('skipped');
              onOpen('practice');
            }}
            onStartPractice={() => onOpen('practice')}
            reducedMotion={settings.reducedMotion}
          />
        ) : view === 'play' ? (
          <MenuPanel title={t('general.play')} eyebrow={t('menu.playEyebrow')}>
            <p>{t('menu.playUnavailable')}</p>
            <div className="cpi-menu-notice" role="status">
              <strong>
                {service === 'offline' ? t('menu.youOffline') : t('menu.servicesMissing')}
              </strong>
              <span>{t('menu.noRankedHere')}</span>
            </div>
            <MenuAction
              label={t('menu.practiceInstead')}
              description={t('menu.practiceNow')}
              icon="practice"
              variant="primary"
              onClick={() => onOpen('practice')}
            />
          </MenuPanel>
        ) : view === 'rankings' ? (
          <MenuPanel title={t('general.rankings')} eyebrow={t('menu.rankingsScope')}>
            <p>{t('menu.rankingsUnavailable')}</p>
            <div className="cpi-menu-notice" role="status">
              <strong>
                {service === 'offline' ? t('menu.offlineRankings') : t('menu.rankingsMissing')}
              </strong>
              <span>{t('menu.practiceNotRanked')}</span>
            </div>
            <p className="cpi-menu-personal-summary">
              {t('menu.localBestRow', { row: number(best) })}
            </p>
            {!online && (
              <button className="cpi-menu-text-action" type="button" onClick={onRetryConnection}>
                {t('menu.recheck')}
              </button>
            )}
            <MenuAction
              label={t('menu.practiceOffline')}
              icon="practice"
              onClick={() => onOpen('practice')}
            />
          </MenuPanel>
        ) : view === 'profile' ? (
          <MenuPanel title={t('general.profile')} eyebrow={t('menu.profileEyebrow')}>
            <div className="cpi-menu-notice" role="status">
              <strong>{t('menu.asGuest')}</strong>
              <span>{t('menu.noAccount')}</span>
            </div>
            <p>{t('menu.profileFuture')}</p>
            <MenuAction
              label={t('menu.practiceUnsigned')}
              icon="practice"
              onClick={() => onOpen('practice')}
            />
          </MenuPanel>
        ) : (
          <MenuPanel title={t('general.settings')} eyebrow={t('menu.settingsEyebrow')}>
            <p>{t('menu.settingsIntro')}</p>
            <AudioSettingsControls settings={settings} onChange={onSettingsChange} />
            <MenuAction
              label={tutorialProgress === 'completed' ? t('menu.replay') : t('menu.openTutorial')}
              description={
                tutorialProgress === 'completed'
                  ? t('menu.tutorialDone')
                  : tutorialProgress === 'skipped'
                    ? t('menu.tutorialSkipped')
                    : t('menu.tutorialAvailable')
              }
              icon="practice"
              onClick={() => onOpen('tutorial')}
            />
            <LanguageSettings />
            <PrivacyAccountSupport />
          </MenuPanel>
        )}
        {warning && (
          <p className="cpi-menu-warning" role="alert">
            {warning}
          </p>
        )}
        <footer className="cpi-menu-footer">
          <span>Crystal Path: Infinity</span>
          <span>{t('menu.footerOffline')}</span>
          {buildLabel && <span>{buildLabel}</span>}
        </footer>
      </div>
    </main>
  );
}
