import { useEffect, useState } from 'react';
import { useLanguage } from '../language-context';
import { ThemeScope } from '../store-provider';
import { AccountEntry } from './account-entry';
import { AccountSessionOwner } from './session-owner';
import { createSessionTransport } from './session-gateway';
import { createOtpGateway } from './otp-gateway';
import { AccountControls } from './account-controls';
import { createAccountControlsClient } from './account-controls-client';
/** Web self-service only: credentials live in memory, with no native SDK, analytics or guest-score promotion. */
function portalServices() {
  const base: unknown = import.meta.env.VITE_ACCOUNT_API_BASE_URL;
  if (import.meta.env.VITE_ACCOUNT_SERVICES_ENABLED !== 'true' || typeof base !== 'string')
    return null;
  const gateway = createOtpGateway(base),
    transport = createSessionTransport(base);
  if (!gateway || !transport) return null;
  let memory: string | null = null;
  const session = new AccountSessionOwner(
    {
      supported: true,
      read: () => Promise.resolve(memory),
      write: (value) => {
        memory = value;
        return Promise.resolve();
      },
      clear: () => {
        memory = null;
        return Promise.resolve();
      },
    },
    transport,
  );
  return { session, gateway, controls: createAccountControlsClient(base, session) };
}
export function AccountPortal() {
  const { t } = useLanguage();
  const [services] = useState(portalServices),
    [scope, setScope] = useState<object | null>(null);
  useEffect(
    () => services?.session.subscribeAccountScope(() => setScope(services.session.accountScope())),
    [services],
  );
  return (
    <ThemeScope theme="obsidian">
      <main className="cpi-account-portal">
        <p>KOLEQUANT</p>
        <h1>Crystal Path: Infinity</h1>
        <h2>{t('accountControls.title')}</h2>
        <p>{t('accountPortal.description')}</p>
        {services && scope ? (
          <>
            <AccountControls client={services.controls} accountScope={scope} />
            <button type="button" onClick={() => void services.session.signOut()}>
              {t('account.signOut')}
            </button>
          </>
        ) : services ? (
          <AccountEntry
            online={navigator.onLine}
            binding={{ gateway: services.gateway, session: services.session }}
          />
        ) : (
          <p>{t('accountPortal.unavailable')}</p>
        )}
        <p>
          <a href="mailto:support@kolequant.com">support@kolequant.com</a>
        </p>
      </main>
    </ThemeScope>
  );
}
