import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startStartupDiagnostics } from './startup-diagnostics';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import './styles.css';

if (__CPI_BUILD_INFO__.environment === 'development' && import.meta.env.MODE === 'development') {
  startStartupDiagnostics();
}

// Reconcile the current native page before gameplay/audio owners can run.
// Failed readiness stays rejected and reaches the ordinary error diagnostics.
void getGameplayLifecycle().ready;

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
