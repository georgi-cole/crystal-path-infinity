import { useEffect, useState } from 'react';
import { useLanguage } from '../language-context';
import { ThemeScope } from '../store-provider';
import { AccountEntry } from './account-entry';
import { AccountSessionOwner } from './session-owner';
import { createSessionTransport } from './session-gateway';
import { createOtpGateway } from './otp-gateway';
import { AccountControls } from './account-controls';
import { createAccountControlsClient } from './account-controls-client';
import { createInMemoryRefreshTokenStore } from './secure-session';
import { SIMULATED_STORE_ENABLED } from '../app-profile';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../support-contact';
/** Web self-service only: credentials live in memory, with no native SDK, analytics or guest-score promotion. */
function portalServices() {
  const base: unknown = import.meta.env.VITE_ACCOUNT_API_BASE_URL;
  if (
    SIMULATED_STORE_ENABLED ||
    import.meta.env.VITE_ACCOUNT_SERVICES_ENABLED !== 'true' ||
    typeof base !== 'string'
  )
    return null;
  const gateway = createOtpGateway(base),
    transport = createSessionTransport(base);
  if (!gateway || !transport) return null;
  const session = new AccountSessionOwner(createInMemoryRefreshTokenStore(), transport);
  return {
    session,
    binding: { gateway, session },
    controls: createAccountControlsClient(base, session),
  };
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
          <AccountEntry online={navigator.onLine} binding={services.binding} />
        ) : (
          <p>{t('accountPortal.unavailable')}</p>
        )}
        <p>
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
        </p>
      </main>
    </ThemeScope>
  );
}
