import { useEffect, useState } from 'react';
import { useLanguage } from '../language-context';
import type { RankedClient, RankedClientState } from './ranked-client';
import './ranked-scene.css';

const EMPTY: RankedClientState = {
  phase: 'unavailable',
  run: null,
  online: true,
  canRetry: false,
  rejected: false,
};
const effectKeys = {
  shield_5s: 'game.effectShield',
  regen_5s: 'game.effectRegen',
  lucky_5s: 'game.effectLucky',
  fragility_5s: 'game.effectFragile',
  drain_5s: 'game.effectDrain',
  inversion_5s: 'game.effectInversion',
} as const;

/** Only an approved, account-scoped client can enable this view. No guest state enters it. */
export function RankedScene({
  client,
  online,
  recoverRunId,
  onLeave,
}: {
  client: RankedClient | null;
  online: boolean;
  /** Supplied by a trusted account recovery list, never a local practice checkpoint. */
  recoverRunId?: string;
  onLeave: () => void;
}) {
  const { t, number } = useLanguage();
  const [observed, setObserved] = useState<{
    client: RankedClient;
    state: RankedClientState;
  } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const state = observed?.client === client ? observed.state : (client?.snapshot() ?? EMPTY);
  const run = state.run;
  const currentRunId = run?.runId ?? recoverRunId;
  const ready = !!client && online && state.phase === 'ready' && !interrupted;
  const playing = ready && run?.status === 'playing' && !run.paused && !confirm;
  const busy = state.phase === 'pending';

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
    if (!client || !online || interrupted) return;
    const timer = window.setInterval(() => {
      const latest = client.snapshot();
      if (
        document.visibilityState !== 'hidden' &&
        latest.phase === 'ready' &&
        latest.run?.status === 'playing' &&
        !latest.run.paused
      ) {
        void client.command({ type: 'heartbeat' });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [client, online, interrupted]);

  const recover = async (takeover = false) => {
    if (!client) return;
    const runId = currentRunId ?? (await client.lookupActive());
    if (!runId) return;
    await client.recover(runId, takeover);
    if (client.snapshot().phase === 'ready' || client.snapshot().phase === 'finished')
      setInterrupted(false);
  };
  const leave = async () => {
    await client?.command({ type: 'pause' });
    onLeave();
  };
  const action = (type: 'choose' | 'hint' | 'mystery', side?: 'left' | 'right') => {
    if (!client || !run || !playing) return;
    const row = run.currentRow;
    const life = run.revivesApplied;
    if (type === 'choose' && side) void client.command({ type, side, row, life });
    else if (type !== 'choose') void client.command({ type, row, life });
  };
  const status =
    state.phase === 'unavailable'
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
      {client &&
        ((!run && state.phase === 'idle') ||
          (run?.status === 'finished' && state.phase === 'finished')) && (
          <button
            className="cpi-ranked-primary"
            type="button"
            disabled={!online}
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
          {t('ranked.retry')}
        </button>
      )}
      {client &&
        online &&
        !busy &&
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
            <p>{t('ranked.confirmed', { row: number(run.lastClearedRow) })}</p>
            <p>{t('ranked.sp', { sp: number(run.sp) })}</p>
            <p>{t('ranked.hints', { count: number(run.hints) })}</p>
          </div>
          {run.status === 'playing' && (
            <>
              <h3 className="cpi-ranked-row">{t('ranked.row', { row: number(run.currentRow) })}</h3>
              <div className="cpi-ranked-bridge" dir="ltr">
                {(['left', 'right'] as const).map((side) => (
                  <button
                    type="button"
                    key={side}
                    className={
                      'cpi-ranked-pane' +
                      (run.current.revealedSafeSide === side ? ' cpi-ranked-pane-revealed' : '')
                    }
                    disabled={!playing}
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
              <div className="cpi-ranked-actions">
                <button
                  type="button"
                  disabled={!playing || run.hints === 0 || run.current.revealedSafeSide !== null}
                  onClick={() => action('hint')}
                >
                  {t('ranked.hint')}
                </button>
                {run.current.hasMystery && (
                  <button
                    type="button"
                    disabled={!playing || run.current.mysteryOutcome !== null}
                    onClick={() => action('mystery')}
                  >
                    {t('ranked.mystery')}
                  </button>
                )}
              </div>
              {ready && (
                <button
                  type="button"
                  disabled={confirm}
                  onClick={() => {
                    void client?.command({ type: run.paused ? 'resume' : 'pause' });
                  }}
                >
                  {t(run.paused ? 'ranked.resume' : 'ranked.pause')}
                </button>
              )}
            </>
          )}
          {run.effects.length > 0 && (
            <div className="cpi-ranked-effects">
              <h3>{t('ranked.effects')}</h3>
              <ul>
                {run.effects.map((effect) => (
                  <li key={effect.kind}>{t(effectKeys[effect.kind as keyof typeof effectKeys])}</li>
                ))}
              </ul>
            </div>
          )}
          {ready && run.status !== 'finished' && !run.rewardPending && !confirm && (
            <button
              className="cpi-ranked-end"
              type="button"
              onClick={() => {
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
                disabled={!ready || run.rewardPending}
                onClick={() => {
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
