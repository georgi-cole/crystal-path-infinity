import { createHash, randomUUID } from 'node:crypto';
import { assertRunState, getReviveSp, transitionRun } from '@crystal-path-infinity/game-core';
import type { SqlConnection, SqlPool } from './database.ts';
import { PostgresTransaction } from './postgres-ranked.ts';
import { rankedSnapshot, RANKED_RNG } from './ranked.ts';
import type { RankedActor, RankedReply, StoredRankedRun } from './ranked.ts';
import { createGoogleRewardKeys, RewardError, verifyGoogleReward } from './reward-ssv.ts';
import type { GoogleRewardKeys } from './reward-ssv.ts';

export interface RewardActor extends RankedActor {
  readonly clientBuild: number;
}
export interface RewardPermit {
  readonly id: string;
  readonly policyVersion: string;
  readonly expiresAt: number;
  readonly inventory: {
    readonly provider: 'admob';
    readonly platform: 'android' | 'ios';
    readonly sdkVersion: string;
    readonly mediation: readonly { identifier: string; version: string }[];
  };
  readonly flags: {
    readonly canRequestAds: true;
    readonly childDirected: boolean;
    readonly underAgeOfConsent: boolean;
    readonly maxAdContentRating: 'G' | 'PG' | 'T' | 'MA';
    readonly nonPersonalized: boolean;
  };
  readonly context: 'unknown' | 'child' | 'teen' | 'adult';
  readonly contextSupported: true;
  readonly prerequisitesSatisfied: true;
}
export interface RewardView {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly status: 'offer' | 'pending' | 'granted' | 'playing' | 'finished';
  readonly deathId: string | null;
  readonly offer: { ordinal: number; restoreSp: number } | null;
  readonly intent: {
    id: string;
    ordinal: number;
    restoreSp: number;
    expiresAt: number;
    customData: string;
  } | null;
  readonly grant: { id: string; ordinal: number; restoreSp: number } | null;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
}
export interface RewardServiceOptions {
  readonly database: SqlPool;
  readonly environment: 'development' | 'staging' | 'production';
  readonly platform: 'android' | 'ios';
  readonly keys?: GoogleRewardKeys;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Trusted operations gate; newest deployment schema requires its transaction context. */
  readonly assertOperationStart?: (
    connection: SqlConnection,
    input: { operation: 'ad'; clientBuild: number; rulesetVersion: string },
  ) => Promise<void>;
}
interface PermitRow extends Record<string, unknown> {
  id: string;
  policy_version: string;
  valid_until: Date | string;
  privacy_context: RewardPermit['context'];
  configuration_id: string;
  platform: 'android' | 'ios';
  sdk_version: string;
  mediation: unknown;
  child_directed: boolean;
  under_age_of_consent: boolean;
  max_ad_content_rating: RewardPermit['flags']['maxAdContentRating'];
  non_personalized: boolean;
  ssv_ad_unit: string;
  ad_networks: string[];
  reward_amount: string;
  reward_item: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code: string): never {
  throw new RewardError(code);
}
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('invalid-reward-request');
  return value.toLowerCase();
}
function date(value: unknown): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isSafeInteger(result)) fail('invalid-reward-state');
  return result;
}
function json(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function publicReply(run: StoredRankedRun): RankedReply {
  return {
    accepted: true,
    reason: null,
    snapshot: rankedSnapshot(run),
    lease: {
      token: run.leaseToken,
      generation: run.leaseGeneration,
      expiresAt: run.leaseExpiresAt,
    },
  };
}

export class RewardService {
  private readonly options: RewardServiceOptions;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly keys: GoogleRewardKeys;
  constructor(options: RewardServiceOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? randomUUID;
    this.keys = options.keys ?? createGoogleRewardKeys();
  }
  private clock(): number {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 120_000)
      fail('invalid-reward-clock');
    return now;
  }
  private actor(actor: RewardActor) {
    uuid(actor.subject);
    if (
      typeof actor.deviceId !== 'string' ||
      !/^[A-Za-z0-9:_-]{1,120}$/.test(actor.deviceId) ||
      !Number.isSafeInteger(actor.clientBuild) ||
      actor.clientBuild < 1 ||
      actor.clientBuild > 2_147_483_647
    )
      fail('invalid-reward-authentication');
  }
  private async transaction<T>(
    subject: string,
    operation: (connection: SqlConnection, ranked: PostgresTransaction) => Promise<T>,
  ): Promise<T> {
    const connection = await this.options.database.connect();
    let began = false;
    let broken: Error | undefined;
    try {
      await connection.query('begin');
      began = true;
      const owner = await connection.query(
        'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
        [subject],
      );
      if (owner.rows.length !== 1) fail('reward-account-unavailable');
      const result = await operation(connection, new PostgresTransaction(connection, subject));
      await connection.query('commit');
      began = false;
      return result;
    } catch (error) {
      if (began) {
        try {
          await connection.query('rollback');
        } catch {
          broken = new Error('reward-rollback-failed');
        }
      }
      throw error;
    } finally {
      connection.release(broken);
    }
  }
  private async run(
    ranked: PostgresTransaction,
    runId: string,
    subject: string,
  ): Promise<StoredRankedRun> {
    const run = await ranked.getRun(runId);
    if (!run || run.subject !== subject) fail('reward-run-unavailable');
    assertRunState(run.state, RANKED_RNG);
    return run;
  }
  private async permit(
    connection: SqlConnection,
    subject: string,
    now: number,
  ): Promise<PermitRow | null> {
    const result = await connection.query(
      'select * from cpi_private.reward_authorization_for($1::uuid,$3::text,$4::text,$2::timestamptz)',
      [subject, new Date(now).toISOString(), this.options.platform, this.options.environment],
    );
    return result.rows.length === 1 ? (result.rows[0] as PermitRow) : null;
  }
  private publicPermit(row: PermitRow): RewardPermit {
    const mediation = json(row.mediation);
    if (!Array.isArray(mediation) || mediation.length > 20) fail('invalid-reward-state');
    const adapters: { identifier: string; version: string }[] = [];
    for (const candidate of mediation) {
      if (
        !object(candidate, ['identifier', 'version']) ||
        typeof candidate.identifier !== 'string' ||
        !/^[-A-Za-z0-9._]{1,120}$/.test(candidate.identifier) ||
        typeof candidate.version !== 'string' ||
        !/^[-A-Za-z0-9._]{1,80}$/.test(candidate.version)
      )
        fail('invalid-reward-state');
      adapters.push({ identifier: candidate.identifier, version: candidate.version });
    }
    return {
      id: row.id,
      policyVersion: row.policy_version,
      expiresAt: date(row.valid_until),
      inventory: {
        provider: 'admob',
        platform: row.platform,
        sdkVersion: row.sdk_version,
        mediation: adapters,
      },
      flags: {
        canRequestAds: true,
        childDirected: row.child_directed,
        underAgeOfConsent: row.under_age_of_consent,
        maxAdContentRating: row.max_ad_content_rating,
        nonPersonalized: row.non_personalized,
      },
      context: row.privacy_context,
      contextSupported: true,
      prerequisitesSatisfied: true,
    };
  }
  async eligibility(
    actor: RewardActor,
    body: unknown,
  ): Promise<
    | { schemaVersion: 1; status: 'unavailable' }
    | { schemaVersion: 1; status: 'allowed'; permit: RewardPermit }
  > {
    this.actor(actor);
    if (!object(body, ['runId'])) fail('invalid-reward-request');
    const runId = uuid(body.runId);
    return this.transaction(actor.subject, async (connection, ranked) => {
      const run = await this.run(ranked, runId, actor.subject);
      if (run.state.status !== 'dead') return { schemaVersion: 1, status: 'unavailable' };
      if (this.options.assertOperationStart)
        await this.options.assertOperationStart(connection, {
          operation: 'ad',
          clientBuild: actor.clientBuild,
          rulesetVersion: run.state.rulesetVersion,
        });
      const permit = await this.permit(connection, actor.subject, this.clock());
      return permit
        ? { schemaVersion: 1, status: 'allowed', permit: this.publicPermit(permit) }
        : { schemaVersion: 1, status: 'unavailable' };
    });
  }
  private async view(connection: SqlConnection, run: StoredRankedRun): Promise<RewardView> {
    const state = run.state;
    const deathId = state.death?.id ?? null;
    const intentRow = deathId
      ? (
          await connection.query(
            'select * from cpi_private.reward_intents where run_id=$1::uuid and death_id=$2::text',
            [state.runId, deathId],
          )
        ).rows[0]
      : undefined;
    const grantRow = intentRow
      ? (
          await connection.query(
            'select id,ordinal,restore_sp,state from cpi_private.revive_grants where intent_id=$1::uuid',
            [intentRow.id],
          )
        ).rows[0]
      : undefined;
    const pending = intentRow?.state === 'pending';
    const granted = grantRow?.state === 'granted';
    const status =
      state.status === 'finished'
        ? 'finished'
        : state.status === 'playing'
          ? 'playing'
          : granted
            ? 'granted'
            : pending
              ? 'pending'
              : 'offer';
    const offer =
      status === 'offer' && state.revivesApplied < 10
        ? { ordinal: state.revivesApplied + 1, restoreSp: getReviveSp(state.revivesApplied + 1) }
        : null;
    return {
      schemaVersion: 1,
      runId: state.runId,
      rulesetVersion: state.rulesetVersion,
      status,
      deathId,
      offer,
      intent: intentRow?.authorization_id
        ? {
            id: String(intentRow.id),
            ordinal: Number(intentRow.ordinal),
            restoreSp: Number(intentRow.promised_restore_sp),
            expiresAt: date(intentRow.expires_at),
            customData: String(intentRow.nonce),
          }
        : null,
      grant: grantRow
        ? {
            id: String(grantRow.id),
            ordinal: Number(grantRow.ordinal),
            restoreSp: Number(grantRow.restore_sp),
          }
        : null,
      revivesGranted: state.revivesGranted,
      revivesApplied: state.revivesApplied,
      revivesToReachScore: state.revivesToReachScore,
    };
  }
  async status(actor: RewardActor, body: unknown): Promise<RewardView> {
    this.actor(actor);
    if (!object(body, ['runId'])) fail('invalid-reward-request');
    const runId = uuid(body.runId);
    return this.transaction(actor.subject, async (connection, ranked) =>
      this.view(connection, await this.run(ranked, runId, actor.subject)),
    );
  }
  private async receipt(
    connection: SqlConnection,
    actor: RewardActor,
    key: string,
    request: unknown,
  ): Promise<unknown> {
    const result = await connection.query(
      'select fingerprint,response_private from cpi_private.reward_api_receipts where user_id=$1::uuid and idempotency_key=$2::uuid',
      [actor.subject, key],
    );
    if (result.rows.length === 0) return null;
    if (result.rows[0].fingerprint !== fingerprint(request)) fail('reward-idempotency-conflict');
    return json(result.rows[0].response_private);
  }
  private async remember(
    connection: SqlConnection,
    actor: RewardActor,
    key: string,
    runId: string,
    operation: 'intent' | 'apply',
    request: unknown,
    response: unknown,
    now: number,
  ) {
    await connection.query(
      'insert into cpi_private.reward_api_receipts(user_id,idempotency_key,run_id,operation,fingerprint,response_private,created_at) values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::jsonb,$7::timestamptz)',
      [
        actor.subject,
        key,
        runId,
        operation,
        fingerprint(request),
        JSON.stringify(response),
        new Date(now).toISOString(),
      ],
    );
  }
  async intent(actor: RewardActor, body: unknown): Promise<RewardView> {
    this.actor(actor);
    if (!object(body, ['runId', 'idempotencyKey'])) fail('invalid-reward-request');
    const runId = uuid(body.runId);
    const key = uuid(body.idempotencyKey);
    const request = { operation: 'intent', runId, deviceId: actor.deviceId };
    return this.transaction(actor.subject, async (connection, ranked) => {
      const repeated = await this.receipt(connection, actor, key, request);
      if (repeated) return repeated as RewardView;
      let run = await this.run(ranked, runId, actor.subject);
      const state = run.state;
      const now = this.clock();
      if (state.status !== 'dead' || !state.death || state.revivesApplied >= 10)
        fail('reward-not-offered');
      const existing = await connection.query(
        'select id from cpi_private.reward_intents where run_id=$1::uuid and death_id=$2::text',
        [runId, state.death.id],
      );
      if (existing.rows.length > 0) {
        const response = await this.view(connection, run);
        await this.remember(connection, actor, key, runId, 'intent', request, response, now);
        return response;
      }
      if (state.pendingReward || state.revivesGranted !== state.revivesApplied)
        fail('reward-already-pending');
      const permit = await this.permit(connection, actor.subject, now);
      if (!permit) fail('reward-privacy-unavailable');
      this.publicPermit(permit);
      if (this.options.assertOperationStart)
        await this.options.assertOperationStart(connection, {
          operation: 'ad',
          clientBuild: actor.clientBuild,
          rulesetVersion: state.rulesetVersion,
        });
      const intentId = uuid(this.newId());
      const nonce = uuid(this.newId());
      const ordinal = state.revivesApplied + 1;
      await connection.query(
        `insert into cpi_private.reward_intents(id,run_id,death_id,ordinal,promised_restore_sp,ruleset_version,nonce,authorization_id,configuration_id,environment,created_at,expires_at,expected_ad_unit,expected_ad_networks,expected_reward_amount,expected_reward_item)
        values($1::uuid,$2::uuid,$3::text,$4::smallint,$5::smallint,$6::text,$7::uuid,$8::uuid,$9::uuid,$10::text,$11::timestamptz,$12::timestamptz,$13::text,$14::text[],$15::text,$16::text)`,
        [
          intentId,
          runId,
          state.death.id,
          ordinal,
          getReviveSp(ordinal),
          state.rulesetVersion,
          nonce,
          permit.id,
          permit.configuration_id,
          this.options.environment,
          new Date(now).toISOString(),
          new Date(Math.min(now + 120_000, date(permit.valid_until))).toISOString(),
          permit.ssv_ad_unit,
          permit.ad_networks,
          permit.reward_amount,
          permit.reward_item,
        ],
      );
      const next = transitionRun(
        state,
        { type: 'mark-reward-pending', deathId: state.death.id, ordinal, intentId },
        {
          activeTimeMs: state.activeTimeMs,
          achievedAt: Math.max(now, state.lastObservedAt),
          rng: RANKED_RNG,
        },
      );
      if (!next.accepted) fail('reward-state-conflict');
      run = { ...run, state: next.state, paused: true, clockUpdatedAt: now, activeUntil: now };
      await ranked.saveRun(run);
      await connection.query(
        "insert into cpi_private.reward_audit_events(run_id,intent_id,event) values($1::uuid,$2::uuid,'intent_created')",
        [runId, intentId],
      );
      const response = await this.view(connection, run);
      await this.remember(connection, actor, key, runId, 'intent', request, response, now);
      return response;
    });
  }
  async receiveGoogleSsv(rawQuery: string): Promise<{ status: 'accepted' | 'duplicate' }> {
    const verified = await verifyGoogleReward(rawQuery, this.keys);
    const lookup = await this.options.database.connect();
    let subject: string;
    try {
      const result = await lookup.query(
        'select r.user_id from cpi_private.reward_intents i join cpi_private.ranked_runs r on r.id=i.run_id where i.nonce=$1::uuid',
        [verified.customData],
      );
      if (result.rows.length !== 1) fail('reward-intent-unavailable');
      subject = String(result.rows[0].user_id);
    } finally {
      lookup.release();
    }
    return this.transaction(subject, async (connection, ranked) => {
      const found = await connection.query(
        'select * from cpi_private.reward_intents where nonce=$1::uuid for update',
        [verified.customData],
      );
      if (found.rows.length !== 1) fail('reward-intent-unavailable');
      const intent = found.rows[0];
      const runId = String(intent.run_id);
      let run = await this.run(ranked, runId, subject);
      const now = this.clock();
      if (
        !intent.authorization_id ||
        intent.environment !== this.options.environment ||
        intent.expected_ad_unit !== verified.adUnit ||
        !Array.isArray(intent.expected_ad_networks) ||
        !intent.expected_ad_networks.includes(verified.adNetwork) ||
        intent.expected_reward_amount !== verified.amount ||
        intent.expected_reward_item !== verified.item
      )
        fail('reward-contract-mismatch');
      if (verified.earnedAt < date(intent.created_at) - 5000 || verified.earnedAt > now + 5000)
        fail('reward-invalid-timestamp');
      const prior = await connection.query(
        'select intent_id,run_id,signed_query_sha256 from cpi_private.reward_transactions where provider_transaction_id=$1::text',
        [verified.transactionId],
      );
      if (prior.rows.length) {
        const value = prior.rows[0];
        if (
          value.intent_id !== intent.id ||
          value.run_id !== runId ||
          value.signed_query_sha256 !== verified.signedQuerySha256
        )
          fail('reward-transaction-conflict');
        return { status: 'duplicate' };
      }
      if (
        intent.state !== 'pending' ||
        run.state.status !== 'dead' ||
        run.state.death?.id !== intent.death_id ||
        run.state.rulesetVersion !== intent.ruleset_version ||
        run.state.revivesGranted >= 10 ||
        Number(intent.ordinal) !== run.state.revivesApplied + 1 ||
        Number(intent.promised_restore_sp) !== getReviveSp(Number(intent.ordinal))
      )
        fail('reward-state-conflict');
      const grantId = uuid(this.newId());
      const next = transitionRun(
        run.state,
        {
          type: 'grant-revive',
          deathId: String(intent.death_id),
          ordinal: Number(intent.ordinal),
          intentId: String(intent.id),
          grantId,
        },
        {
          activeTimeMs: run.state.activeTimeMs,
          achievedAt: Math.max(now, run.state.lastObservedAt),
          rng: RANKED_RNG,
        },
      );
      if (!next.accepted) fail('reward-state-conflict');
      await connection.query(
        'insert into cpi_private.reward_transactions(provider_transaction_id,intent_id,run_id,signed_query_sha256,earned_at) values($1::text,$2::uuid,$3::uuid,$4::text,$5::timestamptz)',
        [
          verified.transactionId,
          intent.id,
          runId,
          verified.signedQuerySha256,
          new Date(verified.earnedAt).toISOString(),
        ],
      );
      await connection.query(
        'insert into cpi_private.revive_grants(id,intent_id,run_id,death_id,ordinal,restore_sp) values($1::uuid,$2::uuid,$3::uuid,$4::text,$5::smallint,$6::smallint)',
        [grantId, intent.id, runId, intent.death_id, intent.ordinal, intent.promised_restore_sp],
      );
      await connection.query(
        "update cpi_private.reward_intents set state='verified',resolved_at=$2::timestamptz where id=$1::uuid",
        [intent.id, new Date(now).toISOString()],
      );
      run = { ...run, state: next.state, paused: true, clockUpdatedAt: now, activeUntil: now };
      await ranked.saveRun(run);
      await connection.query(
        "insert into cpi_private.reward_audit_events(run_id,intent_id,event) values($1::uuid,$2::uuid,'ssv_verified')",
        [runId, intent.id],
      );
      return { status: 'accepted' };
    });
  }
  async apply(actor: RewardActor, body: unknown): Promise<RankedReply> {
    this.actor(actor);
    if (!object(body, ['runId', 'grantId', 'idempotencyKey', 'leaseToken', 'sequence']))
      fail('invalid-reward-request');
    const runId = uuid(body.runId);
    const grantId = uuid(body.grantId);
    const key = uuid(body.idempotencyKey);
    const leaseToken = uuid(body.leaseToken);
    const sequence = body.sequence;
    if (typeof sequence !== 'string' || !/^[1-9][0-9]*$/.test(sequence) || sequence.length > 1000)
      fail('invalid-reward-request');
    const request = {
      operation: 'apply',
      runId,
      grantId,
      deviceId: actor.deviceId,
      leaseToken,
      sequence,
    };
    return this.transaction(actor.subject, async (connection, ranked) => {
      const repeated = await this.receipt(connection, actor, key, request);
      if (repeated) return repeated as RankedReply;
      let run = await this.run(ranked, runId, actor.subject);
      const now = this.clock();
      if (run.deviceId !== actor.deviceId || run.leaseToken !== leaseToken)
        fail('reward-lease-lost');
      if (now >= run.leaseExpiresAt) fail('reward-lease-expired');
      if (run.nextSequence !== sequence) fail('reward-sequence-conflict');
      const grants = await connection.query(
        'select g.*,i.ruleset_version from cpi_private.revive_grants g join cpi_private.reward_intents i on i.id=g.intent_id where g.id=$1::uuid and g.run_id=$2::uuid for update of g',
        [grantId, runId],
      );
      const grant = grants.rows[0];
      if (
        !grant ||
        grant.state !== 'granted' ||
        grant.death_id !== run.state.death?.id ||
        grant.ruleset_version !== run.state.rulesetVersion ||
        Number(grant.ordinal) !== run.state.revivesApplied + 1 ||
        Number(grant.restore_sp) !== getReviveSp(Number(grant.ordinal))
      )
        fail('reward-grant-unavailable');
      const next = transitionRun(
        run.state,
        {
          type: 'apply-revive',
          deathId: String(grant.death_id),
          ordinal: Number(grant.ordinal),
          grantId,
        },
        {
          activeTimeMs: run.state.activeTimeMs,
          achievedAt: Math.max(now, run.state.lastObservedAt),
          rng: RANKED_RNG,
        },
      );
      if (!next.accepted) fail('reward-state-conflict');
      run = {
        ...run,
        state: next.state,
        nextSequence: (BigInt(sequence) + 1n).toString(),
        paused: true,
        clockUpdatedAt: now,
        activeUntil: now,
      };
      await connection.query(
        "update cpi_private.revive_grants set state='applied',applied_at=$2::timestamptz where id=$1::uuid",
        [grantId, new Date(now).toISOString()],
      );
      await ranked.saveRun(run);
      await connection.query(
        "insert into cpi_private.reward_audit_events(run_id,intent_id,event) values($1::uuid,$2::uuid,'grant_applied')",
        [runId, grant.intent_id],
      );
      // Keep the exact sequence visible to the ranked audit without introducing a
      // mobile-accessible grant command into the ordinary action parser.
      await connection.query(
        'insert into cpi_private.ranked_action_audit(run_id,user_id,command_sequence,idempotency_key,command_private,result_private,received_at) values($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb,$6::jsonb,$7::timestamptz)',
        [
          runId,
          actor.subject,
          sequence,
          key,
          JSON.stringify({ type: 'verified-reward-apply', grantId }),
          JSON.stringify(rankedSnapshot(run)),
          new Date(now).toISOString(),
        ],
      );
      const response = publicReply(run);
      await this.remember(connection, actor, key, runId, 'apply', request, response, now);
      return response;
    });
  }
}
