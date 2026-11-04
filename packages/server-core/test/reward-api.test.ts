import { describe, expect, it } from 'vitest';
import { createRewardHandler } from '../src/reward-api.ts';
import { RewardService } from '../src/reward-service.ts';
import type { RewardApiOptions } from '../src/reward-api.ts';

const actor = {
  subject: '00000000-0000-4000-8000-000000000681',
  deviceId: 'verified-device',
  clientBuild: 1,
  rewardsAllowed: true,
};
const runId = '00000000-0000-4000-8000-000000000682';
function fixture(policy = true) {
  const calls: string[] = [];
  let raw = '';
  let failed = false;
  const value = { schemaVersion: 1 as const, status: 'unavailable' as const };
  const service = {
    eligibility: () => {
      calls.push('eligibility');
      return failed ? Promise.reject(new Error('secret-db-credential')) : Promise.resolve(value);
    },
    intent: () => Promise.reject(new Error('not-used')),
    status: () => Promise.reject(new Error('not-used')),
    apply: () => Promise.reject(new Error('not-used')),
    receiveGoogleSsv: (query: string) => {
      raw = query;
      calls.push('ssv');
      return Promise.resolve({ status: 'accepted' as const });
    },
  } satisfies RewardApiOptions['service'];
  const handler = createRewardHandler({
    basePath: '/cpi',
    service,
    authenticate: (token) =>
      Promise.resolve(
        token === 'synthetic-access-token' ? { ...actor, rewardsAllowed: policy } : null,
      ),
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    rateLimit: () => Promise.resolve(true),
  });
  const request = (route: string, headers: Record<string, string> = {}) =>
    new Request('https://reward.example.invalid/cpi/rewards/' + route, {
      method: 'POST',
      headers: {
        origin: 'capacitor://localhost',
        authorization: 'Bearer synthetic-access-token',
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ runId }),
    });
  return {
    handler,
    calls,
    request,
    raw: () => raw,
    fail: () => {
      failed = true;
    },
  };
}
describe('trusted reward HTTP boundary', () => {
  it('does not treat truthy verifier values as an ad policy authorization', async () => {
    const state = fixture('yes' as never);
    expect((await state.handler(state.request('eligibility'))).status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });
  it('requires fresh authenticated policy and explicit origin before privacy-sensitive operations', async () => {
    const state = fixture();
    expect(
      (
        await state.handler(
          state.request('eligibility', { origin: 'https://hostile.example.invalid' }),
        )
      ).status,
    ).toBe(403);
    expect((await state.handler(state.request('eligibility', { authorization: '' }))).status).toBe(
      401,
    );
    expect(state.calls).toHaveLength(0);
    const result = await state.handler(state.request('eligibility'));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({ schemaVersion: 1, status: 'unavailable' });
  });
  it('preserves raw signed callback query bytes and provides no client-earned grant route', async () => {
    const state = fixture();
    const raw = 'ad_network=123&custom_data=a%2fb&signature=ABCD%3D&key_id=123';
    const result = await state.handler(
      new Request('https://reward.example.invalid/cpi/rewards/ssv?' + raw),
    );
    expect(result.status).toBe(200);
    expect(state.raw()).toBe(raw);
    expect((await state.handler(state.request('earned'))).status).toBe(404);
    expect((await state.handler(state.request('ssv'))).status).toBe(405);
    expect(state.calls).toEqual(['ssv']);
  });
  it('does not echo database, verifier, URL or credential failures', async () => {
    const state = fixture();
    state.fail();
    const result = await state.handler(state.request('eligibility'));
    expect(result.status).toBe(503);
    expect(await result.text()).toBe('{"code":"service_unavailable"}');
  });
  it('rejects forged policy, actor and scalar reward fields before any SQL transaction', async () => {
    let connections = 0;
    const service = new RewardService({
      environment: 'development',
      platform: 'android',
      database: {
        connect: () => {
          connections += 1;
          return Promise.reject(new Error('unexpected-database'));
        },
      },
    });
    await expect(service.eligibility(actor, { runId, canRequestAds: true })).rejects.toMatchObject({
      code: 'invalid-reward-request',
    });
    await expect(
      service.intent(actor, { runId, idempotencyKey: runId, privacyContext: 'adult' }),
    ).rejects.toMatchObject({ code: 'invalid-reward-request' });
    await expect(
      service.apply(actor, {
        runId,
        grantId: runId,
        idempotencyKey: runId,
        leaseToken: runId,
        sequence: '1',
        sp: 400,
      }),
    ).rejects.toMatchObject({ code: 'invalid-reward-request' });
    expect(connections).toBe(0);
  });
});
