import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../language-context';
import type { IdentityProvider, NativeIdentityClient } from './native-identity-client';
import './provider-sign-in.css';

const providers: readonly IdentityProvider[] = ['apple', 'google'];

function ProviderIcon({ provider }: { provider: IdentityProvider }) {
  return provider === 'apple' ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M17.1 12.3c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.5-1.7-3.1-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.8-2.8-.7-1.4 0-2.7.8-3.5 2-1.5 2.6-.4 6.4 1 8.5.7 1 1.5 2 2.6 2 1 0 1.4-.6 2.7-.6s1.6.6 2.8.6 1.9-1 2.6-2c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.3-.9-2.3-3.1zM15 5.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.7 1.3-.6.7-1.1 1.7-1 2.7 1 0 2.1-.5 2.8-1.3z"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.2-1.8 13.6-4.5l-6.7-5.1a12.4 12.4 0 0 1-18.4-6.5H5.6v5.2A20 20 0 0 0 24 44z"
      />
      <path fill="#FBBC05" d="M12.5 27.9a12 12 0 0 1 0-7.8v-5.2H5.6a20 20 0 0 0 0 18.2l6.9-5.2z" />
      <path
        fill="#EA4335"
        d="M24 12a11 11 0 0 1 7.8 3l5.8-5.8A19.2 19.2 0 0 0 24 4 20 20 0 0 0 5.6 14.9l6.9 5.2A12 12 0 0 1 24 12z"
      />
    </svg>
  );
}

export function IdentityButtons({
  disabled,
  linking = false,
  onChoose,
}: {
  disabled: boolean;
  linking?: boolean;
  onChoose: (provider: IdentityProvider) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="cpi-identity-options">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          className={'cpi-provider-button cpi-provider-button--' + provider}
          disabled={disabled}
          onClick={() => onChoose(provider)}
        >
          <ProviderIcon provider={provider} />
          {t(
            provider === 'apple'
              ? linking
                ? 'account.linkApple'
                : 'account.continueApple'
              : linking
                ? 'account.linkGoogle'
                : 'account.continueGoogle',
          )}
        </button>
      ))}
    </div>
  );
}

export function IdentityLinks({
  client,
  online,
}: {
  client: NativeIdentityClient;
  online: boolean;
}) {
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<'linked' | 'already_linked' | 'error' | null>(null);
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => attempt.current?.abort(), []);

  async function link(provider: IdentityProvider) {
    if (attempt.current || !online) return;
    const controller = new AbortController();
    attempt.current = controller;
    setPending(true);
    setNotice(null);
    try {
      const result = await client.link(provider, controller.signal);
      if (!controller.signal.aborted && result !== 'cancelled') setNotice(result);
    } catch {
      if (!controller.signal.aborted) setNotice('error');
    } finally {
      attempt.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <details className="cpi-profile-details cpi-identity-links">
      <summary>{t('account.signInMethods')}</summary>
      <p>{t('account.linkHelp')}</p>
      <IdentityButtons
        disabled={!online || pending}
        linking
        onChoose={(provider) => void link(provider)}
      />
      {pending && <p role="status">{t('account.signingIn')}</p>}
      {notice && (
        <p role="status">
          {t(
            notice === 'linked'
              ? 'account.identityLinked'
              : notice === 'already_linked'
                ? 'account.identityAlreadyLinked'
                : 'account.retry',
          )}
        </p>
      )}
    </details>
  );
}
