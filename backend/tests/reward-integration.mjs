import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getCurrentRow } from '../../packages/game-core/src/run.ts';
import { PostgresRankedRepository } from '../../packages/server-core/src/postgres-ranked.ts';
import { RankedAuthority } from '../../packages/server-core/src/ranked.ts';
import { RewardService } from '../../packages/server-core/src/reward-service.ts';
import { createRewardHandler } from '../../packages/server-core/src/reward-api.ts';
import { createAccountLifecycleHandler } from '../../packages/server-core/src/account-lifecycle.ts';
import { PendingRunsService } from '../../packages/server-core/src/pending-runs.ts';
import { enableFixtureOperations } from './operations-fixture.mjs';
import { createMvpServer } from '../../packages/server-core/src/server-app.ts';

/** Local keys sign synthetic Google-shaped fixtures. This is NOT live AdMob evidence. */
export async function runRewardIntegration(adminPool, runtimePool) {
  const admin = await adminPool.connect();
  const subject = '00000000-0000-4000-8000-000000000681';
  const other = '00000000-0000-4000-8000-000000000682';
  const configuration = '00000000-0000-4000-8000-000000000683';
  const authorization = '00000000-0000-4000-8000-000000000684';
  const actor = { subject, deviceId: 'trusted-reward-device', clientBuild: 1 };
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let now = Date.now();
  const authority = new RankedAuthority({
    repository: new PostgresRankedRepository(runtimePool),
    now: () => now,
  });
  const service = new RewardService({
    database: runtimePool,
    environment: 'development',
    platform: 'android',
    now: () => now,
    keys: { get: () => Promise.resolve(keys.publicKey) },
  });
  const pendingRuns = new PendingRunsService({ database: runtimePool, now: () => now });
  let otherActive = null;
  const rewardHandler = createRewardHandler({
    basePath: '/cpi',
    service,
    authenticate: (token) =>
      Promise.resolve(
        token === 'synthetic-reward-token' ? { ...actor, rewardsAllowed: true } : null,
      ),
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    rateLimit: () => Promise.resolve(true),
  });
  const api = createMvpServer({ basePath: '/cpi', handlers: { rewards: rewardHandler } });
  async function post(route, body, expected = 200) {
    const result = await api(
      new Request('https://reward.example.invalid/cpi/rewards/' + route, {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          authorization: 'Bearer synthetic-reward-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(result.status, expected, 'Unexpected reward route status');
    return result.json();
  }
  function callback(intent, ordinal, overrides = {}) {
    const signed = new URLSearchParams({
      ad_network: '5450213213286189855',
      ad_unit: '9999999999',
      custom_data: intent.customData,
      reward_amount: '1',
      reward_item: 'continue',
      timestamp: String(now),
      transaction_id: 'feed' + ordinal.toString(16).padStart(4, '0'),
      ...overrides,
    }).toString();
    return (
      signed +
      '&signature=' +
      sign('sha256', Buffer.from(signed), { key: keys.privateKey, dsaEncoding: 'der' }).toString(
        'base64url',
      ) +
      '&key_id=123'
    );
  }
  async function ssv(raw, expected = 200) {
    const result = await api(new Request('https://reward.example.invalid/cpi/rewards/ssv?' + raw));
    assert.equal(result.status, expected, 'Unexpected synthetic callback status');
    return result.json();
  }
  let restorePolicy = () => Promise.resolve();
  let latest;
  async function command(value) {
    now += 200;
    latest = await authority.execute(actor, {
      runId: latest.snapshot.runId,
      sequence: latest.snapshot.nextSequence,
      leaseToken: latest.lease.token,
      idempotencyKey: randomUUID(),
      command: value,
    });
    return latest;
  }
  async function die() {
    if (latest.snapshot.paused) await command({ type: 'resume' });
    while (latest.snapshot.status === 'playing') {
      const result = await admin.query(
        'select checkpoint_private from cpi_private.ranked_runs where id=$1::uuid',
        [latest.snapshot.runId],
      );
      const state = result.rows[0].checkpoint_private.state;
      const safe = getCurrentRow(state).safeSide;
      await command({
        type: 'choose',
        row: latest.snapshot.currentRow,
        life: latest.snapshot.revivesApplied,
        side: safe === 'left' ? 'right' : 'left',
      });
    }
  }
  try {
    restorePolicy = await enableFixtureOperations(admin);
    await admin.query('insert into auth.users(id,email) values($1::uuid,$2),($3::uuid,$4)', [
      subject,
      'reward-integration@example.invalid',
      other,
      'reward-other@example.invalid',
    ]);
    const runtime = await runtimePool.connect();
    try {
      await runtime.query(
        'select cpi_private.save_profile($1::uuid,$2::text,$3::text,$4::text,null)',
        [subject, 'reward_integration', 'BG', 'keep'],
      );
      await runtime.query(
        'select cpi_private.save_profile($1::uuid,$2::text,$3::text,$4::text,null)',
        [other, 'reward_other', 'CA', 'keep'],
      );
    } finally {
      runtime.release();
    }
    latest = await authority.start(actor, { idempotencyKey: randomUUID() });
    await die();
    assert.equal(latest.snapshot.status, 'dead');
    assert.equal(
      (await post('eligibility', { runId: latest.snapshot.runId })).status,
      'unavailable',
      'no permit defaults unavailable',
    );
    const rejected = await post(
      'intent',
      { runId: latest.snapshot.runId, idempotencyKey: randomUUID() },
      409,
    );
    assert.equal(rejected.code, 'reward-privacy-unavailable');
    // Synthetic fixture approval is confined to this disposable database. Actual
    // deployment requires reviewed native SDK/consent inventory and provider setup.
    await admin.query(
      `insert into cpi_private.reward_sdk_configurations(id,environment,platform,sdk_version,ad_unit_id,ssv_ad_unit,reward_amount,reward_item,reviewed,families_reviewed,closeability_reviewed,enabled)
      values($1::uuid,'development','android','synthetic-fixture','ca-app-pub-1111111111111111/9999999999','9999999999','1','continue',true,true,true,true)`,
      [configuration],
    );
    await admin.query(
      `insert into cpi_private.reward_authorizations(id,user_id,configuration_id,privacy_context,policy_version,verification_reference,prerequisites_satisfied,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,issued_at,valid_until)
      values($1::uuid,$2::uuid,$3::uuid,'unknown','synthetic-fixture','fixture:reviewed',true,true,true,'G',true,$4::timestamptz,$5::timestamptz)`,
      [
        authorization,
        subject,
        configuration,
        new Date(now - 1000).toISOString(),
        new Date(now + 14 * 60_000).toISOString(),
      ],
    );
    const eligible = await post('eligibility', { runId: latest.snapshot.runId });
    assert.equal(eligible.status, 'allowed');
    assert.equal(eligible.permit.context, 'unknown');
    assert.equal(eligible.permit.flags.childDirected, true);
    assert.equal(eligible.permit.flags.maxAdContentRating, 'G');
    const seen = [];
    for (let ordinal = 1; ordinal <= 10; ordinal += 1) {
      const state = await post('status', { runId: latest.snapshot.runId });
      const sp = ordinal <= 5 ? 200 : 150;
      assert.deepEqual(state.offer, { ordinal, restoreSp: sp });
      const request = { runId: latest.snapshot.runId, idempotencyKey: randomUUID() };
      const pending = await post('intent', request);
      assert.equal(pending.status, 'pending');
      assert.equal(pending.intent.ordinal, ordinal);
      assert.equal(pending.intent.restoreSp, sp);
      assert.deepEqual(
        await post('intent', request),
        pending,
        'same intent request is exactly idempotent',
      );
      assert.equal(pending.intent.customData.includes(subject), false);
      assert.equal(
        (await post('status', { runId: latest.snapshot.runId })).revivesGranted,
        ordinal - 1,
        'unconfirmed client callbacks grant nothing',
      );
      if (ordinal === 1) {
        latest = await authority.recover(actor, {
          runId: latest.snapshot.runId,
          idempotencyKey: randomUUID(),
          takeover: false,
        });
        const archived = await pendingRuns.archive(actor, {
          runId: latest.snapshot.runId,
          sequence: latest.snapshot.nextSequence,
          idempotencyKey: randomUUID(),
          leaseToken: latest.lease.token,
        });
        assert.deepEqual(archived, { status: 'archived', runId: latest.snapshot.runId });
        otherActive = await authority.start(actor, { idempotencyKey: randomUUID() });
        assert.notEqual(otherActive.snapshot.runId, latest.snapshot.runId);
        await assert.rejects(
          authority.recover(actor, {
            runId: latest.snapshot.runId,
            idempotencyKey: randomUUID(),
            takeover: true,
          }),
          (error) => error.code === 'active-run-exists',
        );
      }
      await ssv(callback(pending.intent, ordinal, { ad_unit: 'wrong-unit' }), 409);
      await ssv(callback(pending.intent, ordinal, { timestamp: String(now - 60_000) }), 409);
      if (ordinal === 2) await ssv(callback(pending.intent, 1), 409);
      // A long legitimate ad and a much later provider delivery still owe the same
      // grant; expiry is pre-display freshness, never earning/settlement forfeiture.
      if (ordinal === 1) {
        now += 180_000;
      }
      const raw = callback(pending.intent, ordinal);
      if (ordinal === 1) {
        now += 1;
        await admin.query(
          'update cpi_private.reward_authorizations set revoked_at=$2::timestamptz where id=$1::uuid',
          [authorization, new Date(now).toISOString()],
        );
        now += 180_000;
      }
      const results = await Promise.all([ssv(raw), ssv(raw)]);
      assert.deepEqual(results.map((value) => value.status).sort(), ['accepted', 'duplicate']);
      seen.push(raw);
      const granted = await post('status', { runId: latest.snapshot.runId });
      assert.equal(granted.status, 'granted');
      assert.equal(granted.revivesGranted, ordinal);
      assert.equal(granted.revivesApplied, ordinal - 1);
      if (ordinal === 1) {
        const stale = {
          runId: latest.snapshot.runId,
          grantId: granted.grant.id,
          idempotencyKey: randomUUID(),
          leaseToken: latest.lease.token,
          sequence: latest.snapshot.nextSequence,
        };
        assert.equal((await post('apply', stale, 409)).code, 'reward-lease-lost');
        await assert.rejects(
          service.apply({ ...actor, subject: other }, stale),
          (error) => error.code === 'reward-run-unavailable',
        );
        const stored = await admin.query(
          'select lease_active,checkpoint_private from cpi_private.ranked_runs where id=$1::uuid',
          [latest.snapshot.runId],
        );
        assert.equal(
          stored.rows[0].lease_active,
          false,
          'late SSV never reattaches a saved attempt',
        );
        assert.equal(stored.rows[0].checkpoint_private.leaseActive, false);
        assert.equal(stored.rows[0].checkpoint_private.state.revivesGranted, 1);
        const saved = await pendingRuns.saved(actor, { after: null });
        assert.equal(saved.runs[0].runId, latest.snapshot.runId);
        assert.equal(saved.runs[0].revivesGranted, 1);
        assert.equal(saved.runs[0].revivesApplied, 0);
        assert.equal(JSON.stringify(saved).includes('hmac'), false);
        assert.deepEqual(
          (await pendingRuns.saved({ ...actor, subject: other }, { after: null })).runs,
          [],
        );
        assert.deepEqual(await authority.active(actor, {}), {
          status: 'active',
          runId: otherActive.snapshot.runId,
        });
        otherActive = await authority.recover(actor, {
          runId: otherActive.snapshot.runId,
          idempotencyKey: randomUUID(),
          takeover: false,
        });
        await authority.execute(actor, {
          runId: otherActive.snapshot.runId,
          sequence: otherActive.snapshot.nextSequence,
          idempotencyKey: randomUUID(),
          leaseToken: otherActive.lease.token,
          command: { type: 'end' },
        });
      }
      latest = await authority.recover(actor, {
        runId: latest.snapshot.runId,
        idempotencyKey: randomUUID(),
        takeover: false,
      });
      const score = latest.snapshot.lastClearedRow;
      const achieved = latest.snapshot.achievedAt;
      const tie = latest.snapshot.revivesToReachScore;
      const apply = {
        runId: latest.snapshot.runId,
        grantId: granted.grant.id,
        idempotencyKey: randomUUID(),
        leaseToken: latest.lease.token,
        sequence: latest.snapshot.nextSequence,
      };
      const [restored, repeated] = await Promise.all([post('apply', apply), post('apply', apply)]);
      assert.deepEqual(repeated, restored, 'duplicate apply never adds SP or a life');
      assert.equal(restored.snapshot.sp, sp);
      assert.equal(restored.snapshot.revivesApplied, ordinal);
      assert.equal(restored.snapshot.revivesGranted, ordinal);
      assert.equal(restored.snapshot.lastClearedRow, score);
      assert.equal(restored.snapshot.achievedAt, achieved);
      assert.equal(restored.snapshot.revivesToReachScore, tie);
      assert.equal(restored.snapshot.paused, true);
      latest = restored;
      if (ordinal === 1)
        await admin.query(
          'update cpi_private.reward_authorizations set revoked_at=null where id=$1::uuid',
          [authorization],
        );
      await die();
    }
    assert.equal(latest.snapshot.status, 'finished', 'the death after continuation ten is final');
    await post('intent', { runId: latest.snapshot.runId, idempotencyKey: randomUUID() }, 409);
    assert.equal(
      (await ssv(seen.at(-1))).status,
      'duplicate',
      'late duplicate cannot reopen a finalized result',
    );
    const counts = await admin.query(
      `select (select count(*)::text from cpi_private.reward_transactions where run_id=$1::uuid) as transactions,
      (select count(*)::text from cpi_private.revive_grants where run_id=$1::uuid and state='applied') as applied,
      (select count(*)::text from cpi_private.verified_results where run_id=$1::uuid and published_at is not null) as published`,
      [latest.snapshot.runId],
    );
    assert.deepEqual(counts.rows[0], { transactions: '10', applied: '10', published: '1' });
    const wall = Date.now();
    const accountHandler = createAccountLifecycleHandler({
      database: runtimePool,
      authenticate: () => Promise.resolve({ subject }),
      verifyReauthentication: () =>
        Promise.resolve({
          subject,
          purpose: 'export',
          proofId: randomUUID(),
          verifiedAt: wall,
          expiresAt: wall + 60_000,
        }),
      revokeAllSessions: () => Promise.resolve(null),
      allowOrigin: (origin) => origin === 'capacitor://localhost',
      rateLimit: () => Promise.resolve(true),
      now: () => wall,
    });
    const lifecycle = createMvpServer({ handlers: { account: accountHandler } });
    const exported = await lifecycle(
      new Request('https://reward.example.invalid/account/export', {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          authorization: 'Bearer synthetic-reward-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          reauthProof: 'synthetic-reauth-proof-0123456789',
        }),
      }),
    );
    assert.equal(exported.status, 200, 'reauthenticated export includes reward collections');
    const own = await exported.json();
    assert.equal(own.rewards.length, 10);
    assert.equal(own.adAuthorizations.length, 1);
    assert.equal(JSON.stringify(own.rewards).includes('customData'), false);
    assert.equal(JSON.stringify(own).includes('fixture:reviewed'), false);
    console.log(
      'Synthetic signed reward HTTP + PostgreSQL fixtures: privacy gates, exact intents, late SSV, replay/concurrency, 200/150 schedule and ten-grant finalization passed. Not live AdMob evidence.',
    );
  } finally {
    await admin.query('delete from auth.users where id in($1::uuid,$2::uuid)', [subject, other]);
    await admin.query('delete from cpi_private.reward_sdk_configurations where id=$1::uuid', [
      configuration,
    ]);
    await restorePolicy();
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
    await runRewardIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
