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
import { CrystalButton } from './brand/CrystalButton';
import { CRYSTAL_IDENTITY } from './brand/identity';
import { InfinityPractice } from './infinity-scene';
import { Capacitor } from '@capacitor/core';
import { markDiagnosticReactReady } from './startup-diagnostics';

const build = __CPI_BUILD_INFO__;
const showBuildDetails = build.environment !== 'production';

function CrystalArtwork() {
  return (
    <img
      className="cpi-brand-artwork"
      src={import.meta.env.BASE_URL + 'assets/brand/icon-concept.svg'}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
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
  const [saved, setSaved] = useState<PracticeLoad>(loadLocalPractice);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [settings, setSettings] = useState<PracticeSettings>(() => {
    try {
      return typeof window === 'undefined'
        ? DEFAULT_PRACTICE_SETTINGS
        : readPracticeSettings(window.localStorage).settings;
    } catch {
      return DEFAULT_PRACTICE_SETTINGS;
    }
  });
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
        <h1 id="brand-title" aria-label={CRYSTAL_IDENTITY.name}>
          <span className="brand-name">Crystal Path</span>
          <span className="brand-edition">Infinity</span>
        </h1>
        <div className="brand-divider" aria-hidden="true">
          <span />
        </div>
        <p className="launch-message">Every step is a choice. The path never ends.</p>
        <div className="cpi-primary-actions" aria-label="Practice actions">
          {saved.status === 'ready' && (
            <CrystalButton
              variant="primary"
              stretch
              onClick={() => setGame({ initial: saved.state })}
            >
              Continue practice · Row {saved.state.currentRow}
            </CrystalButton>
          )}
          <CrystalButton
            variant={saved.status === 'ready' ? 'secondary' : 'primary'}
            stretch
            onClick={newPractice}
          >
            {saved.status === 'corrupt' ? 'Discard save and start new' : 'New practice'}
          </CrystalButton>
        </div>
        {saved.status === 'corrupt' && (
          <p className="preview-note" role="alert">
            {saved.message}
          </p>
        )}
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
