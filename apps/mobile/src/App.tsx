import { useCallback, useEffect, useState } from 'react';
import type { RunState } from '@crystal-path-infinity/game-core';
import {
  clearPracticeCheckpoint,
  DEFAULT_PRACTICE_SETTINGS,
  readPracticeCheckpoint,
  readPracticeSettings,
  writePracticeCheckpoint,
  writePracticeSettings,
} from './practice-save';
import type { PracticeLoad, PracticeSettings } from './practice-save';
import { AudioSettingsControls } from './audio-settings-controls';
import { InfinityPractice } from './infinity-scene';
import { Capacitor } from '@capacitor/core';
import { markDiagnosticReactReady } from './startup-diagnostics';
import { settleStartup } from './startup-bootstrap';

const build = __CPI_BUILD_INFO__;
const showBuildDetails = build.environment !== 'production';

function CrystalArtwork() {
  return (
    <div className="crystal-artwork" aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}brand/prism-mark.svg`} alt="" draggable={false} />
    </div>
  );
}

function BuildDetails() {
  const platform = Capacitor.getPlatform();
  const platformName =
    platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Browser preview';

  return (
    <aside className="build-details" aria-label={`${build.appName} build information`}>
      <p className="build-summary">
        <span>{platformName}</span>
        <span className="build-separator" aria-hidden="true">
          ·
        </span>
        <span>Version {build.version}</span>
      </p>
      <p className="build-identifier">
        <span className="visually-hidden">App identifier: </span>
        {build.appId}
      </p>
    </aside>
  );
}

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

export function App() {
  const [game, setGame] = useState<{ initial: RunState | null } | null>(null);
  const [saved, setSaved] = useState<PracticeLoad>({ status: 'empty' });
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
  const [bootPhase, setBootPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [bootError, setBootError] = useState<string>('');
  const [bootAttempt, setBootAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void settleStartup(() => {
      const checkpoint = loadLocalPractice();
      let preferences = DEFAULT_PRACTICE_SETTINGS;
      try {
        preferences = readPracticeSettings(window.localStorage).settings;
      } catch {
        // Settings cannot block offline play.
      }
      return { checkpoint, preferences };
    }).then((result) => {
      if (!active) return;
      if (result.status === 'failed') {
        setBootError(result.reason);
        setBootPhase('failed');
        return;
      }
      setSaved(result.value.checkpoint);
      setSettings(result.value.preferences);
      setBootPhase('ready');
    });
    return () => {
      active = false;
    };
  }, [bootAttempt]);
  function retryBootstrap() {
    setBootPhase('loading');
    setBootAttempt((value) => value + 1);
  }
  function openOfflinePractice() {
    // Keep existing storage untouched; never silently discard a saved run.
    setSaved({ status: 'empty' });
    setSettings(DEFAULT_PRACTICE_SETTINGS);
    setStorageWarning('Local startup was unavailable. Practice is playable, but saving may fail.');
    setBootPhase('ready');
  }
  const changeSettings = useCallback((next: PracticeSettings) => {
    setSettings(next);
    try {
      writePracticeSettings(window.localStorage, next);
      setStorageWarning(null);
    } catch {
      setStorageWarning('Sound settings could not be saved on this device.');
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
  function newPractice() {
    if (
      saved.status === 'ready' &&
      saved.state.status !== 'finished' &&
      !window.confirm(
        'Start a new practice? This permanently replaces the saved attempt and its progress.',
      )
    )
      return;
    if (
      saved.status === 'corrupt' &&
      !window.confirm('Discard the damaged practice save and begin a new attempt?')
    )
      return;
    try {
      clearPracticeCheckpoint(window.localStorage);
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        'Local storage is unavailable. The new attempt can be played but might not be saved.',
      );
    }
    setGame({ initial: null });
  }
  function closePractice() {
    setGame(null);
    setSaved(loadLocalPractice());
  }
  useEffect(() => {
    // Post-commit smoke signal: public build metadata only, outside production.
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
          onExit={closePractice}
          initialState={game.initial}
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

  return (
    <main className="launch-screen" data-testid="app-ready" aria-labelledby="brand-title">
      <header className="launch-header">
        <p className="development-status">
          <span className="status-dot" aria-hidden="true" />
          In development
        </p>
        {showBuildDetails && (
          <span className={`environment-badge environment-badge--${build.environment}`}>
            {build.environment === 'staging' ? 'Staging' : 'Development'}
          </span>
        )}
      </header>

      <section className="launch-content" aria-labelledby="brand-title">
        <CrystalArtwork />
        <h1 id="brand-title" aria-label="Crystal Path Infinity">
          <span className="brand-name">Crystal Path</span>
          <span className="brand-edition">Infinity</span>
        </h1>
        <div className="brand-divider" aria-hidden="true">
          <span />
        </div>
        <p className="launch-message">The endless crystal bridge is taking shape.</p>
        {saved.status === 'ready' && (
          <button
            className="preview-play-button"
            type="button"
            onClick={() => setGame({ initial: saved.state })}
          >
            Continue practice · Row {saved.state.currentRow}
          </button>
        )}
        {saved.status === 'corrupt' && (
          <p className="preview-note" role="alert">
            {saved.message}
          </p>
        )}
        <button className="preview-play-button" type="button" onClick={newPractice}>
          {saved.status === 'corrupt' ? 'Discard save and start new' : 'New practice'}
        </button>
        {storageWarning && (
          <p className="preview-note" role="alert">
            {storageWarning}
          </p>
        )}
        <AudioSettingsControls settings={settings} onChange={changeSettings} />
        <p className="preview-note">
          Offline practice · No account needed · Results are not ranked
        </p>
      </section>

      <footer className="launch-footer">
        {showBuildDetails ? (
          <BuildDetails />
        ) : (
          <span className="quiet-signature" aria-hidden="true">
            ∞
          </span>
        )}
      </footer>
    </main>
  );
}
