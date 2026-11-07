import { describe, it, expect } from 'vitest';
import {
  createRun,
  LIVE_RULESET_VERSION,
  applyServerResource,
} from '@crystal-path-infinity/game-core';
import { rankedSnapshot, RANKED_RNG } from '../../../packages/server-core/src/ranked.ts';
import { parseRankedReply } from '../src/ranked/ranked-client';
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
