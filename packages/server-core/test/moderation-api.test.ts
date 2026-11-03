import { describe, expect, it, vi } from 'vitest';
import { createModerationHandler } from '../src/moderation-api.ts';
import type { ModerationApiOptions } from '../src/moderation-api.ts';
import type { SqlConnection } from '../src/database.ts';
const subject = '25000000-0000-4000-8000-000000000001';
const target = '25100000-0000-4000-8000-000000000002';
const caseId = '25300000-0000-4000-8000-000000000001';
const decisionId = '25400000-0000-4000-8000-000000000001';
const runId = '25200000-0000-4000-8000-000000000002';
const reporterToken = 'reporter-verified-access-token';
const staffToken = 'moderator-verified-access-token';
const origin = 'capacitor://localhost';
const report = { schemaVersion: 1, targetPublicId: target, reason: 'spam' };
const review = { schemaVersion: 1, caseId, decisionId, decision: 'hide_player', runId: null };
const queueInput = { schemaVersion: 1, afterAt: null, afterId: null };
function queue() {
  return {
    schemaVersion: 1,
    cases: [
      {
        caseId,
        targetPublicId: target,
        username: 'prism_player',
        updatedAt: '2026-11-04T00:00:00Z',
        reasons: { spam: '2' },
      },
    ],
    next: null,
  };
}
function fixture() {
  const query = vi.fn<SqlConnection['query']>().mockImplementation((sql, values = []) =>
    Promise.resolve({
      rows: [
        {
          result: sql.includes('submit_name_report')
            ? { status: 'accepted' }
            : sql.includes('read_moderation_queue')
              ? queue()
              : { status: 'reviewed', caseId: values[0], decisionId: values[1] },
        },
      ],
    }),
  );
  const release = vi.fn<SqlConnection['release']>();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const authenticateReporter = vi
    .fn<ModerationApiOptions['authenticateReporter']>()
    .mockImplementation((token) =>
      Promise.resolve(token === reporterToken ? { subject, reportAllowed: true } : null),
    );
  const authenticateModerator = vi
    .fn<ModerationApiOptions['authenticateModerator']>()
    .mockImplementation((token) =>
      Promise.resolve(
        token === staffToken
          ? { actorReference: 'staff:one', canReadQueue: true, canReview: true }
          : null,
      ),
    );
  const rateLimit = vi.fn<ModerationApiOptions['rateLimit']>().mockResolvedValue(true);
  const handler = createModerationHandler({
    database: { connect },
    authenticateReporter,
    authenticateModerator,
    rateLimit,
    allowOrigin: (candidate) => candidate === origin,
  });
  return {
    handler,
    query,
    release,
    connect,
    authenticateReporter,
    authenticateModerator,
    rateLimit,
  };
}
function request(route = 'report', input: unknown = report, token = reporterToken) {
  return new Request('https://api.example.invalid/moderation/' + route, {
    method: 'POST',
    headers: { origin, authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
describe('CPI-025 authenticated minimal reports and separate staff authority', () => {
  it('binds reporter identity to the verified bearer and submits only an allowlisted reason/public target', async () => {
    const f = fixture();
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(f.query).toHaveBeenCalledExactlyOnceWith(
      'select cpi_private.submit_name_report($1::uuid,$2::uuid,$3::text) as result',
      [subject, target, 'spam'],
    );
    expect(f.rateLimit.mock.calls.map((call) => call[1])).toEqual([null, subject]);
    expect(f.authenticateModerator).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(undefined);
  });
  it('rejects body identities, staff flags, private fields and free text instead of retaining them', async () => {
    for (const input of [
      { ...report, reporterUserId: subject },
      { ...report, actorReference: 'staff:forged' },
      { ...report, isAdmin: true },
      { ...report, privacyContext: 'adult' },
      { ...report, email: 'person@example.invalid' },
      { ...report, reason: 'this score looks too high' },
      { ...report, details: 'free text' },
      { ...report, targetPublicId: 'not-a-uuid' },
      { schemaVersion: 1, reason: 'spam' },
    ]) {
      const f = fixture();
      expect((await f.handler(request('report', input))).status).toBe(400);
      expect(f.connect).not.toHaveBeenCalled();
    }
  });
  it('denies ordinary mobile bearers all staff routes with no role flag or reporter fallback', async () => {
    const f = fixture();
    expect((await f.handler(request('queue', queueInput))).status).toBe(403);
    expect((await f.handler(request('review', { ...review, isAdmin: true }))).status).toBe(403);
    expect(f.authenticateReporter).not.toHaveBeenCalled();
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('uses the server-verified staff identity for audited hide/restore/disqualification decisions', async () => {
    const f = fixture();
    const response = await f.handler(request('review', review, staffToken));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'reviewed', caseId, decisionId });
    expect(f.query).toHaveBeenCalledExactlyOnceWith(
      'select cpi_private.review_moderation_case($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text) as result',
      [caseId, decisionId, 'hide_player', null, 'staff:one'],
    );
    expect(f.rateLimit.mock.calls.map((call) => call[1])).toEqual([null, 'moderator:staff:one']);
    for (const decision of ['dismiss', 'restore_player', 'disqualify_run', 'restore_run']) {
      const g = fixture();
      expect(
        (
          await g.handler(
            request(
              'review',
              { ...review, decision, runId: decision.endsWith('_run') ? runId : null },
              staffToken,
            ),
          )
        ).status,
      ).toBe(200);
    }
    for (const invalid of [
      { ...review, actorReference: 'staff:forged' },
      { ...review, decision: 'reset_private_age' },
      { ...review, decision: 'disqualify_run' },
      { ...review, runId },
      { ...review, username: 'replacement' },
      { ...review, decisionId: 'invalid' },
    ]) {
      const g = fixture();
      expect((await g.handler(request('review', invalid, staffToken))).status).toBe(400);
      expect(g.connect).not.toHaveBeenCalled();
    }
  });
  it('separates staff queue permission from review authority and rejects a non-opaque staff reference', async () => {
    const f = fixture();
    f.authenticateModerator.mockResolvedValue({
      actorReference: 'staff:read-only',
      canReadQueue: true,
      canReview: false,
    });
    expect((await f.handler(request('queue', queueInput, staffToken))).status).toBe(200);
    expect((await f.handler(request('review', review, staffToken))).status).toBe(403);
    const invalid = fixture();
    invalid.authenticateModerator.mockResolvedValue({
      actorReference: 'staff@example.invalid',
      canReadQueue: true,
      canReview: true,
    });
    expect((await invalid.handler(request('queue', queueInput, staffToken))).status).toBe(403);
    expect(invalid.connect).not.toHaveBeenCalled();
  });
  it('returns a bounded private staff queue without reporter IDs, private profile fields or raw SQL extras', async () => {
    const f = fixture();
    const raw = queue();
    f.query.mockResolvedValue({
      rows: [
        {
          result: {
            ...raw,
            email: 'secret@example.invalid',
            cases: [
              {
                ...raw.cases[0],
                reporterUserId: subject,
                privacyContext: 'child',
                analyticsAgeBand: 'under_13',
              },
            ],
          },
        },
      ],
    });
    const response = await f.handler(request('queue', queueInput, staffToken));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"spam":"2"');
    expect(text).not.toMatch(/reporterUserId|25000000|email|privacy|AgeBand/);
    expect(f.query.mock.calls[0][1]).toEqual([null, null]);
    const paged = fixture();
    const afterAt = '2026-11-04T00:00:00Z';
    expect(
      (
        await paged.handler(
          request('queue', { schemaVersion: 1, afterAt, afterId: caseId }, staffToken),
        )
      ).status,
    ).toBe(200);
    expect(paged.query.mock.calls[0][1]).toEqual([afterAt, caseId]);
    const bad = fixture();
    expect(
      (await bad.handler(request('queue', { ...queueInput, afterId: caseId }, staffToken))).status,
    ).toBe(400);
  });
  it('fails closed on malformed or unbounded queue projections', async () => {
    const raw = queue();
    for (const malformed of [
      null,
      { ...raw, schemaVersion: 2 },
      { ...raw, cases: Array.from({ length: 101 }, () => raw.cases[0]) },
      { ...raw, cases: [{ ...raw.cases[0], reasons: { spam: 2 } }] },
      { ...raw, cases: [{ ...raw.cases[0], reasons: { free_text: '1' } }] },
      { ...raw, cases: [raw.cases[0], raw.cases[0]] },
      { ...raw, next: { afterId: caseId } },
    ]) {
      const f = fixture();
      f.query.mockResolvedValue({ rows: [{ result: malformed }] });
      const response = await f.handler(request('queue', queueInput, staffToken));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'service_unavailable' });
    }
  });
  it('enforces host limits and maps the independent durable SQL reporter/target limit without raw errors', async () => {
    const f = fixture();
    f.rateLimit.mockResolvedValue(false);
    expect((await f.handler(request())).status).toBe(429);
    expect(f.authenticateReporter).not.toHaveBeenCalled();
    const perActor = fixture();
    perActor.rateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await perActor.handler(request())).status).toBe(429);
    expect(perActor.connect).not.toHaveBeenCalled();
    const durable = fixture();
    durable.query.mockRejectedValue(new Error('CPI_REPORT_RATE_LIMITED'));
    const response = await durable.handler(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ code: 'rate_limited' });
    expect(durable.release).toHaveBeenCalledExactlyOnceWith(undefined);
    const conflict = fixture();
    conflict.query.mockRejectedValue(new Error('CPI_MODERATION_CONFLICT'));
    expect((await conflict.handler(request('review', review, staffToken))).status).toBe(409);
  });
  it('requires fresh reporter policy authorization and rejects cookies/missing bearer shortcuts', async () => {
    const f = fixture();
    f.authenticateReporter.mockResolvedValue({ subject, reportAllowed: false });
    expect((await f.handler(request())).status).toBe(401);
    expect(f.connect).not.toHaveBeenCalled();
    const absent = request();
    absent.headers.delete('authorization');
    absent.headers.set('cookie', 'admin=true');
    expect((await f.handler(absent)).status).toBe(401);
  });
  it('restricts fixed HTTPS routes, preflight, streamed size, encoding and origin before database access', async () => {
    const f = fixture();
    const alien = request();
    alien.headers.set('origin', 'https://alien.invalid');
    expect((await f.handler(alien)).status).toBe(403);
    const preflight = new Request('https://api.example.invalid/moderation/report', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    });
    expect((await f.handler(preflight)).status).toBe(204);
    preflight.headers.set('access-control-request-headers', 'x-user-role');
    expect((await f.handler(preflight)).status).toBe(405);
    for (const payload of ['{invalid', JSON.stringify({ ...report, junk: 'x'.repeat(4096) })])
      expect((await f.handler(new Request(request(), { body: payload }))).status).toBe(400);
    const compressed = request();
    compressed.headers.set('content-encoding', 'gzip');
    expect((await f.handler(compressed)).status).toBe(400);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('redacts verifier/database exceptions and discards a failed autocommit query connection', async () => {
    const f = fixture();
    f.query.mockRejectedValue(new Error('postgres://password@host/private@example.invalid'));
    const response = await f.handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"code":"service_unavailable"}');
    expect(f.release).toHaveBeenCalledExactlyOnceWith(
      new Error('Moderation database query failed'),
    );
    const auth = fixture();
    auth.authenticateModerator.mockRejectedValue(new Error(staffToken));
    expect((await auth.handler(request('queue', queueInput, staffToken))).status).toBe(503);
    expect(auth.connect).not.toHaveBeenCalled();
  });
});
