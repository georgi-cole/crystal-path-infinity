import { useState } from 'react';
import { getReviveSp, getRuleset, RESERVE_SP_PER_RUN } from '@crystal-path-infinity/game-core';
import type { RunState, TestResource } from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { useTestStore } from './store-context';

export function RunReserves({
  state,
  busy,
  onUse,
  message,
  onOpenStore,
}: {
  state: RunState;
  busy: boolean;
  onUse: (resource: TestResource, amount: number) => Promise<boolean>;
  message: string;
  onOpenStore?: () => void;
}) {
  const { t, number } = useLanguage();
  const { snapshot, error } = useTestStore();
  const [confirmation, setConfirmation] = useState<{
    resource: TestResource;
    amount: number;
    label: string;
  } | null>(null);
  const economy = state.storeTest;
  if (!economy || state.status === 'finished') return null;
  const refill = Math.max(
    0,
    Math.min(
      100,
      (getRuleset(state.rulesetVersion).maxSp ?? Number.MAX_SAFE_INTEGER) - state.sp,
      RESERVE_SP_PER_RUN - economy.reserveSpent,
      snapshot.sp,
    ),
  );
  const dead = state.status === 'dead';
  const sp = dead ? getReviveSp(state.revivesApplied + 1, state.rulesetVersion) : 0;
  const request = (resource: TestResource, amount: number, label: string) =>
    setConfirmation({ resource, amount, label });
  return (
    <section
      className={'cpi-resource-panel' + (dead ? ' is-continuation' : '')}
      aria-label={t('vault.manage')}
    >
      <h3>{t(dead ? 'vault.continuations' : 'vault.manage')}</h3>
      <div className="cpi-resource-balances">
        {!dead && <span>{number(snapshot.sp)} SP</span>}
        <span>{t('vault.creditAmount', { count: number(snapshot.credits) })}</span>
        {!dead && <span>{t('vault.hintAmount', { count: number(snapshot.hints) })}</span>}
      </div>
      <small>{t('vault.test')}</small>
      {confirmation ? (
        <div className="cpi-resource-confirm" role="group" aria-label={confirmation.label}>
          <p>{confirmation.label}</p>
          <p>{t('vault.spendDetail')}</p>
          <div className="cpi-resource-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void onUse(confirmation.resource, confirmation.amount).then((success) => {
                  if (success) setConfirmation(null);
                });
              }}
            >
              {t('vault.confirmUse')}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>
              {t('vault.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {dead ? (
            <>
              <p>
                {t('vault.continueCount', {
                  next: number(state.revivesApplied + 1),
                  credits: number(snapshot.credits),
                })}
              </p>
              {state.revivesApplied >= 10 && <p>{t('vault.extra')}</p>}
              <div className="cpi-resource-actions">
                {(snapshot.credits > 0 || state.revivesApplied >= 10) && (
                  <button
                    type="button"
                    disabled={busy || snapshot.credits < 1 || !!error}
                    onClick={() => request('credit', 1, t('vault.useCredit', { sp: number(sp) }))}
                  >
                    {t('vault.useCredit', { sp: number(sp) })}
                  </button>
                )}
                {snapshot.credits === 0 && onOpenStore && (
                  <button type="button" disabled={busy || !!error} onClick={onOpenStore}>
                    {t('vault.shopCredits')}
                  </button>
                )}
                {state.revivesApplied < 10 && (
                  <button
                    type="button"
                    disabled={busy || !!error}
                    onClick={() => {
                      void onUse('ad', 1);
                    }}
                  >
                    {t('vault.testAd', { sp: number(sp) })}
                  </button>
                )}
              </div>
              {snapshot.credits === 0 && state.revivesApplied >= 10 && (
                <p>{t('vault.emptyCredits')}</p>
              )}
            </>
          ) : (
            <>
              <div className="cpi-resource-actions">
                <button
                  type="button"
                  disabled={busy || refill === 0 || !!error}
                  onClick={() =>
                    request('sp', refill, t('vault.refill', { amount: number(refill) }))
                  }
                >
                  {t('vault.refill', { amount: number(refill) })}
                </button>
                <button
                  type="button"
                  disabled={busy || snapshot.hints < 1 || !!error}
                  onClick={() => request('hints', 1, t('vault.loadHint'))}
                >
                  {t('vault.loadHint')}
                </button>
              </div>
              <small>{t('vault.spRemaining', { amount: number(economy.reserveSpent) })}</small>
            </>
          )}
        </>
      )}
      {(error || message) && <p role="status">{error ?? message}</p>}
    </section>
  );
}
