import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import type { RankedClient, RankedClientState } from './ranked-client';
import { RewardOffer } from '../rewards/reward-offer';
import type { RewardFlow } from '../rewards/reward-flow';
import { SavedPendingView } from './saved-pending-view';
import type { SavedPendingClient } from './saved-pending-client';
import './ranked-scene.css';
import { operationMessageKeys } from '../operations/operation-failure';
import { useCommerce } from '../commerce/commerce-context';
import { canUseCreditFromReward, leaveVerifiedRun } from './ranked-leave';
import { useSoundtrack } from '../soundtrack';
import { RankedBoard } from './ranked-board';
import { useThemeId } from '../store-context';
import { WorldOutcomeHero } from '../world-treasures';
import type { PactOption } from '@crystal-path-infinity/game-core';

import { enterRankedPlay } from './ranked-entry';

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
  music = false,
  autoStart = false,
  accountScope,
  reducedMotion = false,
  onViewRankings,
  onPractice,
  recoverRunId,
  onLeave,
  rewardFlow = null,
  savedPendingClient = null,
}: {
  client: RankedClient | null;
  online: boolean;
  music?: boolean;
  autoStart?: boolean;
  accountScope?: object | null;
  reducedMotion?: boolean;
  onViewRankings?: () => void;
  onPractice?: () => void;
  /** Supplied by a trusted account recovery list, never a local practice checkpoint. */
  recoverRunId?: string;
  onLeave: () => void;
  rewardFlow?: RewardFlow | null;
  savedPendingClient?: SavedPendingClient | null;
}) {
  const { t, number } = useLanguage();
  const theme = useThemeId();
  const commerce = useCommerce();
  const [observed, setObserved] = useState<{
    client: RankedClient;
    scope?: object | null;
    state: RankedClientState;
  } | null>(null);
  const entry = useRef<object | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const subscribeReward = useCallback(
    (observer: () => void) => rewardFlow?.subscribe(observer) ?? (() => {}),
    [rewardFlow],
  );
  const readReward = useCallback(() => rewardFlow?.snapshot() ?? null, [rewardFlow]);
  const rewardState = useSyncExternalStore(subscribeReward, readReward, readReward);
  const state =
    observed?.client === client && observed.scope === accountScope
      ? observed.state
      : (client?.snapshot() ?? EMPTY);
  const run = state.run;
  const currentRunId = run?.runId ?? recoverRunId;
  const ready = !!client && online && state.phase === 'ready' && !interrupted;
  const rewardBound = !!run && rewardFlow?.runId === run.runId;
  const rewardBlocked = rewardBound && rewardState?.inputBlocked === true;
  const playing = ready && run?.status === 'playing' && !run.paused && !confirm && !rewardBlocked;
  const busy = state.phase === 'pending';
  useSoundtrack(
    run ? (run.status === 'playing' ? 'run' : 'ended') : null,
    music &&
      !!run &&
      !rewardState?.fullscreen &&
      (run.status !== 'playing' || (online && !run.paused && !confirm && !interrupted)),
    music && run?.status === 'playing',
  );
  const resourceWindow = !!run?.economy && (run.paused || run.status === 'dead');
  useEffect(() => {
    if (resourceWindow) void commerce.flow?.refreshWallet();
  }, [resourceWindow, commerce.flow]);
  async function spend(resource: 'sp' | 'hints' | 'credit', amount: number) {
    if (!client?.spendResource || !run || client.snapshot().run?.runId !== run.runId) return;
    if (await client.spendResource(resource, amount)) {
      if (resource === 'credit' && rewardFlow?.runId === run.runId) await rewardFlow.recover();
    }
    await commerce.flow?.refreshWallet();
  }

  useEffect(() => {
    if (!client) return;
    let active = true;
    const update = () => {
      if (!active) return;
      const next = client.snapshot();
      setObserved({ client, scope: accountScope, state: next });
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
  }, [accountScope, client]);
  useEffect(() => {
    client?.setOnline(online);
  }, [client, online]);
  useEffect(() => {
    if (!client) return;
    const current = {};
    entry.current = current;
    if (autoStart)
      void Promise.resolve().then(() => enterRankedPlay(client, () => entry.current === current));
    return () => {
      entry.current = null;
    };
  }, [accountScope, autoStart, client]);
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
      if (latest.run?.status === 'playing' && !latest.run.paused) {
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
      const latest = client.snapshot().run;
      if (latest?.status === 'playing' && !latest.paused) void client.command({ type: 'pause' });
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
    if (!client || !run) {
      onLeave();
      return;
    }
    if (
      await leaveVerifiedRun(client, run.runId, () =>
        rewardFlow?.runId === run.runId ? rewardFlow.snapshot() : null,
      )
    )
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
                        ? 'game.noticeDead'
                        : run?.paused
                          ? 'ranked.paused'
                          : 'ranked.rules';

  const needsRecovery =
    interrupted ||
    state.phase === 'recovery' ||
    state.phase === 'lease_lost' ||
    state.phase === 'retry' ||
    state.phase === 'error';
  const retry = state.canRetry && (
    <button type="button" onClick={() => void client?.retry()}>
      {t(state.phase === 'blocked' ? 'operations.recheck' : 'ranked.retry')}
    </button>
  );
  const recovery = online && !busy && needsRecovery && !state.canRetry && (
    <>
      <button type="button" data-cpi-overlay-primary onClick={() => void recover()}>
        {t('ranked.recover')}
      </button>
      {state.phase === 'lease_lost' && (
        <button type="button" onClick={() => void recover(true)}>
          {t('ranked.takeover')}
        </button>
      )}
    </>
  );
  const canStart =
    !!client &&
    online &&
    !busy &&
    !rewardState?.fullscreen &&
    ((!run && state.phase === 'idle') ||
      (run?.status === 'finished' && state.phase === 'finished'));
  const start = canStart && (
    <button
      className="cpi-ranked-primary"
      type="button"
      data-cpi-overlay-primary
      onClick={() => {
        const current = entry.current;
        if (client && current) void enterRankedPlay(client, () => entry.current === current);
      }}
    >
      {t('ranked.start')}
    </button>
  );
  const leaveButton = (
    <button type="button" disabled={rewardState?.fullscreen} onClick={() => void leave()}>
      {t(run?.status === 'finished' ? 'rewards.leave' : 'ranked.leave')}
    </button>
  );

  if (!run) {
    return (
      <main className="cpi-ranked-lobby cps-shell" data-world={theme}>
        <section
          className="cpi-ranked-scene cpi-menu-panel"
          aria-labelledby="cpi-ranked-title"
          aria-busy={busy}
        >
          <h1 id="cpi-ranked-title">{t('ranked.title')}</h1>
          <p role="status">{t(status)}</p>
          <div className="cpi-ranked-actions">
            {start}
            {retry}
            {recovery}
            {leaveButton}
          </div>
          {onPractice && !busy && (
            <button type="button" onClick={onPractice}>
              {t('menu.practiceInstead')}
            </button>
          )}
          {savedPendingClient && (
            <details className="cpi-ranked-saved">
              <summary>{t('savedPending.title')}</summary>
              <SavedPendingView
                client={savedPendingClient}
                online={online}
                canRecover={!busy && !state.problem}
                onRecover={recoverSaved}
              />
            </details>
          )}
        </section>
      </main>
    );
  }

  const pause = () => {
    if (client?.snapshot().run?.runId !== run.runId || !ready || rewardBlocked) return;
    void client.command({ type: run.paused ? 'resume' : 'pause' });
  };
  const requestEnd = () => {
    if (
      client?.snapshot().run?.runId !== run.runId ||
      !ready ||
      run.rewardPending ||
      (rewardBlocked && rewardState?.canEnd !== true)
    )
      return;
    setConfirm(true);
    if (run.status === 'playing' && !run.paused) void client.command({ type: 'pause' });
  };
  const end = () => {
    if (
      client?.snapshot().run?.runId !== run.runId ||
      !ready ||
      run.rewardPending ||
      (rewardBound && rewardFlow?.snapshot().inputBlocked && !rewardFlow.snapshot().canEnd)
    )
      return;
    setConfirm(false);
    void client.command({ type: 'end' });
  };
  const pact = (option: PactOption) => {
    if (
      playing &&
      client?.snapshot().run?.runId === run.runId &&
      !(rewardFlow?.runId === run.runId && rewardFlow.snapshot().inputBlocked)
    )
      void client.command({ type: 'pact', row: run.currentRow, life: run.revivesApplied, option });
  };
  const overlay =
    run.status !== 'playing' ||
    run.paused ||
    confirm ||
    needsRecovery ||
    !online ||
    state.phase === 'blocked' ||
    state.phase === 'unavailable';
  const outcomeTitle = confirm
    ? 'game.confirmTitle'
    : run.status === 'finished'
      ? 'game.complete'
      : run.status === 'dead'
        ? 'game.deathTitle'
        : run.paused
          ? 'game.paused'
          : 'ranked.title';
  const rewardsVisible =
    run.status === 'dead' && rewardBound && rewardState?.phase !== 'playing' && !confirm;
  const outcomeHeading = <h2 id="cpi-ranked-outcome">{t(outcomeTitle)}</h2>;
  const resources = resourceWindow &&
    run?.economy &&
    client?.spendResource &&
    commerce.snapshot.wallet && (
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
                amount: Math.min(20, commerce.snapshot.wallet.sp, 200 - run.economy.reserveSpent),
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
              !canUseCreditFromReward(rewardState)
            }
            onClick={() => void spend('credit', 1)}
          >
            {t('ranked.creditContinue')}
          </button>
        )}
      </div>
    );

  return (
    <RankedBoard
      run={run}
      interactive={playing && !overlay}
      canPause={ready && !confirm && !rewardBlocked && run.status === 'playing'}
      reducedMotion={reducedMotion}
      notice={t(status)}
      onChoose={(side) => action('choose', side)}
      onHint={() => action('hint')}
      onMystery={() => action('mystery')}
      onPause={pause}
      onPact={pact}
    >
      {overlay ? (
        <div className="cpi-overlay cpi-crossing-overlay">
          <section
            className="cpi-overlay-card cpi-run-outcome cpi-ranked-scene"
            role={confirm ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="cpi-ranked-outcome"
            aria-busy={busy}
          >
            {theme !== 'obsidian' && !confirm && run.status !== 'playing' ? (
              <WorldOutcomeHero theme={theme} finished={run.status === 'finished'}>
                {outcomeHeading}
              </WorldOutcomeHero>
            ) : (
              <header className="cpi-dialog-heading">{outcomeHeading}</header>
            )}
            {run.status !== 'playing' && (
              <div className="cpi-result-score">
                <span>{t('game.rowsCleared')}</span>
                <strong>{number(run.lastClearedRow)}</strong>
              </div>
            )}
            <p role="status">{t(status)}</p>
            {state.rejected && <p role="alert">{t('ranked.rejected')}</p>}
            {confirm ? (
              <>
                <p>{t('game.confirmCleared', { row: number(run.lastClearedRow) })}</p>
                <div className="cpi-overlay-actions">
                  <button
                    type="button"
                    data-cpi-overlay-primary
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    {t('ranked.cancel')}
                  </button>
                  <button
                    type="button"
                    className="cpi-run-danger-action"
                    disabled={!ready || run.rewardPending}
                    onClick={end}
                  >
                    {t('ranked.confirmEnd')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {run.paused && run.status === 'playing' && ready && (
                  <div className="cpi-overlay-actions">
                    <button type="button" data-cpi-overlay-primary onClick={pause}>
                      {t('ranked.resume')}
                    </button>
                  </div>
                )}
                {resources}
                {rewardsVisible && (
                  <RewardOffer
                    flow={rewardFlow}
                    online={online}
                    onLeave={() => void leave()}
                    onEnd={requestEnd}
                  />
                )}
                <div className="cpi-overlay-actions">
                  {retry}
                  {recovery}
                  {start}
                  {run.status === 'finished' && onViewRankings && (
                    <button type="button" onClick={onViewRankings}>
                      {t('general.rankings')}
                    </button>
                  )}
                  {!rewardsVisible && leaveButton}
                  {ready &&
                    run.status !== 'finished' &&
                    !run.rewardPending &&
                    !rewardBlocked &&
                    !rewardsVisible && (
                      <button type="button" className="cpi-run-danger-action" onClick={requestEnd}>
                        {t('ranked.end')}
                      </button>
                    )}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </RankedBoard>
  );
}
