import type { ReactNode } from 'react';
import { StageAtmosphere } from './stage-atmosphere';
import { PrismBridge } from './prism-bridge';
import { AudioSettingsControls } from './audio-settings-controls';
import { AccountEntry } from './account/account-entry';
import { ProfileEditor } from './account/profile-editor';
import type { ProfileClient } from './account/profile-client';
import { LeaderboardView } from './leaderboard/leaderboard-view';
import type { LeaderboardClient } from './leaderboard/leaderboard-client';
import { RankedScene } from './ranked/ranked-scene';
import type { RankedClient } from './ranked/ranked-client';
import type { RewardFlow } from './rewards/reward-flow';
import type { SavedPendingClient } from './ranked/saved-pending-client';
import { AccountControls } from './account/account-controls';
import type { AccountControlsClient } from './account/account-controls-model';
import type { NameReportClient } from './leaderboard/name-report-client';
import { LanguageSettings, PrivacyAccountSupport } from './locale-settings';
import { useLanguage } from './language-context';
import { BridgeTutorial } from './bridge-tutorial';
import { useThemeId } from './store-context';
import { StoreVault } from './store-vault';
import { WorldHomeIdentity, WorldNavGlyph } from './world-navigation';
import { isPetWorld } from './world-kits';
import type { TutorialProgress } from './tutorial-progress';
import type { PracticeLoad, PracticeSettings } from './practice-save';
import { canResumePractice, rankedServiceState } from './menu-navigation';
import type { MenuView } from './menu-navigation';
import './main-menu.css';
import './intro-hub-premium.css';
import './game-settings.css';

const INTRO_HUB_BASE = import.meta.env.BASE_URL + 'intro-hub/';

type GlyphName = 'play' | 'practice' | 'ranking' | 'profile' | 'settings' | 'store' | 'arrow';

function Glyph({ name }: { name: GlyphName }) {
  const theme = useThemeId();
  if (theme !== 'obsidian') return <WorldNavGlyph theme={theme} name={name} />;
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
    store: (
      <>
        <path d="M5 8h14l1 13H4L5 8Z" />
        <path d="M8 8V6a4 4 0 0 1 8 0v2M9 13l3 3 3-3" />
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

/** Shared semantic action with an original material and interaction treatment. */
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
  return (
    <button
      className={'cpi-menu-action cpi-menu-action--' + variant}
      type="button"
      onClick={onClick}
    >
      {icon && (
        <span className="cpi-menu-action-icon">
          <Glyph name={icon} />
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
  const theme = useThemeId();
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
            aria-label={t(settings[key] ? 'settings.disable' : 'settings.enable', {
              setting: label.toLowerCase(),
            })}
            aria-pressed={settings[key]}
            onClick={() => onSettingsChange({ ...settings, [key]: !settings[key] })}
          >
            {theme !== 'obsidian' ? (
              <WorldNavGlyph theme={theme} name={key === 'music' ? 'music' : 'sound'} />
            ) : (
              <img
                className="cpi-hub-chip-glyph"
                src={INTRO_HUB_BASE + 'utilities/' + icon}
                alt=""
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="cpi-hub-chip"
        aria-label={t('settings.open')}
        onClick={() => onOpen('settings')}
      >
        {theme !== 'obsidian' ? (
          <WorldNavGlyph theme={theme} name="settings" />
        ) : (
          <img
            className="cpi-hub-chip-glyph"
            src={INTRO_HUB_BASE + 'utilities/settings_v2.svg'}
            alt=""
            aria-hidden="true"
          />
        )}
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
  profileClient?: ProfileClient | null;
  leaderboardClient?: LeaderboardClient | null;
  leaderboardCountries?: readonly { countryCode: string; continentCode: string }[];
  pendingPersonalResult?: boolean;
  rankedClient?: RankedClient | null;
  rewardFlow?: RewardFlow | null;
  savedPendingClient?: SavedPendingClient | null;
  accountControlsClient?: AccountControlsClient | null;
  accountScope?: object | null;
  accountConnected?: boolean;
  nameReportClient?: NameReportClient | null;
}

function MenuHeader({
  view,
  online,
  onBack,
  accountConnected = false,
  rankedAvailable = false,
  utilities,
}: {
  view: MenuView;
  online: boolean;
  onBack: () => void;
  accountConnected?: boolean;
  rankedAvailable?: boolean;
  utilities?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <header className="cpi-menu-header">
      {view !== 'home' ? (
        <button
          className="cpi-menu-back"
          type="button"
          onClick={onBack}
          aria-label={t('general.back')}
        >
          <Glyph name="arrow" />
          <span>{t('general.back')}</span>
        </button>
      ) : (
        utilities
      )}
      <div className="cpi-menu-status" aria-label={t('menu.status')}>
        <StatusPill>
          {t(accountConnected ? 'general.accountConnected' : 'general.guest')}
        </StatusPill>
        {(!online || rankedAvailable) && (
          <StatusPill tone={online ? 'neutral' : 'offline'}>
            {online
              ? t(rankedAvailable ? 'general.rankedReady' : 'general.rankedUnavailable')
              : t('general.offline')}
          </StatusPill>
        )}
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
  rankedClient,
  settings,
}: Pick<
  MainMenuProps,
  | 'saved'
  | 'best'
  | 'onOpen'
  | 'onResume'
  | 'onNew'
  | 'tutorialProgress'
  | 'rankedClient'
  | 'settings'
>) {
  const canResume = canResumePractice(saved);
  const { t, number } = useLanguage();
  const theme = useThemeId();
  return (
    <div className="cpi-home-composition">
      <div className="cpi-home-scenery" aria-hidden="true">
        <PrismBridge preview reducedMotion={settings.reducedMotion} />
      </div>
      <section className="cpi-menu-hero" aria-labelledby="menu-title">
        <p className="cpi-menu-kicker">Crystal Path</p>
        <h1 id="menu-title" data-menu-heading tabIndex={-1}>
          Infinity
        </h1>
        {theme === 'obsidian' ? (
          <p className="cpi-menu-tagline">{t('menu.tagline')}</p>
        ) : (
          <WorldHomeIdentity theme={theme} />
        )}
      </section>

      <section className="cpi-menu-scoreboard" aria-label={t('menu.progress')}>
        <div>
          <span className="cpi-menu-eyebrow">{t('menu.personalBest')}</span>
          <strong className="cpi-menu-score">{t('general.row', { row: number(best) })}</strong>
        </div>
        <span className="visually-hidden">{t('menu.notRanked')}</span>
      </section>

      <nav className="cpi-menu-actions" aria-label={t('menu.main')}>
        <MenuAction
          label={t(canResume && !rankedClient ? 'general.resume' : 'general.play')}
          icon="play"
          variant="primary"
          onClick={rankedClient ? () => onOpen('play') : canResume ? onResume : onNew}
        />
        <MenuAction
          label={t('general.practice')}
          icon="practice"
          onClick={() => onOpen('practice')}
        />
        <MenuAction
          label={tutorialProgress === 'completed' ? t('menu.replay') : t('menu.learn')}
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
          <MenuAction
            label={t('general.rankings')}
            icon="ranking"
            onClick={() => onOpen('rankings')}
          />
          <MenuAction
            label={t('general.profile')}
            icon="profile"
            onClick={() => onOpen('profile')}
          />
          <MenuAction label={t('general.store')} icon="store" onClick={() => onOpen('store')} />
        </div>
      </nav>
    </div>
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
  const theme = useThemeId();
  return (
    <div className="cpi-menu-modal" role="presentation" data-world={theme}>
      <section
        className="cpi-menu-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cpi-new-title"
        aria-describedby="cpi-new-copy"
      >
        <p className="cpi-menu-eyebrow">{t('menu.confirmTitle')}</p>
        <h2 id="cpi-new-title">{damaged ? t('menu.confirmDiscard') : t('menu.confirmReplace')}</h2>
        <p id="cpi-new-copy">{damaged ? t('menu.discardExplained') : t('menu.replaceExplained')}</p>
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
  profileClient = null,
  leaderboardClient = null,
  leaderboardCountries = [],
  pendingPersonalResult = false,
  rankedClient = null,
  rewardFlow = null,
  savedPendingClient = null,
  accountControlsClient = null,
  accountScope = null,
  accountConnected = false,
  nameReportClient = null,
}: MainMenuProps) {
  const service = rankedServiceState(online);
  const themeId = useThemeId();
  const { t, number } = useLanguage();
  return (
    <main
      className={
        'cpi-menu-shell cpi-menu-view--' +
        view +
        (settings.reducedMotion ? ' cpi-reduced-motion' : '')
      }
      data-world={themeId}
      data-testid="app-ready"
    >
      <StageAtmosphere subdued={view !== 'home'} />
      <div className="cpi-menu-inner">
        <MenuHeader
          view={view}
          online={online}
          onBack={onBack}
          accountConnected={accountConnected}
          rankedAvailable={rankedClient !== null}
          utilities={
            view === 'home' ? (
              <HubUtilityControls
                settings={settings}
                onSettingsChange={onSettingsChange}
                onOpen={onOpen}
              />
            ) : undefined
          }
        />
        {view === 'home' ? (
          <>
            <MenuHome
              saved={saved}
              best={best}
              onOpen={onOpen}
              onResume={onResume}
              onNew={onNew}
              tutorialProgress={tutorialProgress}
              rankedClient={rankedClient}
              settings={settings}
            />
          </>
        ) : view === 'practice' ? (
          <MenuPanel title={t('general.practice')} eyebrow={t('menu.practiceEyebrow')}>
            <p>{t(isPetWorld(themeId) ? 'vault.petPractice' : 'menu.practiceIntro')}</p>
            <MenuAction
              label={tutorialProgress === 'completed' ? t('menu.replay') : t('menu.learn')}
              description={t('menu.tutorialExercise')}
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
        ) : view === 'store' ? (
          <StoreVault />
        ) : view === 'play' ? (
          <MenuPanel title={t('general.play')} eyebrow={t('menu.playEyebrow')}>
            {rankedClient ? (
              <RankedScene
                client={rankedClient}
                online={online}
                onLeave={() => onOpen('home')}
                rewardFlow={rewardFlow}
                savedPendingClient={savedPendingClient}
              />
            ) : (
              <>
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
              </>
            )}
          </MenuPanel>
        ) : view === 'rankings' ? (
          <MenuPanel title={t('general.rankings')} eyebrow={t('menu.rankingsScope')}>
            {leaderboardClient && (
              <LeaderboardView
                client={leaderboardClient}
                online={online}
                countries={leaderboardCountries}
                pendingPersonalResult={pendingPersonalResult}
                reportClient={nameReportClient}
              />
            )}
            {!leaderboardClient && (
              <>
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
                  <button
                    className="cpi-menu-text-action"
                    type="button"
                    onClick={onRetryConnection}
                  >
                    {t('menu.recheck')}
                  </button>
                )}
              </>
            )}
            <MenuAction
              label={t('menu.practiceOffline')}
              icon="practice"
              onClick={() => onOpen('practice')}
            />
          </MenuPanel>
        ) : view === 'profile' ? (
          <MenuPanel title={t('general.profile')} eyebrow={t('menu.profileEyebrow')}>
            {!accountConnected && (
              <>
                <div className="cpi-menu-notice" role="status">
                  <strong>{t('menu.asGuest')}</strong>
                  <span>{t('menu.noAccount')}</span>
                </div>
                <AccountEntry online={online} />
              </>
            )}
            <ProfileEditor client={profileClient} online={online} />
            <MenuAction
              label={t('menu.practiceUnsigned')}
              icon="practice"
              onClick={() => onOpen('practice')}
            />
          </MenuPanel>
        ) : (
          <section className="cpi-settings-menu" aria-labelledby="cpi-settings-title">
            <header className="cpi-settings-title">
              <Glyph name="settings" />
              <h1 id="cpi-settings-title" data-menu-heading tabIndex={-1}>
                {t('general.settings')}
              </h1>
            </header>
            <AudioSettingsControls settings={settings} onChange={onSettingsChange} />
            <LanguageSettings />
            <button type="button" className="cpi-settings-link" onClick={() => onOpen('tutorial')}>
              <Glyph name="practice" />
              <span>
                {t(tutorialProgress === 'completed' ? 'menu.replay' : 'menu.openTutorial')}
              </span>
              <span aria-hidden="true">›</span>
            </button>
            <PrivacyAccountSupport
              accountAvailable={accountConnected && accountControlsClient !== null}
              accountActions={
                accountConnected && accountControlsClient ? (
                  <AccountControls client={accountControlsClient} accountScope={accountScope} />
                ) : undefined
              }
            />
          </section>
        )}
        {warning && (
          <p className="cpi-menu-warning" role="alert">
            {warning}
          </p>
        )}
        {view !== 'home' && view !== 'settings' && view !== 'tutorial' && view !== 'store' && (
          <footer className="cpi-menu-footer">
            <span>Crystal Path: Infinity</span>
            <span>
              <span className="cpi-status-dot" aria-hidden="true" /> {t('menu.footerOffline')}
            </span>
            {buildLabel && <span>{buildLabel}</span>}
          </footer>
        )}
      </div>
    </main>
  );
}
