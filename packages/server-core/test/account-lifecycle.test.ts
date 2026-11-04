import { describe, expect, it, vi } from 'vitest';
import { createAccountLifecycleHandler, processAccountDeletion } from '../src/account-lifecycle.ts';
import type {
  AccountLifecycleOptions,
  ReauthenticationEvidence,
} from '../src/account-lifecycle.ts';
import type { SqlConnection } from '../src/database.ts';

const NOW = 1_800_000_000_000;
const A = '31000000-0000-4000-8000-000000000001';
const B = '31000000-0000-4000-8000-000000000002';
const REQUEST = '31100000-0000-4000-8000-000000000001';
const PROOF = '31500000-0000-4000-8000-000000000001';
const rawProof = 'signed-opaque-reauth-proof-0123456789';
function evidence(purpose: 'export' | 'delete'): ReauthenticationEvidence {
  return { subject: A, purpose, proofId: PROOF, verifiedAt: NOW - 1_000, expiresAt: NOW + 60_000 };
}
function status(state: 'not_found' | 'revocation_pending' | 'deleted') {
  return {
    requestId: REQUEST,
    status: state,
    ...(state !== 'not_found' ? { requestedAt: new Date(NOW).toISOString() } : {}),
    ...(state === 'deleted' ? { completedAt: new Date(NOW + 1).toISOString() } : {}),
  };
}
function fixture() {
  type State = 'not_found' | 'revocation_pending' | 'deleted';
  let state: State = 'not_found';
  let proofHashes = new Set<string>();
  let backup: { state: State; proofHashes: Set<string> } | null = null;
  const query = vi.fn<SqlConnection['query']>().mockImplementation(async (sql, values = []) => {
    await Promise.resolve();
    if (sql === 'begin') backup = { state, proofHashes: new Set(proofHashes) };
    else if (sql === 'commit') backup = null;
    else if (sql === 'rollback' && backup) {
      state = backup.state;
      proofHashes = new Set(backup.proofHashes);
      backup = null;
    } else if (sql.includes('consume_account_reauthentication')) {
      const hash = String(values[1]);
      if (proofHashes.has(hash)) throw new Error('CPI_ACCOUNT_REAUTH_REPLAY');
      proofHashes.add(hash);
    } else if (sql.includes('prepare_account_deletion')) {
      state = 'revocation_pending';
      return { rows: [{ status: status(state) }] };
    } else if (sql.includes('complete_account_deletion')) {
      state = 'deleted';
      return { rows: [{ status: status(state) }] };
    } else if (sql.includes('get_account_deletion_status'))
      return {
        rows: [
          {
            status: status(state),
            work: state === 'revocation_pending' ? { requestId: REQUEST, subject: A } : null,
          },
        ],
      };
    else if (sql.includes('export_account_page'))
      return {
        rows: [
          {
            account_export: {
              schemaVersion: 1,
              profile: { username: 'prism_a' },
              runs: [],
              next: { consent: null, parental: null, run: null, result: null },
            },
          },
        ],
      };
    else if (sql.includes('export_own_name_reports'))
      return {
        rows: [
          {
            report_export: {
              reports: [
                {
                  id: '31700000-0000-4000-8000-000000000001',
                  targetPublicId: '31800000-0000-4000-8000-000000000001',
                  reason: 'spam',
                  pending: true,
                  createdAt: new Date(NOW).toISOString(),
                },
              ],
              next: null,
            },
          },
        ],
      };
    else if (sql.includes('export_own_rewards'))
      return { rows: [{ reward_export: { rewards: [], next: null } }] };
    else if (sql.includes('export_own_ad_authorizations'))
      return { rows: [{ ad_authorization_export: { adAuthorizations: [], next: null } }] };
    return { rows: [] };
  });
  const release = vi.fn<SqlConnection['release']>();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const authenticate = vi
    .fn<AccountLifecycleOptions['authenticate']>()
    .mockResolvedValue({ subject: A });
  const verifyReauthentication = vi
    .fn<AccountLifecycleOptions['verifyReauthentication']>()
    .mockImplementation(({ purpose }) => Promise.resolve(evidence(purpose)));
  const revokeAllSessions = vi
    .fn<AccountLifecycleOptions['revokeAllSessions']>()
    .mockImplementation(({ subject, operationId }) =>
      Promise.resolve({ status: 'revoked', subject, operationId }),
    );
  const rateLimit = vi.fn<AccountLifecycleOptions['rateLimit']>().mockResolvedValue(true);
  const options: AccountLifecycleOptions = {
    database: { connect },
    authenticate,
    verifyReauthentication,
    revokeAllSessions,
    allowOrigin: (origin) =>
      origin === 'capacitor://localhost' || origin === 'https://account.example.invalid',
    rateLimit,
    now: () => NOW,
  };
  return {
    query,
    release,
    connect,
    authenticate,
    verifyReauthentication,
    revokeAllSessions,
    rateLimit,
    options,
    handler: createAccountLifecycleHandler(options),
    current: () => state,
  };
}
function request(endpoint: string, input: object = {}, origin = 'capacitor://localhost') {
  return new Request('https://api.example.invalid/cpi/account/' + endpoint, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      authorization: 'Bearer verified-access-token-0123456789',
    },
    body: JSON.stringify({
      schemaVersion: 1,
      ...(endpoint === 'status' ? {} : { reauthProof: rawProof }),
      ...input,
    }),
  });
}

describe('CPI-031 trusted account lifecycle', () => {
  it('exports only the authenticated account with fresh purpose-bound proof and parameterized cursors', async () => {
    const f = fixture();
    const cursor = {
      consent: '31600000-0000-4000-8000-000000000001',
      parental: null,
      run: null,
      result: null,
      report: '31900000-0000-4000-8000-000000000001',
      reward: '31900000-0000-4000-8000-000000000002',
      adAuthorization: '31900000-0000-4000-8000-000000000003',
    };
    const response = await f.handler(request('export', { cursor }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: 1,
      profile: { username: 'prism_a' },
      reports: [{ reason: 'spam', pending: true }],
      rewards: [],
      adAuthorizations: [],
      next: { report: null, reward: null, adAuthorization: null },
    });
    expect(f.verifyReauthentication).toHaveBeenCalledWith({
      subject: A,
      accessToken: 'verified-access-token-0123456789',
      proof: rawProof,
      purpose: 'export',
    });
    const consume = f.query.mock.calls.find(([sql]) =>
      sql.includes('consume_account_reauthentication'),
    )!;
    expect(consume[1]).toEqual([
      A,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'export',
      new Date(NOW + 60_000).toISOString(),
    ]);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(rawProof);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('export_account_page'), [
      A,
      cursor.consent,
      null,
      null,
      null,
    ]);
    expect(f.query).toHaveBeenLastCalledWith('commit');
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('export_own_name_reports'), [
      A,
      cursor.report,
    ]);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('export_own_rewards'), [
      A,
      cursor.reward,
    ]);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('export_own_ad_authorizations'), [
      A,
      cursor.adAuthorization,
    ]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('never silently omits reports or forwards private extras in report export pages', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation((sql, values) =>
      sql.includes('export_own_name_reports')
        ? Promise.resolve({
            rows: [
              {
                report_export: {
                  reports: [
                    {
                      id: '31700000-0000-4000-8000-000000000001',
                      targetPublicId: '31800000-0000-4000-8000-000000000001',
                      reason: 'spam',
                      pending: false,
                      createdAt: new Date(NOW).toISOString(),
                      reporter_user_id: B,
                      email: 'secret@example.invalid',
                    },
                  ],
                  next: null,
                },
              },
            ],
          })
        : original(sql, values),
    );
    const response = await f.handler(request('export'));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"reports"');
    expect(text).not.toContain('secret@example.invalid');
    expect(text).not.toContain('reporter_user_id');
    const unavailable = fixture();
    const base = unavailable.query.getMockImplementation()!;
    unavailable.query.mockImplementation((sql, values) =>
      sql.includes('export_own_name_reports')
        ? Promise.reject(new Error('function is unavailable'))
        : base(sql, values),
    );
    expect((await unavailable.handler(request('export'))).status).toBe(503);
    expect(unavailable.query).toHaveBeenLastCalledWith('rollback');
  });
  it('requires subject, purpose, nonce and genuinely fresh reauthentication instead of caller assertions', async () => {
    for (const invalid of [
      null,
      { ...evidence('delete'), subject: B },
      evidence('export'),
      { ...evidence('delete'), proofId: 'client-approved' },
      { ...evidence('delete'), verifiedAt: NOW + 1 },
      { ...evidence('delete'), verifiedAt: NOW - 300_001 },
      { ...evidence('delete'), expiresAt: NOW },
      { ...evidence('delete'), expiresAt: NOW + 300_001 },
    ]) {
      const f = fixture();
      f.verifyReauthentication.mockResolvedValue(invalid);
      expect((await f.handler(request('delete'))).status).toBe(401);
      expect(f.connect).not.toHaveBeenCalled();
      expect(f.revokeAllSessions).not.toHaveBeenCalled();
    }
  });
  it('rejects client owner IDs, exact age, raw consent, array proofs and malformed cursors', async () => {
    for (const input of [
      { userId: B },
      { subject: B },
      { age: 25 },
      { consent: true },
      { admin: true },
      { reauthProof: [rawProof] },
      { cursor: { consent: B } },
    ]) {
      const f = fixture();
      expect((await f.handler(request('export', input))).status).toBe(400);
      expect(f.connect).not.toHaveBeenCalled();
    }
    const f = fixture();
    expect(
      (
        await f.handler(
          request('delete', { cursor: { consent: null, parental: null, run: null, result: null } }),
        )
      ).status,
    ).toBe(400);
  });
  it('commits a durable pending request before revocation, then deletes only after a matching issuer ack', async () => {
    const f = fixture();
    f.revokeAllSessions.mockImplementation(({ subject, operationId }) => {
      expect(f.current()).toBe('revocation_pending');
      expect(f.query).toHaveBeenLastCalledWith(
        expect.stringContaining('get_account_deletion_work'),
        [REQUEST],
      );
      expect(f.query.mock.calls.find(([sql]) => sql === 'commit')).toBeDefined();
      return Promise.resolve({ status: 'revoked', subject, operationId });
    });
    const response = await f.handler(request('delete'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(status('deleted'));
    expect(f.revokeAllSessions.mock.calls[0]?.[0]).toMatchObject({
      subject: A,
      operationId: REQUEST,
    });
    expect(f.revokeAllSessions.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('complete_account_deletion'), [
      A,
      REQUEST,
    ]);
    expect(f.query).toHaveBeenLastCalledWith('commit');
  });
  it('keeps issuer failures and wrong-subject/operation acknowledgments pending without pretending to delete', async () => {
    for (const acknowledgment of [
      null,
      { status: 'ok' },
      { status: 'revoked', subject: B, operationId: REQUEST },
      { status: 'revoked', subject: A, operationId: PROOF },
    ]) {
      const f = fixture();
      f.revokeAllSessions.mockResolvedValue(acknowledgment);
      const response = await f.handler(request('delete'));
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual(status('revocation_pending'));
      expect(f.query.mock.calls.some(([sql]) => sql.includes('complete_account_deletion'))).toBe(
        false,
      );
      expect(f.current()).toBe('revocation_pending');
    }
    const f = fixture();
    f.revokeAllSessions.mockRejectedValue(new Error('private issuer details'));
    const response = await f.handler(request('delete'));
    expect(response.status).toBe(202);
    expect(await response.text()).not.toContain('private issuer');
  });
  it('recovers a committed deletion through its durable worker after the original process/request is gone', async () => {
    const f = fixture();
    f.revokeAllSessions.mockRejectedValueOnce(new Error('Issuer offline'));
    expect((await f.handler(request('delete'))).status).toBe(202);
    f.authenticate.mockResolvedValue(null); // Revoked credentials are no longer needed by the durable worker.
    expect(await processAccountDeletion(f.options, REQUEST)).toEqual(status('deleted'));
    const before = f.revokeAllSessions.mock.calls.length;
    expect(await processAccountDeletion(f.options, REQUEST)).toEqual(status('deleted'));
    expect(f.revokeAllSessions).toHaveBeenCalledTimes(before);
    const publicStatus = await f.handler(
      request('status', { requestId: REQUEST }, 'https://account.example.invalid'),
    );
    expect(publicStatus.status).toBe(200);
    const body = await publicStatus.text();
    expect(body).not.toContain(A);
    expect(body).not.toContain('subject');
    expect(body).toContain('deleted');
  });
  it('rejects reauthentication nonce replay across endpoints without a second deletion attempt', async () => {
    const f = fixture();
    expect((await f.handler(request('export'))).status).toBe(200);
    const replay = await f.handler(request('delete'));
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ code: 'CPI_ACCOUNT_REAUTH_REPLAY' });
    expect(f.revokeAllSessions).not.toHaveBeenCalled();
    expect(f.current()).toBe('not_found');
    expect(f.query).toHaveBeenLastCalledWith('rollback');
  });
  it('returns the pending receipt when completion fails and discards a failed rollback connection', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation((sql, values) => {
      if (sql.includes('complete_account_deletion') || sql === 'rollback')
        return Promise.reject(new Error('private failure'));
      return original(sql, values);
    });
    const response = await f.handler(request('delete'));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(status('revocation_pending'));
    expect(f.release).toHaveBeenLastCalledWith(expect.any(Error));
  });
  it('bounds revocation waiting, aborts the issuer call and retains pending recovery', async () => {
    const f = fixture();
    f.revokeAllSessions.mockImplementation(() => new Promise(() => undefined));
    const handler = createAccountLifecycleHandler({ ...f.options, revocationTimeoutMs: 1 });
    expect((await handler(request('delete'))).status).toBe(202);
    expect(f.revokeAllSessions.mock.calls[0][0].signal.aborted).toBe(true);
    expect(f.current()).toBe('revocation_pending');
    expect(f.query.mock.calls.some(([sql]) => sql.includes('complete_account_deletion'))).toBe(
      false,
    );
  });
  it('enforces origins, bearer auth and durable limits, supports native/web preflight and has no cookie shortcut', async () => {
    const f = fixture();
    expect((await f.handler(request('delete', {}, 'https://alien.invalid'))).status).toBe(403);
    expect(f.authenticate).not.toHaveBeenCalled();
    const preflight = new Request('https://api.example.invalid/cpi/account/delete', {
      method: 'OPTIONS',
      headers: { origin: 'https://account.example.invalid' },
    });
    const cors = await f.handler(preflight);
    expect(cors.headers.get('access-control-allow-origin')).toBe('https://account.example.invalid');
    expect(cors.headers.get('access-control-allow-headers')).toContain('authorization');
    f.rateLimit.mockResolvedValue(false);
    expect((await f.handler(request('delete'))).status).toBe(429);
    f.rateLimit.mockResolvedValue(true);
    const noBearer = request('delete');
    noBearer.headers.delete('authorization');
    noBearer.headers.set('cookie', 'session=not-authority');
    expect((await f.handler(noBearer)).status).toBe(401);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized streamed JSON before any database request', async () => {
    const f = fixture();
    for (const body of [
      '{invalid',
      JSON.stringify({ schemaVersion: 1, reauthProof: rawProof, junk: 'x'.repeat(5000) }),
    ]) {
      expect((await f.handler(new Request(request('delete'), { body }))).status).toBe(400);
    }
    expect(f.connect).not.toHaveBeenCalled();
  });
  it('never treats an unknown receipt as proof of deletion or exposes database/issuer errors', async () => {
    const f = fixture();
    const result = await f.handler(request('status', { requestId: REQUEST }));
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual(status('not_found'));
    f.connect.mockRejectedValue(new Error('private password email@example.invalid'));
    const failed = await f.handler(request('export'));
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe('{"code":"service_unavailable"}');
  });
});
