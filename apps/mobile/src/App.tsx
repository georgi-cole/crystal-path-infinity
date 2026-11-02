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

const build = __CPI_BUILD_INFO__;
const showBuildDetails = build.environment !== 'production';

function CrystalArtwork() {
  return (
    <div className="crystal-artwork" aria-hidden="true">
      <svg viewBox="0 0 280 300" focusable="false">
        <defs>
          <radialGradient id="crystal-halo">
            <stop offset="0" stopColor="#58d9ee" stopOpacity=".12" />
            <stop offset="1" stopColor="#58d9ee" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id="crystal-face"
            x1="74"
            y1="34"
            x2="200"
            y2="248"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#b7f6f8" />
            <stop offset=".48" stopColor="#44c8e5" />
            <stop offset="1" stopColor="#184f92" />
          </linearGradient>
          <linearGradient
            id="crystal-edge"
            x1="140"
            y1="34"
            x2="140"
            y2="248"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#d5ffff" />
            <stop offset="1" stopColor="#79d9ed" stopOpacity=".25" />
          </linearGradient>
        </defs>
        <circle cx="140" cy="133" r="123" fill="url(#crystal-halo)" />
        <circle cx="140" cy="133" r="100" fill="none" stroke="#7ad9ed" strokeOpacity=".08" />
        <path d="m140 34 66 73-27 94-39 47-39-47-27-94 66-73Z" fill="url(#crystal-face)" />
        <path d="m140 34 33 73-33 69-33-69 33-73Z" fill="#b6f4f5" fillOpacity=".57" />
        <path d="m74 107 33 0 33 69-39 25-27-94Z" fill="#39b6d6" fillOpacity=".62" />
        <path d="m173 107 33 0-27 94-39-25 33-69Z" fill="#1d629c" fillOpacity=".67" />
        <path d="m107 107 33 69v72l-39-47 6-94Z" fill="#2d8fbd" fillOpacity=".36" />
        <path d="m173 107-33 69v72l39-47-6-94Z" fill="#174c83" fillOpacity=".58" />
        <path
          d="m140 34 66 73-27 94-39 47-39-47-27-94 66-73Z M74 107h132 M140 34l-33 73 33 69 33-69-33-73 M101 201l39-25 39 25 M140 176v72"
          fill="none"
          stroke="url(#crystal-edge)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path d="m140 263 12 6-12 6-12-6 12-6Z" fill="#69d6e9" fillOpacity=".26" />
        <path d="m140 283 8 4-8 4-8-4 8-4Z" fill="#69d6e9" fillOpacity=".12" />
        <path
          d="M49 75v8m-4-4h8M220 182v6m-3-3h6"
          stroke="#98e5f0"
          strokeWidth="1"
          strokeOpacity=".65"
        />
        <circle cx="221" cy="56" r="1.4" fill="#b5edf6" fillOpacity=".65" />
        <circle cx="55" cy="204" r="1" fill="#b5edf6" fillOpacity=".35" />
      </svg>
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
