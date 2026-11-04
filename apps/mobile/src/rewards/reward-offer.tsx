import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import type { RewardFlow, RewardFlowState } from './reward-flow';
import './reward-offer.css';
const EMPTY: RewardFlowState = Object.freeze({
  phase: 'unavailable',
  promise: null,
  revivesGranted: null,
  revivesApplied: null,
  revivesToReachScore: null,
  inputBlocked: true,
  fullscreen: false,
  waiting: false,
  canWatch: false,
  canApply: false,
  canRetry: false,
  canEnd: false,
  problem: null,
});
export function RewardOffer({
  flow,
  online,
  onLeave,
  onEnd,
}: {
  flow: RewardFlow | null;
  online: boolean;
  onLeave: () => void;
  onEnd: () => void;
}) {
  const { t, number } = useLanguage();
  const subscribe = useCallback(
    (observer: () => void) => flow?.subscribe(observer) ?? (() => {}),
    [flow],
  );
  const read = useCallback(() => flow?.snapshot() ?? EMPTY, [flow]);
  const state = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    flow?.setOnline(online);
  }, [flow, online]);
  if (state.phase === 'playing') return null;
  const status =
    state.phase === 'offer'
      ? null
      : state.phase === 'loading'
        ? 'rewards.loading'
        : state.phase === 'showing'
          ? 'rewards.showing'
          : state.phase === 'earned_pending'
            ? state.waiting
              ? 'rewards.pending'
              : 'rewards.savedPending'
            : state.phase === 'granted'
              ? 'rewards.granted'
              : state.phase === 'reviving'
                ? 'rewards.reviving'
                : state.phase === 'final'
                  ? 'rewards.final'
                  : 'rewards.unavailable';
  const problem =
    state.problem === 'offline'
      ? 'rewards.offline'
      : state.problem === 'no_fill'
        ? 'rewards.noFill'
        : state.problem === 'privacy_unavailable'
          ? 'rewards.privacyUnavailable'
          : state.problem
            ? 'rewards.error'
            : null;
  return (
    <section className="cpi-reward-offer" aria-label={t('rewards.title')}>
      <h3>{t('rewards.title')}</h3>
      {state.promise && (
        <>
          <p className="cpi-reward-promise">
            {t('rewards.offer', {
              ordinal: number(state.promise.ordinal),
              sp: number(state.promise.restoreSp),
            })}
          </p>
          <p>{t('rewards.set')}</p>
        </>
      )}
      {state.revivesGranted !== null && (
        <p>
          {t('rewards.quota', {
            granted: number(state.revivesGranted),
            applied: number(state.revivesApplied),
          })}
        </p>
      )}
      {status && (
        <p role="status" aria-live="polite">
          {t(status)}
        </p>
      )}
      {problem && <p role="status">{t(problem)}</p>}
      {state.fullscreen && state.phase === 'granted' && <p>{t('rewards.closeFirst')}</p>}
      <div className="cpi-reward-actions">
        {state.phase === 'offer' && (
          <button
            type="button"
            disabled={!online || !state.canWatch}
            onClick={() => {
              void flow?.watch();
            }}
          >
            {t('rewards.watch')}
          </button>
        )}
        {state.phase === 'granted' && (
          <button
            type="button"
            disabled={!online || !state.canApply}
            onClick={() => {
              void flow?.apply();
            }}
          >
            {t('rewards.apply')}
          </button>
        )}
        {state.canRetry && (
          <button
            type="button"
            disabled={!online}
            onClick={() => {
              void flow?.retry();
            }}
          >
            {t('rewards.retry')}
          </button>
        )}
        {state.canEnd && (
          <button type="button" onClick={onEnd}>
            {t('rewards.end')}
          </button>
        )}
        <button type="button" disabled={state.fullscreen} onClick={onLeave}>
          {t('rewards.leave')}
        </button>
      </div>
    </section>
  );
}
