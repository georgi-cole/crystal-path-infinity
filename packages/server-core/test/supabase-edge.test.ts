import { describe, expect, it, vi } from 'vitest';
import {
  createApprovedEdgeServices,
  createSupabaseEdgeHandler,
  createSupabaseIdentityVerifier,
  DEVELOPMENT_PROJECT,
  readEdgeConfiguration,
} from '../src/supabase-edge.ts';
import { createEdgeSqlPool } from '../src/supabase-database.ts';
import type { EdgeDatabaseOptions } from '../src/supabase-database.ts';

const projectUrl = `https://${DEVELOPMENT_PROJECT}.supabase.co`;
const config = { projectUrl, publishableKey: 'public-key', origins: ['capacitor://localhost'] };
const subject = '00000000-0000-4000-8000-000000000001';
const token = 'verified-test-access-token';
const user = {
  id: subject,
  role: 'authenticated',
  is_anonymous: false,
  email_confirmed_at: '2026-11-04T00:00:00Z',
};
function post(path: string, extras: Record<string, string> = {}) {
  return new Request(projectUrl + '/functions/v1/cpi-api' + path, {
    method: 'POST',
    headers: {
      origin: 'capacitor://localhost',
      'content-type': 'application/json',
      authorization: 'Bearer ' + token,
      ...extras,
    },
    body: '{"schemaVersion":1}',
  });
}

describe('Supabase edge boundary', () => {
  it('targets only the designated development project and cannot activate accounts or ads', () => {
    const env: Record<string, string> = {
      SUPABASE_URL: projectUrl,
      SUPABASE_ANON_KEY: 'public-key',
    };
    expect(readEdgeConfiguration((key) => env[key]).origins).toEqual([]);
    for (const values of [
      { SUPABASE_URL: 'https://other.supabase.co' },
      { SUPABASE_ANON_KEY: '' },
      { CPI_ENABLE_ACCOUNTS: 'true' },
      { CPI_ENABLE_ADS: 'true' },
      { CPI_ALLOWED_ORIGINS: '*' },
      { CPI_ALLOWED_ORIGINS: 'https://example.com/path' },
    ]) {
      const combined: Record<string, string | undefined> = { ...env, ...values };
      expect(() => readEdgeConfiguration((key) => combined[key])).toThrow();
    }
  });

  it('keeps every current account/game/ad route unavailable without approved services', async () => {
    const server = createSupabaseEdgeHandler(config);
    for (const path of [
      '/eligibility',
      '/otp/request',
      '/otp/verify',
      '/session/exchange',
      '/session/refresh',
      '/session/revoke',
      '/profile/read',
      '/profile/save',
      '/ranked/start',
      '/rewards/intent',
      '/account/delete',
    ]) {
      const response = await server(post(path));
      expect(response.status, path).toBe(503);
      expect(await response.json()).toEqual({ code: 'service_unavailable' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('rejects hostile origins, cookies, credential queries, methods and wrong mounts before dispatch', async () => {
    const profile = vi.fn().mockResolvedValue(new Response('{}'));
    const server = createSupabaseEdgeHandler(config, { profile });
    expect((await server(post('/profile/read', { origin: 'https://evil.invalid' }))).status).toBe(
      403,
    );
    expect((await server(post('/profile/read', { cookie: 'session=secret' }))).status).toBe(400);
    expect((await server(post('/profile/read?token=secret'))).status).toBe(400);
    expect((await server(new Request(projectUrl + '/cpi-api/profile/read'))).status).toBe(405);
    expect(
      (await server(new Request(projectUrl + '/other/profile/read', { method: 'POST' }))).status,
    ).toBe(404);
    expect(profile).not.toHaveBeenCalled();
  });

  it('handles strict preflight without invoking Auth or SQL', async () => {
    const server = createSupabaseEdgeHandler(config);
    const options = (headers: Record<string, string>) =>
      new Request(projectUrl + '/cpi-api/profile/read', { method: 'OPTIONS', headers });
    const headers = {
      origin: 'capacitor://localhost',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,apikey,content-type',
    };
    const response = await server(options(headers));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(
      (await server(options({ ...headers, 'access-control-request-headers': 'x-user-id' }))).status,
    ).toBe(400);
    expect((await server(options({ ...headers, origin: 'null' }))).status).toBe(403);
  });

  it('preserves the original Request and supports both gateway mount shapes', async () => {
    const seen: Request[] = [];
    const profile = (request: Request) => {
      seen.push(request);
      return Promise.resolve(new Response('{}'));
    };
    const server = createSupabaseEdgeHandler(config, { profile });
    const request = post('/profile/read');
    expect((await server(request)).status).toBe(200);
    expect(seen[0]).toBe(request);
    expect(
      (await server(new Request(projectUrl + '/cpi-api/profile/read', { method: 'POST' }))).status,
    ).toBe(200);
  });

  it('does not treat a verified identity as privacy/revocation approval', async () => {
    const connect = vi.fn();
    const authorize = vi.fn().mockResolvedValue(false);
    const verifyIdentity = createSupabaseIdentityVerifier(
      config,
      vi
        .fn()
        .mockResolvedValue(Response.json({ ...user, user_metadata: { profileAllowed: true } })),
    );
    const server = createSupabaseEdgeHandler(
      config,
      createApprovedEdgeServices(config, {
        database: { connect },
        verifyIdentity,
        authorize,
        rateLimit: () => Promise.resolve(true),
        allowedRulesets: ['infinity-v1'],
        allowedMappingVersions: ['countries-v1'],
      }),
    );
    expect((await server(post('/profile/read'))).status).toBe(401);
    expect(authorize).toHaveBeenCalledWith(subject, token);
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails closed on policy/limiter errors without exposing provider messages', async () => {
    const connect = vi.fn();
    const server = createSupabaseEdgeHandler(
      config,
      createApprovedEdgeServices(config, {
        database: { connect },
        verifyIdentity: () => Promise.resolve(subject),
        authorize: () => Promise.reject(new Error('private policy detail')),
        rateLimit: () => Promise.resolve(true),
        allowedRulesets: [],
        allowedMappingVersions: [],
      }),
    );
    const response = await server(post('/profile/read'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('remote Supabase token verification', () => {
  it('uses only the fixed Auth origin, headers and bounded no-redirect request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(user));
    expect(await createSupabaseIdentityVerifier(config, fetcher)(token)).toBe(subject);
    expect(fetcher).toHaveBeenCalledWith(
      projectUrl + '/auth/v1/user',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        headers: { authorization: 'Bearer ' + token, apikey: 'public-key' },
      }),
    );
    expect(() =>
      createSupabaseIdentityVerifier({ ...config, projectUrl: 'https://evil.invalid' }),
    ).toThrow();
  });

  it.each([
    null,
    [],
    {},
    { ...user, id: 'not-a-uuid' },
    { ...user, role: 'service_role' },
    { ...user, is_anonymous: true },
    { ...user, email_confirmed_at: null },
    { ...user, email_confirmed_at: 'invalid' },
  ])('rejects malformed, anonymous, unconfirmed and non-user identities %#', async (body) => {
    expect(
      await createSupabaseIdentityVerifier(
        config,
        vi.fn().mockResolvedValue(Response.json(body)),
      )(token),
    ).toBeNull();
  });

  it('rejects invalid tokens without network and bounds provider errors/body size/time', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const verify = createSupabaseIdentityVerifier(config, fetcher);
    for (const value of ['short', 'x'.repeat(8193), 'bad token', 'token\nheader'])
      expect(await verify(value)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response('private error', { status: 401 }));
    expect(await verify(token)).toBeNull();
    fetcher.mockRejectedValueOnce(new Error('private network error'));
    expect(await verify(token)).toBeNull();
    fetcher.mockResolvedValueOnce(new Response('x'.repeat(65537)));
    expect(await verify(token)).toBeNull();
    vi.useFakeTimers();
    try {
      fetcher.mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
          }),
      );
      const pending = verify(token);
      await vi.advanceTimersByTimeAsync(5001);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('edge Postgres adapter', () => {
  const url = `postgresql://postgres:synthetic@db.${DEVELOPMENT_PROJECT}.supabase.co:5432/postgres`;
  function fixture() {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: 'service_role' }] });
    const end = vi.fn().mockResolvedValue(undefined);
    const client = { connect: vi.fn().mockResolvedValue(undefined), query, end };
    const make = vi.fn<(options: EdgeDatabaseOptions) => typeof client>().mockReturnValue(client);
    return { make, client, query, end };
  }
  it('requires a pinned development TLS session target and refuses URL overrides', () => {
    const f = fixture();
    for (const value of [
      url + '?sslmode=disable',
      url.replace(':5432', ':6543'),
      url.replace(DEVELOPMENT_PROJECT, 'other'),
      url.replace('/postgres', '/other'),
    ])
      expect(() => createEdgeSqlPool(value, f.make)).toThrow('Invalid development database target');
    expect(f.make).not.toHaveBeenCalled();
  });
  it('sets and verifies the runtime role before exposing query access, and disposes on release', async () => {
    const f = fixture();
    const pool = createEdgeSqlPool(url, f.make);
    const connection = await pool.connect();
    expect(f.make).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 5000,
        query_timeout: 15000,
      }),
    );
    expect(f.query.mock.calls.slice(0, 2)).toEqual([
      ['set role service_role'],
      ['select current_user as role'],
    ]);
    await connection.query('select $1', [subject]);
    connection.release();
    connection.release(new Error('uncertain commit'));
    await Promise.resolve();
    expect(f.end).toHaveBeenCalledOnce();
    await expect(connection.query('select 1')).rejects.toThrow('Connection closed');
  });
  it('disposes failed connections and redacts driver errors', async () => {
    const f = fixture();
    f.client.connect.mockRejectedValueOnce(new Error(url));
    await expect(createEdgeSqlPool(url, f.make).connect()).rejects.toThrow('Database unavailable');
    expect(f.end).toHaveBeenCalledOnce();
    f.query.mockResolvedValue({ rows: [{ role: 'postgres' }] });
    await expect(createEdgeSqlPool(url, f.make).connect()).rejects.toThrow('Database unavailable');
    expect(f.end).toHaveBeenCalledTimes(2);
  });
  it('bounds concurrent connections and recovers capacity after release', async () => {
    const f = fixture();
    const pool = createEdgeSqlPool(url, f.make);
    const connections = await Promise.all(Array.from({ length: 4 }, () => pool.connect()));
    await expect(pool.connect()).rejects.toThrow('Database busy');
    connections.forEach((connection) => connection.release());
    await Promise.resolve();
    await Promise.resolve();
    const next = await pool.connect();
    next.release();
  });
});
