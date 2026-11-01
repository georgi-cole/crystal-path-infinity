import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProbeStore, restoreSp, TEST_AD_UNITS } from './probe.ts';
import { verifyGoogleSsv } from './ssv.ts';
import { createProbeServer } from './index.ts';

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
function signed(query: string) {
  return `${query}&signature=${sign('sha256', Buffer.from(query), keys.privateKey).toString('base64url')}&key_id=123`;
}
function fixture(mode: 'synthetic' | 'native' = 'synthetic') {
  const store = new ProbeStore({ chooseSide: () => 'left' });
  const run = store.create(mode, mode === 'native' ? 'android' : 'web');
  return { store, run };
}
function nativeFields(intent: ReturnType<ProbeStore['intent']>, transaction = '1234567890abcdef') {
  return { ad_network: '5450213213286189855', ad_unit: TEST_AD_UNITS.android,
    custom_data: intent.intentId, reward_amount: '10', reward_item: 'coins',
    timestamp: String(Date.now()), transaction_id: transaction, user_id: intent.ssvUserId };
}
describe('authoritative lab fixture', () => {
  it('counts survived wrong rows, not fatal attempts, and never exposes the current answer', () => {
    const { store, run } = fixture();
    expect(JSON.stringify(run)).not.toContain('safeSide');
    for (let sequence = 1; sequence <= 15; sequence++) store.step(run.runId, run.token,
      { sequence, side: 'right', idempotencyKey: `step-${sequence}` });
    expect(store.get(run.runId, run.token)).toMatchObject({ sp: 0, lastClearedRow: 14, currentRow: 15, status: 'dead' });
    const intent = store.intent(run.runId, run.token);
    store.syntheticGrant(run.runId, run.token, intent.intentId); store.restore(run.runId, run.token, intent.intentId);
    expect(store.step(run.runId, run.token, { sequence: 16, side: 'left', idempotencyKey: 'retry' }).state.lastClearedRow).toBe(15);
  });
  it('enforces opaque bearer, strict sequence and bound idempotency', () => {
    const { store, run } = fixture();
    expect(() => store.get(run.runId, 'wrong')).toThrow('invalid_run_credentials');
    const action = { sequence: 1, side: 'right', idempotencyKey: 'one' };
    store.step(run.runId, run.token, action);
    expect(store.step(run.runId, run.token, action)).toMatchObject({ duplicate: true, state: { sp: 280, lastClearedRow: 1 } });
    expect(() => store.step(run.runId, run.token, { ...action, side: 'left' })).toThrow('idempotency_conflict');
    expect(() => store.step(run.runId, run.token, { ...action, idempotencyKey: 'another' })).toThrow('sequence_conflict');
  });
  it('applies 200x5/150x5, retries/no-fill preserve ordinal, and death after tenth is final', () => {
    const { store, run } = fixture(); const amounts: number[] = [];
    for (let k = 1; k <= 10; k++) {
      store.death(run.runId, run.token);
      const a = store.intent(run.runId, run.token); const retry = store.intent(run.runId, run.token);
      expect(retry).toEqual(a); expect(a.reviveNumber).toBe(k);
      expect(() => store.restore(run.runId, run.token, a.intentId)).toThrow('grant_required');
      store.syntheticGrant(run.runId, run.token, a.intentId);
      expect(store.syntheticGrant(run.runId, run.token, a.intentId).duplicate).toBe(true);
      amounts.push(store.restore(run.runId, run.token, a.intentId).state.sp);
      const step = store.step(run.runId, run.token, { sequence: k, side: 'right', idempotencyKey: String(k) });
      expect(store.restore(run.runId, run.token, a.intentId).state.sp).toBe(step.state.sp);
    }
    expect(amounts).toEqual([200,200,200,200,200,150,150,150,150,150]);
    expect(store.death(run.runId, run.token).status).toBe('finished');
    expect(() => store.intent(run.runId, run.token)).toThrow('run_not_dead');
    expect(() => restoreSp(11)).toThrow('revive_limit');
    expect(store.get(run.runId, run.token)).toMatchObject({ official: false, evidence: 'synthetic', verifiedSsvGrants: 0 });
  });
  it('native mode refuses synthetic grants and rejects cross-intent transaction replay', () => {
    const { store, run } = fixture('native'); store.death(run.runId, run.token);
    const a = store.intent(run.runId, run.token);
    expect(() => store.syntheticGrant(run.runId, run.token, a.intentId)).toThrow('synthetic_grant_forbidden');
    const fields = nativeFields(a);
    store.acceptVerifiedSsv(fields); expect(store.acceptVerifiedSsv(fields).duplicate).toBe(true);
    store.restore(run.runId, run.token, a.intentId); store.death(run.runId, run.token);
    const b = store.intent(run.runId, run.token);
    expect(() => store.acceptVerifiedSsv(nativeFields(b))).toThrow('transaction_conflict');
    expect(() => store.acceptVerifiedSsv({ ...nativeFields(b, '2222222222222222'), ad_unit: TEST_AD_UNITS.ios })).toThrow('ssv_fields_mismatch');
    expect(() => store.acceptVerifiedSsv({ ...nativeFields(b, '2222222222222222'), user_id: 'wrong' })).toThrow('ssv_fields_mismatch');
    expect(store.get(run.runId, run.token)).toMatchObject({ revivesGranted: 1, revivesApplied: 1, official: false });
  });
  it('retains bounded state without silently evicting pending runs', () => {
    const store = new ProbeStore({ maxRuns: 1, maxActions: 1, chooseSide: () => 'left' });
    const run = store.create('synthetic', 'web');
    expect(() => store.create('synthetic', 'web')).toThrow('lab_run_limit');
    store.step(run.runId, run.token, { sequence: 1, side: 'left', idempotencyKey: 'one' });
    expect(() => store.step(run.runId, run.token, { sequence: 2, side: 'left', idempotencyKey: 'two' })).toThrow('lab_action_limit');
    expect(store.get(run.runId, run.token).lastClearedRow).toBe(1);
  });
  it('preserves short documented hex transaction IDs without imposing a made-up minimum length', () => {
    const { store, run } = fixture('native'); store.death(run.runId, run.token);
    const intent = store.intent(run.runId, run.token);
    for (const transaction of ['', 'a'.repeat(257), 'a\n', 'not-hex']) {
      expect(() => store.acceptVerifiedSsv(nativeFields(intent, transaction))).toThrow('ssv_fields_mismatch');
    }
    expect(store.acceptVerifiedSsv(nativeFields(intent, 'a')).duplicate).toBe(false);
    expect(store.acceptVerifiedSsv(nativeFields(intent, 'a')).duplicate).toBe(true);
  });
});
describe('Google-format ECDSA verifier (local keys, not Google delivery evidence)', () => {
  it('verifies exact raw encoded bytes and rejects altered/re-encoded data', () => {
    const raw = 'ad_unit=5224354917&custom_data=a%2Fb%20c&timestamp=123';
    const callback = signed(raw);
    expect(verifyGoogleSsv(callback, publicPem).custom_data).toBe('a/b c');
    expect(() => verifyGoogleSsv(callback.replace('%20', '+'), publicPem)).toThrow('invalid_ssv_signature');
    expect(() => verifyGoogleSsv(callback.replace('5224354917', '1712485313'), publicPem)).toThrow('invalid_ssv_signature');
  });
  it('rejects missing/reordered trailer and ambiguous duplicate signed fields', () => {
    expect(() => verifyGoogleSsv('ad_unit=1&key_id=123&signature=x', publicPem)).toThrow('invalid_ssv');
    expect(() => verifyGoogleSsv(signed('ad_unit=1&ad_unit=2'), publicPem)).toThrow('duplicate_ssv_parameter');
    expect(() => verifyGoogleSsv(signed('ad_unit=1&signature=hidden'), publicPem)).toThrow('duplicate_ssv_parameter');
  });
});

// Exercise the actual HTTP handler without a listening socket. The workspace
// can prohibit loopback listen; this is deliberately not a wire/network test.
function request(server: ReturnType<typeof createProbeServer>, method: string, url: string,
  body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  req.method = method; req.url = url;
  req.headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders };
  return new Promise<{ status: number; body: any; headers: Map<string, string> }>(accept => {
    let status = 0; const headers = new Map<string, string>();
    const res = { setHeader(name: string, value: string) { headers.set(name, value); },
      writeHead(value: number) { status = value; },
      end(value: string) { accept({ status, body: JSON.parse(value), headers }); } } as unknown as ServerResponse;
    server.emit('request', req, res);
  });
}
describe('HTTP handler trust boundary (in-process transport)', () => {
  it('requires bearer, rejects unlisted origins/oversize bodies, and reports actual metrics', async () => {
    const server = createProbeServer();
    const creation = await request(server, 'POST', '/v1/probe/runs', { mode: 'synthetic', platform: 'web' });
    expect(creation.status).toBe(201);
    const { runId, token } = creation.body;
    expect((await request(server, 'GET', `/v1/probe/runs/${runId}`)).status).toBe(401);
    expect((await request(server, 'GET', `/v1/probe/runs/${runId}`, undefined, token)).body.state.official).toBe(false);
    expect((await request(server, 'GET', '/v1/probe/health', undefined, undefined, { origin: 'https://untrusted.example' })).status).toBe(403);
    expect((await request(server, 'POST', '/v1/probe/runs', { extra: 'x'.repeat(5000) })).status).toBe(413);
    const metrics = (await request(server, 'GET', '/v1/probe/metrics')).body;
    expect(metrics.requestBodyBytes).toBeGreaterThan(4096); expect(metrics.official).toBe(false);
    expect(metrics.measurement).toContain('not native');
  });
  it('client callbacks cannot grant; only a verified raw query grants native test evidence', async () => {
    const server = createProbeServer({ getPublicKey: async () => publicPem });
    const creation = await request(server, 'POST', '/v1/probe/runs', { mode: 'native', platform: 'android' });
    const { runId, token } = creation.body; const path = `/v1/probe/runs/${runId}`;
    await request(server, 'POST', `${path}/death`, {}, token);
    const intent = (await request(server, 'POST', `${path}/reward-intent`, {}, token)).body;
    for (const event of ['dismissed', 'earned', 'earned']) {
      expect((await request(server, 'POST', `${path}/client-event`, { event }, token)).body.state.revivesGranted).toBe(0);
    }
    expect((await request(server, 'POST', `${path}/synthetic-grant`, { intentId: intent.intentId }, token)).status).toBe(403);
    const raw = new URLSearchParams(nativeFields(intent)).toString(); const query = signed(raw);
    expect((await request(server, 'GET', `/ssv?${query.replace('reward_amount=10', 'reward_amount=11')}`)).status).toBe(403);
    const valid = await request(server, 'GET', `/ssv?${query}`);
    expect(valid.body).toEqual({ ok: true, duplicate: false, official: false, evidence: 'native-test-ssv' });
    expect((await request(server, 'GET', `/ssv?${query}`)).body.duplicate).toBe(true);
    const restored = await request(server, 'POST', `${path}/restore`, { intentId: intent.intentId }, token);
    expect(restored.body.state).toMatchObject({ sp: 200, revivesApplied: 1, verifiedSsvGrants: 1, official: false });
  });
});
