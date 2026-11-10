import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccountGatewayError, AccountOtpFlow } from './otp-flow';
import { createOtpGateway } from './otp-gateway';
import type { AccountFlowProblem } from './otp-flow';
import { useLanguage } from '../language-context';
import './account-entry.css';
import { QA_TOOLS_ENABLED } from '../app-profile';
import type { OtpGateway } from './otp-flow';
import type { AccountSessionOwner } from './session-owner';
import { ACCOUNT_COUNTRIES } from './country-codes';
import { playerInformationUrl } from '../support-contact';
import { IdentityButtons } from './provider-sign-in';
import type {
  IdentityProvider,
  NativeIdentityClient,
  ProviderSignIn,
} from './native-identity-client';

export interface AccountEntryBinding {
  readonly gateway: OtpGateway;
  readonly session: AccountSessionOwner;
  readonly identity?: NativeIdentityClient | null;
  readonly staging?: boolean;
}

/**
 * Account intake stays unavailable until a trusted policy/guardian service is
 * deployed and the environment explicitly points at its HTTPS endpoint.
 * A verified one-time ticket is exchanged by the separate credential owner.
 */
export function AccountEntry({
  online,
  binding,
  onSignedIn,
}: {
  online: boolean;
  binding?: AccountEntryBinding;
  onSignedIn?: (offerProfile: boolean) => void;
}) {
  const { t, locale } = useLanguage();
  const staging = binding?.staging === true;
  const screeningMessage = staging ? 'account.stagingCheckFirst' : 'account.checkFirst';
  const sessionPhase = useSyncExternalStore(
    (listener) => binding?.session.subscribeAccountScope(listener) ?? (() => {}),
    () => binding?.session.snapshot().phase ?? 'guest',
    () => 'guest',
  );
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    const codes = staging ? ['BG'] : ACCOUNT_COUNTRIES;
    return codes
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale, staging]);
  const configuredOrigin: unknown = import.meta.env.VITE_ACCOUNT_API_BASE_URL;
  const gateway = useMemo(
    () =>
      binding?.gateway ??
      (QA_TOOLS_ENABLED
        ? createOtpGateway(typeof configuredOrigin === 'string' ? configuredOrigin : undefined)
        : null),
    [configuredOrigin, binding],
  );
  const flow = useMemo(() => (gateway ? new AccountOtpFlow(gateway) : null), [gateway]);
  const [state, setState] = useState(() => flow?.snapshot() ?? null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [age, setAge] = useState('');
  const [country, setCountry] = useState('');
  const [emailSelected, setEmailSelected] = useState(false);
  const [providerNotice, setProviderNotice] = useState<
    'link_required' | 'signup_unavailable' | 'already_linked' | null
  >(null);
  const [providerProblem, setProviderProblem] = useState<AccountFlowProblem>(null);
  const [providerLink, setProviderLink] = useState<{
    token: string;
    resendAt: number | null;
  } | null>(null);
  const providerAttempt = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const ownsConnection = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      providerAttempt.current?.abort();
      flow?.cancel();
      if (ownsConnection.current && binding?.session.snapshot().phase === 'connecting')
        void binding.session.signOut();
    };
  }, [flow, binding]);

  useEffect(() => {
    flow?.cancel();
    if (!online) {
      flow?.offline();
      providerAttempt.current?.abort();
    }
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setEmail('');
      setCode('');
      setProviderLink(null);
      setProviderProblem(null);
      setState(flow?.snapshot() ?? null);
    });
    return () => {
      active = false;
    };
  }, [flow, online]);

  function sync() {
    if (mounted.current) setState(flow?.snapshot() ?? null);
  }
  async function evaluate() {
    if (!flow) return;
    const pending = flow.checkEligibility(online, { age: Number(age), country });
    sync();
    await pending;
    if (mounted.current && flow.snapshot().step === 'eligible') {
      setAge('');
      setCountry('');
    }
    sync();
  }
  async function connect(ticket: string, offerProfile = false) {
    if (!binding || !mounted.current) return;
    ownsConnection.current = true;
    const active = await binding.session.exchangeVerifiedTicket(ticket);
    ownsConnection.current = false;
    if (active) onSignedIn?.(offerProfile);
    else if (mounted.current) setSessionFailed(true);
  }
  async function runProvider(
    request: (
      identity: NativeIdentityClient,
      signal: AbortSignal,
    ) => Promise<ProviderSignIn | { status: 'code_sent'; resendAt: number }>,
  ) {
    if (!binding?.identity || !online || providerAttempt.current || !mounted.current) return;
    const controller = new AbortController();
    providerAttempt.current = controller;
    setProviderNotice(null);
    setProviderProblem(null);
    setSessionFailed(false);
    setConnecting(true);
    try {
      const result = await request(binding.identity, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === 'verify_existing') {
        setProviderLink({ token: result.linkToken, resendAt: null });
      } else if (result.status === 'code_sent') {
        setProviderLink((current) => current && { ...current, resendAt: result.resendAt });
      } else if (result.status === 'verified') {
        setCode('');
        await connect(result.ticket, result.offerProfile);
      } else if (result.status !== 'cancelled') {
        setProviderNotice(result.status);
        setProviderLink(null);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const kind = error instanceof AccountGatewayError ? error.kind : 'unavailable';
        setProviderProblem(kind === 'unavailable' ? 'retry' : kind);
        if (kind === 'expired') {
          setProviderLink(null);
          setCode('');
        }
      }
    } finally {
      providerAttempt.current = null;
      if (mounted.current) setConnecting(false);
    }
  }
  function chooseEmail() {
    setEmailSelected(true);
    setProviderNotice(null);
    setProviderProblem(null);
    setSessionFailed(false);
  }
  function chooseProvider(provider: IdentityProvider) {
    void runProvider((identity, signal) => identity.signIn(provider, signal));
  }
  async function send() {
    if (!flow) return;
    const pending = flow.requestCode(email, online);
    sync();
    await pending;
    sync();
  }
  async function verify() {
    if (!flow) return;
    const pending = flow.verifyCode(code, online);
    sync();
    await pending;
    if (!mounted.current) return;
    setCode('');
    setAge('');
    setCountry('');
    sync();
    if (binding && flow.snapshot().step === 'verified_pending_session') {
      const ticket = flow.takeVerifiedTicket();
      if (!ticket) {
        setSessionFailed(true);
        return;
      }
      setConnecting(true);
      await connect(ticket);
      if (mounted.current) setConnecting(false);
    }
  }
  function cancel() {
    providerAttempt.current?.abort();
    setEmailSelected(false);
    setProviderLink(null);
    setProviderNotice(null);
    setProviderProblem(null);
    if (binding?.session.snapshot().phase === 'connecting') void binding.session.signOut();
    flow?.cancel();
    setEmail('');
    setCode('');
    setAge('');
    setCountry('');
    setSessionFailed(false);
    setConnecting(false);
    sync();
  }
  const problem = providerProblem ?? state?.problem;
  const errors: Partial<Record<Exclude<AccountFlowProblem, null>, string>> = {
    invalid_email: t('account.invalidEmail'),
    invalid_code: t('account.invalidCode'),
    expired: t('account.expired'),
    rate_limited: t('account.rateLimited'),
    cooldown: t('account.cooldown'),
    retry: t('account.retry'),
  };

  const step = state?.step;
  const screening =
    step === 'guest' || step === 'checking' || step === 'unavailable' || step === 'offline';
  const showMethods = !!binding?.identity && !emailSelected && !providerLink;
  const emailFlow = !showMethods && !providerLink;
  const codeStep =
    step === 'code' || step === 'verifying' || (step === 'sending' && state?.codeExpiresAt != null);
  const busy = step === 'sending' || step === 'verifying' || connecting;
  const sessionStatus =
    sessionPhase === 'restoring' || sessionPhase === 'refreshing'
      ? 'account.signingIn'
      : sessionPhase === 'recovery_required'
        ? 'account.restoreFailed'
        : sessionPhase === 'signing_out'
          ? 'account.signingOut'
          : sessionPhase === 'revocation_unconfirmed'
            ? 'account.signOutFailed'
            : sessionPhase === 'blocked'
              ? 'account.notReady'
              : null;

  return (
    <section
      className={showMethods ? 'cpi-account-entry cpi-account-entry--methods' : 'cpi-account-entry'}
      aria-labelledby="cpi-account-entry-title"
    >
      <h2 id="cpi-account-entry-title">
        {t(
          codeStep
            ? 'account.checkEmail'
            : providerLink
              ? providerLink.resendAt
                ? 'account.checkEmail'
                : 'account.verifyExisting'
              : 'account.title',
        )}
      </h2>
      {!gateway ? (
        <p role="status">{t('account.notReady')}</p>
      ) : sessionStatus ? (
        <>
          <p role="status">{t(sessionStatus)}</p>
          {sessionPhase === 'recovery_required' && (
            <button
              type="button"
              disabled={!online}
              onClick={() => void binding?.session.restore()}
            >
              {t('ranked.retry')}
            </button>
          )}
          {sessionPhase === 'revocation_unconfirmed' && (
            <button
              type="button"
              disabled={!online}
              onClick={() => void binding?.session.retryRevocation()}
            >
              {t('ranked.retry')}
            </button>
          )}
        </>
      ) : (
        <>
          {showMethods && (
            <>
              {providerNotice && (
                <p role="status">
                  {t(
                    providerNotice === 'link_required'
                      ? 'account.useAccountEmail'
                      : providerNotice === 'already_linked'
                        ? 'account.identityAlreadyLinked'
                        : 'account.betaProviderUnavailable',
                  )}
                </p>
              )}
              <IdentityButtons disabled={busy || !online} onChoose={chooseProvider} />
              <button
                type="button"
                className="cpi-email-fallback"
                disabled={busy || !online}
                onClick={chooseEmail}
              >
                {t('account.continueEmail')}
              </button>
              {connecting && <p role="status">{t('account.signingIn')}</p>}
              {!online && <p role="status">{t('account.offline')}</p>}
            </>
          )}
          {providerLink && (
            <>
              {providerLink.resendAt === null ? (
                <p>{t('account.verifyExistingHelp')}</p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runProvider((identity, signal) =>
                      identity.verifyLinkCode(providerLink.token, code, signal),
                    );
                  }}
                >
                  <label htmlFor="cpi-provider-code">{t('account.code')}</label>
                  <input
                    id="cpi-provider-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    value={code}
                    disabled={connecting}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <button type="submit" disabled={connecting || !online}>
                    {t(connecting ? 'account.signingIn' : 'account.verify')}
                  </button>
                </form>
              )}
              <button
                type="button"
                className={providerLink.resendAt ? 'cpi-account-secondary' : undefined}
                disabled={connecting || !online}
                onClick={() =>
                  void runProvider(async (identity, signal) => ({
                    status: 'code_sent',
                    ...(await identity.requestLinkCode(providerLink.token, signal)),
                  }))
                }
              >
                {t(
                  connecting && !providerLink.resendAt
                    ? 'account.sendingCode'
                    : providerLink.resendAt
                      ? 'account.resend'
                      : 'account.sendCode',
                )}
              </button>
            </>
          )}
          {screening && emailFlow && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void evaluate();
              }}
            >
              <p>{t(online ? screeningMessage : 'account.offline')}</p>
              <label htmlFor="cpi-account-age">{t('account.age')}</label>
              <input
                id="cpi-account-age"
                type="number"
                inputMode="numeric"
                min="0"
                max="120"
                required
                value={age}
                disabled={step === 'checking' || connecting}
                onChange={(event) => setAge(event.target.value)}
                autoComplete="off"
              />
              <label htmlFor="cpi-account-country">{t('account.country')}</label>
              <select
                id="cpi-account-country"
                required
                value={country}
                disabled={step === 'checking' || connecting}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="">{t('account.selectCountry')}</option>
                {countries.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <p className="cpi-menu-fine-print">{t('account.agePrivacy')}</p>
              <button type="submit" disabled={!online || step === 'checking' || connecting}>
                {t(step === 'checking' ? 'account.checking' : 'account.check')}
              </button>
            </form>
          )}
          {step === 'parental_review' && <p role="status">{t('account.parentalReview')}</p>}
          {emailFlow && (step === 'eligible' || (step === 'sending' && !codeStep)) && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <p>{t('account.privacyFirst')}</p>
              <label htmlFor="cpi-account-email">{t('account.email')}</label>
              <input
                id="cpi-account-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" disabled={busy || !online}>
                {t(step === 'sending' ? 'account.sendingCode' : 'account.sendCode')}
              </button>
            </form>
          )}
          {codeStep && (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void verify();
                }}
              >
                <label htmlFor="cpi-account-code">{t('account.code')}</label>
                <input
                  id="cpi-account-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  disabled={busy}
                  onChange={(event) => setCode(event.target.value)}
                />
                <button type="submit" disabled={busy || !online}>
                  {t(step === 'verifying' ? 'account.signingIn' : 'account.verify')}
                </button>
              </form>
              <div className="cpi-account-links">
                <button type="button" disabled={busy || !online} onClick={() => void send()}>
                  {t(step === 'sending' ? 'account.sendingCode' : 'account.resend')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    flow?.changeEmail();
                    setCode('');
                    sync();
                  }}
                >
                  {t('account.changeEmail')}
                </button>
              </div>
            </>
          )}
          {step === 'verified_pending_session' && !sessionFailed && (
            <p role="status">{t(connecting ? 'account.signingIn' : 'account.notSignedIn')}</p>
          )}
          {(sessionFailed || problem) && (
            <p role="alert">{sessionFailed ? t('account.retry') : problem && errors[problem]}</p>
          )}
          <div className="cpi-account-links">
            {!showMethods && (!screening || emailSelected || providerLink) && !connecting && (
              <button type="button" onClick={cancel}>
                {t(binding?.identity ? 'account.otherMethods' : 'account.cancel')}
              </button>
            )}
            {(showMethods || (screening && !providerLink)) && (
              <a
                href={playerInformationUrl('privacy', locale)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('support.privacyPolicy')}
              </a>
            )}
          </div>
        </>
      )}
    </section>
  );
}
