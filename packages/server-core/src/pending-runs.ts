import { createHash, randomUUID } from 'node:crypto';
import { addDecimal, assertRunState } from '@crystal-path-infinity/game-core';
import { RANKED_RNG, RankedError, rankedSnapshot } from './ranked.ts';
import type { RankedActor, RankedReply, StoredRankedRun } from './ranked.ts';
import type { SqlConnection, SqlPool } from './database.ts';

export interface SavedRunCursor {
  readonly createdAt: string;
  readonly runId: string;
}
export interface SavedPendingRun {
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly status: 'dead' | 'verification_pending';
  readonly lastClearedRow: string;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly rewardPending: boolean;
  readonly createdAt: string;
}
export interface SavedPendingRuns {
  readonly status: 'saved';
  readonly runs: readonly SavedPendingRun[];
  readonly next: SavedRunCursor | null;
}
export interface ArchivedPendingRun {
  readonly status: 'archived';
  readonly runId: string;
}
export interface PendingRunsOptions {
  readonly database: SqlPool;
  readonly now?: () => number;
  readonly newId?: () => string;
}
type SavedRecord = StoredRankedRun & { readonly leaseActive?: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
function fail(code: string): never {
  throw new RankedError(code);
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  )
    fail('invalid-request');
  return value as Record<string, unknown>;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('invalid-request');
  return value.toLowerCase();
}
function decimal(value: unknown, positive = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 1000 ||
    !DECIMAL.test(value) ||
    (positive && value === '0')
  )
    fail('invalid-request');
  return value;
}
function date(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    !value.startsWith('0000-') &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
function actor(value: RankedActor) {
  uuid(value.subject);
  if (!/^[A-Za-z0-9:_-]{1,120}$/.test(value.deviceId)) fail('invalid-authentication');
}
function decoded(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      fail('run-not-found');
    }
  }
  return value;
}
async function transaction<T>(
  database: SqlPool,
  subject: string,
  operation: (connection: SqlConnection) => Promise<T>,
): Promise<T> {
  const connection = await database.connect();
  let began = false;
  let committing = false;
  let broken: Error | undefined;
  try {
    await connection.query('begin');
    began = true;
    const owner = await connection.query(
      'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
      [subject],
    );
    if (owner.rows.length !== 1) fail('run-not-found');
    const result = await operation(connection);
    committing = true;
    await connection.query('commit');
    began = false;
    return result;
  } catch (error) {
    if (!began || committing) broken = new Error('Pending run transaction outcome uncertain');
    if (began) {
      try {
        await connection.query('rollback');
      } catch {
        broken = new Error('Pending run rollback failed');
      }
    }
    throw error;
  } finally {
    connection.release(broken);
  }
}

/** Archive releases ownership only. Original state, RNG, pending ledger and score stay unchanged. */
export class PendingRunsService {
  private readonly database: SqlPool;
  private readonly now: () => number;
  private readonly newId: () => string;
  constructor(options: PendingRunsOptions) {
    this.database = options.database;
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? randomUUID;
  }
  async archive(account: RankedActor, body: unknown): Promise<ArchivedPendingRun> {
    actor(account);
    const input = object(body, ['runId', 'sequence', 'idempotencyKey', 'leaseToken']);
    const runId = uuid(input.runId);
    const sequence = decimal(input.sequence, true);
    const key = uuid(input.idempotencyKey);
    const leaseToken = uuid(input.leaseToken);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          type: 'archive_pending',
          deviceId: account.deviceId,
          runId,
          sequence,
          leaseToken,
        }),
      )
      .digest('hex');
    return transaction(this.database, account.subject, async (connection) => {
      const receipt = await connection.query(
        'select request_fingerprint,response_private from cpi_private.ranked_receipts where user_id=$1::uuid and idempotency_key=$2::uuid',
        [account.subject, key],
      );
      if (receipt.rows.length) {
        if (receipt.rows[0].request_fingerprint !== fingerprint) fail('idempotency-conflict');
        const saved = decoded(receipt.rows[0].response_private) as RankedReply | null;
        if (!saved || saved.snapshot?.runId !== runId) fail('run-not-found');
        return { status: 'archived', runId };
      }
      const result = await connection.query(
        'select checkpoint_private,lease_active from cpi_private.ranked_runs where user_id=$1::uuid and id=$2::uuid for update',
        [account.subject, runId],
      );
      if (result.rows.length !== 1) fail('run-not-found');
      const value = decoded(result.rows[0].checkpoint_private);
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('run-not-found');
      const record = value as SavedRecord;
      if (record.subject !== account.subject || record.state?.runId !== runId)
        fail('run-not-found');
      assertRunState(record.state, RANKED_RNG);
      if (result.rows[0].lease_active !== true || record.leaseActive === false)
        fail('run-archived');
      if (record.deviceId !== account.deviceId || record.leaseToken !== leaseToken)
        fail('lease-lost');
      const now = this.now();
      if (!Number.isSafeInteger(now) || now < record.clockUpdatedAt || now < 0)
        fail('server-clock-regressed');
      if (now >= record.leaseExpiresAt) fail('lease-expired');
      if (record.nextSequence !== sequence) fail('sequence-conflict');
      if (
        record.state.status !== 'dead' ||
        (!record.state.pendingReward && record.state.revivesGranted <= record.state.revivesApplied)
      )
        fail('archive-not-pending');
      const updated: SavedRecord = {
        ...record,
        leaseActive: false,
        paused: true,
        leaseToken: uuid(this.newId()),
        leaseGeneration: addDecimal(record.leaseGeneration),
        leaseExpiresAt: now,
        activeUntil: now,
        clockUpdatedAt: now,
        nextSequence: addDecimal(record.nextSequence),
      };
      const publicReply: RankedReply = {
        accepted: true,
        reason: null,
        snapshot: rankedSnapshot(updated),
        lease: {
          token: updated.leaseToken,
          generation: updated.leaseGeneration,
          expiresAt: updated.leaseExpiresAt,
        },
      };
      await connection.query(
        'update cpi_private.ranked_runs set checkpoint_private=$3::jsonb,lease_active=false,updated_at=$4::timestamptz where user_id=$1::uuid and id=$2::uuid',
        [account.subject, runId, JSON.stringify(updated), new Date(now).toISOString()],
      );
      await connection.query(
        `insert into cpi_private.ranked_action_audit
        (run_id,user_id,command_sequence,idempotency_key,command_private,result_private,received_at)
        values($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb,$6::jsonb,$7::timestamptz)`,
        [
          runId,
          account.subject,
          sequence,
          key,
          JSON.stringify({ type: 'archive_pending' }),
          JSON.stringify(publicReply.snapshot),
          new Date(now).toISOString(),
        ],
      );
      await connection.query(
        `insert into cpi_private.ranked_receipts
        (user_id,idempotency_key,run_id,request_fingerprint,response_private,created_at)
        values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb,$6::timestamptz)`,
        [
          account.subject,
          key,
          runId,
          fingerprint,
          JSON.stringify(publicReply),
          new Date(now).toISOString(),
        ],
      );
      return { status: 'archived', runId };
    });
  }
  async saved(account: RankedActor, body: unknown): Promise<SavedPendingRuns> {
    actor(account);
    const input = object(body, ['after']);
    let cursor: SavedRunCursor | null = null;
    if (input.after !== null) {
      const after = object(input.after, ['createdAt', 'runId']);
      if (!date(after.createdAt)) fail('invalid-request');
      cursor = { createdAt: after.createdAt, runId: uuid(after.runId) };
    }
    return transaction(this.database, account.subject, async (connection) => {
      const result = await connection.query(
        `select r.id,r.ruleset_version,r.status,r.last_cleared_row,r.revives_granted,r.revives_applied,
        to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at
        from cpi_private.ranked_runs r where r.user_id=$1::uuid and not r.lease_active and r.status<>'finished'
        and ($2::timestamptz is null or (r.created_at,r.id)<($2::timestamptz,$3::uuid))
        order by r.created_at desc,r.id desc limit 21`,
        [account.subject, cursor?.createdAt ?? null, cursor?.runId ?? null],
      );
      const runs: SavedPendingRun[] = [];
      for (const row of result.rows.slice(0, 20)) {
        const runId = uuid(row.id);
        const progress = decimal(row.last_cleared_row);
        if (
          typeof row.ruleset_version !== 'string' ||
          !/^[A-Za-z0-9._-]{1,80}$/.test(row.ruleset_version) ||
          !['dead', 'verification_pending'].includes(String(row.status)) ||
          !date(row.created_at) ||
          typeof row.revives_granted !== 'number' ||
          !Number.isInteger(row.revives_granted) ||
          row.revives_granted < 0 ||
          row.revives_granted > 10 ||
          typeof row.revives_applied !== 'number' ||
          !Number.isInteger(row.revives_applied) ||
          row.revives_applied < 0 ||
          row.revives_applied > row.revives_granted
        )
          fail('run-not-found');
        runs.push({
          runId,
          rulesetVersion: row.ruleset_version,
          status: row.status as SavedPendingRun['status'],
          lastClearedRow: progress,
          revivesGranted: row.revives_granted,
          revivesApplied: row.revives_applied,
          rewardPending: row.status === 'verification_pending',
          createdAt: row.created_at,
        });
      }
      const last = runs.at(-1);
      return {
        status: 'saved',
        runs,
        next:
          result.rows.length > 20 && last ? { createdAt: last.createdAt, runId: last.runId } : null,
      };
    });
  }
}
