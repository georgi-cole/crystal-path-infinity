import './styles.css';
import './brand-tokens.css';
import { StrictMode } from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SIMULATED_STORE_ENABLED } from './app-profile';
import { BrandLaunchGate } from './brand-launch';
import { TestStoreProvider } from './store-provider';
import './theme-worlds.css';
import { LanguageProvider } from './language-provider';
import { startStartupDiagnostics } from './startup-diagnostics';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import './global-accessibility.css';
import { PlayerApp } from './player-app';

if (__CPI_BUILD_INFO__.environment === 'development' && import.meta.env.MODE === 'development') {
  startStartupDiagnostics();
}

// Reconcile the current native page before gameplay/audio owners can run.
// Failed readiness stays rejected and reaches the ordinary error diagnostics.
void getGameplayLifecycle().ready;

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
if (Capacitor.isNativePlatform()) {
  root.dataset.nativeShell = 'true';
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    );
}

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <BrandLaunchGate>
        {SIMULATED_STORE_ENABLED ? (
          <TestStoreProvider>
            <App />
          </TestStoreProvider>
        ) : (
          <PlayerApp />
        )}
      </BrandLaunchGate>
    </LanguageProvider>
  </StrictMode>,
);
