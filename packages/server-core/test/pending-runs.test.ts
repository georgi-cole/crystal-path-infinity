import { createRun } from '@crystal-path-infinity/game-core';
import { describe, expect, it, vi } from 'vitest';
import { PendingRunsService } from '../src/pending-runs.ts';
import { createPendingRunsHandler } from '../src/pending-runs-api.ts';
import { RANKED_RNG } from '../src/ranked.ts';
import type { StoredRankedRun } from '../src/ranked.ts';
import type { SqlConnection } from '../src/database.ts';
const A = '30000000-0000-4000-8000-000000000031';
const B = '30000000-0000-4000-8000-000000000032';
const RUN = '30100000-0000-4000-8000-000000000031';
const LEASE = '30300000-0000-4000-8000-000000000031';
const NEXT = '30300000-0000-4000-8000-000000000032';
const KEY = '30400000-0000-4000-8000-000000000031';
const NOW = 1_800_000_000_000;
const actor = { subject: A, deviceId: 'device-a' };
function stored(): StoredRankedRun & { leaseActive?: boolean } {
  const initial = createRun(
    {
      runId: RUN,
      routeRng: { algorithm: RANKED_RNG.algorithm, state: 'a'.repeat(64), draws: '0' },
      mysteryRng: { algorithm: RANKED_RNG.algorithm, state: 'b'.repeat(64), draws: '0' },
      observedAt: NOW,
      buffer: { ahead: 8, history: 2 },
    },
    RANKED_RNG,
  );
  return {
    subject: A,
    region: { countryCode: 'BG', continent: 'EU', mappingVersion: 'cpi-regions-2026-11-v1' },
    state: {
      ...initial,
      status: 'dead',
      sp: 0,
      deaths: 1,
      death: {
        id: 'death-1',
        sequence: 1,
        fatalRow: '1',
        cause: 'wrong_tile',
        activeTimeMs: 0,
        observedAt: NOW,
      },
      pendingReward: { deathId: 'death-1', ordinal: 1, intentId: 'intent-1' },
    },
    nextSequence: '2',
    deviceId: 'device-a',
    leaseToken: LEASE,
    leaseGeneration: '1',
    leaseExpiresAt: NOW + 60000,
    clockUpdatedAt: NOW,
    activeUntil: NOW,
    paused: true,
    lastChoiceAt: null,
  };
}
function fixture() {
  let record = stored();
  let attached = true;
  let audits = 0;
  let receipt: Record<string, unknown> | null = null;
  let backup: {
    record: typeof record;
    attached: boolean;
    audits: number;
    receipt: Record<string, unknown> | null;
  } | null = null;
  const query = vi.fn<SqlConnection['query']>().mockImplementation((sql, values = []) => {
    if (sql === 'begin') backup = { record: structuredClone(record), attached, audits, receipt };
    if (sql === 'rollback' && backup) {
      record = backup.record;
      attached = backup.attached;
      audits = backup.audits;
      receipt = backup.receipt;
    }
    if (sql.startsWith('select user_id'))
      return Promise.resolve({ rows: [{ user_id: values[0] }] });
    if (sql.startsWith('select request_fingerprint'))
      return Promise.resolve({ rows: receipt ? [receipt] : [] });
    if (sql.startsWith('select checkpoint_private'))
      return Promise.resolve({
        rows:
          values[0] === A
            ? [{ checkpoint_private: structuredClone(record), lease_active: attached }]
            : [],
      });
    if (sql.startsWith('update cpi_private.ranked_runs')) {
      record = JSON.parse(String(values[2])) as typeof record;
      attached = false;
    }
    if (sql.includes('insert into cpi_private.ranked_action_audit')) audits++;
    if (sql.includes('insert into cpi_private.ranked_receipts'))
      receipt = {
        request_fingerprint: values[3],
        response_private: JSON.parse(String(values[4])) as unknown,
      };
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn<SqlConnection['release']>();
  const database = { connect: () => Promise.resolve({ query, release }) };
  const service = new PendingRunsService({ database, now: () => NOW + 100, newId: () => NEXT });
  const input = { runId: RUN, sequence: '2', idempotencyKey: KEY, leaseToken: LEASE };
  return {
    service,
    input,
    query,
    release,
    get: () => ({ record, attached, audits, receipt }),
    set: (next: typeof record) => {
      record = next;
    },
  };
}
describe('saved pending ranked attempts', () => {
  it('atomically detaches only pending ownership, preserving the exact run/reward/RNG state and retry receipt', async () => {
    const f = fixture();
    const original = structuredClone(f.get().record);
    expect(await f.service.archive(actor, f.input)).toEqual({ status: 'archived', runId: RUN });
    expect(f.get().record.state).toEqual(original.state);
    expect(f.get().record.region).toEqual(original.region);
    expect(f.get().record).toMatchObject({
      leaseActive: false,
      leaseToken: NEXT,
      nextSequence: '3',
      leaseGeneration: '2',
      paused: true,
    });
    expect(f.get().attached).toBe(false);
    expect(f.get().audits).toBe(1);
    expect(f.query).toHaveBeenLastCalledWith('commit');
    expect(await f.service.archive(actor, f.input)).toEqual({ status: 'archived', runId: RUN });
    expect(f.get().audits).toBe(1);
    await expect(f.service.archive(actor, { ...f.input, sequence: '3' })).rejects.toMatchObject({
      code: 'idempotency-conflict',
    });
  });
  it('rejects other accounts/devices, stale sequence/capability, expired leases and ordinary deaths', async () => {
    const cases: [typeof actor, Record<string, unknown>, string][] = [
      [{ ...actor, subject: B }, {}, 'run-not-found'],
      [{ ...actor, deviceId: 'device-b' }, {}, 'lease-lost'],
      [actor, { leaseToken: NEXT }, 'lease-lost'],
      [actor, { sequence: '1' }, 'sequence-conflict'],
    ];
    for (const [account, changes, code] of cases) {
      const f = fixture();
      await expect(f.service.archive(account, { ...f.input, ...changes })).rejects.toMatchObject({
        code,
      });
      expect(f.get().attached).toBe(true);
    }
    const expired = fixture();
    expired.set({ ...expired.get().record, leaseExpiresAt: NOW });
    await expect(expired.service.archive(actor, expired.input)).rejects.toMatchObject({
      code: 'lease-expired',
    });
    const ordinary = fixture();
    ordinary.set({
      ...ordinary.get().record,
      state: { ...ordinary.get().record.state, pendingReward: null },
    });
    await expect(ordinary.service.archive(actor, ordinary.input)).rejects.toMatchObject({
      code: 'archive-not-pending',
    });
  });
  it('rolls back lease/checkpoint mutation if audit persistence fails', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation((sql, values) =>
      sql.includes('insert into cpi_private.ranked_action_audit')
        ? Promise.reject(new Error('private failure'))
        : original(sql, values),
    );
    await expect(f.service.archive(actor, f.input)).rejects.toThrow('private failure');
    expect(f.get().attached).toBe(true);
    expect(f.get().record.leaseActive).toBeUndefined();
    expect(f.get().audits).toBe(0);
    expect(f.query).toHaveBeenLastCalledWith('rollback');
  });
  it('returns bounded owner-only summaries and exact timestamp cursors without private checkpoints', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `30500000-0000-4000-8000-${String(100 - index).padStart(12, '0')}`,
      ruleset_version: 'infinity-v1',
      status: 'verification_pending',
      last_cleared_row: '9007199254740993',
      revives_granted: 0,
      revives_applied: 0,
      created_at: '2026-11-04T00:00:00.123456Z',
      checkpoint_private: { seed: 'private-seed' },
      user_id: A,
    }));
    f.query.mockImplementation((sql, values) =>
      sql.includes('limit 21') ? Promise.resolve({ rows }) : original(sql, values),
    );
    const result = await f.service.saved(actor, { after: null });
    expect(result.runs).toHaveLength(20);
    expect(result.runs[0].lastClearedRow).toBe('9007199254740993');
    expect(result.next).toEqual({ createdAt: '2026-11-04T00:00:00.123456Z', runId: rows[19].id });
    expect(JSON.stringify(result)).not.toMatch(/seed|checkpoint|user_id/);
    await f.service.saved(actor, { after: result.next });
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('limit 21'), [
      A,
      result.next!.createdAt,
      result.next!.runId,
    ]);
  });
  it('rejects supplied owner IDs and arbitrary saved-list fields before querying private runs', async () => {
    const f = fixture();
    await expect(f.service.archive(actor, { ...f.input, userId: B })).rejects.toMatchObject({
      code: 'invalid-request',
    });
    await expect(f.service.saved(actor, { after: null, subject: B })).rejects.toMatchObject({
      code: 'invalid-request',
    });
    expect(f.query).not.toHaveBeenCalled();
  });
  it('mounts strict authenticated archive/saved routes with safe errors and no guest shortcut', async () => {
    const archive = vi.fn().mockResolvedValue({ status: 'archived', runId: RUN });
    const saved = vi.fn().mockResolvedValue({ status: 'saved', runs: [], next: null });
    const authenticate = vi.fn().mockResolvedValue({ ...actor, rankedAllowed: true });
    const handler = createPendingRunsHandler({
      basePath: '/cpi',
      service: { archive, saved },
      authenticate,
      allowOrigin: (origin) => origin === 'capacitor://localhost',
      rateLimit: () => Promise.resolve(true),
    });
    const request = (route: string, input: unknown) =>
      new Request('https://api.example.invalid/cpi/ranked/' + route, {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          'content-type': 'application/json',
          authorization: 'Bearer verified-access-token-0123456789',
        },
        body: JSON.stringify(input),
      });
    expect((await handler(request('archive', fixture().input))).status).toBe(200);
    expect((await handler(request('saved', { after: null }))).status).toBe(200);
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ subject: A, deviceId: 'device-a' }),
      { after: null },
    );
    authenticate.mockResolvedValue(null);
    expect((await handler(request('saved', { after: null }))).status).toBe(401);
    authenticate.mockResolvedValue({ ...actor, rankedAllowed: true });
    archive.mockRejectedValue(new Error('private account token'));
    const failed = await handler(request('archive', fixture().input));
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe('{"code":"service_unavailable"}');
  });
});
