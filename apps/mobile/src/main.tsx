import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startStartupDiagnostics } from './startup-diagnostics';
import './styles.css';

if (__CPI_BUILD_INFO__.environment === 'development' && import.meta.env.MODE === 'development') {
  startStartupDiagnostics();
}

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
