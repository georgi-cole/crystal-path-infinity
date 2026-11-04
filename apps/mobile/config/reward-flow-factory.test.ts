import { describe, expect, it, vi } from 'vitest';
import { createRankedRewardFlowFactory } from '../src/rewards/reward-flow-factory';
import type { RewardClient, RewardView } from '../src/rewards/reward-client';
import type { RankedClient, RankedClientState, RankedRun } from '../src/ranked/ranked-client';
const RUN = '29000000-0000-4000-8000-000000000001';
const OTHER = '29000000-0000-4000-8000-000000000002';
const GRANT = '29300000-0000-4000-8000-000000000001';
function fixture() {
  let scope: object | null = {};
  const accountObservers = new Set<() => void>();
  const runObservers = new Set<() => void>();
  const run: RankedRun = {
    runId: RUN,
    rulesetVersion: 'infinity-v1',
    status: 'dead',
    region: { countryCode: null, continent: null, mappingVersion: 'cpi-regions-2026-11-v1' },
    nextSequence: '2',
    lastClearedRow: '0',
    currentRow: '1',
    sp: 0,
    hints: 1,
    activeTimeMs: 0,
    achievedAt: null,
    paused: true,
    current: {
      revealedSafeSide: 'left',
      mysteryOutcome: null,
      lastChoice: { side: 'right', wrong: true },
      hasMystery: false,
    },
    history: [],
    effects: [],
    death: { id: 'death:1', fatalRow: '1', cause: 'wrong_tile' },
    revivesGranted: 1,
    revivesApplied: 0,
    revivesToReachScore: 0,
    rewardPending: false,
  };
  let state: RankedClientState = {
    phase: 'ready',
    run,
    online: true,
    canRetry: false,
    rejected: false,
  };
  let view: RewardView = {
    schemaVersion: 1,
    runId: RUN,
    rulesetVersion: 'infinity-v1',
    status: 'granted',
    deathId: 'death:1',
    offer: null,
    intent: null,
    grant: { id: GRANT, ordinal: 1, restoreSp: 200 },
    revivesGranted: 1,
    revivesApplied: 0,
    revivesToReachScore: 0,
  };
  const restored = () => {
    state = {
      ...state,
      phase: 'ready',
      canRetry: false,
      run: { ...run, status: 'playing', death: null, sp: 200, revivesApplied: 1 },
    };
    view = { ...view, status: 'playing', deathId: null, grant: null, revivesApplied: 1 };
    for (const observer of runObservers) observer();
  };
  const recover = vi.fn<RankedClient['recover']>(() => {
    restored();
    return Promise.resolve();
  });
  const retry = vi.fn<RankedClient['retry']>(() => {
    restored();
    return Promise.resolve();
  });
  const apply = vi.fn<RankedClient['applyVerifiedGrant']>(() => {
    restored();
    return Promise.resolve(true);
  });
  const ranked: RankedClient = {
    snapshot: () => state,
    subscribe: (observer) => {
      runObservers.add(observer);
      return () => {
        runObservers.delete(observer);
      };
    },
    start: () => Promise.resolve(),
    lookupActive: () => Promise.resolve(RUN),
    command: () => Promise.resolve(),
    applyVerifiedGrant: apply,
    archivePending: () => Promise.resolve(false),
    retry,
    recover,
    setOnline: () => {},
    clear: () => {},
    dispose: () => {},
  };
  const status = vi.fn<RewardClient['status']>(() => Promise.resolve(view));
  const rawApply = vi.fn<RewardClient['applyGrant']>().mockResolvedValue(false);
  const reward: RewardClient = {
    accountScope: () => scope,
    subscribeAccountScope: (observer) => {
      accountObservers.add(observer);
      return () => {
        accountObservers.delete(observer);
      };
    },
    eligibility: () => Promise.resolve(null),
    status,
    intent: () => Promise.resolve(view),
    applyGrant: rawApply,
  };
  const gate = vi.fn<(id: string, blocked: boolean) => void>();
  const factory = createRankedRewardFlowFactory({
    client: reward,
    rankedClient: ranked,
    onGateChange: gate,
  });
  return {
    factory,
    ranked,
    reward,
    status,
    apply,
    rawApply,
    recover,
    retry,
    gate,
    remotePlaying: () => {
      view = { ...view, status: 'playing', deathId: null, grant: null, revivesApplied: 1 };
    },
    setState: (patch: Partial<RankedClientState>) => {
      state = { ...state, ...patch };
      for (const observer of runObservers) observer();
    },
    changeRun: () => {
      state = { ...state, run: { ...run, runId: OTHER } };
      for (const observer of runObservers) observer();
    },
    changeAccount: () => {
      scope = {};
      for (const observer of accountObservers) observer();
    },
  };
}
describe('CPI-029 explicit ranked/reward flow binding', () => {
  it('uses the ranked private queue with an obligatory expected run ID instead of a supplied arbitrary apply callback', async () => {
    const f = fixture();
    const flow = f.factory(RUN)!;
    await flow.recover();
    await flow.apply();
    expect(f.apply).toHaveBeenCalledExactlyOnceWith(GRANT, RUN);
    expect(f.rawApply).not.toHaveBeenCalled();
    expect(flow.snapshot()).toMatchObject({
      phase: 'playing',
      inputBlocked: false,
      revivesApplied: 1,
    });
    flow.dispose();
  });
  it('retries an existing ambiguous ranked request before replacing any recovery/lease operation', async () => {
    const f = fixture();
    f.remotePlaying();
    f.setState({ phase: 'retry', canRetry: true });
    const flow = f.factory(RUN)!;
    await flow.recover();
    expect(f.retry).toHaveBeenCalledOnce();
    expect(f.recover).not.toHaveBeenCalled();
    expect(flow.snapshot().phase).toBe('playing');
    flow.dispose();
    const stuck = fixture();
    stuck.remotePlaying();
    stuck.setState({ phase: 'retry', canRetry: true });
    stuck.retry.mockResolvedValue(undefined);
    const pending = stuck.factory(RUN)!;
    await pending.recover();
    expect(stuck.recover).not.toHaveBeenCalled();
    expect(pending.snapshot().inputBlocked).toBe(true);
    pending.dispose();
  });
  it('recovers only the same device and keeps gameplay blocked if another device still owns the run', async () => {
    const f = fixture();
    f.remotePlaying();
    f.setState({ phase: 'lease_lost' });
    f.recover.mockResolvedValue(undefined);
    const flow = f.factory(RUN)!;
    await flow.recover();
    expect(f.recover).toHaveBeenCalledExactlyOnceWith(RUN, false);
    expect(flow.snapshot().inputBlocked).toBe(true);
    flow.dispose();
  });
  it('rejects a wrong/new run before any operation and synchronously fences an old flow on account change', async () => {
    const f = fixture();
    expect(f.factory(OTHER)).toBeNull();
    const flow = f.factory(RUN)!;
    await flow.recover();
    const calls = f.status.mock.calls.length;
    f.changeAccount();
    expect(flow.snapshot().revivesGranted).toBeNull();
    await flow.apply();
    await flow.recover();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.status).toHaveBeenCalledTimes(calls);
    flow.dispose();
    const old = fixture();
    const previous = old.factory(RUN)!;
    old.changeRun();
    expect(previous.snapshot().phase).toBe('unavailable');
    await previous.recover();
    expect(old.status).not.toHaveBeenCalled();
    previous.dispose();
  });
  it('keeps the default native adapter unavailable and constructs nothing without an explicitly supplied client', async () => {
    const f = fixture();
    const disabled = createRankedRewardFlowFactory({ client: null, rankedClient: f.ranked });
    expect(disabled(RUN)).toBeNull();
    const flow = f.factory(RUN)!;
    await flow.recover();
    expect(flow.snapshot().canWatch).toBe(false);
    flow.dispose();
  });
});
