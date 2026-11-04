import { RewardFlow } from './reward-flow.ts';
import type { NativeRewardedAdapter } from './reward-flow.ts';
import type { RewardClient } from './reward-client.ts';
import { RewardUnavailable } from './reward-client.ts';
import type { RankedClient } from '../ranked/ranked-client';

/** Explicit source-only binding. No URL, account, privacy approval or SDK is selected here. */
export function createRankedRewardFlowFactory(options: {
  client: RewardClient | null;
  rankedClient: RankedClient | null;
  adapter?: NativeRewardedAdapter;
  onGateChange?: (runId: string, blocked: boolean) => void;
}): (runId: string) => RewardFlow | null {
  return (runId) => {
    const reward = options.client;
    const ranked = options.rankedClient;
    const scope = reward?.accountScope();
    if (!reward || !ranked || !scope || ranked.snapshot().run?.runId !== runId) return null;
    const current = () => reward.accountScope() === scope && ranked.snapshot().run?.runId === runId;
    const bound: RewardClient = {
      accountScope: () => (current() ? scope : null),
      subscribeAccountScope: (observer) => {
        const account = reward.subscribeAccountScope(observer);
        const run = ranked.subscribe(observer);
        return () => {
          account();
          run();
        };
      },
      eligibility: (id, signal) => {
        if (id !== runId || !current()) return Promise.reject(new RewardUnavailable());
        return reward.eligibility(id, signal);
      },
      status: (id, signal) => {
        if (id !== runId || !current()) return Promise.reject(new RewardUnavailable());
        return reward.status(id, signal);
      },
      intent: (id, key, signal) => {
        if (id !== runId || !current()) return Promise.reject(new RewardUnavailable());
        return reward.intent(id, key, signal);
      },
      applyGrant: async (id, grant) => {
        if (id !== runId || !current()) return false;
        const applied = await ranked.applyVerifiedGrant(grant, runId);
        return current() && applied;
      },
    };
    return new RewardFlow({
      runId,
      client: bound,
      adapter: options.adapter,
      onGateChange: (blocked) => {
        if (current()) options.onGateChange?.(runId, blocked);
      },
      synchronizeRun: async (id) => {
        if (id !== runId || !current()) return false;
        let state = ranked.snapshot();
        if (state.canRetry) {
          await ranked.retry();
          if (!current()) return false;
          state = ranked.snapshot();
        }
        if (state.phase === 'ready' && state.run?.status === 'playing') return true;
        // An unresolved request must retain its original receipt key/body.
        if (state.phase === 'pending' || state.canRetry) return false;
        await ranked.recover(runId, false);
        if (!current()) return false;
        state = ranked.snapshot();
        return state.phase === 'ready' && state.run?.status === 'playing';
      },
    });
  };
}
