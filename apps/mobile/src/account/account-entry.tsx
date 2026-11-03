import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountOtpFlow } from './otp-flow';
import { createOtpGateway } from './otp-gateway';
import type { AccountFlowProblem } from './otp-flow';
import { useLanguage } from '../language-context';
import './account-entry.css';

/**
 * Account intake stays unavailable until a trusted policy/guardian service is
 * deployed and the environment explicitly points at its HTTPS endpoint.
 * This is NOT a login screen and verified OTP does not grant ranked access.
 */
export function AccountEntry({ online }: { online: boolean }) {
  const { t } = useLanguage();
  const gateway = useMemo(
    () => createOtpGateway(import.meta.env.VITE_ACCOUNT_API_BASE_URL),
    [],
  );
  const flow = useMemo(() => (gateway ? new AccountOtpFlow(gateway) : null), [gateway]);
  const [state, setState] = useState(() => flow?.snapshot() ?? null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const mounted = useRef(true);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flow?.cancel();
    };
  }, [flow]);

  useEffect(() => {
    if (!online) {
      flow?.offline();
      setEmail('');
      setCode('');
      setState(flow?.snapshot() ?? null);
    }
  }, [flow, online]);

  function sync() {
    if (mounted.current) setState(flow?.snapshot() ?? null);
  }
  async function evaluate() {
    if (!flow) return;
    const pending = flow.checkEligibility(onlineRef.current);
    sync();
    await pending;
    sync();
  }
  async function send() {
    if (!flow) return;
    const pending = flow.requestCode(email, onlineRef.current);
    sync();
    await pending;
    sync();
  }
  async function verify() {
    if (!flow) return;
    const pending = flow.verifyCode(code, onlineRef.current);
    sync();
    await pending;
    setCode('');
    sync();
  }
  function cancel() {
    flow?.cancel();
    setEmail('');
    setCode('');
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
              <button type="button" onClick={() => void evaluate()} disabled={!online}>
                {t('account.check')}
              </button>
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
            <p role="status">{t('account.notSignedIn')}</p>
          )}
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
