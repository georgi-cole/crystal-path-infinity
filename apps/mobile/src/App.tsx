import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunState } from '@crystal-path-infinity/game-core';
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
import { ConfirmNewPractice, MainMenu } from './main-menu';
import { historyFlag, viewFromHash, viewHash } from './menu-navigation';
import type { MenuView } from './menu-navigation';
import { markDiagnosticReactReady } from './startup-diagnostics';
import { settleStartup } from './startup-bootstrap';

const build = __CPI_BUILD_INFO__;
const showBuildDetails = build.environment !== 'production';

function loadLocalPractice(): PracticeLoad {
  if (typeof window === 'undefined') return { status: 'empty' };
  try {
    return readPracticeCheckpoint(window.localStorage);
  } catch {
    return {
      status: 'corrupt',
      message:
        'Local storage is unavailable. Practice is still playable, but progress may not be saved.',
    };
  }
}

interface GameOwner {
  initial: RunState | null;
  token: number;
}

export function App() {
  const [game, setGame] = useState<GameOwner | null>(null);
  const gameRef = useRef<GameOwner | null>(null);
  const gameSequence = useRef(0);
  const [saved, setSaved] = useState<PracticeLoad>({ status: 'empty' });
  const [best, setBest] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
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

  useEffect(() => {
    let active = true;
    void settleStartup(() => {
      const checkpoint = loadLocalPractice();
      let preferences = DEFAULT_PRACTICE_SETTINGS;
      try {
        preferences = readPracticeSettings(window.localStorage).settings;
      } catch {
        // Offline play does not require a writable settings store.
      }
      let personalBest: string | null = null;
      try {
        personalBest = readPracticePersonalBest(window.localStorage);
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
  }, [bootAttempt]);

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
  const onCheckpoint = useCallback((state: RunState) => {
    try {
      writePracticeCheckpoint(window.localStorage, state);
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        'Local storage could not save this checkpoint. You can keep playing, but progress might not survive an app restart.',
      );
    }
  }, []);

  const startPractice = (initial: RunState | null) => {
    if (gameRef.current) return;
    const next = { initial, token: ++gameSequence.current };
    gameRef.current = next;
    setGame(next);
    setExitRequest(0);
    window.history.pushState({ cpiNavigation: true }, '', '#practice-run');
  };

  const resumePractice = () => {
    if (saved.status !== 'ready' || saved.state.status === 'finished') return;
    startPractice(saved.state);
  };

  const startNewPractice = () => {
    if (gameRef.current) return;
    if (confirmingRef.current) {
      confirmingRef.current = false;
      setConfirmNew(false);
      window.history.replaceState({ cpiNavigation: true }, '', viewHash(view));
    }
    try {
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
    if (saved.status === 'empty') {
      startNewPractice();
      return;
    }
    confirmingRef.current = true;
    setConfirmNew(true);
    window.history.pushState({ cpiModal: true }, '', '#new-practice');
  };

  const closePractice = () => {
    gameRef.current = null;
    setGame(null);
    backExitInFlight.current = false;
    setSaved(loadLocalPractice());
    try {
      setBest(readPracticePersonalBest(window.localStorage));
    } catch {
      setBest(null);
    }
    window.history.replaceState({ cpiNavigation: true }, '', viewHash(view));
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
          <p role="status">Opening your path…</p>
        ) : (
          <div className="cpi-bootstrap-failure" role="alert">
            <p>{bootError} You can retry or start offline practice.</p>
            <div className="cpi-bootstrap-actions">
              <button type="button" onClick={retryBootstrap}>
                Retry startup
              </button>
              <button type="button" onClick={openOfflinePractice}>
                Play offline
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
          onExit={closePractice}
          onExitCancelled={cancelGameExit}
          exitRequest={exitRequest}
          onCheckpoint={onCheckpoint}
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
          view={view}
          saved={saved}
          best={best}
          online={online}
          settings={settings}
          onOpen={navigate}
          onBack={back}
          onResume={resumePractice}
          onNew={requestNewPractice}
          onSettingsChange={changeSettings}
          onRetryConnection={retryConnectivity}
          buildLabel={buildLabel}
          warning={storageWarning}
        />
      </div>
      {confirmNew && (
        <ConfirmNewPractice saved={saved} onCancel={cancelNew} onConfirm={startNewPractice} />
      )}
    </>
  );
}
