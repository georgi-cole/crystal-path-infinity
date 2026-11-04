import { describe, expect, it } from 'vitest';
import { ownAdAuthorizationExport, ownRewardExport } from '../src/reward-export.ts';

const id = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-04T00:00:00.000Z';
const reward = {
  id,
  runId: id,
  deathId: 'run:death:1',
  rulesetVersion: 'infinity-v1',
  state: 'verified',
  ordinal: 1,
  restoreSp: 200,
  createdAt: timestamp,
  expiresAt: timestamp,
  resolvedAt: timestamp,
  providerEarnedAt: timestamp,
  grant: { id, state: 'applied', grantedAt: timestamp, appliedAt: timestamp },
};
const authorization = {
  id,
  policyVersion: 'test-v1',
  context: 'unknown',
  prerequisitesSatisfied: true,
  flags: {
    childDirected: true,
    underAgeOfConsent: true,
    maxAdContentRating: 'G',
    nonPersonalized: true,
  },
  issuedAt: timestamp,
  validUntil: timestamp,
  revokedAt: null,
  inventory: {
    provider: 'admob',
    platform: 'android',
    sdkVersion: 'test-v1',
    mediation: [{ identifier: 'example.adapter', version: '1.0' }],
  },
};
describe('own reward export allowlist', () => {
  it('exports own decisions and timings without nonce, raw SSV, private checkpoint or verification references', () => {
    const rewards = ownRewardExport({
      rewards: [
        {
          ...reward,
          nonce: 'private-nonce',
          rawQuery: 'private-signature',
          checkpoint: 'private-route',
        },
      ],
      next: id,
    });
    expect(rewards.next).toBe(id);
    expect(rewards.rewards).toEqual([reward]);
    const adAuthorizations = ownAdAuthorizationExport({
      adAuthorizations: [
        {
          ...authorization,
          verification_reference: 'private-reference',
          user_id: 'private-auth-uuid',
          flags: { ...authorization.flags, secret: 'private-flag' },
          inventory: { ...authorization.inventory, privateKey: 'private-key' },
        },
      ],
      next: null,
    });
    expect(adAuthorizations.adAuthorizations).toEqual([authorization]);
    expect(JSON.stringify({ rewards, adAuthorizations })).not.toContain('private-');
  });
  it('fails closed on incomplete, malformed or oversized export pages instead of silently omitting data', () => {
    for (const value of [
      { rewards: [], next: 'bad-cursor' },
      { rewards: Array(101).fill(reward), next: null },
      { rewards: [{ ...reward, restoreSp: 400 }], next: null },
      {},
    ])
      expect(() => ownRewardExport(value)).toThrow();
    for (const value of [
      {
        adAuthorizations: [
          { ...authorization, inventory: { ...authorization.inventory, provider: 'unreviewed' } },
        ],
        next: null,
      },
      { adAuthorizations: [{ ...authorization, prerequisitesSatisfied: 'yes' }], next: null },
      {},
    ])
      expect(() => ownAdAuthorizationExport(value)).toThrow();
  });
});
