import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import './account-controls.css';

import { AccountControlsOwner, EMPTY_ACCOUNT_CONTROLS as empty } from './account-controls-model';
import type { AccountControlsClient } from './account-controls-model';
import { ReauthForm } from './reauth-form';
export type { AccountControlsClient } from './account-controls-model';

export function AccountControls({
  client = null,
  accountScope,
}: {
  client?: AccountControlsClient | null;
  /** Replace on account change even if a host deliberately reuses its client. */
  accountScope?: object | null;
}) {
  const { t } = useLanguage();
  const scope = accountScope === undefined ? client : accountScope;
  const [owner] = useState(() => new AccountControlsOwner(client, scope));
  const snapshot = useSyncExternalStore(owner.subscribe, owner.snapshot, owner.snapshot);
  const view = owner.matches(client, scope) ? snapshot : empty;
  const [confirmation, setConfirmation] = useState<{ scope: object | null; token: object } | null>(
    null,
  );
  const confirming =
    owner.matches(client, scope) &&
    scope !== null &&
    confirmation?.scope === scope &&
    confirmation.token === snapshot;
  useEffect(() => {
    owner.replace(client, scope);
    return () => {
      owner.clear();
      client?.reauth?.cancel();
    };
  }, [owner, client, scope]);
  const busy =
    !owner.matches(client, scope) || view.phase === 'exporting' || view.phase === 'deleting';
  return (
    <section className="cpi-account-controls" aria-labelledby="cpi-account-controls-title">
      <h2 id="cpi-account-controls-title">{t('accountControls.title')}</h2>
      {client?.reauth && <ReauthForm prompt={client.reauth} />}
      {!client || scope === null ? (
        <p role="status">{t('accountControls.unavailable')}</p>
      ) : view.phase === 'deleted' ? (
        <>
          <p role="status">{t('accountControls.deleted')}</p>
          {client.finishDeletion && (
            <button type="button" onClick={() => void client.finishDeletion?.()}>
              {t('accountControls.done')}
            </button>
          )}
        </>
      ) : view.phase === 'pending' ? (
        <>
          <p role="status">{t('accountControls.pending')}</p>
          <button
            type="button"
            onClick={() => {
              void owner.deleteAccount();
            }}
          >
            {t('accountControls.retry')}
          </button>
        </>
      ) : (
        <>
          <p>{t('accountControls.reauth')}</p>
          <div className="cpi-account-controls-actions">
            <button
              type="button"
              disabled={busy || confirming}
              onClick={() => {
                void owner.exportData();
              }}
            >
              {view.phase === 'exporting'
                ? t('accountControls.exporting')
                : t('accountControls.export')}
            </button>
            <button
              type="button"
              disabled={busy || confirming}
              onClick={() => {
                owner.clear();
                setConfirmation({ scope, token: owner.snapshot() });
              }}
            >
              {t('accountControls.delete')}
            </button>
          </div>
          {confirming && (
            <div role="group" aria-labelledby="cpi-account-delete-confirm">
              <p id="cpi-account-delete-confirm">{t('accountControls.confirm')}</p>
              <button type="button" onClick={() => setConfirmation(null)}>
                {t('accountControls.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmation(null);
                  void owner.deleteAccount();
                }}
              >
                {t('accountControls.confirmDelete')}
              </button>
            </div>
          )}
          {view.phase === 'deleting' && <p role="status">{t('accountControls.deleting')}</p>}
          {view.exportJson && (
            <>
              <label htmlFor="cpi-account-export">{t('accountControls.privateExport')}</label>
              <textarea
                id="cpi-account-export"
                value={view.exportJson}
                readOnly
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => {
                  void owner.copyExport(async (text) => {
                    await navigator.clipboard.writeText(text);
                  });
                }}
              >
                {t('accountControls.copy')}
              </button>
              <button type="button" onClick={() => owner.clear()}>
                {t('accountControls.clear')}
              </button>
              {view.copied && <p role="status">{t('accountControls.copied')}</p>}
            </>
          )}
        </>
      )}
      {client && view.error && (
        <p role="alert">
          {t(
            view.error === 'export'
              ? 'accountControls.exportError'
              : view.error === 'delete'
                ? 'accountControls.deleteError'
                : 'accountControls.copyError',
          )}
        </p>
      )}
    </section>
  );
}
