import { describe, expect, it, vi } from 'vitest';
import {
  createOperationRecoveryGate,
  createOperationStartGate,
  createOperationsStatusHandler,
  OperationsPolicyError,
  parseOperationsPolicy,
  readOperationsPolicy,
} from '../src/operations-policy.ts';
import type { OperationStartContext } from '../src/operations-policy.ts';
import type { SqlConnection } from '../src/database.ts';
const policy = () => ({
  schemaVersion: 1,
  revision: '1',
  rankedStartsEnabled: false,
  adStartsEnabled: false,
  minimumClientBuild: 10,
  recoveryMinimumClientBuild: 1,
  startRuleset: 'infinity-v1',
  recoveryRulesets: ['infinity-v1'],
  maintenanceCode: 'service_not_ready',
  updatedAt: '2026-11-04T00:00:00Z',
});
function fixture() {
  const query = vi.fn<SqlConnection['query']>().mockResolvedValue({ rows: [{ policy: policy() }] });
  const release = vi.fn<SqlConnection['release']>();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const allowPublicRead = vi.fn().mockResolvedValue(true);
  const rateLimit = vi.fn().mockResolvedValue(true);
  const database = { connect };
  const handler = createOperationsStatusHandler({
    database,
    basePath: '/cpi',
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    allowPublicRead,
    rateLimit,
  });
  return { query, release, connect, database, handler, allowPublicRead, rateLimit };
}
function request(
  input: unknown = { schemaVersion: 1 },
  url = 'https://api.example.invalid/cpi/operations/status',
) {
  return new Request(url, {
    method: 'POST',
    headers: { origin: 'capacitor://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
describe('operational policy contracts', () => {
  it('reconstructs a minimal versioned policy and rejects permissive malformed controls', () => {
    expect(
      parseOperationsPolicy({
        ...policy(),
        actorReference: 'private-staff',
        email: 'private@example.invalid',
      }),
    ).toEqual(policy());
    for (const value of [
      null,
      { ...policy(), rankedStartsEnabled: 'yes' },
      { ...policy(), adStartsEnabled: 1 },
      { ...policy(), minimumClientBuild: 0 },
      { ...policy(), recoveryMinimumClientBuild: 11 },
      { ...policy(), recoveryRulesets: [] },
      { ...policy(), recoveryRulesets: ['infinity-v1', 'infinity-v1'] },
      { ...policy(), maintenanceCode: 'free personal message' },
      { ...policy(), revision: 1 },
    ])
      expect(parseOperationsPolicy(value)).toBeNull();
  });
  it('binds the trusted build and server ruleset to fixed SQL inside the caller transaction', async () => {
    const f = fixture();
    await createOperationStartGate()(
      { query: f.query, release: f.release },
      { operation: 'ranked', clientBuild: 10, rulesetVersion: 'infinity-v1' },
    );
    expect(f.query).toHaveBeenCalledExactlyOnceWith(
      'select cpi_private.authorize_operation_start($1::text,$2::integer,$3::text)',
      ['ranked', 10, 'infinity-v1'],
    );
    expect(f.connect).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    await createOperationRecoveryGate()(
      { query: f.query, release: f.release },
      { clientBuild: 1, rulesetVersion: 'infinity-v1' },
    );
    expect(f.query).toHaveBeenLastCalledWith(
      'select cpi_private.check_operation_recovery($1::integer,$2::text)',
      [1, 'infinity-v1'],
    );
  });
  it('fails closed for missing build/context and maps only fixed maintenance/update errors', async () => {
    const f = fixture();
    for (const input of [
      { operation: 'ranked', clientBuild: 0, rulesetVersion: 'infinity-v1' },
      { operation: 'ad', clientBuild: 10.1, rulesetVersion: 'infinity-v1' },
      { operation: 'unknown', clientBuild: 10, rulesetVersion: 'infinity-v1' },
    ])
      await expect(
        createOperationStartGate()(
          { query: f.query, release: f.release },
          input as OperationStartContext,
        ),
      ).rejects.toMatchObject({ code: 'operation_context_required' });
    expect(f.query).not.toHaveBeenCalled();
    const context = { operation: 'ad', clientBuild: 10, rulesetVersion: 'infinity-v1' } as const;
    for (const [message, code] of [
      ['CPI_OPERATIONS_MAINTENANCE', 'maintenance'],
      ['CPI_OPERATIONS_UPDATE_REQUIRED', 'client_update_required'],
      ['CPI_OPERATIONS_RULESET_UNAVAILABLE', 'ruleset_unavailable'],
      ['private@example.invalid Bearer secret', 'service_unavailable'],
    ]) {
      f.query.mockRejectedValueOnce(new Error(message));
      await expect(
        createOperationStartGate()({ query: f.query, release: f.release }, context),
      ).rejects.toMatchObject({ code, message: code });
    }
  });
  it('discards failed read connections and never propagates database text', async () => {
    const f = fixture();
    expect(await readOperationsPolicy(f.database)).toEqual(policy());
    f.query.mockRejectedValue(new Error('private database credentials'));
    await expect(readOperationsPolicy(f.database)).rejects.toEqual(
      new OperationsPolicyError('service_unavailable'),
    );
    expect(f.release).toHaveBeenLastCalledWith(expect.any(Error));
  });
  it('exposes only an explicitly approved read-only mount with truthful maintenance', async () => {
    const f = fixture();
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(policy());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect((await f.handler(request({ schemaVersion: 1, rankedStartsEnabled: true }))).status).toBe(
      400,
    );
    expect(f.query).toHaveBeenCalledTimes(1);
    f.allowPublicRead.mockResolvedValue(false);
    expect((await f.handler(request())).status).toBe(503);
    f.rateLimit.mockResolvedValue(false);
    expect((await f.handler(request())).status).toBe(429);
  });
  it('rejects wrong namespaces, sensitive query strings and oversized streamed input', async () => {
    const f = fixture();
    const wrong = request({ schemaVersion: 1 }, 'https://api.example.invalid/operations/status');
    expect((await f.handler(wrong)).status).toBe(404);
    const url = request(
      { schemaVersion: 1 },
      'https://api.example.invalid/cpi/operations/status?email=private',
    );
    expect((await f.handler(url)).status).toBe(404);
    expect((await f.handler(request({ schemaVersion: 1, raw: 'x'.repeat(300) }))).status).toBe(400);
    expect(f.connect).not.toHaveBeenCalled();
  });
});
