import {
  CAMPAIGN_ENABLED,
  CAMPAIGN_TEST_BUILD,
  CAMPAIGN_COMMERCE_ENABLED,
  CAMPAIGN_WEB_BUILD,
  PLAYER_PREVIEW_ENABLED,
  practiceStorage,
  QA_TOOLS_ENABLED,
} from './app-profile';
import { rememberMysteries } from './mystery-journal-model';
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usesStoreTestRules, parseTileExperiment } from '@crystal-path-infinity/game-core';
import { useTestStore, useThemeId } from './store-context';
import { selectTestPractice } from './test-store';
import type { ThemeId } from './store-catalog';
import type { GearId, RunEvent, RunState } from '@crystal-path-infinity/game-core';
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
import type { PracticeLoad, PracticeSettings, PracticeStorage } from './practice-save';
import { InfinityPractice } from './infinity-scene';
import { useHomeSoundtrack } from './soundtrack';
import { BrandLaunchActive } from './brand-launch-state';
import {
  campaignFailureReason,
  campaignGoalProgress,
  campaignMissionSnapshot,
  campaignProgressFromEvents,
  campaignRunMatches,
  infinityProgressFromEvents,
  touchesInfinitySupplies,
  advanceInfinityCycle,
  claimTestOffer,
  CAMPAIGN_RAIN_RULESET,
  CAMPAIGN_RUN_NAMESPACE,
  CAMPAIGN_TEST_PROGRESS_KEY,
  createCampaignInfinityRun,
  createCampaignRun,
  equipBridgeStyle,
  equipBridgeDesign,
  equipCampaignGear,
  EMPTY_CAMPAIGN_PROGRESS,
  grantCampaignClear,
  isMissionUnlocked,
  journeyRuleset,
  namespacePracticeStorage,
  readCampaignSave,
  selectedInfinitySeason,
  spendSeasonChange,
  startCampaignAttempt,
  writeCampaignSave,
} from './campaign-test';
import type {
  CampaignApproach,
  CampaignMissionId,
  CampaignMissionSnapshot,
  CampaignOffer,
  CampaignProgress,
} from './campaign-test';
import type { CampaignFailureReason } from './campaign-test';
import { CAMPAIGN_MISSIONS } from './campaign-content';
import type { BridgeSlot, BridgeStyle, StyleId } from './campaign-content';
import { ThemeScope } from './store-provider';
import { CampaignMissionResult } from './campaign-test-ui';
import { ConfirmNewPractice, MainMenu } from './main-menu';
import {
  canResumePractice,
  historyFlag,
  menuSection,
  menuParent,
  viewFromHash,
  viewHash,
} from './menu-navigation';
import { readTutorialProgress, writeTutorialProgress } from './tutorial-progress';
import type { TutorialProgress } from './tutorial-progress';
import type { MenuView } from './menu-navigation';
import { markDiagnosticReactReady } from './startup-diagnostics';
import { settleStartup } from './startup-bootstrap';
import { useLanguage } from './language-context';
import type { AccountSessionOwner } from './account/session-owner';
import type { OwnerProfile, ProfileClient } from './account/profile-client';
import type { LeaderboardClient } from './leaderboard/leaderboard-client';
import type { NameReportClient } from './leaderboard/name-report-client';
import type { RankedClient } from './ranked/ranked-client';
import { RankedScene } from './ranked/ranked-scene';
import type { AccountControlsClient } from './account/account-controls-model';
import type { RewardFlow } from './rewards/reward-flow';
import type { CampaignInterstitialAd, GuestRewardedAd } from './rewards/native-admob';
import { createCampaignInterstitialCadence } from './rewards/campaign-interstitial-policy';
import type { SavedPendingClient } from './ranked/saved-pending-client';
import { SavedRuns } from './ranked/saved-pending-view';
import type { AccountEntryBinding } from './account/account-entry';
import { useCommerce } from './commerce/commerce-context';
import { commerceKeyForOffer } from './commerce/adventure-products';
import {
  applyPaidEntitlements,
  offlineSupplyCapacity,
  receiveOfflineSupplies,
  seedAccountCampaign,
} from './commerce/campaign-inventory';

/** Supplied only by an approved account host; shipped builds inject nothing. */
export interface ApprovedAccountServices {
  accountEntry?: AccountEntryBinding;
  signOut?: () => Promise<boolean>;
  adPrivacyOptions?: () => Promise<void>;
  session?: Pick<AccountSessionOwner, 'accountScope' | 'subscribeAccountScope'>;
  profileClient?: ProfileClient | null;
  leaderboardClient?: LeaderboardClient | null;
  nameReportClient?: NameReportClient | null;
  rankedClient?: RankedClient | null;
  rewardFlowFactory?: ((runId: string) => RewardFlow | null) | null;
  campaignInterstitial?: CampaignInterstitialAd | null;
  savedPendingClient?: SavedPendingClient | null;
  accountControlsClient?: AccountControlsClient | null;
  countries?: readonly { countryCode: string; continentCode: string }[];
  pendingPersonalResult?: boolean;
}

const build = __CPI_BUILD_INFO__;
const showBuildDetails = build.environment !== 'production' && !PLAYER_PREVIEW_ENABLED;

function loadLocalPractice(storage: PracticeStorage): PracticeLoad {
  if (typeof window === 'undefined') return { status: 'empty' };
  try {
    if (CAMPAIGN_ENABLED) {
      const journey = readCampaignSave(storage);
      if (journey.infinitySaved) return campaignLoad(journey.infinityCheckpoint);
    }
    const loaded = readPracticeCheckpoint(storage);
    if (
      !QA_TOOLS_ENABLED &&
      loaded.status === 'ready' &&
      (loaded.state.storeTest || parseTileExperiment(loaded.state.rulesetVersion))
    )
      return { status: 'empty' };
    if (loaded.status === 'ready') {
      try {
        rememberMysteries(storage, loaded.state);
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
  mode: 'infinity' | 'campaign';
  weather?: 'clear' | 'rain';
  campaignMissionId?: CampaignMissionId;
  trialTheme?: ThemeId;
  initial: RunState | null;
  token: number;
}

function campaignRunStorage(storage: PracticeStorage) {
  return namespacePracticeStorage(storage, CAMPAIGN_RUN_NAMESPACE);
}

function campaignLoad(state: RunState | null): PracticeLoad {
  return state ? { status: 'ready', state, revision: 1 } : { status: 'empty' };
}
function loadCampaign(storage: PracticeStorage, seedStorage?: PracticeStorage) {
  try {
    let saved = readCampaignSave(storage);
    if (seedStorage && !storage.getItem(CAMPAIGN_TEST_PROGRESS_KEY)) {
      const guest = readCampaignSave(seedStorage);
      saved = {
        ...guest,
        progress: seedAccountCampaign(guest.progress),
        infinityCheckpoint: null,
        infinitySaved: false,
      };
    }
    if (saved.legacy && saved.progress.activeMissionSnapshot) {
      const old = readPracticeCheckpoint(campaignRunStorage(storage));
      if (
        old.status === 'ready' &&
        campaignRunMatches(old.state, saved.progress.activeMissionSnapshot)
      )
        return { ...saved, checkpoint: old.state };
    }
    return saved;
  } catch {
    return {
      progress: EMPTY_CAMPAIGN_PROGRESS,
      checkpoint: null,
      infinityCheckpoint: null,
      infinitySaved: false,
    };
  }
}

export function App({
  services,
  guestRewardedAd = null,
  storage: suppliedStorage,
  storageSeed,
  commerceAccountToken,
}: {
  services?: ApprovedAccountServices;
  guestRewardedAd?: GuestRewardedAd | null;
  storage?: PracticeStorage;
  storageSeed?: PracticeStorage;
  commerceAccountToken?: string;
}) {
  const [storage] = useState(() => suppliedStorage ?? practiceStorage());
  const [deviceStorage] = useState(practiceStorage);
  const { flow: commerceFlow, snapshot: commerceSnapshot } = useCommerce();
  const { t } = useLanguage();
  const launchActive = useContext(BrandLaunchActive);
  const menuTheme = useThemeId();
  const { store, snapshot: testSnapshot } = useTestStore();
  const accountScope = useSyncExternalStore(
    (listener) => services?.session?.subscribeAccountScope(listener) ?? (() => {}),
    () => services?.session?.accountScope() ?? null,
    () => null,
  );
  const profileClient = accountScope ? (services?.profileClient ?? null) : null;
  const [menuProfile, setMenuProfile] = useState<{ scope: object; value: OwnerProfile } | null>(
    null,
  );
  const [setupScope, setSetupScope] = useState<object | null>(null);
  const profile = menuProfile?.scope === accountScope ? menuProfile?.value : null;
  const [game, setGame] = useState<GameOwner | null>(null);
  const gameRef = useRef<GameOwner | null>(null);
  const gameSequence = useRef(0);
  const [saved, setSaved] = useState<PracticeLoad>({ status: 'empty' });
  const [loadedCampaign] = useState(() => loadCampaign(storage, storageSeed));
  const [campaignProgress, setCampaignProgress] = useState(loadedCampaign.progress);
  const campaignProgressRef = useRef(campaignProgress);
  const campaignCheckpointRef = useRef<RunState | null>(loadedCampaign.checkpoint);
  const infinityCheckpointRef = useRef<RunState | null | undefined>(
    loadedCampaign.infinitySaved ? loadedCampaign.infinityCheckpoint : undefined,
  );
  const [campaignSaved, setCampaignSaved] = useState<PracticeLoad>(() =>
    campaignLoad(loadedCampaign.checkpoint),
  );
  const [campaignOutcome, setCampaignOutcome] = useState<{
    mission: CampaignMissionSnapshot;
    cleared: boolean;
    goalReached: boolean;
    firstClear: boolean;
    failureReason: CampaignFailureReason;
    stability: number;
    mastery: boolean;
  } | null>(null);
  const campaignOutcomeRef = useRef(false);
  const campaignInterstitialCadence = useRef(createCampaignInterstitialCadence());
  const campaignContinueInFlight = useRef(false);
  const campaignMission =
    game?.mode === 'campaign' && game.campaignMissionId
      ? campaignMissionSnapshot(campaignProgress, game.campaignMissionId)
      : undefined;
  const campaignMissionPresentation = campaignMission && {
    name:
      CAMPAIGN_MISSIONS.find((entry) => entry.id === campaignMission.id)?.name ??
      campaignMission.name,
    targetRow: campaignMission.targetRow,
    minimumStability: campaignMission.minimumStability,
    objectiveProgress: campaignGoalProgress(campaignMission, campaignProgress),
  };
  const visibleSaved = selectTestPractice(testSnapshot, saved);
  const [best, setBest] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
  const [tutorialProgress, setTutorialProgress] = useState<TutorialProgress>(() => {
    if (typeof window === 'undefined') return 'unseen';
    try {
      return readTutorialProgress(deviceStorage);
    } catch {
      return 'unseen';
    }
  });
  const [bootPhase, setBootPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [bootError, setBootError] = useState('');
  const [bootAttempt, setBootAttempt] = useState(0);
  const [view, setView] = useState<MenuView>(() =>
    typeof window === 'undefined'
      ? 'home'
      : CAMPAIGN_ENABLED && ['#practice-run', '#new-practice'].includes(window.location.hash)
        ? 'campaign'
        : viewFromHash(window.location.hash, QA_TOOLS_ENABLED),
  );
  const [savedRun, setSavedRun] = useState<{ scope: object; runId: string } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [storeEntry, setStoreEntry] = useState<'worlds' | 'essentials'>('worlds');
  const confirmingRef = useRef(false);
  const backExitInFlight = useRef(false);
  const [exitRequest, setExitRequest] = useState(0);
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );
  const rankedClient =
    accountScope && profile?.profile !== null ? (services?.rankedClient ?? null) : null;
  const setupProfile = view === 'profile' && accountScope !== null && setupScope === accountScope;
  useEffect(() => {
    if (!profileClient || !accountScope || !online) return;
    const request = new AbortController();
    void profileClient
      .load(request.signal)
      .then((result) => {
        if (request.signal.aborted || !result.ok) return;
        setMenuProfile((current) =>
          current?.scope === accountScope ? current : { scope: accountScope, value: result.value },
        );
      })
      .catch(() => {
        // The account remains usable if the optional display name could not be read.
      });
    return () => request.abort();
  }, [profileClient, accountScope, online]);
  const rewardFactory = accountScope ? (services?.rewardFlowFactory ?? null) : null;
  const rankedRunId = useSyncExternalStore(
    (listener) => rankedClient?.subscribe(listener) ?? (() => {}),
    () => rankedClient?.snapshot().run?.runId ?? null,
    () => null,
  );
  const { activate: activateMusic, awaitingGesture: musicAwaitingGesture } = useHomeSoundtrack(
    !game && !(view === 'play' && rankedClient) && bootPhase === 'ready',
    !launchActive,
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
        : loadLocalPractice(storage);
      let preferences = DEFAULT_PRACTICE_SETTINGS;
      try {
        preferences = readPracticeSettings(deviceStorage).settings;
      } catch {
        // Offline play does not require a writable settings store.
      }
      let personalBest: string | null = null;
      try {
        personalBest = readPracticePersonalBest(
          deviceStorage,
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
  }, [bootAttempt, store, storage, deviceStorage]);

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
      setSavedRun(null);
      setSetupScope(null);
      setView(viewFromHash(window.location.hash, QA_TOOLS_ENABLED));
    };
    window.addEventListener('online', onConnection);
    window.addEventListener('offline', onConnection);
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    // A refreshed deep link cannot resurrect a gameplay runtime or confirm a delete.
    if (window.location.hash === '#practice-run' || window.location.hash === '#new-practice') {
      window.history.replaceState(
        { cpiNavigation: false },
        '',
        CAMPAIGN_ENABLED ? '#campaign' : '#practice',
      );
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
  }, [bootPhase, game, view, confirmNew, setupProfile]);

  const navigate = (next: MenuView) => {
    if (gameRef.current || confirmingRef.current || view === next) return;
    if (next === 'store') setStoreEntry('worlds');
    setSavedRun(null);
    if (menuSection(view) === menuSection(next))
      window.history.replaceState(window.history.state, '', viewHash(next));
    else window.history.pushState({ cpiNavigation: true, cpiParent: view }, '', viewHash(next));
    setView(next);
    setStorageWarning(null);
  };

  const finishProfileSetup = () => {
    setSetupScope(null);
    window.history.replaceState({ cpiNavigation: false }, '', viewHash('home'));
    setView('home');
  };

  const onAccountSignedIn = (offerProfile: boolean) => {
    const scope = services?.session?.accountScope();
    if (!scope || window.location.hash !== viewHash('profile')) return;
    if (offerProfile && services?.profileClient) setSetupScope(scope);
    else finishProfileSetup();
  };

  const onProfileSaved = (value: OwnerProfile) => {
    if (!accountScope || services?.session?.accountScope() !== accountScope) return;
    setMenuProfile({ scope: accountScope, value });
    if (setupProfile) finishProfileSetup();
  };

  const openSavedRun = (runId: string) => {
    const active = rankedClient?.snapshot().run;
    if (
      !rankedClient ||
      !accountScope ||
      services?.session?.accountScope() !== accountScope ||
      !online ||
      (active && active.status !== 'finished')
    )
      return;
    navigate('play');
    setSavedRun({ scope: accountScope, runId });
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
    if (setupProfile) {
      finishProfileSetup();
      return;
    }
    if (confirmingRef.current) {
      cancelNew();
      return;
    }
    const section = menuSection(view);
    if (
      (section === 'journal' || section === 'store') &&
      !menuParent(window.history.state as unknown)
    ) {
      window.history.replaceState({ cpiNavigation: false }, '', viewHash('home'));
      setView('home');
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
  const changeSettings = useCallback(
    (next: PracticeSettings) => {
      if (next.music && !settings.music) activateMusic();
      setSettings(next);
      try {
        writePracticeSettings(deviceStorage, next);
        setStorageWarning(null);
      } catch {
        setStorageWarning('Settings could not be saved on this device.');
      }
    },
    [activateMusic, settings.music, deviceStorage],
  );
  const onTutorialProgress = (progress: Exclude<TutorialProgress, 'unseen'>) => {
    // Replaying or skipping a completed tutorial must never erase completion.
    const next = tutorialProgress === 'completed' ? 'completed' : progress;
    setTutorialProgress(next);
    try {
      writeTutorialProgress(deviceStorage, next);
    } catch {
      setStorageWarning('Tutorial progress could not be saved on this device.');
    }
  };
  const commitCampaignProgress = useCallback(
    (
      progress: CampaignProgress,
      checkpoint: RunState | null = campaignCheckpointRef.current,
      requireWrite = false,
      infinityCheckpoint = infinityCheckpointRef.current,
    ) => {
      try {
        writeCampaignSave(storage, progress, checkpoint, infinityCheckpoint);
        setStorageWarning(null);
      } catch (error) {
        setStorageWarning('Campaign progress could not be saved on this device.');
        if (requireWrite) throw error;
      }
      campaignCheckpointRef.current = checkpoint;
      infinityCheckpointRef.current = infinityCheckpoint;
      if (campaignProgressRef.current !== progress) {
        campaignProgressRef.current = progress;
        setCampaignProgress(progress);
      }
    },
    [storage],
  );

  const transferSupplies = useCallback(async () => {
    if (!commerceFlow || !commerceAccountToken) return;
    const assertOwner = (token: string) => {
      if (token !== commerceAccountToken)
        throw new Error('Please reopen the store for this account.');
    };
    await commerceFlow.transferOfflineSupplies({
      capacity: (wallet) => offlineSupplyCapacity(campaignProgressRef.current, wallet),
      receive: (allocation, token) => {
        assertOwner(token);
        const next = receiveOfflineSupplies(campaignProgressRef.current, allocation);
        if (next !== campaignProgressRef.current)
          commitCampaignProgress(next, campaignCheckpointRef.current, true);
      },
      acknowledged: (operationId, token) => {
        assertOwner(token);
        const current = campaignProgressRef.current;
        if (current.supplyAllocations?.includes(operationId))
          commitCampaignProgress(
            {
              ...current,
              supplyAllocations: current.supplyAllocations.filter((id) => id !== operationId),
            },
            campaignCheckpointRef.current,
            true,
          );
      },
    });
  }, [commerceFlow, commerceAccountToken, commitCampaignProgress]);
  const lastSupplySync = useRef<string | null>(null);
  useEffect(() => {
    if (
      !CAMPAIGN_COMMERCE_ENABLED ||
      !commerceAccountToken ||
      !commerceSnapshot.wallet ||
      (commerceSnapshot.wallet.inventoryToken ?? commerceSnapshot.wallet.accountToken) !==
        commerceAccountToken
    )
      return;
    try {
      commitCampaignProgress(
        applyPaidEntitlements(campaignProgressRef.current, commerceSnapshot.wallet),
        campaignCheckpointRef.current,
        true,
      );
    } catch {
      /* Keep the last durable inventory; the store can retry. */
    }
  }, [commerceAccountToken, commerceSnapshot.wallet, commitCampaignProgress]);
  useEffect(() => {
    if (commerceSnapshot.phase === 'error') lastSupplySync.current = null;
    if (
      !CAMPAIGN_COMMERCE_ENABLED ||
      game ||
      !['store', 'supplies', 'bridge-style'].includes(view) ||
      !commerceAccountToken ||
      commerceSnapshot.supplySyncIncomplete ||
      commerceSnapshot.phase !== 'ready' ||
      !commerceSnapshot.wallet
    )
      return;
    const key = [
      commerceAccountToken,
      commerceSnapshot.wallet.revision,
      campaignProgress.reserveSp,
      campaignProgress.reserveHints,
      campaignProgress.continues,
      campaignProgress.shields,
      campaignProgress.seasonChanges,
    ].join(':');
    if (lastSupplySync.current === key) return;
    lastSupplySync.current = key;
    void transferSupplies();
  }, [
    commerceAccountToken,
    commerceSnapshot.phase,
    commerceSnapshot.supplySyncIncomplete,
    commerceSnapshot.wallet,
    game,
    view,
    transferSupplies,
    campaignProgress,
  ]);

  const commitInfinitySupply = useCallback(
    (state: RunState, events: readonly RunEvent[], previous: RunState) => {
      if (!touchesInfinitySupplies(events)) return;
      if (gameRef.current?.mode !== 'infinity' || previous.runId !== state.runId)
        throw new Error('The Infinity crossing has changed.');
      const progress = infinityProgressFromEvents(campaignProgressRef.current, previous, events);
      // Inventory and the resulting crossing share one atomic local-storage write.
      commitCampaignProgress(progress, campaignCheckpointRef.current, true, state);
    },
    [commitCampaignProgress],
  );

  const onCheckpoint = useCallback(
    (state: RunState, events: readonly RunEvent[] = []) => {
      const owner = gameRef.current;
      if (owner?.mode === 'campaign') {
        if (campaignOutcomeRef.current) return;
        const previous = campaignProgressRef.current;
        const mission = previous.activeMissionSnapshot;
        if (!mission || !campaignRunMatches(state, mission)) return;
        if (
          state === campaignCheckpointRef.current &&
          events.some((event) => event.type === 'journey-resource-used')
        )
          return;
        let progress = campaignProgressFromEvents(previous, mission, events, state.currentRow);
        const landing = BigInt(state.lastClearedRow) >= BigInt(mission.targetRow);
        if (landing || state.status === 'dead') {
          const failureReason = landing ? campaignFailureReason(mission, progress, state.sp) : null;
          const cleared = landing && !failureReason;
          const firstClear = cleared && !progress.cleared.includes(mission.id);
          const alreadyMastered = progress.mastered.includes(mission.id);
          if (cleared) progress = grantCampaignClear(progress, mission, state);
          commitCampaignProgress(progress, cleared ? null : state);
          campaignOutcomeRef.current = true;
          setCampaignOutcome({
            mission,
            cleared,
            firstClear,
            failureReason,
            goalReached: landing,
            stability: state.sp,
            mastery: cleared && !alreadyMastered && progress.mastered.includes(mission.id),
          });
        } else if (state !== campaignCheckpointRef.current || progress !== previous) {
          commitCampaignProgress(progress, state);
        }
        return;
      }
      if (CAMPAIGN_ENABLED && state.runId.startsWith('practice-campaign-infinity-')) {
        if (state !== infinityCheckpointRef.current)
          commitCampaignProgress(
            campaignProgressRef.current,
            campaignCheckpointRef.current,
            false,
            state,
          );
        try {
          rememberMysteries(deviceStorage, state);
        } catch {
          setStorageWarning('Discovery history could not be saved on this device.');
        }
        return;
      }
      try {
        if (usesStoreTestRules(state.rulesetVersion) && store) store.saveRun(state);
        else writePracticeCheckpoint(storage, state);
        rememberMysteries(deviceStorage, state);
        setStorageWarning(null);
      } catch {
        setStorageWarning(
          'Local storage could not save this checkpoint. You can keep playing, but progress might not survive an app restart.',
        );
      }
    },
    [store, commitCampaignProgress, storage, deviceStorage],
  );

  const startPractice = (
    initial: RunState | null,
    mode: GameOwner['mode'] = 'infinity',
    campaignMissionId?: CampaignMissionId,
    weather: 'clear' | 'rain' = 'clear',
  ) => {
    if (gameRef.current) return;
    campaignOutcomeRef.current = false;
    setCampaignOutcome(null);
    const next: GameOwner = {
      initial,
      mode,
      weather,
      campaignMissionId,
      token: ++gameSequence.current,
    };
    gameRef.current = next;
    setGame(next);
    setExitRequest(0);
    if (window.location.hash !== '#practice-run')
      window.history.pushState({ cpiNavigation: true }, '', '#practice-run');
  };

  const resumePractice = () => {
    if (visibleSaved.status !== 'ready' || !canResumePractice(visibleSaved)) return;
    startPractice(
      visibleSaved.state,
      'infinity',
      undefined,
      visibleSaved.state.rulesetVersion === CAMPAIGN_RAIN_RULESET ? 'rain' : 'clear',
    );
  };

  const newInfinityRun = () => {
    const progress = campaignProgressRef.current;
    const state = createCampaignInfinityRun(progress);
    const next = advanceInfinityCycle(progress);
    commitCampaignProgress(next, campaignCheckpointRef.current, false, state);
    return state;
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
      clearPracticeCheckpoint(storage);
      setSaved({ status: 'empty' });
      setStorageWarning(null);
    } catch {
      setStorageWarning('Progress might not be saved because local storage is unavailable.');
    }
    startPractice(CAMPAIGN_ENABLED ? newInfinityRun() : null);
  };

  const newCampaignRun = (missionId: CampaignMissionId, approach?: CampaignApproach) => {
    const progress = startCampaignAttempt(campaignProgressRef.current, missionId, approach);
    const snapshot = progress.activeMissionSnapshot!;
    const initial = createCampaignRun(snapshot);
    commitCampaignProgress(progress, initial);
    setCampaignSaved(campaignLoad(initial));
    return { initial, snapshot };
  };

  const startCampaignMission = (
    missionId: CampaignMissionId,
    approach?: CampaignApproach,
    retry = false,
  ) => {
    if (!CAMPAIGN_ENABLED || gameRef.current) return;
    const current = campaignProgressRef.current;
    if (!isMissionUnlocked(current, missionId)) return;
    const mission = campaignMissionSnapshot(current, missionId);
    const previous = campaignCheckpointRef.current;
    if (
      !retry &&
      current.activeMissionId === missionId &&
      previous &&
      campaignRunMatches(previous, mission) &&
      (!approach || approach === mission.approach) &&
      BigInt(previous.lastClearedRow) < BigInt(mission.targetRow) &&
      previous.status === 'playing'
    ) {
      startPractice(previous, 'campaign', missionId, mission.weather);
      return;
    }
    const { initial, snapshot } = newCampaignRun(missionId, approach);
    startPractice(initial, 'campaign', missionId, snapshot.weather);
  };

  const changeBridgeStyle = (slot: BridgeSlot, id: StyleId | null) =>
    commitCampaignProgress(equipBridgeStyle(campaignProgressRef.current, slot, id));
  const changeBridgeDesign = (style: BridgeStyle) =>
    commitCampaignProgress(equipBridgeDesign(campaignProgressRef.current, style));
  const changeCampaignWorld = (world: ThemeId) => {
    const owned = commerceSnapshot.wallet?.owned ??
      campaignProgressRef.current.ownedWorlds ?? ['obsidian'];
    if ((CAMPAIGN_COMMERCE_ENABLED || CAMPAIGN_WEB_BUILD) && !owned.includes(world)) {
      if (CAMPAIGN_WEB_BUILD) return;
      if (!commerceSnapshot.wallet) {
        navigate('profile');
        return;
      }
      if (commerceFlow) void commerceFlow.buy('theme.' + world);
      return;
    }
    commitCampaignProgress({ ...campaignProgressRef.current, world });
    if (CAMPAIGN_COMMERCE_ENABLED && commerceFlow) void commerceFlow.equip(world);
  };
  const changeCampaignGear = (gear: GearId | null) =>
    commitCampaignProgress(equipCampaignGear(campaignProgressRef.current, gear));
  const changeNextSeason = () => {
    const current = campaignProgressRef.current;
    const next = spendSeasonChange(current);
    if (next !== current) commitCampaignProgress(next);
  };
  const changeClockPreference = () => {
    const current = campaignProgressRef.current;
    if (current.offers.includes('clock-free'))
      commitCampaignProgress({ ...current, clockFree: !current.clockFree });
  };
  const claimCampaignOffer = (offer: CampaignOffer) => {
    if (CAMPAIGN_WEB_BUILD) return;
    if (!CAMPAIGN_TEST_BUILD) {
      if (!commerceSnapshot.wallet) {
        navigate('profile');
        return;
      }
      const key = commerceKeyForOffer(offer);
      if (CAMPAIGN_COMMERCE_ENABLED && key && commerceFlow) void commerceFlow.buy(key);
      return;
    }
    const current = campaignProgressRef.current;
    const next = claimTestOffer(current, offer);
    if (next === current) return;
    try {
      commitCampaignProgress(next, campaignCheckpointRef.current, true);
    } catch {
      // Keep the displayed supplies unchanged when a claim cannot be saved.
    }
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
    const leavingCampaign = gameRef.current?.mode === 'campaign';
    gameRef.current = null;
    setGame(null);
    backExitInFlight.current = false;
    const testRun = store?.snapshot().checkpoint;
    const checkpoint: PracticeLoad = testRun
      ? { status: 'ready', state: testRun, revision: store?.snapshot().revision ?? 1 }
      : loadLocalPractice(storage);
    setSaved(checkpoint);
    if (leavingCampaign) setCampaignSaved(campaignLoad(campaignCheckpointRef.current));
    try {
      setBest(
        readPracticePersonalBest(
          deviceStorage,
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
  const continueCampaignResult = () => {
    if (campaignContinueInFlight.current) return;
    campaignContinueInFlight.current = true;
    void (async () => {
      try {
        const outcome = campaignOutcome;
        const showInterstitial =
          outcome?.cleared === true &&
          outcome.firstClear &&
          outcome.mission.id !== 'bring-the-dawn-home' &&
          campaignInterstitialCadence.current.recordFirstClear();
        const ad = services?.campaignInterstitial;
        if (showInterstitial && ad?.available) await ad.show(new AbortController().signal);
      } catch {
        // An unavailable ad never holds back earned Campaign progress.
      } finally {
        campaignContinueInFlight.current = false;
        closePractice('campaign');
      }
    })();
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
    if (game.mode === 'campaign' && campaignOutcome)
      return (
        <CampaignMissionResult
          mission={campaignOutcome.mission}
          cleared={campaignOutcome.cleared}
          goalReached={campaignOutcome.goalReached}
          firstClear={campaignOutcome.firstClear}
          failureReason={campaignOutcome.failureReason}
          stability={campaignOutcome.stability}
          mastery={campaignOutcome.mastery}
          warning={storageWarning}
          world={campaignProgress.world}
          reducedMotion={settings.reducedMotion}
          onEquip={
            campaignOutcome.firstClear && campaignOutcome.mission.grant.style
              ? changeBridgeStyle
              : undefined
          }
          onContinue={continueCampaignResult}
          onRetry={() => {
            const missionId = campaignOutcome.mission.id;
            gameRef.current = null;
            setGame(null);
            setCampaignOutcome(null);
            campaignOutcomeRef.current = false;
            startCampaignMission(missionId, campaignOutcome.mission.approach, true);
          }}
        />
      );

  if (game)
    return (
      <>
        <InfinityPractice
          key={game.token}
          initialState={game.initial}
          onExit={() => closePractice(game.mode === 'campaign' ? 'campaign' : 'home')}
          onStore={() => {
            setStoreEntry('essentials');
            closePractice('store');
          }}
          onViewRankings={() => closePractice('rankings')}
          onExitCancelled={cancelGameExit}
          exitRequest={exitRequest}
          onCheckpoint={game.trialTheme ? ignoreTrialCheckpoint : onCheckpoint}
          trialTheme={game.trialTheme}
          guestRewardedAd={guestRewardedAd}
          newJourney={
            game.mode === 'infinity' && CAMPAIGN_ENABLED && !game.trialTheme
              ? newInfinityRun
              : game.mode === 'campaign' && campaignMission
                ? () => newCampaignRun(campaignMission.id, campaignMission.approach).initial
                : undefined
          }
          weather={
            game.mode === 'campaign' && game.campaignMissionId
              ? campaignMissionSnapshot(campaignProgress, game.campaignMissionId).weather
              : (game.weather ?? 'clear')
          }
          campaignMission={campaignMissionPresentation}
          bridgeStyle={CAMPAIGN_ENABLED ? campaignProgress.style : undefined}
          worldTheme={CAMPAIGN_ENABLED ? campaignProgress.world : undefined}
          infinitySupplies={
            game.mode === 'infinity' && CAMPAIGN_ENABLED && !game.trialTheme
              ? {
                  sp: campaignProgress.reserveSp,
                  hint: campaignProgress.reserveHints,
                  shield: campaignProgress.shields,
                  continue: campaignProgress.continues,
                }
              : undefined
          }
          onInfinitySupplyCommit={
            game.mode === 'infinity' && CAMPAIGN_ENABLED ? commitInfinitySupply : undefined
          }
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

  if (!confirmNew && view === 'play' && rankedClient)
    return (
      <RankedScene
        client={rankedClient}
        online={online}
        music={settings.music}
        reducedMotion={settings.reducedMotion}
        autoStart
        accountScope={accountScope}
        onLeave={() => navigate('home')}
        onPractice={canResumePractice(visibleSaved) ? resumePractice : requestNewPractice}
        onViewRankings={() => navigate('rankings')}
        rewardFlow={rewardFlow}
        recoverRunId={savedRun?.scope === accountScope ? savedRun.runId : undefined}
      />
    );

  const platform = Capacitor.getPlatform();
  const platformLabel = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web';
  const buildLabel = showBuildDetails ? platformLabel + ' · ' + build.version : undefined;
  const activeRun = rankedClient?.snapshot().run;

  return (
    <>
      <div inert={confirmNew}>
        <ThemeScope theme={CAMPAIGN_ENABLED ? campaignProgress.world : menuTheme}>
          <MainMenu
            accountEntry={services?.accountEntry}
            onSignOut={services?.signOut}
            onAdPrivacyOptions={services?.adPrivacyOptions ?? guestRewardedAd?.showPrivacyOptions}
            onTryTheme={(theme) => {
              if (gameRef.current) return;
              const next: GameOwner = {
                initial: null,
                token: ++gameSequence.current,
                mode: 'infinity',
                trialTheme: theme,
              };
              gameRef.current = next;
              setGame(next);
              setExitRequest(0);
              window.history.pushState({ cpiNavigation: true }, '', '#practice-run');
            }}
            view={view}
            storeEntry={storeEntry}
            saved={visibleSaved}
            best={
              CAMPAIGN_ENABLED
                ? readPracticePersonalBest(
                    storage,
                    visibleSaved.status === 'ready' && canResumePractice(visibleSaved)
                      ? visibleSaved.state.rulesetVersion
                      : journeyRuleset(
                          selectedInfinitySeason(campaignProgress),
                          !!campaignProgress.gear,
                          campaignProgress.clockFree,
                        ),
                  )
                : best
            }
            online={online}
            settings={settings}
            musicAwaitingGesture={musicAwaitingGesture}
            onActivateMusic={activateMusic}
            onOpen={navigate}
            onBack={back}
            onResume={resumePractice}
            onNew={requestNewPractice}
            campaignProgress={campaignProgress}
            campaignSaved={campaignSaved}
            onStartCampaignMission={startCampaignMission}
            onEquipBridgeDesign={changeBridgeDesign}
            onChangeCampaignWorld={changeCampaignWorld}
            onUseSeasonChange={changeNextSeason}
            onToggleClock={changeClockPreference}
            onClaimCampaignOffer={claimCampaignOffer}
            onEquipCampaignGear={changeCampaignGear}
            onSettingsChange={changeSettings}
            onRetryConnection={retryConnectivity}
            tutorialProgress={tutorialProgress}
            onTutorialProgress={onTutorialProgress}
            buildLabel={buildLabel}
            warning={storageWarning}
            profileClient={profileClient}
            accountName={profile?.profile?.username ?? profile?.providerDisplayName}
            setupProfile={setupProfile}
            onAccountSignedIn={onAccountSignedIn}
            onProfileSaved={onProfileSaved}
            onSkipProfile={finishProfileSetup}
            leaderboardClient={services?.leaderboardClient}
            leaderboardCountries={services?.countries}
            pendingPersonalResult={services?.pendingPersonalResult || activeRun?.rewardPending}
            rankedClient={rankedClient}
            savedRuns={
              rankedClient &&
              services?.savedPendingClient && (
                <SavedRuns
                  client={services.savedPendingClient}
                  online={online}
                  canRecover={!activeRun || activeRun.status === 'finished'}
                  onRecover={openSavedRun}
                />
              )
            }
            accountControlsClient={accountScope ? services?.accountControlsClient : null}
            accountScope={accountScope}
            accountConnected={accountScope !== null}
            nameReportClient={accountScope ? services?.nameReportClient : null}
          />
        </ThemeScope>
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
