import { describe, expect, it, vi } from 'vitest';
import {
  createRun,
  getCurrentRow,
  getReviveSp,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { RandomSource, RunCommand } from '@crystal-path-infinity/game-core';
import { RewardFlow, UNAVAILABLE_REWARDED_ADAPTER } from '../src/rewards/reward-flow';
import type { LoadedRewardedAd, NativeRewardedAdapter } from '../src/rewards/reward-flow';
import { RewardOperationUnavailable } from '../src/rewards/reward-client';
import type {
  RewardClient,
  RewardInventory,
  RewardPermit,
  RewardView,
} from '../src/rewards/reward-client';
const RUN = '29000000-0000-4000-8000-000000000001';
const rng: RandomSource = {
  algorithm: 'cpi029-independent-fixture',
  next: (cursor) => ({
    value: cursor.state === 'reward' ? 0.72 : 0,
    cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
  }),
};
const inventory: RewardInventory = {
  provider: 'admob',
  platform: 'android',
  sdkVersion: 'test-sdk-1',
  mediation: [],
};
const uuid = (index: number) => '29100000-0000-4000-8000-' + String(index).padStart(12, '0');
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

/** Trusted storage fixture using the actual core; SDK callbacks do not invoke verify(). */
function fixture() {
  let now = 1_800_000_000_000;
  let nextId = 100;
  let scope: object | null = {};
  let core = createRun(
    {
      runId: RUN,
      observedAt: 1000,
      routeRng: { algorithm: rng.algorithm, state: 'route', draws: '0' },
      mysteryRng: { algorithm: rng.algorithm, state: 'reward', draws: '0' },
    },
    rng,
  );
  const act = (command: RunCommand, activeTimeMs = core.activeTimeMs) => {
    const result = transitionRun(core, command, {
      rng,
      activeTimeMs,
      achievedAt: core.lastObservedAt + 1,
    });
    core = result.state;
    return result;
  };
  const advance = () =>
    act({
      type: 'choose',
      row: core.currentRow,
      life: core.revivesApplied,
      side: getCurrentRow(core).safeSide,
    });
  for (let index = 0; index < 348; index++) advance();
  act({ type: 'hint', row: core.currentRow, life: 0 });
  const kill = (cause: 'wrong_tile' | 'mystery' | 'drain' = 'wrong_tile') => {
    core = { ...core, sp: 1, effects: [] };
    if (cause === 'drain') {
      core = {
        ...core,
        effects: [
          {
            kind: 'drain_5s',
            startedAt: core.activeTimeMs,
            expiresAt: core.activeTimeMs + 5000,
            nextTickAt: core.activeTimeMs + 500,
          },
        ],
      };
      act({ type: 'tick' }, core.activeTimeMs + 500);
    } else if (cause === 'mystery')
      act({ type: 'mystery', row: core.currentRow, life: core.revivesApplied });
    else
      act({
        type: 'choose',
        row: core.currentRow,
        life: core.revivesApplied,
        side: getCurrentRow(core).safeSide === 'left' ? 'right' : 'left',
      });
  };
  kill('mystery');
  let currentIntent: NonNullable<RewardView['intent']> | null = null;
  const calls: string[] = [];
  const keys: string[] = [];
  const observers = new Set<() => void>();
  const view = (): RewardView => {
    const grant = core.reviveReceipts.find((item) => item.status === 'granted');
    const status =
      core.status === 'finished'
        ? 'finished'
        : core.status === 'playing'
          ? 'playing'
          : grant
            ? 'granted'
            : core.pendingReward
              ? 'pending'
              : 'offer';
    const ordinal = core.revivesApplied + 1;
    const restoreSp = (ordinal <= 10 ? getReviveSp(ordinal) : 150) as 200 | 150;
    return {
      schemaVersion: 1,
      runId: RUN,
      rulesetVersion: core.rulesetVersion,
      status,
      deathId: core.death?.id ?? null,
      offer: status === 'offer' ? { ordinal, restoreSp } : null,
      intent: status === 'pending' || status === 'granted' ? currentIntent : null,
      grant: grant
        ? { id: grant.grantId, ordinal: grant.ordinal, restoreSp: grant.sp as 200 | 150 }
        : null,
      revivesGranted: core.revivesGranted,
      revivesApplied: core.revivesApplied,
      revivesToReachScore: core.revivesToReachScore,
    };
  };
  const permit = (): RewardPermit => ({
    id: uuid(1),
    policyVersion: 'test-policy',
    expiresAt: now + 60_000,
    inventory,
    flags: {
      canRequestAds: true,
      childDirected: true,
      underAgeOfConsent: true,
      maxAdContentRating: 'G',
      nonPersonalized: true,
    },
    context: 'unknown',
    contextSupported: true,
    prerequisitesSatisfied: true,
  });
  const client: RewardClient = {
    accountScope: () => scope,
    subscribeAccountScope: (observer) => {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
    eligibility: vi.fn<RewardClient['eligibility']>(() => {
      calls.push('eligibility');
      return Promise.resolve(permit());
    }),
    status: vi.fn<RewardClient['status']>(() => {
      calls.push('status');
      return Promise.resolve(view());
    }),
    intent: vi.fn<RewardClient['intent']>((_run, key) => {
      calls.push('intent');
      keys.push(key);
      if (!core.pendingReward) {
        currentIntent = {
          id: uuid(nextId++),
          ordinal: core.revivesApplied + 1,
          restoreSp: getReviveSp(core.revivesApplied + 1) as 200 | 150,
          customData: uuid(nextId++),
          expiresAt: now + 60_000,
        };
        act({
          type: 'mark-reward-pending',
          deathId: core.death!.id,
          ordinal: currentIntent.ordinal,
          intentId: currentIntent.id,
        });
      }
      return Promise.resolve(view());
    }),
    applyGrant: vi.fn<RewardClient['applyGrant']>((_run, grantId) => {
      calls.push('apply');
      const receipt = core.reviveReceipts.find((item) => item.grantId === grantId)!;
      act({ type: 'apply-revive', deathId: receipt.deathId, ordinal: receipt.ordinal, grantId });
      return Promise.resolve(true);
    }),
  };
  let events: Parameters<LoadedRewardedAd['show']>[0] | null = null;
  const ad: LoadedRewardedAd = {
    show: vi.fn<LoadedRewardedAd['show']>((input) => {
      calls.push('show');
      events = input;
      return Promise.resolve();
    }),
    dispose: vi.fn(),
  };
  const adapter: NativeRewardedAdapter = {
    available: true,
    inventory,
    initialize: vi.fn<NativeRewardedAdapter['initialize']>(() => {
      calls.push('initialize');
      return Promise.resolve();
    }),
    load: vi.fn<NativeRewardedAdapter['load']>(() => {
      calls.push('load');
      return Promise.resolve({ status: 'loaded', ad });
    }),
  };
  const timers = new Map<number, { at: number; callback: () => void }>();
  let timerId = 0;
  const schedule = (callback: () => void, delay: number) => {
    const key = ++timerId;
    timers.set(key, { at: now + delay, callback });
    return () => {
      timers.delete(key);
    };
  };
  const gate = vi.fn<(blocked: boolean) => void>();
  const makeFlow = (chosen = adapter) =>
    new RewardFlow({
      runId: RUN,
      client,
      adapter: chosen,
      now: () => now,
      newId: () => uuid(nextId++),
      schedule,
      onGateChange: gate,
      synchronizeRun: () => Promise.resolve(core.status === 'playing'),
    });
  const verify = () => {
    if (!currentIntent) throw new Error('No issued intent');
    act({
      type: 'grant-revive',
      deathId: core.death!.id,
      ordinal: currentIntent.ordinal,
      intentId: currentIntent.id,
      grantId: uuid(500 + currentIntent.ordinal),
    });
  };
  const tick = async (milliseconds: number) => {
    now += milliseconds;
    for (const [id, timer] of [...timers])
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    await flush();
  };
  return {
    client,
    adapter,
    ad,
    calls,
    keys,
    permit,
    view,
    makeFlow,
    gate,
    kill,
    advance,
    verify,
    tick,
    timers,
    core: () => core,
    events: () => events!,
    setNow: (value: number) => {
      now = value;
    },
    switchAccount: () => {
      scope = {};
      for (const observer of observers) observer();
    },
  };
}

describe('CPI-029/030 authoritative continuation orchestration', () => {
  it('stops pending polling on a fixed policy refusal without erasing the issued intent', async () => {
    const f = fixture();
    const flow = f.makeFlow();
    await flow.recover();
    await flow.watch();
    f.events().onClosed();
    await flush();
    expect(f.timers.size).toBe(1);
    vi.mocked(f.client.status).mockRejectedValueOnce(
      new RewardOperationUnavailable('operation_context_required'),
    );
    await f.tick(1000);
    expect(flow.snapshot()).toMatchObject({
      phase: 'earned_pending',
      problem: 'operation_context_required',
      waiting: false,
      canRetry: false,
      inputBlocked: true,
    });
    expect(f.timers.size).toBe(0);
    expect(f.core().pendingReward).not.toBeNull();
    expect(f.core().revivesGranted).toBe(0);
    flow.dispose();
  });
  it('blocks SDK work on operational refusal and permits only an explicit useful recheck', async () => {
    const f = fixture();
    const flow = f.makeFlow();
    await flow.recover();
    vi.mocked(f.client.eligibility).mockRejectedValueOnce(
      new RewardOperationUnavailable('maintenance'),
    );
    await flow.watch();
    expect(flow.snapshot()).toMatchObject({
      problem: 'maintenance',
      phase: 'offer',
      canWatch: false,
      canRetry: true,
    });
    expect(f.adapter.initialize).not.toHaveBeenCalled();
    expect(f.core().revivesGranted).toBe(0);
    await flow.watch();
    expect(f.client.eligibility).toHaveBeenCalledOnce();
    await flow.retry();
    expect(flow.snapshot()).toMatchObject({ problem: null, canWatch: true });
    vi.mocked(f.client.eligibility).mockRejectedValueOnce(
      new RewardOperationUnavailable('client_update_required'),
    );
    await flow.watch();
    expect(flow.snapshot()).toMatchObject({
      problem: 'client_update_required',
      canRetry: false,
      canWatch: false,
    });
    const calls = f.calls.length;
    await flow.retry();
    expect(f.calls).toHaveLength(calls);
    expect(f.adapter.initialize).not.toHaveBeenCalled();
    flow.dispose();
  });
  it('keeps a verified grant when recovery requires an update and never consumes a second ad', async () => {
    const f = fixture();
    const flow = f.makeFlow();
    await flow.recover();
    await flow.watch();
    f.verify();
    f.events().onClosed();
    await flush();
    vi.mocked(f.client.applyGrant).mockRejectedValueOnce(
      new RewardOperationUnavailable('client_update_required'),
    );
    await flow.apply();
    expect(flow.snapshot()).toMatchObject({
      phase: 'granted',
      problem: 'client_update_required',
      revivesGranted: 1,
      revivesApplied: 0,
      canApply: false,
      canRetry: false,
      inputBlocked: true,
    });
    expect(f.core().revivesApplied).toBe(0);
    expect(f.core().reviveReceipts[0].status).toBe('granted');
    await flow.watch();
    expect(f.ad.show).toHaveBeenCalledOnce();
    flow.dispose();
    const updated = f.makeFlow();
    await updated.recover();
    await updated.apply();
    expect(f.core().revivesApplied).toBe(1);
    expect(f.ad.show).toHaveBeenCalledOnce();
    updated.dispose();
  });
  it('serializes a shared fullscreen provider and refreshes a stale second offer before any second SDK load', async () => {
    const f = fixture();
    const first = f.makeFlow();
    const second = f.makeFlow();
    await first.recover();
    await second.recover();
    await first.watch();
    await second.watch();
    expect(f.ad.show).toHaveBeenCalledOnce();
    f.verify();
    f.events().onClosed();
    await flush();
    await second.watch();
    expect(second.snapshot().phase).toBe('granted');
    expect(f.adapter.initialize).toHaveBeenCalledOnce();
    expect(f.adapter.load).toHaveBeenCalledOnce();
    expect(f.ad.show).toHaveBeenCalledOnce();
    first.dispose();
    second.dispose();
  });
  it('cancels pre-show SDK work on privacy withdrawal without forfeiting an already verified grant', async () => {
    const f = fixture();
    let resolve!: (permit: RewardPermit) => void;
    vi.mocked(f.client.eligibility).mockImplementationOnce(
      () =>
        new Promise<RewardPermit>((done) => {
          resolve = done;
        }),
    );
    const flow = f.makeFlow();
    await flow.recover();
    const watching = flow.watch();
    await flush();
    flow.invalidateEligibility();
    resolve(f.permit());
    await watching;
    expect(f.adapter.initialize).not.toHaveBeenCalled();
    expect(f.core().pendingReward).toBeNull();
    await flow.recover();
    await flow.watch();
    f.verify();
    f.events().onClosed();
    await flush();
    flow.invalidateEligibility();
    expect(flow.snapshot()).toMatchObject({ phase: 'granted', canApply: true });
    await flow.apply();
    expect(f.core().sp).toBe(200);
    expect(f.core().revivesApplied).toBe(1);
    expect(f.adapter.initialize).toHaveBeenCalledOnce();
    flow.dispose();
  });
  it('walks all ten core restores with the 5->6 SP boundary, all death causes and no eleventh ad', async () => {
    const f = fixture();
    const flow = f.makeFlow();
    await flow.recover();
    const expected = [200, 200, 200, 200, 200, 150, 150, 150, 150, 150];
    for (const [index, sp] of expected.entries()) {
      expect(flow.snapshot().promise).toEqual({ ordinal: index + 1, restoreSp: sp });
      const hints = f.core().hints;
      const row = f.core().currentRow;
      const activeTime = f.core().activeTimeMs;
      await flow.watch();
      expect(f.calls.slice(-5)).toEqual(['eligibility', 'initialize', 'load', 'intent', 'show']);
      f.events().onEarned();
      await flush();
      expect(f.core().revivesGranted).toBe(index);
      expect(f.core().sp).toBe(0);
      expect(flow.snapshot().inputBlocked).toBe(true);
      f.verify();
      await flow.recover();
      expect(flow.snapshot().phase).toBe('granted');
      expect(flow.snapshot().canApply).toBe(false);
      await flow.apply();
      expect(f.core().revivesApplied).toBe(index);
      f.events().onClosed();
      await flush();
      await flow.apply();
      expect(f.core().sp).toBe(sp);
      expect(f.core().revivesApplied).toBe(index + 1);
      expect(f.core().currentRow).toBe(row);
      expect(f.core().hints).toBe(hints);
      expect(f.core().effects).toEqual([]);
      expect(f.core().activeTimeMs).toBe(activeTime);
      expect(flow.snapshot().phase).toBe('playing');
      expect(flow.snapshot().inputBlocked).toBe(false);
      if (index === 0) {
        expect(f.core().current.mysteryOutcome).toBe('hurt_15');
        f.advance();
        f.advance();
        expect(f.core().currentRow).toBe('351');
      }
      f.kill(index === 1 ? 'drain' : 'wrong_tile');
      await flow.recover();
    }
    expect(f.core().status).toBe('finished');
    expect(flow.snapshot().phase).toBe('final');
    expect(f.core().lastClearedRow).toBe('350');
    expect(f.core().revivesToReachScore).toBe(1);
    expect(flow.snapshot().canWatch).toBe(false);
    const loads = f.calls.filter((call) => call === 'load').length;
    await flow.watch();
    expect(f.calls.filter((call) => call === 'load')).toHaveLength(loads);
    flow.dispose();
  });
  it('loads before issuing an intent so no-fill/load failure use no quota and preserve the same offer', async () => {
    const f = fixture();
    vi.mocked(f.adapter.load)
      .mockResolvedValueOnce({ status: 'no_fill' })
      .mockResolvedValueOnce({ status: 'error' });
    const flow = f.makeFlow();
    await flow.recover();
    await flow.watch();
    expect(flow.snapshot()).toMatchObject({
      phase: 'offer',
      problem: 'no_fill',
      revivesGranted: 0,
      revivesApplied: 0,
    });
    expect(f.calls).not.toContain('intent');
    await flow.watch();
    expect(f.calls).not.toContain('intent');
    expect(f.core().pendingReward).toBeNull();
    expect(flow.snapshot().promise).toEqual({ ordinal: 1, restoreSp: 200 });
    flow.dispose();
  });
  it('requires fresh reviewed inventory and restrictive unknown/child flags before any SDK initialization', async () => {
    const f = fixture();
    const bad = { ...f.permit(), flags: { ...f.permit().flags, childDirected: false } };
    vi.mocked(f.client.eligibility).mockResolvedValueOnce(bad);
    const flow = f.makeFlow();
    await flow.recover();
    await flow.watch();
    expect(f.adapter.initialize).not.toHaveBeenCalled();
    expect(f.calls).not.toContain('load');
    expect(f.calls).not.toContain('intent');
    expect(flow.snapshot().problem).toBe('privacy_unavailable');
    vi.mocked(f.client.eligibility).mockResolvedValueOnce({
      ...f.permit(),
      inventory: { ...inventory, sdkVersion: 'unreviewed' },
    });
    await flow.watch();
    expect(f.adapter.initialize).not.toHaveBeenCalled();
    flow.dispose();
    const unavailable = f.makeFlow(UNAVAILABLE_REWARDED_ADAPTER);
    await unavailable.recover();
    await unavailable.watch();
    expect(unavailable.snapshot().canWatch).toBe(false);
    expect(f.calls).not.toContain('load');
    unavailable.dispose();
  });
  it('supports close-before-late-earned and duplicate callbacks without a client grant or second ad', async () => {
    const f = fixture();
    const flow = f.makeFlow();
    await flow.recover();
    await Promise.all([flow.watch(), flow.watch()]);
    expect(f.ad.show).toHaveBeenCalledOnce();
    f.events().onClosed();
    await flush();
    expect(flow.snapshot().phase).toBe('earned_pending');
    expect(flow.snapshot().inputBlocked).toBe(true);
    f.events().onEarned();
    f.events().onEarned();
    await flush();
    expect(f.core().revivesGranted).toBe(0);
    f.verify();
    await flow.retry();
    expect(flow.snapshot().canApply).toBe(true);
    await flow.watch();
    expect(f.ad.show).toHaveBeenCalledOnce();
    await flow.apply();
    await flow.apply();
    expect(f.core().revivesApplied).toBe(1);
    expect(f.client.applyGrant).toHaveBeenCalledOnce();
    flow.dispose();
  });
  it('bounds pending waiting and preserves a late grant across disposal and a new process owner', async () => {
    const f = fixture();
    const first = f.makeFlow();
    await first.recover();
    await first.watch();
    f.events().onClosed();
    await flush();
    await f.tick(16_000);
    expect(first.snapshot()).toMatchObject({
      phase: 'earned_pending',
      waiting: false,
      canRetry: true,
      canEnd: false,
    });
    first.dispose();
    expect(f.core().pendingReward).not.toBeNull();
    f.verify();
    const second = f.makeFlow();
    await second.recover();
    expect(second.snapshot().phase).toBe('granted');
    expect(f.ad.show).toHaveBeenCalledOnce();
    await second.apply();
    expect(f.core().sp).toBe(200);
    second.dispose();
    expect(f.timers.size).toBe(0);
  });
  it('keeps the exact intent idempotency key after a committed response is lost', async () => {
    const f = fixture();
    const real = f.client.intent;
    vi.mocked(f.client.intent).mockImplementationOnce(async (run, key, signal) => {
      await real(run, key, signal);
      throw new Error('Response lost');
    });
    const flow = f.makeFlow();
    await flow.recover();
    await flow.watch();
    expect(f.core().pendingReward).not.toBeNull();
    expect(f.ad.show).not.toHaveBeenCalled();
    await flow.retry();
    expect(f.keys).toHaveLength(2);
    expect(f.keys[0]).toBe(f.keys[1]);
    expect(f.ad.show).toHaveBeenCalledOnce();
    f.events().onClosed();
    await flush();
    flow.dispose();
  });
  it('recovers an applied-but-lost response without applying SP twice or worsening the score tie', async () => {
    const f = fixture();
    const flow = f.makeFlow();
    await flow.recover();
    await flow.watch();
    f.verify();
    f.events().onClosed();
    await flush();
    const real = f.client.applyGrant;
    vi.mocked(f.client.applyGrant).mockImplementationOnce(async (run, grant) => {
      await real(run, grant);
      throw new Error('Apply response lost');
    });
    await flow.apply();
    expect(f.core().revivesApplied).toBe(1);
    expect(flow.snapshot().phase).toBe('granted');
    await flow.retry();
    expect(flow.snapshot().phase).toBe('playing');
    expect(f.core().revivesApplied).toBe(1);
    expect(f.core().revivesToReachScore).toBe(0);
    flow.dispose();
  });
  it('clears A-account state synchronously and never initializes an ad from a late A permit under B', async () => {
    const f = fixture();
    let resolve!: (permit: RewardPermit) => void;
    vi.mocked(f.client.eligibility).mockImplementationOnce(
      () =>
        new Promise<RewardPermit>((done) => {
          resolve = done;
        }),
    );
    const flow = f.makeFlow();
    await flow.recover();
    const watching = flow.watch();
    await flush();
    f.switchAccount();
    expect(flow.snapshot().revivesGranted).toBeNull();
    resolve(f.permit());
    await watching;
    expect(f.adapter.initialize).not.toHaveBeenCalled();
    expect(f.calls).not.toContain('intent');
    flow.dispose();
  });
});
