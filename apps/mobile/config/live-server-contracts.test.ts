import { describe, it, expect, vi } from 'vitest';
import {
  createRun,
  LIVE_RULESET_VERSION,
  applyServerResource,
} from '@crystal-path-infinity/game-core';
import { rankedSnapshot, RANKED_RNG } from '../../../packages/server-core/src/ranked.ts';
import { parseRankedReply } from '../src/ranked/ranked-client';
import { parseRewardView } from '../src/rewards/reward-client';
import type { RewardClient, RewardView } from '../src/rewards/reward-client';
import { RewardFlow } from '../src/rewards/reward-flow';
function fixture() {
  const state = createRun(
    {
      runId: 'aa000000-0000-4000-8000-000000000001',
      rulesetVersion: LIVE_RULESET_VERSION,
      routeRng: { algorithm: RANKED_RNG.algorithm, state: 'a'.repeat(64), draws: '0' },
      mysteryRng: { algorithm: RANKED_RNG.algorithm, state: 'b'.repeat(64), draws: '0' },
      observedAt: 10000,
    },
    RANKED_RNG,
  );
  return {
    subject: 'aa000000-0000-4000-8000-000000000002',
    state,
    region: { countryCode: 'BG', continent: 'EU', mappingVersion: 'cpi-regions-2026-11-v1' },
    nextSequence: '1',
    deviceId: 'fixture-device',
    leaseToken: 'aa000000-0000-4000-8000-000000000003',
    leaseGeneration: '1',
    leaseExpiresAt: 70000,
    clockUpdatedAt: 10000,
    activeUntil: 10000,
    paused: true,
    lastChoiceAt: null,
  };
}
describe('live server/mobile contract', () => {
  it('keeps credits available after ten shared continues and resumes after a credit', async () => {
    const runId = fixture().state.runId;
    let view: RewardView = {
      schemaVersion: 1,
      runId,
      rulesetVersion: LIVE_RULESET_VERSION,
      status: 'limit',
      deathId: 'death:11',
      offer: null,
      intent: null,
      grant: null,
      revivesGranted: 10,
      revivesApplied: 10,
      revivesToReachScore: 0,
    };
    expect(parseRewardView(view, runId)).toEqual(view);
    expect(parseRewardView({ ...view, revivesApplied: 9, revivesGranted: 9 }, runId)).toBeNull();
    expect(parseRewardView({ ...view, rulesetVersion: 'infinity-v1' }, runId)).toBeNull();
    const scope = {};
    const client: RewardClient = {
      accountScope: () => scope,
      subscribeAccountScope: () => () => {},
      eligibility: vi.fn(() => Promise.resolve(null)),
      status: () => Promise.resolve(view),
      intent: () => Promise.reject(new Error('No ad slot remains')),
      applyGrant: () => Promise.resolve(false),
    };
    const flow = new RewardFlow({
      runId,
      client,
      onGateChange: () => {},
      synchronizeRun: () => Promise.resolve(true),
    });
    try {
      await flow.recover();
      expect(flow.snapshot()).toMatchObject({
        phase: 'limit',
        canWatch: false,
        canEnd: true,
        inputBlocked: true,
      });
      expect(client.eligibility).not.toHaveBeenCalled();
      view = { ...view, status: 'playing', deathId: null, revivesGranted: 11, revivesApplied: 11 };
      await flow.recover();
      expect(flow.snapshot()).toMatchObject({ phase: 'playing', inputBlocked: false });
    } finally {
      flow.dispose();
    }
  });
  it('accepts fractional SP, first-loss grace, and an explicit assisted classification', () => {
    const run = fixture();
    const paid = applyServerResource(run.state, 'sp', 20, {
      activeTimeMs: 0,
      achievedAt: 10000,
      rng: RANKED_RNG,
    });
    const snapshot = rankedSnapshot({ ...run, state: { ...paid.state, sp: 319.5 } });
    const parsed = parseRankedReply({
      accepted: true,
      reason: null,
      snapshot,
      lease: { token: run.leaseToken, generation: '1', expiresAt: 70000 },
    });
    expect(parsed?.snapshot.sp).toBe(319.5);
    expect(parsed?.snapshot.economy?.assisted).toBe(true);
    expect(parsed?.snapshot.deathClock?.firstLossAt).toBe(6000);
  });
  it('rejects missing accounting and leaked private state', () => {
    const run = fixture(),
      snapshot = rankedSnapshot(run),
      wire = {
        accepted: true,
        reason: null,
        snapshot,
        lease: { token: run.leaseToken, generation: '1', expiresAt: 70000 },
      };
    expect(parseRankedReply(wire)).not.toBeNull();
    expect(parseRankedReply({ ...wire, snapshot: { ...snapshot, economy: undefined } })).toBeNull();
    expect(
      parseRankedReply({ ...wire, snapshot: { ...snapshot, routeRng: { state: 'private' } } }),
    ).toBeNull();
  });
});
