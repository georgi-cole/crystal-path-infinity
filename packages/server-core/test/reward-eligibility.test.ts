import { describe, expect, it, vi } from 'vitest';
import { createRun, getCurrentRow, transitionRun } from '@crystal-path-infinity/game-core';
import type { RunState, RunCommand } from '@crystal-path-infinity/game-core';
import { RewardService } from '../src/reward-service.ts';
import { RANKED_RNG } from '../src/ranked.ts';
import type { SqlConnection } from '../src/database.ts';
const actor = {
  subject: '00000000-0000-4000-8000-000000000771',
  deviceId: 'trusted-device',
  clientBuild: 1,
};
const runId = '00000000-0000-4000-8000-000000000772';
const initial = () =>
  createRun(
    {
      runId,
      routeRng: { algorithm: RANKED_RNG.algorithm, state: 'a'.repeat(64), draws: '0' },
      mysteryRng: { algorithm: RANKED_RNG.algorithm, state: 'b'.repeat(64), draws: '0' },
      observedAt: 1_000_000,
    },
    RANKED_RNG,
  );
function step(state: RunState, command: RunCommand, die = false) {
  const result = transitionRun(state, command, {
    activeTimeMs: state.activeTimeMs + (die ? 1_000_000 : 0),
    achievedAt: state.lastObservedAt + (die ? 1_000_000 : 0),
    rng: RANKED_RNG,
  });
  expect(result.accepted).toBe(true);
  return result.state;
}
function dead(state = initial()) {
  let count = 0;
  while (state.status === 'playing' && count++ < 1024) {
    const safe = getCurrentRow(state).safeSide;
    state = step(state, {
      type: 'choose',
      row: state.currentRow,
      life: state.revivesApplied,
      side: safe === 'left' ? 'right' : 'left',
    });
  }
  expect(['dead', 'finished']).toContain(state.status);
  return state;
}
function pending(state: RunState, ordinal: number) {
  return step(state, {
    type: 'mark-reward-pending',
    deathId: state.death!.id,
    ordinal,
    intentId: 'intent-' + ordinal,
  });
}
function grant(state: RunState, ordinal: number) {
  return step(state, {
    type: 'grant-revive',
    deathId: state.death!.id,
    ordinal,
    intentId: 'intent-' + ordinal,
    grantId: 'grant-' + ordinal,
  });
}
function fixture(state: RunState, leaseActive = true, deviceId = actor.deviceId) {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const query = vi.fn<SqlConnection['query']>((text) => {
    if (text.startsWith('select user_id'))
      return Promise.resolve({ rows: [{ user_id: actor.subject }] });
    if (text.startsWith('select checkpoint_private'))
      return Promise.resolve({
        rows: [
          {
            checkpoint_private: {
              subject: actor.subject,
              region: { countryCode: null, continent: null, mappingVersion: 'fixture' },
              leaseActive,
              deviceId,
              state,
            },
          },
        ],
      });
    return Promise.resolve({ rows: [] });
  });
  const service = new RewardService({
    database: { connect: () => Promise.resolve({ query, release: () => {} }) },
    environment: 'development',
    platform: 'android',
    assertOperationStart: authorize,
  });
  return { authorize, query, read: () => service.eligibility(actor, { runId }) };
}
describe('new-ad permit eligibility boundary', () => {
  it('authorizes SDK prerequisites only for an attached dead attempt with an unused continuation offer', async () => {
    const f = fixture(dead());
    expect(await f.read()).toEqual({ schemaVersion: 1, status: 'unavailable' });
    expect(f.authorize).toHaveBeenCalledOnce();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('reward_authorization_for'),
      expect.any(Array),
    );
  });
  it('returns no SDK permit for archived, playing, finished, pending, unapplied-grant or exhausted attempts', async () => {
    const death = dead();
    let exhausted = death;
    for (let ordinal = 1; ordinal <= 10; ordinal++) {
      exhausted = grant(pending(exhausted, ordinal), ordinal);
      exhausted = step(exhausted, {
        type: 'apply-revive',
        deathId: exhausted.death!.id,
        ordinal,
        grantId: 'grant-' + ordinal,
      });
      exhausted = dead(exhausted);
    }
    const cases = [
      fixture(death, false),
      fixture(death, true, 'another-trusted-device'),
      fixture(initial()),
      fixture(step(death, { type: 'end' })),
      fixture(pending(death, 1)),
      fixture(grant(pending(death, 1), 1)),
      fixture(exhausted),
    ];
    for (const f of cases) {
      expect(await f.read()).toEqual({ schemaVersion: 1, status: 'unavailable' });
      expect(f.authorize).not.toHaveBeenCalled();
      expect(f.query.mock.calls.some(([text]) => text.includes('reward_authorization_for'))).toBe(
        false,
      );
    }
    expect(exhausted.revivesGranted).toBe(10);
    expect(exhausted.revivesApplied).toBe(10);
  });
});
