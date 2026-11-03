import { describe, expect, it } from 'vitest';
import type { SqlConnection, SqlPool } from '../src/database.ts';
import { PostgresRankedRepository } from '../src/postgres-ranked.ts';
import { RankedAuthority } from '../src/ranked.ts';

const subject = '00000000-0000-4000-8000-000000000021';
const runId = '00000000-0000-4000-8000-000000000121';

class Connection implements SqlConnection {
  readonly calls: { text: string; values?: readonly unknown[] }[] = [];
  releases: (Error | undefined)[] = [];
  fail = '';
  rollbackFails = false;
  missingOwner = false;
  active: unknown = null;
  receipt: Record<string, unknown> | null = null;
  region: unknown = {
    countryCode: 'BG',
    continent: 'EU',
    mappingVersion: 'cpi-regions-2026-11-v1',
  };

  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    this.calls.push({ text, values });
    if ((this.fail && text.includes(this.fail)) || (text === 'rollback' && this.rollbackFails)) {
      return Promise.reject(new Error('injected-database-failure'));
    }
    if (text.includes('select user_id from cpi_private.profile_owners')) {
      return Promise.resolve({ rows: this.missingOwner ? [] : [{ user_id: subject }] });
    }
    if (text.includes('select checkpoint_private')) {
      return Promise.resolve({ rows: this.active ? [{ checkpoint_private: this.active }] : [] });
    }
    if (text.includes('select request_fingerprint')) {
      return Promise.resolve({ rows: this.receipt ? [this.receipt] : [] });
    }
    if (text.includes('snapshot_profile_region'))
      return Promise.resolve({ rows: [{ snapshot: this.region }] });
    if (text.includes('insert into cpi_private.ranked_runs'))
      return Promise.resolve({ rows: [{ id: values?.[0] }] });
    return Promise.resolve({ rows: [] });
  }

  release(error?: Error): void {
    this.releases.push(error);
  }
}

function fixture() {
  const connection = new Connection();
  const pool: SqlPool = { connect: () => Promise.resolve(connection) };
  const repository = new PostgresRankedRepository(pool);
  let id = 0;
  const authority = new RankedAuthority({
    repository,
    newId: () => (id++ === 0 ? runId : '00000000-0000-4000-8000-000000000122'),
    now: () => 1_000_000,
    newSecret: () => 'a'.repeat(64),
  });
  const actor = { subject, deviceId: 'authenticated-device-1' };
  const start = () =>
    authority.start(actor, { idempotencyKey: '00000000-0000-4000-8000-000000000123' });
  return { connection, repository, authority, actor, start };
}

describe('PostgreSQL ranked transaction adapter', () => {
  it('locks the shared owner before reading active state and atomically commits parameterized private state plus receipt', async () => {
    const { connection, start } = fixture();
    const response = await start();
    expect(response.snapshot.runId).toBe(runId);
    const calls = connection.calls;
    expect(calls[0].text).toBe('begin');
    expect(calls[1].text).toContain('insert into cpi_private.profile_owners');
    expect(calls[1].values).toEqual([subject]);
    expect(calls[2].text).toBe(
      'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
    );
    expect(
      calls.findIndex((call) => call.text.includes('snapshot_profile_region')),
    ).toBeGreaterThan(2);
    const insert = calls.find((call) => call.text.includes('insert into cpi_private.ranked_runs'))!;
    const receipt = calls.find((call) =>
      call.text.includes('insert into cpi_private.ranked_receipts'),
    )!;
    expect(insert.text).toContain('on conflict (id) do update');
    expect(insert.text).toContain("existing.status<>'finished'");
    expect(insert.text).not.toContain(subject);
    expect(insert.values?.[1]).toBe(subject);
    const checkpoint = JSON.parse(String(insert.values?.[4])) as {
      state: { stream: { rng: { state: string } } };
    };
    expect(checkpoint.state.stream.rng.state).toBe('a'.repeat(64));
    expect(receipt.values?.[0]).toBe(subject);
    expect(receipt.values?.[2]).toBe(runId);
    expect(receipt.values?.[3]).toMatch(/^[a-f0-9]{64}$/);
    expect(String(receipt.values?.[4])).not.toContain('a'.repeat(64));
    expect(calls.at(-1)?.text).toBe('commit');
    expect(connection.releases).toEqual([undefined]);
  });

  it('rolls back a failed receipt without committing a partial checkpoint', async () => {
    const { connection, start } = fixture();
    connection.fail = 'insert into cpi_private.ranked_receipts';
    await expect(start()).rejects.toThrow('injected-database-failure');
    expect(connection.calls.at(-1)?.text).toBe('rollback');
    expect(connection.calls.some((call) => call.text === 'commit')).toBe(false);
    expect(connection.releases).toEqual([undefined]);
  });

  it('discards a connection when rollback itself fails and preserves the original failure', async () => {
    const { connection, start } = fixture();
    connection.fail = 'insert into cpi_private.ranked_receipts';
    connection.rollbackFails = true;
    await expect(start()).rejects.toThrow('injected-database-failure');
    expect(connection.releases).toHaveLength(1);
    expect(connection.releases[0]?.message).toBe('ranked-transaction-rollback-failed');
  });

  it('does not begin work when owner acquisition fails and always returns the connection', async () => {
    const { connection, start } = fixture();
    connection.missingOwner = true;
    await expect(start()).rejects.toMatchObject({ code: 'account-unavailable' });
    expect(connection.calls.some((call) => call.text.includes('select checkpoint_private'))).toBe(
      false,
    );
    expect(connection.calls.at(-1)?.text).toBe('rollback');
    expect(connection.releases).toEqual([undefined]);
  });

  it('scopes every read to the authenticated subject and fails closed on legacy checkpoints', async () => {
    const { connection, repository } = fixture();
    connection.active = { stream: { secret: 'legacy' } };
    await expect(
      repository.transaction(subject, (transaction) => transaction.getRun(runId)),
    ).rejects.toMatchObject({ code: 'invalid-private-checkpoint' });
    const read = connection.calls.find((call) => call.text.includes('select checkpoint_private'))!;
    expect(read.text).toContain('where user_id=$1::uuid and id=$2::uuid for update');
    expect(read.values).toEqual([subject, runId]);
  });

  it('rejects malformed or unsupported region snapshots before inserting a ranked run', async () => {
    const { connection, start } = fixture();
    connection.region = {
      countryCode: 'BG',
      continent: null,
      mappingVersion: 'cpi-regions-2026-11-v1',
    };
    await expect(start()).rejects.toMatchObject({ code: 'invalid-region-snapshot' });
    expect(
      connection.calls.some((call) => call.text.includes('insert into cpi_private.ranked_runs')),
    ).toBe(false);
    expect(connection.calls.at(-1)?.text).toBe('rollback');
  });
});
