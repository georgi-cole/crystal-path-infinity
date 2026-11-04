import type { SqlConnection, SqlPool } from './database.ts';
import { RankedError } from './ranked.ts';
import { createOperationStartGate, createOperationRecoveryGate } from './operations-policy.ts';
import type {
  RankedAudit,
  RankedReceipt,
  RankedRegionSnapshot,
  RankedRepository,
  RankedTransaction,
  StoredRankedRun,
} from './ranked.ts';

function decoded(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new RankedError('invalid-private-checkpoint');
    }
  }
  return value;
}

function stored(value: unknown, subject: string): StoredRankedRun {
  const candidate = decoded(value);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new RankedError('invalid-private-checkpoint');
  }
  const record = candidate as StoredRankedRun;
  if (record.subject !== subject || !record.state || !record.region) {
    throw new RankedError('invalid-private-checkpoint');
  }
  return structuredClone(record);
}

function timestamp(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Server-only checkpoint helper for callers holding the same account transaction lock. */
export class PostgresTransaction implements RankedTransaction {
  private readonly connection: SqlConnection;
  private readonly subject: string;

  constructor(connection: SqlConnection, subject: string) {
    this.connection = connection;
    this.subject = subject;
  }

  authorizeStart(input: { clientBuild: number; rulesetVersion: string }): Promise<void> {
    return createOperationStartGate()(this.connection, { operation: 'ranked', ...input });
  }

  authorizeRecovery(input: { clientBuild: number; rulesetVersion: string }): Promise<void> {
    return createOperationRecoveryGate()(this.connection, input);
  }

  async getActiveRun(): Promise<StoredRankedRun | null> {
    const result = await this.connection.query(
      "select checkpoint_private from cpi_private.ranked_runs where user_id=$1::uuid and lease_active and status<>'finished' for update",
      [this.subject],
    );
    if (result.rows.length > 1) throw new RankedError('inconsistent-active-runs');
    return result.rows.length === 1
      ? stored(result.rows[0].checkpoint_private, this.subject)
      : null;
  }

  async getRun(runId: string): Promise<StoredRankedRun | null> {
    const result = await this.connection.query(
      'select checkpoint_private from cpi_private.ranked_runs where user_id=$1::uuid and id=$2::uuid for update',
      [this.subject, runId],
    );
    return result.rows.length === 1
      ? stored(result.rows[0].checkpoint_private, this.subject)
      : null;
  }

  async getReceipt(key: string): Promise<RankedReceipt | null> {
    const result = await this.connection.query(
      'select request_fingerprint,response_private,created_at from cpi_private.ranked_receipts where user_id=$1::uuid and idempotency_key=$2::uuid',
      [this.subject, key],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const response = decoded(row.response_private);
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.getTime()
        : Date.parse(String(row.created_at));
    if (!response || typeof response !== 'object' || !Number.isSafeInteger(createdAt)) {
      throw new RankedError('invalid-private-receipt');
    }
    return {
      key,
      requestFingerprint: String(row.request_fingerprint),
      response: response as RankedReceipt['response'],
      createdAt,
    };
  }

  async getRegionSnapshot(): Promise<RankedRegionSnapshot> {
    const result = await this.connection.query(
      'select cpi_private.snapshot_profile_region($1::uuid) as snapshot',
      [this.subject],
    );
    const snapshot = decoded(result.rows[0]?.snapshot);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new RankedError('profile-unavailable');
    }
    const region = snapshot as RankedRegionSnapshot;
    if (
      typeof region.mappingVersion !== 'string' ||
      region.mappingVersion.length === 0 ||
      !(
        (region.countryCode === null && region.continent === null) ||
        (typeof region.countryCode === 'string' &&
          /^[A-Z]{2}$/.test(region.countryCode) &&
          typeof region.continent === 'string' &&
          /^(AF|AS|EU|NA|SA|OC|AN)$/.test(region.continent))
      )
    )
      throw new RankedError('invalid-region-snapshot');
    return {
      countryCode: region.countryCode,
      continent: region.continent,
      mappingVersion: region.mappingVersion,
    };
  }

  async saveRun(record: StoredRankedRun): Promise<void> {
    if (record.subject !== this.subject) throw new RankedError('run-not-found');
    const state = record.state;
    const result = await this.connection.query(
      `
      insert into cpi_private.ranked_runs as existing
        (id,user_id,ruleset_version,status,checkpoint_private,sp,hints,last_cleared_row,current_row,
         revives_granted,revives_applied,revives_to_reach_score,active_time_ms,created_at,updated_at,
         finalized_at,achieved_at,server_validated,country_snapshot,continent_snapshot,mapping_version,region_snapshotted_at,lease_active)
      values ($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::smallint,$7::integer,$8::text,$9::text,
              $10::smallint,$11::smallint,$12::smallint,$13::bigint,
              coalesce((select created_at from cpi_private.ranked_runs where id=$1::uuid and user_id=$2::uuid),$14::timestamptz),$14::timestamptz,
              $15::timestamptz,$16::timestamptz,true,$17::text,$18::text,$19::text,$14::timestamptz,$20::boolean)
      on conflict (id) do update set
        status=excluded.status,checkpoint_private=excluded.checkpoint_private,sp=excluded.sp,hints=excluded.hints,
        last_cleared_row=excluded.last_cleared_row,current_row=excluded.current_row,
        revives_granted=excluded.revives_granted,revives_applied=excluded.revives_applied,
        revives_to_reach_score=excluded.revives_to_reach_score,active_time_ms=excluded.active_time_ms,
        updated_at=excluded.updated_at,finalized_at=excluded.finalized_at,achieved_at=excluded.achieved_at,
        server_validated=true,lease_active=excluded.lease_active
      where existing.user_id=excluded.user_id and existing.ruleset_version=excluded.ruleset_version
        and existing.country_snapshot is not distinct from excluded.country_snapshot
        and existing.continent_snapshot is not distinct from excluded.continent_snapshot
        and existing.mapping_version is not distinct from excluded.mapping_version
        and existing.status<>'finished'
      returning id`,
      [
        state.runId,
        this.subject,
        state.rulesetVersion,
        state.pendingReward ? 'verification_pending' : state.status,
        JSON.stringify(record),
        state.sp,
        state.hints,
        state.lastClearedRow,
        state.currentRow,
        state.revivesGranted,
        state.revivesApplied,
        state.revivesToReachScore,
        state.activeTimeMs,
        timestamp(record.clockUpdatedAt),
        timestamp(state.result?.endedAt ?? null),
        timestamp(state.achievedAt),
        record.region.countryCode,
        record.region.continent,
        record.region.mappingVersion,
        record.leaseActive !== false,
      ],
    );
    if (result.rows.length !== 1) throw new RankedError('immutable-run-conflict');
    if (state.status === 'finished') {
      // Publication validates the mirrored server state and unresolved rewards.
      // If it fails, the enclosing transaction also rolls back End + receipt + audit.
      await this.connection.query('select cpi_private.publish_ranked_result($1::uuid)', [
        state.runId,
      ]);
    }
  }

  async saveReceipt(receipt: RankedReceipt): Promise<void> {
    await this.connection.query(
      `insert into cpi_private.ranked_receipts
      (user_id,idempotency_key,run_id,request_fingerprint,response_private,created_at)
      values ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb,$6::timestamptz)`,
      [
        this.subject,
        receipt.key,
        receipt.response.snapshot.runId,
        receipt.requestFingerprint,
        JSON.stringify(receipt.response),
        timestamp(receipt.createdAt),
      ],
    );
  }

  async appendAudit(event: RankedAudit): Promise<void> {
    await this.connection.query(
      `insert into cpi_private.ranked_action_audit
      (run_id,user_id,command_sequence,idempotency_key,command_private,result_private,received_at)
      values ($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb,$6::jsonb,$7::timestamptz)`,
      [
        event.runId,
        this.subject,
        event.sequence,
        event.idempotencyKey,
        JSON.stringify(event.command),
        JSON.stringify({ accepted: event.accepted, reason: event.reason, snapshot: event.result }),
        timestamp(event.receivedAt),
      ],
    );
  }
}

/** Parameterized, private PostgreSQL persistence. No credentials or pool are created here. */
export class PostgresRankedRepository implements RankedRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  async transaction<T>(
    subject: string,
    operation: (transaction: RankedTransaction) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.connect();
    let began = false;
    let committing = false;
    let releaseError: Error | undefined;
    try {
      await connection.query('begin');
      began = true;
      // The ownership row is the common profile/ranked parent lock. The upsert
      // serializes FIRST starts too; its Auth foreign key fences account deletion.
      await connection.query(
        'insert into cpi_private.profile_owners(user_id) values ($1::uuid) on conflict (user_id) do nothing',
        [subject],
      );
      const account = await connection.query(
        'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
        [subject],
      );
      if (account.rows.length !== 1) throw new RankedError('account-unavailable');
      const value = await operation(new PostgresTransaction(connection, subject));
      committing = true;
      await connection.query('commit');
      began = false;
      return value;
    } catch (error) {
      if (!began || committing) releaseError = new Error('ranked-transaction-outcome-uncertain');
      if (began) {
        try {
          await connection.query('rollback');
        } catch {
          releaseError = new Error('ranked-transaction-rollback-failed');
        }
      }
      throw error;
    } finally {
      connection.release(releaseError);
    }
  }
}
