import { describe, expect, it, vi } from 'vitest';
import { createLeaderboardHandler } from '../src/leaderboard-api.ts';
import type { LeaderboardApiOptions } from '../src/leaderboard-api.ts';
import type { SqlConnection } from '../src/database.ts';

const subject = '00000000-0000-4000-8000-000000000021';
const token = 'approved-token-not-public';
const origin = 'capacitor://localhost';
const world = {
  schemaVersion: 1,
  rulesetVersion: 'infinity-v1',
  scope: 'world',
  region: null,
  mappingVersion: null,
};
const country = {
  ...world,
  scope: 'country',
  region: 'BG',
  mappingVersion: 'cpi-regions-2026-11-v1',
};
function player(rank: number) {
  return {
    rank: String(rank),
    publicId: '11111111-1111-4111-8111-' + String(rank).padStart(12, '0'),
    username: 'player_' + String(rank),
    countryCode: 'BG',
    continentCode: 'EU',
    mappingVersion: 'cpi-regions-2026-11-v1',
    lastClearedRow: (9007199254740994n - BigInt(rank)).toString(),
    revivesToReachScore: 0,
    achievedAt: '2026-11-01T12:00:00Z',
  };
}
function snapshot(
  query: {
    schemaVersion: number;
    rulesetVersion: string;
    scope: string;
    region: string | null;
    mappingVersion: string | null;
  } = world,
  count = 105,
  personalized = true,
) {
  return {
    ...query,
    count: String(count),
    updatedAt: '2026-11-04T00:00:00Z',
    top100: Array.from({ length: Math.min(100, count) }, (_, index) => player(index + 1)),
    own: count >= 101 && personalized ? player(101) : null,
    neighbors: count >= 101 && personalized ? [99, 100, 101, 102, 103].map(player) : [],
  };
}
function fixture(overrides: Partial<LeaderboardApiOptions> = {}) {
  const query = vi
    .fn<SqlConnection['query']>()
    .mockResolvedValue({ rows: [{ board: snapshot() }] });
  const release = vi.fn<SqlConnection['release']>();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const authenticate = vi
    .fn<NonNullable<LeaderboardApiOptions['authenticate']>>()
    .mockResolvedValue({ subject, leaderboardAllowed: true });
  const rateLimit = vi.fn<LeaderboardApiOptions['rateLimit']>().mockResolvedValue(true);
  const allowPublicRead = vi.fn().mockResolvedValue(true);
  const handler = createLeaderboardHandler({
    database: { connect },
    authenticate,
    rateLimit,
    allowPublicRead,
    allowedRulesets: ['infinity-v1'],
    allowedMappingVersions: ['cpi-regions-2026-11-v1'],
    allowOrigin: (candidate) => candidate === origin,
    ...overrides,
  });
  return { handler, query, release, connect, authenticate, rateLimit, allowPublicRead };
}
function request(
  body: unknown = world,
  authenticated = true,
  url = 'https://api.example.invalid/leaderboard/read',
) {
  return new Request(url, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(authenticated ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('CPI-023/024 trusted leaderboard HTTP boundary', () => {
  it('accepts only its explicitly configured mount and rejects ambiguous service prefixes', async () => {
    const f = fixture({ basePath: '/cpi' });
    expect(
      (await f.handler(request(world, true, 'https://api.example.invalid/cpi/leaderboard/read')))
        .status,
    ).toBe(200);
    expect(
      (await f.handler(request(world, true, 'https://api.example.invalid/leaderboard/read')))
        .status,
    ).toBe(404);
    expect(
      (
        await f.handler(
          request(world, true, 'https://api.example.invalid/cpi-evil/leaderboard/read'),
        )
      ).status,
    ).toBe(404);
    for (const basePath of [
      '/',
      '/cpi/',
      'cpi',
      '/cpi//v1',
      '/cpi/../v1',
      '/cpi%2Fv1',
      '/cpi?secret=x',
    ])
      expect(() => fixture({ basePath })).toThrow('Invalid server base path');
  });
  it('binds the optional own account to verified authentication and one stable parameterized SQL statement', async () => {
    const f = fixture();
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    expect(f.authenticate).toHaveBeenCalledWith(token);
    expect(f.rateLimit.mock.calls.map((call) => call[1])).toEqual([null, subject]);
    expect(f.query).toHaveBeenCalledExactlyOnceWith(
      'select cpi_private.read_leaderboard($1::text,$2::text,$3::text,$4::text,$5::uuid) as board',
      ['infinity-v1', 'world', null, null, subject],
    );
    const body = (await response.json()) as ReturnType<typeof snapshot>;
    expect(body.own?.rank).toBe('101');
    expect(body.neighbors.map((item) => item.rank)).toEqual(['99', '100', '101', '102', '103']);
    expect(body.top100[0].lastClearedRow).toBe('9007199254740993');
    expect(body.top100[1].lastClearedRow).toBe('9007199254740992');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    expect(f.release).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('permits only explicitly authorized public reads, without authentication or personal associations', async () => {
    const f = fixture();
    expect((await f.handler(request(world, false))).status).toBe(200);
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(f.query.mock.calls[0][1]?.[4]).toBeNull();
    const response = await f.handler(request(world, false));
    const body = (await response.json()) as ReturnType<typeof snapshot>;
    expect(body.own).toBeNull();
    expect(body.neighbors).toEqual([]);
    const denied = fixture({ allowPublicRead: (query) => query.scope === 'world' });
    expect((await denied.handler(request(country, false))).status).toBe(403);
    expect(denied.connect).not.toHaveBeenCalled();
  });

  it('never falls back to guest when a bearer is invalid, unapproved, malformed or unverifiable', async () => {
    const f = fixture();
    f.authenticate.mockResolvedValue(null);
    expect((await f.handler(request())).status).toBe(401);
    expect(f.allowPublicRead).not.toHaveBeenCalled();
    f.authenticate.mockResolvedValue({ subject, leaderboardAllowed: false });
    expect((await f.handler(request())).status).toBe(401);
    f.authenticate.mockResolvedValue({ subject: 'invalid', leaderboardAllowed: true });
    expect((await f.handler(request())).status).toBe(401);
    const malformed = request();
    malformed.headers.set('authorization', 'Bearer short');
    expect((await f.handler(malformed)).status).toBe(401);
    const unavailable = fixture({ authenticate: undefined });
    expect((await unavailable.handler(request())).status).toBe(401);
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('rejects all body identities, private fields, score submissions and scope/version confusion', async () => {
    for (const body of [
      { ...world, ownUser: subject },
      { ...world, user_id: subject },
      { ...world, score: '99999' },
      { ...world, age: 18 },
      { ...world, privacyContext: 'adult' },
      { ...world, region: 'BG' },
      { ...world, mappingVersion: 'cpi-regions-2026-11-v1' },
      { ...world, rulesetVersion: 'unapproved' },
      { ...world, rulesetVersion: "infinity-v1'; drop table x" },
      { ...world, schemaVersion: '1' },
      { ...country, mappingVersion: 'unapproved' },
      { ...country, region: 'bg' },
      { ...country, scope: 'continent', region: 'EUROPE' },
      { ...country, scope: 'world' },
      { schemaVersion: 1 },
      null,
    ]) {
      const f = fixture();
      expect((await f.handler(request(body))).status).toBe(400);
      expect(f.connect).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.query.mockResolvedValue({ rows: [{ board: snapshot(country) }] });
    expect((await f.handler(request(country))).status).toBe(200);
    expect(f.query.mock.calls[0][1]).toEqual([
      'infinity-v1',
      'country',
      'BG',
      'cpi-regions-2026-11-v1',
      subject,
    ]);
  });

  it('enforces pre-authentication and per-account durable limits before querying', async () => {
    const f = fixture();
    f.rateLimit.mockResolvedValue(false);
    expect((await f.handler(request())).status).toBe(429);
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(f.connect).not.toHaveBeenCalled();
    const perAccount = fixture();
    perAccount.rateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await perAccount.handler(request())).status).toBe(429);
    expect(perAccount.connect).not.toHaveBeenCalled();
  });

  it('handles only allowlisted CORS preflight on the fixed HTTPS route', async () => {
    const f = fixture();
    const preflight = new Request('https://api.example.invalid/leaderboard/read', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, Content-Type',
      },
    });
    const response = await f.handler(preflight);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(f.rateLimit).not.toHaveBeenCalled();
    expect(f.authenticate).not.toHaveBeenCalled();
    preflight.headers.set('access-control-request-headers', 'x-untrusted-identity');
    expect((await f.handler(preflight)).status).toBe(405);
    const alien = request();
    alien.headers.set('origin', 'https://alien.invalid');
    const denied = await f.handler(alien);
    expect(denied.status).toBe(403);
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    expect(
      (await f.handler(request(world, true, 'https://api.example.invalid/another/read'))).status,
    ).toBe(404);
    expect(
      (await f.handler(request(world, true, 'http://api.example.invalid/leaderboard/read'))).status,
    ).toBe(400);
    expect(
      (
        await f.handler(
          request(world, true, 'https://api.example.invalid/leaderboard/read?user=private'),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.handler(
          new Request('https://api.example.invalid/leaderboard/read', { headers: { origin } }),
        )
      ).status,
    ).toBe(405);
  });

  it('limits actual request bytes, rejects compressed/invalid JSON and never opens a connection', async () => {
    const f = fixture();
    for (const payload of ['{invalid', JSON.stringify({ ...world, padding: 'x'.repeat(4096) })])
      expect((await f.handler(new Request(request(), { body: payload }))).status).toBe(400);
    const claimed = request();
    claimed.headers.set('content-length', '999999');
    expect((await f.handler(claimed)).status).toBe(400);
    const compressed = request();
    compressed.headers.set('content-encoding', 'gzip');
    expect((await f.handler(compressed)).status).toBe(400);
    const invalidUtf8 = new Request(request(), { body: new Uint8Array([0xff, 0xfe]) });
    expect((await f.handler(invalidUtf8)).status).toBe(400);
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('reconstructs public SQL fields and excludes all private extras from successful responses', async () => {
    const f = fixture();
    const value = snapshot(world, 1);
    f.query.mockResolvedValue({
      rows: [
        {
          board: {
            ...value,
            user_id: subject,
            email: 'private@example.invalid',
            privacyContext: 'child',
            top100: [
              { ...value.top100[0], checkpoint_private: { safeSide: 'left' }, accessToken: token },
            ],
          },
        },
      ],
    });
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/user_id|private@|privacyContext|checkpoint|safeSide|approved-token/);
    expect(text).toContain('9007199254740993');
  });

  it('fails closed on malformed SQL projections, mismatched scopes and numeric coercion', async () => {
    const good = snapshot(world, 1);
    for (const malformed of [
      null,
      { ...good, count: 1 },
      { ...good, own: player(101) },
      { ...good, scope: 'country' },
      { ...good, top100: [{ ...player(1), lastClearedRow: 9007199254740992 }] },
      { ...good, top100: [{ ...player(1), rank: '01' }] },
      { ...good, top100: [{ ...player(1), revivesToReachScore: 11 }] },
      { ...good, neighbors: [player(1)] },
    ]) {
      const f = fixture();
      f.query.mockResolvedValue({ rows: [{ board: malformed }] });
      const response = await f.handler(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'service_unavailable' });
      expect(f.release).toHaveBeenCalledOnce();
    }
    const empty = fixture();
    empty.query.mockResolvedValue({ rows: [{ board: snapshot(world, 0) }] });
    expect((await empty.handler(request())).status).toBe(200);
  });

  it('returns only generic failures for verifier/limiter/database errors and discards failed query connections', async () => {
    const f = fixture();
    f.query.mockRejectedValue(new Error('postgres://secret:password@host/private@example.invalid'));
    const response = await f.handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"code":"service_unavailable"}');
    expect(f.release).toHaveBeenCalledExactlyOnceWith(
      new Error('Leaderboard database query failed'),
    );
    expect(f.query).toHaveBeenCalledTimes(1);
    const unavailable = fixture();
    unavailable.authenticate.mockRejectedValue(new Error(token));
    expect((await unavailable.handler(request())).status).toBe(503);
    expect(unavailable.connect).not.toHaveBeenCalled();
    const limiter = fixture();
    limiter.rateLimit.mockRejectedValue(new Error('sensitive limitation'));
    expect((await limiter.handler(request())).status).toBe(503);
    expect(limiter.connect).not.toHaveBeenCalled();
  });
});
