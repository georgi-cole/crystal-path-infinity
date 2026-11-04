import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getCurrentRow } from '../../packages/game-core/src/run.ts';
import { RankedAuthority } from '../../packages/server-core/src/ranked.ts';
import { PostgresRankedRepository } from '../../packages/server-core/src/postgres-ranked.ts';
import { createRankedHandler } from '../../packages/server-core/src/ranked-api.ts';
import { RewardService } from '../../packages/server-core/src/reward-service.ts';
import { createRewardHandler } from '../../packages/server-core/src/reward-api.ts';
import { createOperationsStatusHandler } from '../../packages/server-core/src/operations-policy.ts';
import { OperationsMetrics } from '../../packages/server-core/src/operations-metrics.ts';
import { createMvpServer } from '../../packages/server-core/src/server-app.ts';
import { createRewardClient } from '../../apps/mobile/src/rewards/reward-client.ts';
import { RewardFlow } from '../../apps/mobile/src/rewards/reward-flow.ts';

/** Disposable source fixture only. Synthetic provider keys never authorize live traffic. */
export async function runOperationsIntegration(adminPool, runtimePool) {
  const admin = await adminPool.connect();
  const subject = '00000000-0000-4000-8000-000000000771';
  const other = '00000000-0000-4000-8000-000000000772';
  const configuration = '00000000-0000-4000-8000-000000000773';
  const authorization = '00000000-0000-4000-8000-000000000774';
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let now = Date.now();
  let build = 1;
  let currentSubject = subject;
  let currentDevice = 'trusted-operations-device';
  const original = (await admin.query('select cpi_private.get_operations_policy() as policy'))
    .rows[0].policy;
  const authority = new RankedAuthority({
    repository: new PostgresRankedRepository(runtimePool),
    now: () => now,
  });
  const rewards = new RewardService({
    database: runtimePool,
    environment: 'development',
    platform: 'android',
    now: () => now,
    keys: { get: () => Promise.resolve(keys.publicKey) },
  });
  const policy = async (
    ranked,
    ads,
    minimum = 2,
    recoveryMinimum = 1,
    startRuleset = 'infinity-v1',
  ) => {
    const current = (await admin.query('select cpi_private.get_operations_policy() as policy'))
      .rows[0].policy;
    await admin.query(
      'select cpi_private.set_operations_policy($1::bigint,$2::boolean,$3::boolean,$4::integer,$5::integer,$6::text,$7::text[],$8::text,$9::text)',
      [
        current.revision,
        ranked,
        ads,
        minimum,
        recoveryMinimum,
        startRuleset,
        startRuleset === 'infinity-v1' ? ['infinity-v1'] : ['infinity-v1', startRuleset],
        ranked && ads ? 'none' : 'scheduled_maintenance',
        'CI:operations-runtime',
      ],
    );
  };
  const allowOrigin = (origin) => origin === 'capacitor://localhost';
  const authenticate = () =>
    Promise.resolve({
      subject: currentSubject,
      deviceId: currentDevice,
      clientBuild: build,
      rankedAllowed: true,
      rewardsAllowed: true,
    });
  const metrics = new OperationsMetrics({
    enabled: true,
    sink: { write: () => Promise.reject(new Error('synthetic diagnostics unavailable')) },
  });
  const server = createMvpServer({
    basePath: '/cpi',
    rulesetVersion: 'infinity-v1',
    metrics,
    handlers: {
      ranked: createRankedHandler({
        basePath: '/cpi',
        authority,
        authenticate,
        allowOrigin,
        rateLimit: () => Promise.resolve(true),
      }),
      rewards: createRewardHandler({
        basePath: '/cpi',
        service: rewards,
        authenticate,
        allowOrigin,
        rateLimit: () => Promise.resolve(true),
      }),
      operations: createOperationsStatusHandler({
        basePath: '/cpi',
        database: runtimePool,
        allowOrigin,
        allowPublicRead: () => true,
        rateLimit: () => Promise.resolve(true),
      }),
    },
  });
  async function post(path, body, expected = 200) {
    const result = await server(
      new Request('https://ops.example.invalid/cpi/' + path, {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          authorization: 'Bearer synthetic-operations-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(result.status, expected, 'Unexpected operational route status for ' + path);
    return result.json();
  }
  let latest;
  const checkpoint = async () =>
    (
      await admin.query(
        'select checkpoint_private from cpi_private.ranked_runs where id=$1::uuid',
        [latest.snapshot.runId],
      )
    ).rows[0].checkpoint_private;
  async function command(value) {
    now += 100;
    latest = await post('ranked/action', {
      runId: latest.snapshot.runId,
      sequence: latest.snapshot.nextSequence,
      idempotencyKey: randomUUID(),
      leaseToken: latest.lease.token,
      command: value,
    });
  }
  let flow;
  try {
    assert.equal(
      original.rankedStartsEnabled,
      false,
      'Migration must default ranked starts disabled',
    );
    assert.equal(original.adStartsEnabled, false, 'Migration must default ad starts disabled');
    await admin.query('insert into auth.users(id,email) values($1::uuid,$2),($3::uuid,$4)', [
      subject,
      'operations-runtime@example.invalid',
      other,
      'operations-other@example.invalid',
    ]);
    const runtime = await runtimePool.connect();
    try {
      for (const [id, name] of [
        [subject, 'operations_runtime'],
        [other, 'operations_other'],
      ])
        await runtime.query(
          'select cpi_private.save_profile($1::uuid,$2::text,$3::text,$4::text)',
          [id, name, 'BG', 'skip'],
        );
    } finally {
      runtime.release();
    }
    const status = await post('operations/status', { schemaVersion: 1 });
    assert.equal(status.rankedStartsEnabled, false);
    assert.deepEqual(await post('ranked/start', { idempotencyKey: randomUUID() }, 503), {
      code: 'maintenance',
    });
    build = undefined;
    assert.deepEqual(await post('ranked/start', { idempotencyKey: randomUUID() }, 503), {
      code: 'operation_context_required',
    });
    build = 1;
    await policy(true, true, 2);
    assert.deepEqual(await post('ranked/start', { idempotencyKey: randomUUID() }, 426), {
      code: 'client_update_required',
    });
    assert.deepEqual(
      await post('ranked/start', { idempotencyKey: randomUUID(), clientBuild: 999 }, 400),
      { code: 'invalid-request' },
    );
    build = 2;
    const startRequest = { idempotencyKey: randomUUID() };
    latest = await post('ranked/start', startRequest);
    const started = structuredClone(latest);
    await policy(true, true, 2, 1, 'infinity-v2');
    currentSubject = other;
    assert.deepEqual(await post('ranked/start', { idempotencyKey: randomUUID() }, 409), {
      code: 'ruleset_unavailable',
    });
    assert.equal(
      (
        await admin.query(
          'select count(*)::int as count from cpi_private.ranked_runs where user_id=$1::uuid',
          [other],
        )
      ).rows[0].count,
      0,
    );
    currentSubject = subject;
    await policy(true, true);
    await command({ type: 'resume' });
    await command({
      type: 'choose',
      row: latest.snapshot.currentRow,
      life: 0,
      side: getCurrentRow((await checkpoint()).state).safeSide,
    });
    while (latest.snapshot.status === 'playing') {
      const safe = getCurrentRow((await checkpoint()).state).safeSide;
      await command({
        type: 'choose',
        row: latest.snapshot.currentRow,
        life: 0,
        side: safe === 'left' ? 'right' : 'left',
      });
    }
    const originalRoute = (await checkpoint()).state.stream;
    const confirmedProgress = latest.snapshot.lastClearedRow;
    assert.ok(BigInt(confirmedProgress) >= 1n);
    await admin.query(
      `insert into cpi_private.reward_sdk_configurations(id,environment,platform,sdk_version,ad_unit_id,ssv_ad_unit,reward_amount,reward_item,reviewed,families_reviewed,closeability_reviewed,enabled)
      values($1::uuid,'development','android','synthetic-fixture','ca-app-pub-1111111111111111/9999999999','9999999999','1','continue',true,true,true,true)`,
      [configuration],
    );
    await admin.query(
      `insert into cpi_private.reward_authorizations(id,user_id,configuration_id,privacy_context,policy_version,verification_reference,prerequisites_satisfied,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,issued_at,valid_until)
      values($1::uuid,$2::uuid,$3::uuid,'unknown','synthetic-fixture','fixture:operations',true,true,true,'G',true,$4::timestamptz,$5::timestamptz)`,
      [
        authorization,
        subject,
        configuration,
        new Date(now - 1000).toISOString(),
        new Date(now + 14 * 60_000).toISOString(),
      ],
    );
    assert.equal(
      (await post('rewards/eligibility', { runId: latest.snapshot.runId })).status,
      'allowed',
    );
    currentDevice = 'another-trusted-device';
    assert.deepEqual(
      await post('rewards/eligibility', { runId: latest.snapshot.runId }),
      { schemaVersion: 1, status: 'unavailable' },
      'Another device must recover before requesting SDK initialization',
    );
    assert.deepEqual(
      await post(
        'rewards/intent',
        { runId: latest.snapshot.runId, idempotencyKey: randomUUID() },
        409,
      ),
      { code: 'reward-lease-lost' },
      'Another device cannot create a new ad intent before recovery',
    );
    currentDevice = 'trusted-operations-device';
    await policy(false, false, 3);
    assert.deepEqual(await post('rewards/eligibility', { runId: latest.snapshot.runId }, 503), {
      code: 'maintenance',
    });
    // Actual mobile flow receives a fresh refusal before any injected SDK initialization.
    let initializations = 0;
    let loads = 0;
    const scope = {};
    const rewardClient = createRewardClient({
      baseUrl: 'https://ops.example.invalid/cpi',
      session: {
        accountScope: () => scope,
        subscribeAccountScope: () => () => {},
        withAccountRequest: (callback) =>
          callback({
            subject,
            accessToken: 'synthetic-operations-token',
            signal: new AbortController().signal,
          }),
      },
      applyGrant: () => Promise.resolve(false),
      fetcher: (input, init) =>
        server(
          new Request(input, {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init.headers)),
              origin: 'capacitor://localhost',
            },
          }),
        ),
    });
    flow = new RewardFlow({
      runId: latest.snapshot.runId,
      client: rewardClient,
      onGateChange: () => {},
      synchronizeRun: () => Promise.resolve(true),
      now: () => now,
      adapter: {
        available: true,
        inventory: {
          provider: 'admob',
          platform: 'android',
          sdkVersion: 'synthetic-fixture',
          mediation: [],
        },
        initialize: () => {
          initializations++;
          return Promise.resolve();
        },
        load: () => {
          loads++;
          return Promise.resolve({ status: 'no_fill' });
        },
      },
    });
    await flow.recover();
    await flow.watch();
    assert.equal(initializations, 0);
    assert.equal(loads, 0);
    flow.dispose();
    flow = null;
    const intentRequest = { runId: latest.snapshot.runId, idempotencyKey: randomUUID() };
    assert.deepEqual(await post('rewards/intent', intentRequest, 503), { code: 'maintenance' });
    assert.equal(
      (
        await admin.query(
          'select count(*)::int as count from cpi_private.reward_intents where run_id=$1::uuid',
          [latest.snapshot.runId],
        )
      ).rows[0].count,
      0,
    );
    await policy(true, true, 2);
    const pending = await post('rewards/intent', intentRequest);
    await policy(false, false, 3);
    assert.deepEqual(
      await post('rewards/eligibility', { runId: latest.snapshot.runId }),
      { schemaVersion: 1, status: 'unavailable' },
      'Pending settlement cannot authorize another SDK load',
    );
    assert.deepEqual(
      await post('ranked/start', startRequest),
      started,
      'A committed start receipt remains retrievable under a kill',
    );
    assert.deepEqual(
      await post('rewards/intent', intentRequest),
      pending,
      'A committed intent receipt remains retrievable under a kill',
    );
    const raw = new URLSearchParams({
      ad_network: '5450213213286189855',
      ad_unit: '9999999999',
      custom_data: pending.intent.customData,
      reward_amount: '1',
      reward_item: 'continue',
      timestamp: String(now),
      transaction_id: 'feed0071',
    }).toString();
    const signed =
      raw +
      '&signature=' +
      sign('sha256', Buffer.from(raw), { key: keys.privateKey, dsaEncoding: 'der' }).toString(
        'base64url',
      ) +
      '&key_id=123';
    const verified = await server(
      new Request('https://ops.example.invalid/cpi/rewards/ssv?' + signed),
    );
    assert.equal(verified.status, 200, 'Earned SSV is accepted while all new starts are disabled');
    const granted = await post('rewards/status', { runId: latest.snapshot.runId });
    assert.equal(granted.status, 'granted');
    assert.equal(granted.revivesGranted, 1);
    assert.deepEqual(
      await post('rewards/eligibility', { runId: latest.snapshot.runId }),
      { schemaVersion: 1, status: 'unavailable' },
      'An unapplied earned grant cannot authorize another SDK load',
    );
    build = 1;
    latest = await post('ranked/recover', {
      runId: latest.snapshot.runId,
      idempotencyKey: randomUUID(),
      takeover: false,
    });
    assert.deepEqual(
      (await checkpoint()).state.stream,
      originalRoute,
      'Recovery keeps the original route under a start kill',
    );
    await policy(false, false, 3, 2);
    assert.deepEqual(
      await post(
        'ranked/recover',
        { runId: latest.snapshot.runId, idempotencyKey: randomUUID(), takeover: false },
        426,
      ),
      { code: 'client_update_required' },
    );
    const apply = {
      runId: latest.snapshot.runId,
      grantId: granted.grant.id,
      idempotencyKey: randomUUID(),
      leaseToken: latest.lease.token,
      sequence: latest.snapshot.nextSequence,
    };
    assert.deepEqual(await post('rewards/apply', apply, 426), { code: 'client_update_required' });
    assert.equal(
      (await post('rewards/status', { runId: latest.snapshot.runId })).revivesApplied,
      0,
      'A recovery floor cannot consume an owed grant',
    );
    build = 2;
    latest = await post('rewards/apply', apply);
    assert.equal(latest.snapshot.revivesApplied, 1);
    assert.equal(latest.snapshot.sp, 200);
    await policy(false, false, 3, 3);
    assert.deepEqual(
      await post('rewards/apply', apply),
      latest,
      'Committed apply retry is returned even after a recovery floor change',
    );
    build = 3;
    await command({ type: 'end' });
    assert.equal(latest.snapshot.status, 'finished');
    const final = await admin.query(
      'select last_cleared_row,revives_to_reach_score from cpi_private.verified_results where run_id=$1::uuid',
      [latest.snapshot.runId],
    );
    assert.equal(final.rows[0].last_cleared_row, confirmedProgress);
    assert.equal(final.rows[0].revives_to_reach_score, 0);
    const killed = await post('operations/status', { schemaVersion: 1 });
    assert.equal(killed.rankedStartsEnabled, false);
    assert.equal(killed.adStartsEnabled, false);
    assert.equal(
      await metrics.flush(),
      false,
      'An unavailable diagnostics sink does not break recovery or earned grant application',
    );
    console.log(
      'Operational full-router PostgreSQL fixture passed: default kills, trusted build/ruleset gates, no SDK initialization after ad kill, late signed SSV, compatible recovery/apply, durable retries and confirmed publication. Synthetic only; no live service approval.',
    );
  } finally {
    flow?.dispose();
    await admin.query('delete from auth.users where id in($1::uuid,$2::uuid)', [subject, other]);
    await admin.query('delete from cpi_private.reward_sdk_configurations where id=$1::uuid', [
      configuration,
    ]);
    const current = (await admin.query('select cpi_private.get_operations_policy() as policy'))
      .rows[0].policy;
    await admin.query(
      'select cpi_private.set_operations_policy($1::bigint,$2::boolean,$3::boolean,$4::integer,$5::integer,$6::text,$7::text[],$8::text,$9::text)',
      [
        current.revision,
        original.rankedStartsEnabled,
        original.adStartsEnabled,
        original.minimumClientBuild,
        original.recoveryMinimumClientBuild,
        original.startRuleset,
        original.recoveryRulesets,
        original.maintenanceCode,
        'CI:operations-restore',
      ],
    );
    admin.release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'cpi_ci');
  const { Pool } = await import('pg');
  const admin = new Pool({ max: 2 });
  const runtime = new Pool({ max: 4, options: '-c role=service_role' });
  try {
    await runOperationsIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
