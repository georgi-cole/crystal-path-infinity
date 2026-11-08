import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { createAccountIssuer } from '../../packages/server-core/src/account-issuer.ts';
import { createCommerceService } from '../../packages/server-core/src/commerce-service.ts';
import { createPurchaseMaintenance } from '../../packages/server-core/src/purchase-maintenance.ts';
import { createResourceService } from '../../packages/server-core/src/resource-service.ts';
import { PostgresRankedRepository } from '../../packages/server-core/src/postgres-ranked.ts';
import { RankedAuthority } from '../../packages/server-core/src/ranked.ts';
import { privateCryptography } from '../../packages/server-core/src/private-services.ts';
import { createDurableRateLimit } from '../../packages/server-core/src/durable-rate-limit.ts';
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'cpi_ci');
const admin = new Pool({ max: 2 }),
  runtime = new Pool({
    user: 'cpi_runtime',
    password: process.env.CPI_RUNTIME_DB_PASSWORD,
    max: 16,
    options: '-c role=service_role',
  }),
  user = randomUUID(),
  crypto = privateCryptography('5'.repeat(64), '6'.repeat(64));
const original = (await admin.query('select cpi_private.get_operations_policy() as policy')).rows[0]
  .policy;
let lastMail;
try {
  assert.equal(
    (await runtime.query('select session_user as login,current_user as role')).rows[0].login,
    'cpi_runtime',
  );
  assert.equal((await runtime.query('select current_user as role')).rows[0].role, 'service_role');
  await assert.rejects(() => runtime.query('set role postgres'));
  await admin.query(
    "select cpi_private.set_operations_policy($1,true,true,1,1,'infinity-v11-live',array['infinity-v1','infinity-v11-live'],'none','CI:live-concurrency')",
    [original.revision],
  );
  await admin.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    user,
    user + '@example.invalid',
  ]);
  await admin.query("select cpi_private.save_profile($1,'ParallelTester','BG','keep',null)", [
    user,
  ]);
  const issuer = createAccountIssuer({
    database: runtime,
    crypto,
    policy: {
      version: 'fixture-live',
      countries: { BG: { minimumAge: 16, neutralAgeScreenAllowed: true } },
    },
    directory: {
      verifiedEmail: () => Promise.resolve(user),
      emailForSubject: () => Promise.resolve(user + '@example.invalid'),
    },
    mailer: {
      send: (message) => {
        lastMail = message;
        return Promise.resolve();
      },
    },
  });
  const context = { country: 'BG', rateKey: 'ci:' + randomUUID() };
  const permit = await issuer.eligibility(
    { schemaVersion: 2, age: 27, country: 'BG', platform: 'android', clientBuild: 1 },
    context,
  );
  assert.equal(permit.status, 'eligible');
  await issuer.requestCode(
    { schemaVersion: 1, email: user + '@example.invalid', eligibilityPermit: permit.permit },
    context,
  );
  const verified = await issuer.verifyCode({
    schemaVersion: 1,
    email: user + '@example.invalid',
    code: lastMail.code,
    eligibilityPermit: permit.permit,
  });
  const sessions = await Promise.all(
    Array.from({ length: 16 }, () => issuer.exchange(verified.verifiedTicket)),
  );
  assert.ok(sessions.every((session) => session.accessToken === sessions[0].accessToken));
  const rotated = await Promise.all(
    Array.from({ length: 16 }, () => issuer.refresh(sessions[0].refreshToken)),
  );
  assert.ok(rotated.every((session) => session.refreshToken === rotated[0].refreshToken));
  assert.equal(
    (
      await runtime.query(
        'select count(*)::int as count from cpi_private.account_refresh_tokens where family_id=(select id from cpi_private.account_families where user_id=$1) and rotated_at is null',
        [user],
      )
    ).rows[0].count,
    1,
  );
  const actor = await issuer.authenticate(rotated[0].accessToken);
  assert.ok(actor);
  assert.equal(await issuer.authenticate('raw-supabase-jwt'), null);
  const rate = createDurableRateLimit(runtime, crypto),
    limited = await Promise.all(Array.from({ length: 32 }, () => rate('ci:' + user, 12, 60_000)));
  assert.equal(limited.filter(Boolean).length, 12);
  const commerce = createCommerceService({
    database: runtime,
    economyReady: true,
    completionCrypto: crypto,
    products: [
      { key: 'sp.500', sku: 'fixture.live.sp500', kind: 'sp', quantity: 500, platform: 'android' },
      {
        key: 'credits.3',
        sku: 'fixture.live.credits3',
        kind: 'credit',
        quantity: 3,
        platform: 'android',
      },
    ],
    verifyPurchase: (proof) =>
      Promise.resolve({
        status: 'verified',
        purchase: {
          ...proof,
          environment: 'sandbox',
          fingerprint: createHash('sha256')
            .update('android:sandbox:' + proof.purchaseToken)
            .digest('hex'),
        },
      }),
  });
  const wallet = await commerce.wallet(user),
    proof = {
      platform: 'android',
      sku: 'fixture.live.sp500',
      transactionId: randomUUID(),
      accountToken: wallet.accountToken,
      purchaseToken: randomUUID(),
    };
  await commerce.verify(user, proof);
  const authority = new RankedAuthority({
      repository: new PostgresRankedRepository(runtime),
      rulesetVersion: 'infinity-v11-live',
    }),
    start = await authority.start(actor, { idempotencyKey: randomUUID() });
  const spend = createResourceService({ database: runtime }),
    input = {
      schemaVersion: 1,
      runId: start.snapshot.runId,
      idempotencyKey: randomUUID(),
      sequence: start.snapshot.nextSequence,
      leaseToken: start.lease.token,
      leaseGeneration: start.lease.generation,
      row: '1',
      life: 0,
      resource: 'sp',
      amount: 20,
    };
  const results = await Promise.all(Array.from({ length: 16 }, () => spend(actor, input)));
  assert.ok(results.every((result) => result.accepted && result.snapshot.sp === 320));
  assert.equal((await commerce.wallet(user)).sp, 480);
  assert.equal(
    (
      await runtime.query(
        'select count(*)::int as count from cpi_private.resource_spends where user_id=$1',
        [user],
      )
    ).rows[0].count,
    1,
  );
  const maintenance = createPurchaseMaintenance({
      database: runtime,
      crypto,
      acknowledgeAndroid: () => Promise.resolve(),
    }),
    race = {
      ...proof,
      sku: 'fixture.live.credits3',
      transactionId: randomUUID(),
      purchaseToken: randomUUID(),
    };
  await Promise.all([
    commerce.verify(user, race),
    maintenance.refund({
      fingerprint: createHash('sha256')
        .update('android:sandbox:' + race.purchaseToken)
        .digest('hex'),
      platform: 'android',
      environment: 'sandbox',
      transactionId: race.transactionId,
      eventId: randomUUID(),
      effectiveAt: Date.now(),
    }),
  ]);
  assert.equal((await commerce.wallet(user)).credits, 0);
  assert.equal((await commerce.verify(user, race)).status, 'rejected');
  await issuer.revoke(sessions[0].refreshToken);
  assert.equal(await issuer.authenticate(rotated[0].accessToken), null);
  console.log(
    'Independent PostgreSQL clients: 16 ticket exchanges, 16 refresh retries, 32 rate-limit requests, 16 resource retries, and delivery/refund race passed. Provider/mail fixtures are synthetic.',
  );
} finally {
  try {
    // Disposable fixture only: remove its active live run before restoring the old recovery allowlist.
    // Production's ACTIVE_RULESET guard remains unchanged.
    await admin.query('delete from auth.users where id=$1', [user]);
    const current = (await admin.query('select cpi_private.get_operations_policy() as policy'))
      .rows[0].policy;
    await admin.query('select cpi_private.set_operations_policy($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
      current.revision,
      original.rankedStartsEnabled,
      original.adStartsEnabled,
      original.minimumClientBuild,
      original.recoveryMinimumClientBuild,
      original.startRuleset,
      original.recoveryRulesets,
      original.maintenanceCode,
      'CI:restore-live',
    ]);
  } finally {
    await runtime.end();
    await admin.end();
  }
}
