import './styles.css';
import './brand-tokens.css';
import './theme-worlds.css';
import './account-portal.css';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from './language-provider';
import { AccountPortal } from './account/account-portal-view';
const root = document.getElementById('root');
if (!root) throw new Error('Missing account page');
createRoot(root).render(
  <LanguageProvider>
    <AccountPortal />
  </LanguageProvider>,
);
