import { rememberMysteries } from './mystery-journal-model';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usesStoreTestRules } from '@crystal-path-infinity/game-core';
import { useTestStore } from './store-context';
import { selectTestPractice } from './test-store';
import type { ThemeId } from './store-catalog';
import type { RunState } from '@crystal-path-infinity/game-core';
import { PRACTICE_RULESET_VERSION } from './practice-rules';
import { Capacitor } from '@capacitor/core';
import {
  clearPracticeCheckpoint,
  DEFAULT_PRACTICE_SETTINGS,
  readPracticeCheckpoint,
  readPracticePersonalBest,
  readPracticeSettings,
  writePracticeCheckpoint,
  writePracticeSettings,
} from './practice-save';
import type { PracticeLoad, PracticeSettings } from './practice-save';
import { InfinityPractice } from './infinity-scene';
import { useSoundtrack } from './soundtrack';
import { ConfirmNewPractice, MainMenu } from './main-menu';
import { canResumePractice, historyFlag, viewFromHash, viewHash } from './menu-navigation';
import { readTutorialProgress, writeTutorialProgress } from './tutorial-progress';
import type { TutorialProgress } from './tutorial-progress';
import type { MenuView } from './menu-navigation';
import { markDiagnosticReactReady } from './startup-diagnostics';
import { settleStartup } from './startup-bootstrap';
import { useLanguage } from './language-context';
import type { AccountSessionOwner } from './account/session-owner';
import type { ProfileClient } from './account/profile-client';
import type { LeaderboardClient } from './leaderboard/leaderboard-client';
import type { NameReportClient } from './leaderboard/name-report-client';
import type { RankedClient } from './ranked/ranked-client';
import type { AccountControlsClient } from './account/account-controls-model';
import type { RewardFlow } from './rewards/reward-flow';
import type { SavedPendingClient } from './ranked/saved-pending-client';

/** Supplied only by an approved account host; shipped builds inject nothing. */
export interface ApprovedAccountServices {
  session?: Pick<AccountSessionOwner, 'accountScope' | 'subscribeAccountScope'>;
  profileClient?: ProfileClient | null;
  leaderboardClient?: LeaderboardClient | null;
  nameReportClient?: NameReportClient | null;
  rankedClient?: RankedClient | null;
  rewardFlowFactory?: ((runId: string) => RewardFlow | null) | null;
  savedPendingClient?: SavedPendingClient | null;
  accountControlsClient?: AccountControlsClient | null;
  countries?: readonly { countryCode: string; continentCode: string }[];
  pendingPersonalResult?: boolean;
}

const build = __CPI_BUILD_INFO__;
const showBuildDetails = build.environment !== 'production';

function loadLocalPractice(): PracticeLoad {
  if (typeof window === 'undefined') return { status: 'empty' };
  try {
    const loaded = readPracticeCheckpoint(window.localStorage);
    if (loaded.status === 'ready') {
      try {
        rememberMysteries(window.localStorage, loaded.state);
      } catch {
        /* Journal writes never invalidate the saved run. */
      }
    }
    return loaded;
  } catch {
    return {
      status: 'corrupt',
      message:
        'Local storage is unavailable. Practice is still playable, but progress may not be saved.',
    };
  }
}

const ignoreTrialCheckpoint = () => {};

interface GameOwner {
  trialTheme?: ThemeId;
  initial: RunState | null;
  token: number;
}

export function App({ services }: { services?: ApprovedAccountServices }) {
  const { t } = useLanguage();
  const { store, snapshot: testSnapshot } = useTestStore();
  const accountScope = useSyncExternalStore(
    (listener) => services?.session?.subscribeAccountScope(listener) ?? (() => {}),
    () => services?.session?.accountScope() ?? null,
    () => null,
  );
  const [game, setGame] = useState<GameOwner | null>(null);
  const gameRef = useRef<GameOwner | null>(null);
  const gameSequence = useRef(0);
  const [saved, setSaved] = useState<PracticeLoad>({ status: 'empty' });
  const visibleSaved = selectTestPractice(testSnapshot, saved);
  const [best, setBest] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
  const [tutorialProgress, setTutorialProgress] = useState<TutorialProgress>(() => {
    if (typeof window === 'undefined') return 'unseen';
    try {
      return readTutorialProgress(window.localStorage);
    } catch {
      return 'unseen';
    }
  });
  const [bootPhase, setBootPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [bootError, setBootError] = useState('');
  const [bootAttempt, setBootAttempt] = useState(0);
  const [view, setView] = useState<MenuView>(() =>
    typeof window === 'undefined' ? 'home' : viewFromHash(window.location.hash),
  );
  const [confirmNew, setConfirmNew] = useState(false);
  const confirmingRef = useRef(false);
  const backExitInFlight = useRef(false);
  const [exitRequest, setExitRequest] = useState(0);
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );
  const rankedClient = accountScope ? (services?.rankedClient ?? null) : null;
  const rewardFactory = accountScope ? (services?.rewardFlowFactory ?? null) : null;
  const rankedRunId = useSyncExternalStore(
    (listener) => rankedClient?.subscribe(listener) ?? (() => {}),
    () => rankedClient?.snapshot().run?.runId ?? null,
    () => null,
  );
  useSoundtrack(
    !game && !(view === 'play' && rankedRunId) && bootPhase === 'ready' ? 'home' : null,
    settings.music,
  );
  const [rewardOwner, setRewardOwner] = useState<{
    scope: object;
    client: RankedClient;
    factory: (runId: string) => RewardFlow | null;
    runId: string;
    flow: RewardFlow;
  } | null>(null);
  const rewardFlow =
    view === 'play' &&
    rewardOwner?.scope === accountScope &&
    rewardOwner?.client === rankedClient &&
    rewardOwner?.factory === rewardFactory &&
    rewardOwner?.runId === rankedRunId
      ? rewardOwner.flow
      : null;
  useEffect(() => {
    if (view !== 'play' || !accountScope || !rankedClient || !rewardFactory || !rankedRunId) return;
    const flow = rewardFactory(rankedRunId);
    if (!flow) return;
    let active = true;
    // Construct subscriptions after commit; fence stale owners synchronously on render.
    void Promise.resolve().then(() => {
      if (active)
        setRewardOwner({
          scope: accountScope,
          client: rankedClient,
          factory: rewardFactory,
          runId: rankedRunId,
          flow,
        });
    });
    return () => {
      active = false;
      flow.dispose();
    };
  }, [accountScope, rankedClient, rewardFactory, rankedRunId, view]);

  useEffect(() => {
    let active = true;
    void settleStartup(() => {
      const testRun = store?.snapshot().checkpoint;
      const checkpoint: PracticeLoad = testRun
        ? { status: 'ready', state: testRun, revision: store?.snapshot().revision ?? 1 }
        : loadLocalPractice();
      let preferences = DEFAULT_PRACTICE_SETTINGS;
      try {
        preferences = readPracticeSettings(window.localStorage).settings;
      } catch {
        // Offline play does not require a writable settings store.
      }
      let personalBest: string | null = null;
      try {
        personalBest = readPracticePersonalBest(
          window.localStorage,
          checkpoint.status === 'ready'
            ? checkpoint.state.rulesetVersion
            : PRACTICE_RULESET_VERSION,
        );
      } catch {
        // Personal best is optional local metadata, not ranked authority.
      }
      return { checkpoint, preferences, personalBest };
    }).then((result) => {
      if (!active) return;
      if (result.status === 'failed') {
        setBootError(result.reason);
        setBootPhase('failed');
        return;
      }
      setSaved(result.value.checkpoint);
      setSettings(result.value.preferences);
      setBest(result.value.personalBest);
      setBootPhase('ready');
    });
    return () => {
      active = false;
    };
  }, [bootAttempt, store]);

  useEffect(() => {
    const onConnection = () => setOnline(navigator.onLine !== false);
    const onLocationChange = () => {
      if (gameRef.current) {
        if (window.location.hash !== '#practice-run') {
          window.history.pushState({ cpiNavigation: true }, '', '#practice-run');
          if (!backExitInFlight.current) {
            backExitInFlight.current = true;
            setExitRequest((request) => request + 1);
          }
        }
        return;
      }
      if (confirmingRef.current) {
        confirmingRef.current = false;
        setConfirmNew(false);
      }
      setView(viewFromHash(window.location.hash));
    };
    window.addEventListener('online', onConnection);
    window.addEventListener('offline', onConnection);
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    // A refreshed deep link cannot resurrect a gameplay runtime or confirm a delete.
    if (window.location.hash === '#practice-run' || window.location.hash === '#new-practice') {
      window.history.replaceState({ cpiNavigation: false }, '', '#practice');
    }
    return () => {
      window.removeEventListener('online', onConnection);
      window.removeEventListener('offline', onConnection);
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
    };
  }, []);

  useEffect(() => {
    if (bootPhase !== 'ready' || game) return;
    if (confirmNew) {
      document.querySelector<HTMLButtonElement>('.cpi-menu-dialog-cancel')?.focus();
    } else {
      document.querySelector<HTMLElement>('[data-menu-heading]')?.focus();
    }
  }, [bootPhase, game, view, confirmNew]);

  const navigate = (next: MenuView) => {
    if (gameRef.current || confirmingRef.current || view === next) return;
    window.history.pushState({ cpiNavigation: true }, '', viewHash(next));
    setView(next);
    setStorageWarning(null);
  };

  const cancelNew = useCallback(() => {
    if (historyFlag(window.history.state as unknown, 'cpiModal')) {
      window.history.back();
    } else {
      confirmingRef.current = false;
      setConfirmNew(false);
    }
  }, []);

  useEffect(() => {
    if (!confirmNew) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelNew();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [confirmNew, cancelNew]);

  const back = () => {
    if (confirmingRef.current) {
      cancelNew();
      return;
    }
    if (historyFlag(window.history.state as unknown, 'cpiNavigation')) {
      window.history.back();
    } else {
      window.history.replaceState({ cpiNavigation: false }, '', viewHash('home'));
      setView('home');
    }
  };

  const retryBootstrap = () => {
    setBootPhase('loading');
    setBootAttempt((value) => value + 1);
  };
  const openOfflinePractice = () => {
    setSaved({ status: 'empty' });
    setSettings(DEFAULT_PRACTICE_SETTINGS);
    setBest(null);
    setStorageWarning('Local startup was unavailable. Practice is playable, but saving may fail.');
    setBootPhase('ready');
  };
  const changeSettings = useCallback((next: PracticeSettings) => {
    setSettings(next);
    try {
      writePracticeSettings(window.localStorage, next);
      setStorageWarning(null);
    } catch {
      setStorageWarning('Settings could not be saved on this device.');
    }
  }, []);
  const onTutorialProgress = (progress: Exclude<TutorialProgress, 'unseen'>) => {
    // Replaying or skipping a completed tutorial must never erase completion.
    const next = tutorialProgress === 'completed' ? 'completed' : progress;
    setTutorialProgress(next);
    try {
      writeTutorialProgress(window.localStorage, next);
    } catch {
      setStorageWarning('Tutorial progress could not be saved on this device.');
    }
  };
  const onCheckpoint = useCallback(
    (state: RunState) => {
      try {
        if (usesStoreTestRules(state.rulesetVersion) && store) store.saveRun(state);
        else writePracticeCheckpoint(window.localStorage, state);
        rememberMysteries(window.localStorage, state);
        setStorageWarning(null);
      } catch {
        setStorageWarning(
          'Local storage could not save this checkpoint. You can keep playing, but progress might not survive an app restart.',
        );
      }
    },
    [store],
  );

  const startPractice = (initial: RunState | null) => {
    if (gameRef.current) return;
    const next = { initial, token: ++gameSequence.current };
    gameRef.current = next;
    setGame(next);
    setExitRequest(0);
    window.history.pushState({ cpiNavigation: true }, '', '#practice-run');
  };

  const resumePractice = () => {
    if (visibleSaved.status !== 'ready' || !canResumePractice(visibleSaved)) return;
    startPractice(visibleSaved.state);
  };

  const startNewPractice = () => {
    if (gameRef.current) return;
    if (confirmingRef.current) {
      confirmingRef.current = false;
      setConfirmNew(false);
      window.history.replaceState({ cpiNavigation: true }, '', viewHash(view));
    }
    try {
      store?.clearRun();
      clearPracticeCheckpoint(window.localStorage);
      setSaved({ status: 'empty' });
      setStorageWarning(null);
    } catch {
      setStorageWarning('Progress might not be saved because local storage is unavailable.');
    }
    startPractice(null);
  };

  const requestNewPractice = () => {
    if (gameRef.current || confirmingRef.current) return;
    if (
      visibleSaved.status === 'empty' ||
      (visibleSaved.status === 'ready' && !canResumePractice(visibleSaved))
    ) {
      startNewPractice();
      return;
    }
    confirmingRef.current = true;
    setConfirmNew(true);
    window.history.pushState({ cpiModal: true }, '', '#new-practice');
  };

  const closePractice = (destination: MenuView = 'home') => {
    gameRef.current = null;
    setGame(null);
    backExitInFlight.current = false;
    const testRun = store?.snapshot().checkpoint;
    const checkpoint: PracticeLoad = testRun
      ? { status: 'ready', state: testRun, revision: store?.snapshot().revision ?? 1 }
      : loadLocalPractice();
    setSaved(checkpoint);
    try {
      setBest(
        readPracticePersonalBest(
          window.localStorage,
          checkpoint.status === 'ready'
            ? checkpoint.state.rulesetVersion
            : PRACTICE_RULESET_VERSION,
        ),
      );
    } catch {
      setBest(null);
    }
    setView(destination);
    window.history.replaceState({ cpiNavigation: true }, '', viewHash(destination));
  };
  const cancelGameExit = () => {
    backExitInFlight.current = false;
  };
  const retryConnectivity = () => {
    const connected = navigator.onLine !== false;
    setOnline(connected);
    setStorageWarning(
      connected
        ? 'Connectivity detected, but ranked services are not connected in this build.'
        : 'This device is still offline. Practice remains available.',
    );
  };

  // Preserve the development-only post-commit and native bridge smoke markers.
  useEffect(() => {
    if (showBuildDetails) console.info('CPI_APP_READY ' + JSON.stringify(__CPI_BUILD_INFO__));
    if (build.environment === 'development' && import.meta.env.MODE === 'development') {
      markDiagnosticReactReady();
    }
  }, []);

  if (bootPhase !== 'ready')
    return (
      <main className="cpi-bootstrap" aria-labelledby="bootstrap-brand">
        <img
          className="cpi-bootstrap-mark"
          src={import.meta.env.BASE_URL + 'brand/prism-mark.svg'}
          alt=""
          aria-hidden="true"
        />
        <h1 id="bootstrap-brand">Crystal Path: Infinity</h1>
        {bootPhase === 'loading' ? (
          <p role="status">{t('app.opening')}</p>
        ) : (
          <div className="cpi-bootstrap-failure" role="alert">
            <p>
              {bootError} {t('app.startError')}
            </p>
            <div className="cpi-bootstrap-actions">
              <button type="button" onClick={retryBootstrap}>
                {t('app.retryStart')}
              </button>
              <button type="button" onClick={openOfflinePractice}>
                {t('app.playOffline')}
              </button>
            </div>
          </div>
        )}
      </main>
    );

  if (game)
    return (
      <>
        <InfinityPractice
          key={game.token}
          initialState={game.initial}
          onExit={() => closePractice()}
          onViewRankings={() => closePractice('rankings')}
          onExitCancelled={cancelGameExit}
          exitRequest={exitRequest}
          onCheckpoint={game.trialTheme ? ignoreTrialCheckpoint : onCheckpoint}
          trialTheme={game.trialTheme}
          settings={settings}
          onSettingsChange={changeSettings}
        />
        {storageWarning && (
          <div role="alert" className="cpi-storage-warning">
            {storageWarning}
          </div>
        )}
      </>
    );

  const platform = Capacitor.getPlatform();
  const platformLabel = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web';
  const buildLabel = showBuildDetails ? platformLabel + ' · ' + build.version : undefined;

  return (
    <>
      <div inert={confirmNew}>
        <MainMenu
          onTryTheme={(theme) => {
            if (gameRef.current) return;
            const next: GameOwner = {
              initial: null,
              token: ++gameSequence.current,
              trialTheme: theme,
            };
            gameRef.current = next;
            setGame(next);
            setExitRequest(0);
            window.history.pushState({ cpiNavigation: true }, '', '#practice-run');
          }}
          view={view}
          saved={visibleSaved}
          best={best}
          online={online}
          settings={settings}
          onOpen={navigate}
          onBack={back}
          onResume={resumePractice}
          onNew={requestNewPractice}
          onSettingsChange={changeSettings}
          onRetryConnection={retryConnectivity}
          tutorialProgress={tutorialProgress}
          onTutorialProgress={onTutorialProgress}
          buildLabel={buildLabel}
          warning={storageWarning}
          profileClient={accountScope ? services?.profileClient : null}
          leaderboardClient={services?.leaderboardClient}
          leaderboardCountries={services?.countries}
          pendingPersonalResult={services?.pendingPersonalResult}
          rankedClient={rankedClient}
          rewardFlow={rewardFlow}
          savedPendingClient={accountScope ? services?.savedPendingClient : null}
          accountControlsClient={accountScope ? services?.accountControlsClient : null}
          accountScope={accountScope}
          accountConnected={accountScope !== null}
          nameReportClient={accountScope ? services?.nameReportClient : null}
        />
      </div>
      {confirmNew && (
        <ConfirmNewPractice
          saved={visibleSaved}
          onCancel={cancelNew}
          onConfirm={startNewPractice}
        />
      )}
    </>
  );
}
