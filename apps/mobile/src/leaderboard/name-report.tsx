import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import { NAME_REPORT_REASONS } from './name-report-client';
import type {
  NameReportClient,
  NameReportProblem,
  NameReportReason,
  NameReportResult,
} from './name-report-client';
import './name-report.css';
const reasonKeys = {
  impersonation: 'nameReport.impersonation',
  hate_or_harassment: 'nameReport.hate_or_harassment',
  sexual_content: 'nameReport.sexual_content',
  personal_information: 'nameReport.personal_information',
  spam: 'nameReport.spam',
} as const;
const errorKeys = {
  unavailable: 'nameReport.unavailable',
  rate_limited: 'nameReport.rateLimited',
  account_required: 'nameReport.accountRequired',
  invalid: 'nameReport.invalid',
} as const;

/** Only a parent-supplied approved account client enables the reporting affordance. */
export function NameReportButton({
  client,
  targetPublicId,
  username,
  online = true,
}: {
  client: NameReportClient | null;
  targetPublicId: string;
  username: string;
  online?: boolean;
}) {
  const { t } = useLanguage();
  const id = useId();
  const button = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [opened, setOpened] = useState<{
    client: NameReportClient;
    target: string;
    scope: object;
  } | null>(null);
  const [reason, setReason] = useState<NameReportReason | ''>('');
  const [phase, setPhase] = useState<'ready' | 'sending' | 'accepted'>('ready');
  const [problem, setProblem] = useState<NameReportProblem | null>(null);
  const subscribe = useCallback(
    (observer: () => void) => client?.subscribeAccountScope(observer) ?? (() => {}),
    [client],
  );
  const getScope = useCallback(() => client?.accountScope() ?? null, [client]);
  const accountScope = useSyncExternalStore(subscribe, getScope, getScope);
  const open =
    client !== null &&
    accountScope !== null &&
    opened?.client === client &&
    opened.target === targetPublicId &&
    opened.scope === accountScope;
  useEffect(
    () => () => {
      generation.current++;
      pending.current?.abort();
    },
    [client, targetPublicId, accountScope],
  );
  useEffect(() => {
    if (!open || !dialog.current) return;
    const modal = dialog.current;
    const opener = button.current;
    modal.showModal();
    return () => {
      if (modal.open) modal.close();
      opener?.focus();
    };
  }, [open]);
  function close() {
    generation.current++;
    pending.current?.abort();
    setOpened(null);
  }
  async function submit() {
    if (!client || !open || !online || !reason || phase === 'sending' || phase === 'accepted')
      return;
    const revision = ++generation.current;
    const scope = client.accountScope();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPhase('sending');
    setProblem(null);
    let result: NameReportResult;
    try {
      result = await client.submit(targetPublicId, reason, controller.signal);
    } catch {
      result = { ok: false, problem: 'unavailable' };
    }
    if (
      controller.signal.aborted ||
      revision !== generation.current ||
      scope !== client.accountScope()
    )
      return;
    if (result.ok) setPhase('accepted');
    else {
      setPhase('ready');
      setProblem(result.problem);
    }
  }
  if (!client || !accountScope) return null;
  return (
    <>
      <button
        className="cpi-name-report-open"
        type="button"
        ref={button}
        aria-label={t('nameReport.open', { username })}
        onClick={() => {
          setReason('');
          setProblem(null);
          setPhase('ready');
          setOpened({ client, target: targetPublicId, scope: accountScope });
        }}
      >
        {t('nameReport.open', { username })}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="cpi-name-report-dialog"
          aria-labelledby={id + '-title'}
          aria-describedby={id + '-help'}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <h2 id={id + '-title'}>{t('nameReport.title')}</h2>
          <p>{t('nameReport.target', { username })}</p>
          <p id={id + '-help'}>{t('nameReport.help')}</p>
          {phase === 'accepted' ? (
            <p role="status">{t('nameReport.accepted')}</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label htmlFor={id + '-reason'}>{t('nameReport.reason')}</label>
              <select
                id={id + '-reason'}
                required
                value={reason}
                disabled={phase === 'sending'}
                onChange={(event) => {
                  const value = event.target.value;
                  setReason(
                    NAME_REPORT_REASONS.includes(value as NameReportReason)
                      ? (value as NameReportReason)
                      : '',
                  );
                  setProblem(null);
                }}
              >
                <option value="">{t('nameReport.choose')}</option>
                {NAME_REPORT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {t(reasonKeys[value])}
                  </option>
                ))}
              </select>
              {!online && <p role="status">{t('nameReport.offline')}</p>}
              {problem && <p role="alert">{t(errorKeys[problem])}</p>}
              <button type="submit" disabled={!online || !reason || phase === 'sending'}>
                {t(
                  phase === 'sending'
                    ? 'nameReport.submitting'
                    : problem
                      ? 'nameReport.retry'
                      : 'nameReport.submit',
                )}
              </button>
            </form>
          )}
          <button type="button" onClick={close}>
            {t(phase === 'accepted' ? 'nameReport.close' : 'nameReport.cancel')}
          </button>
        </dialog>
      )}
    </>
  );
}
