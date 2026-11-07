import { createHash } from 'node:crypto';
import {
  applyServerResource,
  assertRunState,
  LIVE_RULESET_VERSION,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { SqlPool } from './database.ts';
import type { RankedActor, RankedReply, StoredRankedRun } from './ranked.ts';
import { RANKED_RNG, rankedSnapshot, RankedError } from './ranked.ts';
import { PostgresTransaction } from './postgres-ranked.ts';
import { exactObject, sqlTransaction } from './private-services.ts';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** These debits and the private authoritative checkpoint commit together, across devices and edge instances. */
export function createResourceService(options: { database: SqlPool; now?: () => number }) {
  const now = options.now ?? Date.now;
  return async (actor: RankedActor, input: unknown): Promise<RankedReply> => {
    if (
      !exactObject(input, [
        'schemaVersion',
        'runId',
        'idempotencyKey',
        'sequence',
        'leaseToken',
        'leaseGeneration',
        'row',
        'life',
        'resource',
        'amount',
      ]) ||
      input.schemaVersion !== 1 ||
      typeof input.runId !== 'string' ||
      !uuid.test(input.runId) ||
      typeof input.idempotencyKey !== 'string' ||
      !uuid.test(input.idempotencyKey) ||
      typeof input.leaseToken !== 'string' ||
      !uuid.test(input.leaseToken) ||
      typeof input.sequence !== 'string' ||
      !/^\d{1,1000}$/.test(input.sequence) ||
      typeof input.leaseGeneration !== 'string' ||
      !/^\d{1,1000}$/.test(input.leaseGeneration) ||
      typeof input.row !== 'string' ||
      !/^\d{1,1000}$/.test(input.row) ||
      !['sp', 'hints', 'credit'].includes(String(input.resource)) ||
      typeof input.amount !== 'number' ||
      !Number.isInteger(input.amount) ||
      input.amount < 1 ||
      input.amount > 200 ||
      typeof input.life !== 'number' ||
      !Number.isInteger(input.life)
    )
      throw new RankedError('invalid-request');
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ device: actor.deviceId, input }))
      .digest('hex');
    return sqlTransaction(options.database, async (connection) => {
      const owner = (
        await connection.query(
          'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
          [actor.subject],
        )
      ).rows;
      const deleted = (
        await connection.query(
          'select 1 from cpi_private.account_deletion_requests where user_id=$1::uuid',
          [actor.subject],
        )
      ).rows;
      if (owner.length !== 1 || deleted.length) throw new RankedError('account-unavailable');
      const ranked = new PostgresTransaction(connection, actor.subject);
      const prior = await ranked.getReceipt(input.idempotencyKey as string);
      if (prior) {
        if (prior.requestFingerprint !== requestFingerprint)
          throw new RankedError('idempotency-conflict');
        return prior.response;
      }
      let run = await ranked.getRun(input.runId as string);
      if (!run || run.state.rulesetVersion !== LIVE_RULESET_VERSION || run.leaseActive === false)
        throw new RankedError('run-not-found');
      assertRunState(run.state, RANKED_RNG);
      const stamp = now();
      await ranked.authorizeRecovery({
        clientBuild: actor.clientBuild,
        rulesetVersion: run.state.rulesetVersion,
      });
      if (
        run.deviceId !== actor.deviceId ||
        run.leaseToken !== input.leaseToken ||
        run.leaseGeneration !== input.leaseGeneration
      )
        throw new RankedError('lease-lost');
      if (run.leaseExpiresAt <= stamp) throw new RankedError('lease-expired');
      if (run.nextSequence !== input.sequence) throw new RankedError('sequence-conflict');
      if (run.state.currentRow !== input.row || run.state.revivesApplied !== input.life)
        throw new RankedError('stale-resource-request');
      if (run.state.pact?.phase === 'offered' || run.state.discovery?.introduction)
        throw new RankedError('resource-unavailable');
      if (stamp < run.clockUpdatedAt || stamp < run.state.lastObservedAt)
        throw new RankedError('server-clock-regressed');
      const elapsed =
        run.paused || run.state.status !== 'playing'
          ? 0
          : Math.max(0, Math.min(stamp, run.activeUntil) - run.clockUpdatedAt);
      if (run.state.status === 'playing')
        run = {
          ...run,
          state: transitionRun(
            run.state,
            { type: 'tick' },
            { activeTimeMs: run.state.activeTimeMs + elapsed, achievedAt: stamp, rng: RANKED_RNG },
          ).state,
        };
      const current = (
        await connection.query(
          'select * from cpi_private.commerce_wallets where user_id=$1::uuid for update',
          [actor.subject],
        )
      ).rows[0];
      const resource = input.resource as 'sp' | 'hints' | 'credit',
        amount = input.amount as number,
        column = resource === 'credit' ? 'credits' : resource;
      const funded = !(
        !current ||
        current.blocked ||
        !Number.isSafeInteger(Number(current[column])) ||
        Number(current[column]) < amount
      );
      const outcome = !funded
        ? { state: run.state, accepted: false, reason: 'resource-limit', events: [] }
        : applyServerResource(run.state, resource, amount, {
            activeTimeMs: run.state.activeTimeMs,
            achievedAt: stamp,
            rng: RANKED_RNG,
          });
      if (outcome.accepted) {
        await connection.query(
          `update cpi_private.commerce_wallets set ${column}=${column}-$2,revision=revision+1 where id=$1::uuid`,
          [current.id, amount],
        );
        await connection.query(
          'insert into cpi_private.resource_spends(id,user_id,wallet_id,run_id,resource,amount) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6)',
          [input.idempotencyKey, actor.subject, current.id, input.runId, resource, amount],
        );
      }
      const updated: StoredRankedRun = {
        ...run,
        state: outcome.state,
        nextSequence: (BigInt(run.nextSequence) + 1n).toString(),
        clockUpdatedAt: stamp,
        ...(resource === 'credit' && outcome.accepted ? { paused: true, activeUntil: stamp } : {}),
      };
      const response: RankedReply = {
        accepted: outcome.accepted,
        reason: outcome.reason,
        snapshot: rankedSnapshot(updated),
        lease: {
          token: updated.leaseToken,
          generation: updated.leaseGeneration,
          expiresAt: updated.leaseExpiresAt,
        },
      };
      await ranked.saveRun(updated);
      await ranked.saveReceipt({
        key: input.idempotencyKey as string,
        requestFingerprint,
        response,
        createdAt: stamp,
      });
      await connection.query(
        'insert into cpi_private.ranked_action_audit(run_id,user_id,command_sequence,idempotency_key,command_private,result_private,received_at) values($1::uuid,$2::uuid,$3,$4::uuid,$5::jsonb,$6::jsonb,$7::timestamptz)',
        [
          input.runId,
          actor.subject,
          input.sequence,
          input.idempotencyKey,
          JSON.stringify({
            type: 'purchased-resource',
            resource,
            amount,
            accepted: outcome.accepted,
          }),
          JSON.stringify(response.snapshot),
          new Date(stamp).toISOString(),
        ],
      );
      return response;
    });
  };
}
