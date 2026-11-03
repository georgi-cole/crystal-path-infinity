import { describe, expect, it } from 'vitest';
import { createRankedHandler } from '../src/ranked-api.ts';
import { RankedAuthority } from '../src/ranked.ts';
import type { RankedReceipt, RankedRepository, StoredRankedRun } from '../src/ranked.ts';

const subject = '00000000-0000-4000-8000-000000000021';
const token = 'test-access-token-never-log';
const origin = 'capacitor://localhost';

function fixture() {
  let record: StoredRankedRun | null = null;
  const receipts = new Map<string, RankedReceipt>();
  let id = 1;
  const newId = () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`;
  let allowed = true;
  let limited = false;
  let authenticateError = false;
  let transactionCalls = 0;
  const repository: RankedRepository = {
    transaction: (_subject, operation) => {
      transactionCalls += 1;
      return operation({
        getActiveRun: () => Promise.resolve(record),
        getRun: (runId) => Promise.resolve(record?.state.runId === runId ? record : null),
        getReceipt: (key) => Promise.resolve(receipts.get(key) ?? null),
        getRegionSnapshot: () =>
          Promise.resolve({
            countryCode: 'BG',
            continent: 'EU',
            mappingVersion: 'cpi-regions-2026-11-v1',
          }),
        saveRun: (next) => {
          record = structuredClone(next);
          return Promise.resolve();
        },
        saveReceipt: (receipt) => {
          receipts.set(receipt.key, structuredClone(receipt));
          return Promise.resolve();
        },
        appendAudit: () => Promise.resolve(),
      });
    },
  };
  const authority = new RankedAuthority({
    repository,
    newId,
    newSecret: () => 'a'.repeat(64),
    now: () => 1_000_000,
  });
  const handler = createRankedHandler({
    authority,
    authenticate: (candidate) =>
      authenticateError
        ? Promise.reject(new Error(`secret-database-url:${token}`))
        : Promise.resolve(
            candidate === token
              ? { subject, deviceId: 'trusted-session-device', rankedAllowed: allowed }
              : null,
          ),
    allowOrigin: (candidate) => candidate === origin,
    rateLimit: () => Promise.resolve(!limited),
  });
  const request = (route: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://accounts.example.invalid/ranked/${route}`, {
      method: 'POST',
      headers: {
        origin,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return {
    handler,
    request,
    newId,
    record: () => record,
    calls: () => transactionCalls,
    denyPolicy: () => {
      allowed = false;
    },
    limit: () => {
      limited = true;
    },
    failAuth: () => {
      authenticateError = true;
    },
  };
}

describe('trusted ranked HTTP routes', () => {
  it('uses verified actor/device, returns an issued lease, rejects forged scores and requires that lease for actions', async () => {
    const fixture = fixtureFactory();
    const started = await fixture.handler(
      fixture.request('start', { idempotencyKey: fixture.newId() }),
    );
    expect(started.status).toBe(200);
    expect(started.headers.get('cache-control')).toBe('no-store');
    expect(started.headers.get('access-control-allow-origin')).toBe(origin);
    expect(started.headers.get('access-control-allow-credentials')).toBeNull();
    const body = (await started.json()) as {
      snapshot: { runId: string; nextSequence: string };
      lease: { token: string };
    };
    expect(body.lease.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(fixture.record()?.subject).toBe(subject);
    expect(fixture.record()?.deviceId).toBe('trusted-session-device');
    const action = {
      runId: body.snapshot.runId,
      sequence: '1',
      leaseToken: body.lease.token,
      idempotencyKey: fixture.newId(),
      command: { type: 'resume' },
    };
    const resumed = await fixture.handler(fixture.request('action', action));
    expect(resumed.status).toBe(200);
    const forged = await fixture.handler(
      fixture.request('action', {
        ...action,
        sequence: '2',
        idempotencyKey: fixture.newId(),
        command: { type: 'choose', row: '1', life: 0, side: 'left', score: '999999' },
      }),
    );
    expect(forged.status).toBe(400);
    expect(await forged.json()).toEqual({ code: 'invalid-request' });
    const wrongLease = await fixture.handler(
      fixture.request('action', {
        ...action,
        sequence: '2',
        idempotencyKey: fixture.newId(),
        leaseToken: fixture.newId(),
        command: { type: 'heartbeat' },
      }),
    );
    expect(wrongLease.status).toBe(409);
    expect(await wrongLease.json()).toEqual({ code: 'lease-lost' });
    expect(fixture.record()?.nextSequence).toBe('2');
    expect(JSON.stringify(body)).not.toContain('a'.repeat(64));
  });

  it('cannot supply a different subject, device or ruleset through a start body', async () => {
    const fixture = fixtureFactory();
    for (const extra of [
      { subject },
      { deviceId: 'chosen-by-client' },
      { rulesetVersion: 'practice' },
    ]) {
      const result = await fixture.handler(
        fixture.request('start', { idempotencyKey: fixture.newId(), ...extra }),
      );
      expect(result.status).toBe(400);
    }
    expect(fixture.calls()).toBe(0);
  });

  it('requires current account policy and origin before touching durable state', async () => {
    const fixture = fixtureFactory();
    const badOrigin = await fixture.handler(
      fixture.request(
        'start',
        { idempotencyKey: fixture.newId() },
        { origin: 'https://unapproved.example.invalid' },
      ),
    );
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.get('access-control-allow-origin')).toBeNull();
    const noToken = await fixture.handler(
      fixture.request('start', { idempotencyKey: fixture.newId() }, { authorization: '' }),
    );
    expect(noToken.status).toBe(401);
    fixture.denyPolicy();
    const ineligible = await fixture.handler(
      fixture.request('start', { idempotencyKey: fixture.newId() }),
    );
    expect(ineligible.status).toBe(401);
    expect(fixture.calls()).toBe(0);
  });

  it('returns explicit allowlisted preflight headers and rejects other methods/routes or URL data', async () => {
    const fixture = fixtureFactory();
    const preflight = await fixture.handler(
      new Request('https://accounts.example.invalid/ranked/action', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type',
    );
    expect(await preflight.text()).toBe('');
    const wrongHeaders = await fixture.handler(
      new Request('https://accounts.example.invalid/ranked/action', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-user-id',
        },
      }),
    );
    expect(wrongHeaders.status).toBe(405);
    const badMethod = await fixture.handler(
      new Request('https://accounts.example.invalid/ranked/start', { headers: { origin } }),
    );
    expect(badMethod.status).toBe(405);
    for (const url of [
      'http://accounts.example.invalid/ranked/start',
      'https://accounts.example.invalid/ranked/start?email=private@example.invalid',
    ]) {
      expect(
        (await fixture.handler(new Request(url, { method: 'POST', headers: { origin } }))).status,
      ).toBe(400);
    }
    expect(
      (await fixture.handler(fixture.request('admin', { idempotencyKey: fixture.newId() }))).status,
    ).toBe(404);
    expect(fixture.calls()).toBe(0);
  });

  it('enforces a durable limiter and exposes only fixed error codes on verifier/database failures', async () => {
    const limited = fixtureFactory();
    limited.limit();
    const rate = await limited.handler(
      limited.request('start', { idempotencyKey: limited.newId() }),
    );
    expect(rate.status).toBe(429);
    expect(limited.calls()).toBe(0);
    const failed = fixtureFactory();
    failed.failAuth();
    const result = await failed.handler(
      failed.request('start', { idempotencyKey: failed.newId() }),
    );
    expect(result.status).toBe(503);
    expect(await result.text()).toBe('{"code":"service_unavailable"}');
  });

  it('stops reading a streamed body as soon as the byte budget is exceeded', async () => {
    const fixture = fixtureFactory();
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(4097)));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request('https://accounts.example.invalid/ranked/start', {
      method: 'POST',
      headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const result = await fixture.handler(request);
    expect(result.status).toBe(400);
    expect(canceled).toBe(true);
    expect(fixture.calls()).toBe(0);
    const wrongType = await fixture.handler(
      fixture.request(
        'start',
        { idempotencyKey: fixture.newId() },
        { 'content-type': 'text/plain' },
      ),
    );
    expect(wrongType.status).toBe(400);
    const overLength = await fixture.handler(
      fixture.request('start', { idempotencyKey: fixture.newId() }, { 'content-length': '4097' }),
    );
    expect(overLength.status).toBe(400);
  });
});

// Keep the fixtures private to this HTTP test; no mock adapter is exported in production.
const fixtureFactory = fixture;
