import { describe, expect, it, vi } from 'vitest';
import { createProfileHandler } from '../src/profile-api.ts';
import type { SqlConnection } from '../src/database.ts';
const subject = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const query = vi.fn<SqlConnection['query']>().mockImplementation((sql) =>
    Promise.resolve({
      rows: sql.startsWith('select user_id')
        ? [{ id: subject }]
        : sql.includes('as config')
          ? [{ config: { countries: [] }, owner: { profile: null } }]
          : [],
    }),
  );
  const release = vi.fn();
  const authenticate = vi.fn().mockResolvedValue({ subject, profileAllowed: true });
  const rateLimit = vi.fn().mockResolvedValue(true);
  const connect = vi.fn().mockResolvedValue({ query, release });
  const handler = createProfileHandler({
    database: { connect },
    authenticate,
    rateLimit,
    allowOrigin: (origin) => origin === 'capacitor://localhost',
  });
  return { query, release, authenticate, rateLimit, connect, handler };
}
function request(input: object, endpoint = 'save', token = 'verified-token-in-memory') {
  return new Request('https://example.invalid/cpi/profile/' + endpoint, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      origin: 'capacitor://localhost',
    },
    body: JSON.stringify({ schemaVersion: 1, ...input }),
  });
}
const edit = {
  username: 'Prism',
  countryCode: 'BG',
  analyticsAction: 'answer',
  analyticsAgeBand: '18_24',
};
describe('trusted profile routes', () => {
  it('binds subject to verified bearer and converts age action into fixed transactional SQL', async () => {
    const f = fixture();
    const result = await f.handler(request(edit));
    expect(result.status).toBe(200);
    expect(f.authenticate).toHaveBeenCalledWith('verified-token-in-memory');
    expect(f.query.mock.calls.map(([sql]) => sql.split(' ')[0])).toEqual([
      'begin',
      'insert',
      'select',
      'select',
      'select',
      'commit',
    ]);
    expect(f.query.mock.calls[3][1]).toEqual([subject, 'Prism', 'BG', 'set', '18_24']);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('rejects body identities, exact age, privacy context and raw eligibility before database access', async () => {
    for (const added of [
      { userId: subject },
      { age: 21 },
      { birthdate: '2000-01-01' },
      { privacyContext: 'adult' },
      { analyticsAllowed: true },
    ]) {
      const f = fixture();
      expect((await f.handler(request({ ...edit, ...added }))).status).toBe(400);
      expect(f.connect).not.toHaveBeenCalled();
    }
  });
  it('requires fresh trusted profile authorization, origin and durable limits', async () => {
    const f = fixture();
    f.authenticate.mockResolvedValue({ subject, profileAllowed: false });
    expect((await f.handler(request(edit))).status).toBe(401);
    expect(f.connect).not.toHaveBeenCalled();
    f.rateLimit.mockResolvedValue(false);
    expect((await f.handler(request(edit))).status).toBe(429);
    const alien = request(edit);
    alien.headers.set('origin', 'https://alien.invalid');
    expect((await f.handler(alien)).status).toBe(403);
  });
  it('rolls back all writes on name conflicts and returns only fixed public error', async () => {
    const f = fixture();
    f.query.mockImplementation((sql) => {
      if (sql.includes('save_profile'))
        return Promise.reject(new Error('CPI_PROFILE_USERNAME_TAKEN'));
      return Promise.resolve({ rows: sql.startsWith('select user_id') ? [{ id: subject }] : [] });
    });
    const result = await f.handler(request(edit));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ code: 'CPI_PROFILE_USERNAME_TAKEN' });
    expect(f.query).toHaveBeenLastCalledWith('rollback');
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('never reflects raw SQL messages, account data or credentials on errors', async () => {
    const f = fixture();
    f.connect.mockRejectedValue(new Error('database secret email@example.invalid'));
    const result = await f.handler(request(edit));
    expect(result.status).toBe(503);
    expect(await result.text()).toBe('{"code":"service_unavailable"}');
  });
  it('read cannot create a public profile or accept extra private parameters', async () => {
    const f = fixture();
    expect((await f.handler(request({}, 'read'))).status).toBe(200);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('save_profile'))).toBe(false);
  });
  it('discards a connection when transaction rollback fails', async () => {
    const f = fixture();
    f.query.mockImplementation((sql) => {
      if (sql === 'rollback' || sql.includes('save_profile'))
        return Promise.reject(new Error('private failure'));
      return Promise.resolve({
        rows: sql.startsWith('select user_id') ? [{ user_id: subject }] : [],
      });
    });
    expect((await f.handler(request(edit))).status).toBe(503);
    expect(f.release).toHaveBeenCalledWith(expect.any(Error));
  });
  it('supports allowlisted preflight and returns invalid JSON as a request error', async () => {
    const f = fixture();
    const preflight = new Request('https://example.invalid/cpi/profile/save', {
      method: 'OPTIONS',
      headers: { origin: 'capacitor://localhost' },
    });
    const cors = await f.handler(preflight);
    expect(cors.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(cors.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(f.authenticate).not.toHaveBeenCalled();
    const malformed = new Request(request(edit), { body: '{invalid' });
    expect((await f.handler(malformed)).status).toBe(400);
  });
});
