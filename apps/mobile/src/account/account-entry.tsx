import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountOtpFlow } from './otp-flow';
import { createOtpGateway } from './otp-gateway';
import type { AccountFlowProblem } from './otp-flow';
import { useLanguage } from '../language-context';
import './account-entry.css';
import { QA_TOOLS_ENABLED } from '../app-profile';
import type { OtpGateway } from './otp-flow';
import type { AccountSessionOwner } from './session-owner';
import { ACCOUNT_COUNTRIES } from './country-codes';
import { playerInformationUrl } from '../support-contact';

export interface AccountEntryBinding {
  readonly gateway: OtpGateway;
  readonly session: AccountSessionOwner;
}

/**
 * Account intake stays unavailable until a trusted policy/guardian service is
 * deployed and the environment explicitly points at its HTTPS endpoint.
 * A verified one-time ticket is exchanged by the separate credential owner.
 */
export function AccountEntry({
  online,
  binding,
}: {
  online: boolean;
  binding?: AccountEntryBinding;
}) {
  const { t, locale } = useLanguage();
  const countryNames = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale]);
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
  const mounted = useRef(true);
  const ownsConnection = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flow?.cancel();
      if (ownsConnection.current && binding?.session.snapshot().phase === 'connecting')
        void binding.session.signOut();
    };
  }, [flow, binding]);

  useEffect(() => {
    flow?.cancel();
    if (!online) flow?.offline();
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setEmail('');
      setCode('');
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
    sync();
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
      ownsConnection.current = true;
      const active = await binding.session.exchangeVerifiedTicket(ticket);
      ownsConnection.current = false;
      if (mounted.current) {
        setConnecting(false);
        setSessionFailed(!active);
      }
    }
  }
  async function restore() {
    if (!binding || connecting) return;
    setConnecting(true);
    const active = await binding.session.restore();
    if (mounted.current) {
      setConnecting(false);
      setSessionFailed(!active);
    }
  }
  function cancel() {
    if (binding?.session.snapshot().phase === 'connecting') void binding.session.signOut();
    flow?.cancel();
    setEmail('');
    setCode('');
    setSessionFailed(false);
    setConnecting(false);
    sync();
  }
  const problem = state?.problem as AccountFlowProblem;
  const errors: Partial<Record<Exclude<AccountFlowProblem, null>, string>> = {
    invalid_email: t('account.invalidEmail'),
    invalid_code: t('account.invalidCode'),
    expired: t('account.expired'),
    rate_limited: t('account.rateLimited'),
    cooldown: t('account.cooldown'),
    retry: t('account.retry'),
  };

  return (
    <section className="cpi-account-entry" aria-labelledby="cpi-account-entry-title">
      <h2 id="cpi-account-entry-title">{t('account.title')}</h2>
      <p>{t('account.privacyFirst')}</p>
      <p>
        <a href={playerInformationUrl('privacy', locale)} target="_blank" rel="noopener noreferrer">
          {t('support.privacyPolicy')}
        </a>
      </p>
      {!gateway ? (
        <p role="status">{t('account.notReady')}</p>
      ) : (
        <>
          {(state?.step === 'guest' ||
            state?.step === 'unavailable' ||
            state?.step === 'parental_review' ||
            state?.step === 'offline') && (
            <>
              <p role="status">
                {state?.step === 'parental_review'
                  ? t('account.parentalReview')
                  : state?.step === 'offline'
                    ? t('account.offline')
                    : t('account.checkFirst')}
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void evaluate();
                }}
              >
                <label htmlFor="cpi-account-age">{t('account.age')}</label>
                <input
                  id="cpi-account-age"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="120"
                  required
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  autoComplete="off"
                />
                <label htmlFor="cpi-account-country">{t('account.country')}</label>
                <select
                  id="cpi-account-country"
                  required
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  <option value="">{t('account.selectCountry')}</option>
                  {ACCOUNT_COUNTRIES.map((code) => (
                    <option key={code} value={code}>
                      {countryNames.of(code) ?? code}
                    </option>
                  ))}
                </select>
                <p>{t('account.agePrivacy')}</p>
                <button type="submit" disabled={!online}>
                  {t('account.check')}
                </button>
              </form>
            </>
          )}
          {state?.step === 'checking' && <p role="status">{t('account.checking')}</p>}
          {(state?.step === 'eligible' || state?.step === 'sending') && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label htmlFor="cpi-account-email">{t('account.email')}</label>
              <input
                id="cpi-account-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={254}
                value={email}
                disabled={state.step === 'sending'}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" disabled={state.step === 'sending' || !online}>
                {t('account.sendCode')}
              </button>
            </form>
          )}
          {(state?.step === 'code' || state?.step === 'verifying') && (
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
                disabled={state.step === 'verifying'}
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="submit" disabled={state.step === 'verifying' || !online}>
                {t('account.verify')}
              </button>
              <button
                type="button"
                disabled={state.step === 'verifying' || !online}
                onClick={() => void send()}
              >
                {t('account.resend')}
              </button>
            </form>
          )}
          {state?.step === 'verified_pending_session' && (
            <p role="status">
              {binding && connecting
                ? locale === 'bg'
                  ? 'Свързване…'
                  : 'Signing in…'
                : t('account.notSignedIn')}
            </p>
          )}
          {binding && (state?.step === 'guest' || state?.step === 'unavailable') && (
            <button type="button" disabled={!online || connecting} onClick={() => void restore()}>
              {locale === 'bg' ? 'Възстанови входа' : 'Restore sign-in'}
            </button>
          )}
          {sessionFailed && <p role="alert">{t('account.retry')}</p>}
          {problem && <p role="alert">{errors[problem]}</p>}
          {state?.step !== 'guest' && (
            <button type="button" onClick={cancel}>
              {t('account.cancel')}
            </button>
          )}
        </>
      )}
      <p className="cpi-menu-fine-print">{t('account.guestSafe')}</p>
    </section>
  );
}
