import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import type { RewardFlow, RewardFlowState } from './reward-flow';
import './reward-offer.css';
import { operationMessageKeys } from '../operations/operation-failure';
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
export function RewardOffer({ flow, online }: { flow: RewardFlow | null; online: boolean }) {
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
    state.phase === 'limit'
      ? 'rewards.limit'
      : state.phase === 'offer'
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
            ? state.problem === 'unavailable'
              ? 'rewards.error'
              : operationMessageKeys[state.problem]
            : null;
  return (
    <section className="cpi-reward-offer" aria-label={t('rewards.title')}>
      {status && !problem && (
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
            {state.promise
              ? t('rewards.watchRestore', { sp: number(state.promise.restoreSp) })
              : t('rewards.watch')}
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
            {state.promise
              ? t('rewards.resumeRestore', { sp: number(state.promise.restoreSp) })
              : t('rewards.apply')}
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
      </div>
    </section>
  );
}
