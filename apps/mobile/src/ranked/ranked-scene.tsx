import { DiscoveryIntroduction } from '../mystery-introduction';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import type { RankedClient, RankedClientState } from './ranked-client';
import { RewardOffer } from '../rewards/reward-offer';
import type { RewardFlow } from '../rewards/reward-flow';
import { SavedPendingView } from './saved-pending-view';
import type { SavedPendingClient } from './saved-pending-client';
import './ranked-scene.css';
import { operationMessageKeys } from '../operations/operation-failure';
import type { EffectKind } from '@crystal-path-infinity/game-core';
import { MysteryEffects, PactPanel, EffectGlyph } from '../mystery-effects';
import { effectCopy } from '../mystery.messages';
import { HintCounter } from '../resource-feedback';
import { DeathClockBadge, MysteryRhythmBadge, MysteryCube } from '../mystery-box';
import { useCommerce } from '../commerce/commerce-context';

const EMPTY: RankedClientState = {
  phase: 'unavailable',
  run: null,
  online: true,
  canRetry: false,
  rejected: false,
};

/** Only an approved, account-scoped client can enable this view. No guest state enters it. */
export function RankedScene({
  client,
  online,
  recoverRunId,
  onLeave,
  rewardFlow = null,
  savedPendingClient = null,
}: {
  client: RankedClient | null;
  online: boolean;
  /** Supplied by a trusted account recovery list, never a local practice checkpoint. */
  recoverRunId?: string;
  onLeave: () => void;
  rewardFlow?: RewardFlow | null;
  savedPendingClient?: SavedPendingClient | null;
}) {
  const { t, number, locale } = useLanguage();
  const commerce = useCommerce();
  const [observed, setObserved] = useState<{
    client: RankedClient;
    state: RankedClientState;
  } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const subscribeReward = useCallback(
    (observer: () => void) => rewardFlow?.subscribe(observer) ?? (() => {}),
    [rewardFlow],
  );
  const readReward = useCallback(() => rewardFlow?.snapshot() ?? null, [rewardFlow]);
  const rewardState = useSyncExternalStore(subscribeReward, readReward, readReward);
  const state = observed?.client === client ? observed.state : (client?.snapshot() ?? EMPTY);
  const run = state.run;
  const currentRunId = run?.runId ?? recoverRunId;
  const ready = !!client && online && state.phase === 'ready' && !interrupted;
  const rewardBound = !!run && rewardFlow?.runId === run.runId;
  const rewardBlocked = rewardBound && rewardState?.inputBlocked === true;
  const playing = ready && run?.status === 'playing' && !run.paused && !confirm && !rewardBlocked;
  const busy = state.phase === 'pending';
  const resourceWindow = !!run?.economy && (run.paused || run.status === 'dead');
  useEffect(() => {
    if (resourceWindow) void commerce.flow?.refreshWallet();
  }, [resourceWindow, commerce.flow]);
  async function spend(resource: 'sp' | 'hints' | 'credit', amount: number) {
    if (!client?.spendResource || !run || client.snapshot().run?.runId !== run.runId) return;
    if (await client.spendResource(resource, amount)) await commerce.flow?.refreshWallet();
  }

  useEffect(() => {
    if (!client) return;
    let active = true;
    const update = () => {
      if (!active) return;
      const next = client.snapshot();
      setObserved({ client, state: next });
      if (next.run === null) {
        setInterrupted(false);
        setConfirm(false);
      }
    };
    const unsubscribe = client.subscribe(update);
    void Promise.resolve().then(update);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    client?.setOnline(online);
  }, [client, online]);
  useEffect(() => {
    rewardFlow?.setOnline(online);
  }, [rewardFlow, online]);
  useEffect(() => {
    if (rewardFlow && rewardBound && online) void rewardFlow.recover();
  }, [
    rewardFlow,
    rewardBound,
    online,
    run?.status,
    run?.death?.id,
    run?.revivesGranted,
    run?.revivesApplied,
    run?.rewardPending,
  ]);
  useEffect(() => {
    if (!client) return;
    const pause = () => {
      const latest = client.snapshot();
      if (latest.run && latest.run.status !== 'finished') {
        setInterrupted(true);
        void client.command({ type: 'pause' });
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
      // Leave preserves an authoritative checkpoint; it never sends End run.
      void client.command({ type: 'pause' });
    };
  }, [client]);
  useEffect(() => {
    if (!client || !online || interrupted || rewardBlocked) return;
    const timer = window.setInterval(() => {
      const latest = client.snapshot();
      if (
        document.visibilityState !== 'hidden' &&
        latest.phase === 'ready' &&
        latest.run?.status === 'playing' &&
        !latest.run.paused &&
        !(rewardFlow?.runId === latest.run.runId && rewardFlow.snapshot().inputBlocked)
      ) {
        void client.command({ type: 'heartbeat' });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [client, online, interrupted, rewardBlocked, rewardFlow]);

  const recover = async (takeover = false) => {
    if (!client) return;
    const runId = currentRunId ?? (await client.lookupActive());
    if (!runId) return;
    await client.recover(runId, takeover);
    if (client.snapshot().phase === 'ready' || client.snapshot().phase === 'finished')
      setInterrupted(false);
  };
  const recoverSaved = async (runId: string) => {
    if (!client || rewardFlow?.snapshot().fullscreen) return;
    const active = client.snapshot().run;
    if (active && active.status !== 'finished') return;
    await client.recover(runId, false);
    const result = client.snapshot();
    if (result.phase !== 'ready' || result.run?.runId !== runId)
      throw new Error('Saved run recovery unavailable');
    setInterrupted(false);
  };
  const leave = async () => {
    if (rewardFlow?.snapshot().fullscreen) return;
    if (run && client?.snapshot().run?.runId !== run.runId) return;
    if (
      client &&
      run?.status === 'dead' &&
      rewardBound &&
      (rewardState?.phase === 'earned_pending' || rewardState?.phase === 'granted')
    ) {
      await client.archivePending(run.runId);
    } else await client?.command({ type: 'pause' });
    onLeave();
  };
  const action = (type: 'choose' | 'hint' | 'mystery', side?: 'left' | 'right') => {
    if (
      !client ||
      !run ||
      client.snapshot().run?.runId !== run.runId ||
      !playing ||
      (rewardFlow?.runId === run.runId && rewardFlow.snapshot().inputBlocked)
    )
      return;
    const row = run.currentRow;
    const life = run.revivesApplied;
    if (type === 'choose' && side) void client.command({ type, side, row, life });
    else if (type !== 'choose') void client.command({ type, row, life });
  };
  const status =
    state.problem && online
      ? operationMessageKeys[state.problem]
      : state.phase === 'unavailable'
        ? 'ranked.unavailable'
        : !online || state.phase === 'offline'
          ? 'ranked.offline'
          : busy
            ? 'ranked.pending'
            : state.phase === 'lease_lost'
              ? 'ranked.leaseLost'
              : interrupted || state.phase === 'recovery'
                ? 'ranked.recovery'
                : state.phase === 'retry' || state.phase === 'error'
                  ? 'ranked.error'
                  : run?.status === 'finished'
                    ? 'ranked.finished'
                    : run?.rewardPending
                      ? 'ranked.pendingReward'
                      : run?.status === 'dead'
                        ? 'ranked.dead'
                        : run?.paused
                          ? 'ranked.paused'
                          : 'ranked.rules';

  return (
    <section className="cpi-ranked-scene" aria-labelledby="cpi-ranked-title" aria-busy={busy}>
      <header className="cpi-ranked-heading">
        <h2 id="cpi-ranked-title">{t('ranked.title')}</h2>
        <button
          type="button"
          onClick={() => {
            void leave();
          }}
        >
          {t('ranked.leave')}
        </button>
      </header>
      <p className="cpi-ranked-status" role="status" aria-live="polite">
        {t(status)}
      </p>
      {state.rejected && <p role="alert">{t('ranked.rejected')}</p>}
      {savedPendingClient && (
        <SavedPendingView
          client={savedPendingClient}
          online={online}
          canRecover={
            (!run || run.status === 'finished') &&
            !rewardState?.fullscreen &&
            !busy &&
            !state.problem
          }
          onRecover={recoverSaved}
        />
      )}
      {client &&
        ((!run && state.phase === 'idle') ||
          (run?.status === 'finished' && state.phase === 'finished')) && (
          <button
            className="cpi-ranked-primary"
            type="button"
            disabled={!online || rewardState?.fullscreen === true}
            onClick={() => {
              void client.start();
            }}
          >
            {t('ranked.start')}
          </button>
        )}
      {state.canRetry && (
        <button
          type="button"
          onClick={() => {
            void client?.retry();
          }}
        >
          {t(state.phase === 'blocked' ? 'operations.recheck' : 'ranked.retry')}
        </button>
      )}
      {client &&
        online &&
        !busy &&
        state.phase !== 'blocked' &&
        state.phase !== 'unavailable' &&
        (interrupted ||
          state.phase === 'recovery' ||
          state.phase === 'lease_lost' ||
          state.phase === 'retry' ||
          state.phase === 'error' ||
          !run) && (
          <div className="cpi-ranked-actions">
            <button
              type="button"
              onClick={() => {
                void recover();
              }}
            >
              {t('ranked.recover')}
            </button>
            {state.phase === 'lease_lost' && (
              <button
                type="button"
                onClick={() => {
                  void recover(true);
                }}
              >
                {t('ranked.takeover')}
              </button>
            )}
          </div>
        )}
      {run && (
        <>
          <div className="cpi-ranked-resources">
            {run.economy?.assisted && <p>{t('ranked.assisted')}</p>}
            <p>{t('ranked.confirmed', { row: number(run.lastClearedRow) })}</p>
            <p>{t('ranked.sp', { sp: number(run.sp) })}</p>
            <p>
              {t('ranked.hints', { count: number(run.hints) })}{' '}
              <HintCounter count={run.hints} cue={{ id: `ranked:${run.hints}`, delta: 0 }} />
            </p>
          </div>
          {resourceWindow && client?.spendResource && commerce.snapshot.wallet && (
            <div className="cpi-ranked-actions">
              {run.status === 'playing' && (
                <>
                  <button
                    type="button"
                    disabled={
                      !ready ||
                      busy ||
                      commerce.snapshot.phase !== 'ready' ||
                      !commerce.snapshot.wallet.sp ||
                      run.economy.reserveSpent >= 200 ||
                      !!run.discovery?.introduction ||
                      run.pact?.phase === 'offered'
                    }
                    onClick={() =>
                      void spend(
                        'sp',
                        Math.min(20, commerce.snapshot.wallet!.sp, 200 - run.economy!.reserveSpent),
                      )
                    }
                  >
                    {t('ranked.reserveSp', {
                      amount: Math.min(
                        20,
                        commerce.snapshot.wallet.sp,
                        200 - run.economy.reserveSpent,
                      ),
                    })}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !ready ||
                      busy ||
                      commerce.snapshot.phase !== 'ready' ||
                      !commerce.snapshot.wallet.hints ||
                      !!run.discovery?.introduction ||
                      run.pact?.phase === 'offered'
                    }
                    onClick={() => void spend('hints', 1)}
                  >
                    {t('ranked.reserveHint')}
                  </button>
                </>
              )}
              {run.status === 'dead' && (
                <button
                  type="button"
                  disabled={
                    !ready ||
                    busy ||
                    commerce.snapshot.phase !== 'ready' ||
                    !commerce.snapshot.wallet.credits ||
                    run.rewardPending ||
                    run.revivesGranted !== run.revivesApplied ||
                    rewardBlocked
                  }
                  onClick={() => void spend('credit', 1)}
                >
                  {t('ranked.creditContinue')}
                </button>
              )}
            </div>
          )}
          {run.status === 'playing' && (
            <>
              <h3 className="cpi-ranked-row">{t('ranked.row', { row: number(run.currentRow) })}</h3>
              <MysteryRhythmBadge rhythm={run.mysteryRhythm} activeTimeMs={run.activeTimeMs} />
              <DeathClockBadge
                clock={run.deathClock}
                activeTimeMs={run.activeTimeMs}
                offered={run.pact?.phase === 'offered' || !!run.discovery?.introduction}
              />
              <DiscoveryIntroduction
                discovery={run.discovery}
                activeTimeMs={run.activeTimeMs}
                rulesetVersion={run.rulesetVersion}
              />
              <PactPanel
                sp={run.sp}
                rulesetVersion={run.rulesetVersion}
                activeTimeMs={run.activeTimeMs}
                pact={run.pact}
                hints={run.hints}
                revealed={run.current.revealedSafeSide !== null || !!run.current.noSafeTile}
                disabled={!playing}
                onChoose={(option) => {
                  if (
                    !playing ||
                    !client ||
                    client.snapshot().run?.runId !== run.runId ||
                    (rewardFlow?.runId === run.runId && rewardFlow.snapshot().inputBlocked)
                  )
                    return;
                  void client.command({
                    type: 'pact',
                    row: run.currentRow,
                    life: run.revivesApplied,
                    option,
                  });
                }}
              />
              <div className="cpi-ranked-bridge" dir="ltr">
                {(['left', 'right'] as const).map((side) => (
                  <button
                    type="button"
                    key={side}
                    className={
                      'cpi-ranked-pane' +
                      (run.current.revealedSafeSide === side ? ' cpi-ranked-pane-revealed' : '')
                    }
                    disabled={!playing || run.pact?.phase === 'offered'}
                    onClick={() => action('choose', side)}
                    aria-label={t(side === 'left' ? 'game.leftTile' : 'game.rightTile', {
                      row: number(run.currentRow),
                    })}
                  >
                    <span aria-hidden="true">◇</span>
                    {t(side === 'left' ? 'ranked.left' : 'ranked.right')}
                  </button>
                ))}
              </div>
              {run.current.revealedSafeSide && (
                <p>
                  {t('ranked.reveal', {
                    side: t(
                      run.current.revealedSafeSide === 'left'
                        ? 'tutorial.leftGlass'
                        : 'tutorial.rightGlass',
                    ),
                  })}
                </p>
              )}
              {run.current.noSafeTile && (
                <p role="status">
                  {locale === 'bg'
                    ? 'И двете плочки са счупени. Подсказката е запазена.'
                    : 'Both tiles are broken. Your hint was kept.'}
                </p>
              )}
              <div className="cpi-ranked-actions">
                <button
                  type="button"
                  disabled={
                    !playing ||
                    run.hints === 0 ||
                    run.current.revealedSafeSide !== null ||
                    run.current.noSafeTile ||
                    run.pact?.phase === 'offered' ||
                    (run.pact?.kind === 'false_oracle' && run.pact.phase === 'active')
                  }
                  onClick={() => action('hint')}
                >
                  {t('ranked.hint')}
                </button>
                {run.current.hasMystery && (
                  <button
                    type="button"
                    disabled={
                      !playing ||
                      run.pact?.phase === 'offered' ||
                      run.current.mysteryOutcome !== null
                    }
                    onClick={() => action('mystery')}
                  >
                    {t('ranked.mystery')}
                    {run.current.mysteryTier && (
                      <span style={{ display: 'inline-block', width: '2rem', height: '2rem' }}>
                        <MysteryCube tier={run.current.mysteryTier} />
                      </span>
                    )}
                  </button>
                )}
              </div>
              {ready && (
                <button
                  type="button"
                  disabled={confirm || rewardBlocked}
                  onClick={() => {
                    if (client?.snapshot().run?.runId !== run.runId) return;
                    if (rewardFlow?.runId === run.runId && rewardFlow.snapshot().inputBlocked)
                      return;
                    void client?.command({ type: run.paused ? 'resume' : 'pause' });
                  }}
                >
                  {t(run.paused ? 'ranked.resume' : 'ranked.pause')}
                </button>
              )}
            </>
          )}
          <MysteryEffects
            effects={run.effects}
            activeTimeMs={run.activeTimeMs}
            rulesetVersion={run.rulesetVersion}
          />
          {run.current.mysteryOutcome && !run.pact && (
            <details className="cpi-force">
              <summary>
                <EffectGlyph kind={run.current.mysteryOutcome as EffectKind} />
                <strong>
                  {effectCopy(locale, run.current.mysteryOutcome as EffectKind).title}
                </strong>
              </summary>
              <p>{effectCopy(locale, run.current.mysteryOutcome as EffectKind).detail}</p>
            </details>
          )}
          {run.status === 'dead' && !confirm && (
            <RewardOffer
              flow={rewardBound ? rewardFlow : null}
              online={online}
              onLeave={() => {
                void leave();
              }}
              onEnd={() => {
                if (client?.snapshot().run?.runId !== run.runId) return;
                if (!rewardFlow?.snapshot().canEnd) return;
                setConfirm(true);
                void client?.command({ type: 'pause' });
              }}
            />
          )}
          {ready &&
            run.status !== 'finished' &&
            !run.rewardPending &&
            !confirm &&
            !(run.status === 'dead' && rewardBound) &&
            !rewardBlocked && (
              <button
                className="cpi-ranked-end"
                type="button"
                onClick={() => {
                  if (client?.snapshot().run?.runId !== run.runId) return;
                  setConfirm(true);
                  void client?.command({ type: 'pause' });
                }}
              >
                {t('ranked.end')}
              </button>
            )}
          {confirm && run.status !== 'finished' && (
            <div
              className="cpi-ranked-confirm"
              role="alertdialog"
              aria-labelledby="cpi-ranked-end-title"
            >
              <h3 id="cpi-ranked-end-title">{t('game.confirmTitle')}</h3>
              <p>{t('game.confirmCleared', { row: number(run.lastClearedRow) })}</p>
              <button type="button" disabled={busy} onClick={() => setConfirm(false)}>
                {t('ranked.cancel')}
              </button>
              <button
                type="button"
                disabled={
                  !ready ||
                  run.rewardPending ||
                  (rewardBound && rewardState?.canEnd !== true && rewardBlocked)
                }
                onClick={() => {
                  if (client?.snapshot().run?.runId !== run.runId) return;
                  if (
                    rewardBound &&
                    rewardFlow?.snapshot().inputBlocked &&
                    !rewardFlow.snapshot().canEnd
                  )
                    return;
                  setConfirm(false);
                  void client?.command({ type: 'end' });
                }}
              >
                {t('ranked.confirmEnd')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
