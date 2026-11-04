import { describe, expect, it, vi } from 'vitest';
import { createRun } from '@crystal-path-infinity/game-core';
import { RewardService } from '../src/reward-service.ts';
import { RANKED_RNG } from '../src/ranked.ts';
import type { SqlConnection } from '../src/database.ts';

const actor = {
  subject: '00000000-0000-4000-8000-000000000771',
  deviceId: 'trusted-device',
  clientBuild: 1,
};
const runId = '00000000-0000-4000-8000-000000000772';
function fixture(failure: 'begin' | 'commit' | 'operation', rollbackFails = false) {
  const state = createRun(
    {
      runId,
      routeRng: { algorithm: RANKED_RNG.algorithm, state: 'a'.repeat(64), draws: '0' },
      mysteryRng: { algorithm: RANKED_RNG.algorithm, state: 'b'.repeat(64), draws: '0' },
      observedAt: 1_000_000,
    },
    RANKED_RNG,
  );
  const original = new Error('synthetic-private-transaction-failure');
  const release = vi.fn<SqlConnection['release']>();
  const query = vi.fn<SqlConnection['query']>((text) => {
    if (
      text === failure ||
      (failure === 'operation' && text.startsWith('select checkpoint_private')) ||
      (rollbackFails && text === 'rollback')
    )
      return Promise.reject(original);
    if (text.startsWith('select user_id'))
      return Promise.resolve({ rows: [{ user_id: actor.subject }] });
    if (text.startsWith('select checkpoint_private'))
      return Promise.resolve({
        rows: [
          {
            checkpoint_private: {
              subject: actor.subject,
              region: { countryCode: null, continent: null, mappingVersion: 'fixture' },
              state,
            },
          },
        ],
      });
    return Promise.resolve({ rows: [] });
  });
  const service = new RewardService({
    database: { connect: () => Promise.resolve({ query, release }) },
    environment: 'development',
    platform: 'android',
  });
  return { query, release, original, read: () => service.eligibility(actor, { runId }) };
}
describe('reward transaction failure ownership', () => {
  it('discards an uncertain commit connection even when rollback itself succeeds', async () => {
    const f = fixture('commit');
    await expect(f.read()).rejects.toBe(f.original);
    expect(f.query).toHaveBeenLastCalledWith('rollback');
    expect(f.release).toHaveBeenCalledWith(expect.any(Error));
  });
  it('discards begin and rollback failures while preserving the original failure', async () => {
    for (const f of [fixture('begin'), fixture('operation', true)]) {
      await expect(f.read()).rejects.toBe(f.original);
      expect(f.release).toHaveBeenCalledWith(expect.any(Error));
    }
  });
  it('returns a successfully rolled-back ordinary failure without marking a healthy connection broken', async () => {
    const f = fixture('operation');
    await expect(f.read()).rejects.toBe(f.original);
    expect(f.query).toHaveBeenLastCalledWith('rollback');
    expect(f.release).toHaveBeenCalledWith(undefined);
  });
});
