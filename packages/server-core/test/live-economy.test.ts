import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID, createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  applyServerResource,
  assertRunState,
  LIVE_RULESET_VERSION,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import { privateDatabase } from './private-database.ts';
import { RankedAuthority, RANKED_RNG } from '../src/ranked.ts';
import type { StoredRankedRun } from '../src/ranked.ts';
import { PostgresRankedRepository, PostgresTransaction } from '../src/postgres-ranked.ts';
import { createResourceService } from '../src/resource-service.ts';
import { createCommerceService } from '../src/commerce-service.ts';
import { createPurchaseMaintenance } from '../src/purchase-maintenance.ts';
import { privateCryptography, sqlTransaction } from '../src/private-services.ts';
import { RewardService } from '../src/reward-service.ts';
import { createAccountIssuer } from '../src/account-issuer.ts';
import { createAccountLifecycleHandler } from '../src/account-lifecycle.ts';
let fixture: Awaited<ReturnType<typeof privateDatabase>>;
const user = randomUUID(),
  actor = { subject: user, deviceId: randomUUID(), clientBuild: 1 };
let clock = Date.now();
const crypto = privateCryptography('3'.repeat(64), '4'.repeat(64));
const proofs = new Map<string, string>();
const products = [
  {
    key: 'sp.500',
    sku: 'fixture.sp500',
    platform: 'android' as const,
    kind: 'sp' as const,
    quantity: 500,
  },
  {
    key: 'credits.3',
    sku: 'fixture.credit3',
    platform: 'android' as const,
    kind: 'credit' as const,
    quantity: 3,
  },
  {
    key: 'theme.chaos',
    sku: 'fixture.chaos',
    platform: 'android' as const,
    kind: 'theme' as const,
    quantity: 1,
    theme: 'chaos',
  },
];
let commerce: ReturnType<typeof createCommerceService>,
  spend: ReturnType<typeof createResourceService>,
  authority: RankedAuthority,
  maintenance: ReturnType<typeof createPurchaseMaintenance>;
beforeAll(async () => {
  fixture = await privateDatabase();
  await fixture.db.query(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
    [user, user + '@example.invalid'],
  );
  await fixture.db.query("select cpi_private.save_profile($1::uuid,'SQLTester','BG','keep',null)", [
    user,
  ]);
  await fixture.db.exec(
    "select cpi_private.set_operations_policy(1,true,true,1,1,'infinity-v11-live',array['infinity-v1','infinity-v11-live'],'none','CI:live')",
  );
  commerce = createCommerceService({
    database: fixture.pool,
    products,
    economyReady: true,
    completionCrypto: crypto,
    verifyPurchase: (proof) => {
      const fingerprint = createHash('sha256')
        .update('android:sandbox:' + proof.purchaseToken!)
        .digest('hex');
      proofs.set(proof.transactionId, fingerprint);
      return Promise.resolve({
        status: 'verified',
        purchase: { ...proof, fingerprint, environment: 'sandbox' },
      });
    },
  });
  spend = createResourceService({ database: fixture.pool, now: () => clock });
  authority = new RankedAuthority({
    repository: new PostgresRankedRepository(fixture.pool),
    rulesetVersion: LIVE_RULESET_VERSION,
    now: () => clock,
  });
  maintenance = createPurchaseMaintenance({
    database: fixture.pool,
    crypto,
    now: () => clock,
    acknowledgeAndroid: () => Promise.resolve(),
  });
}, 30000);
afterAll(async () => {
  await fixture?.db.close();
});
async function purchase(key: string) {
  const permit = await commerce.begin(user, 'android', key),
    transactionId = randomUUID();
  await commerce.verify(user, {
    platform: 'android',
    sku: permit.sku,
    transactionId,
    accountToken: permit.accountToken,
    purchaseToken: randomUUID(),
  });
  return { transactionId, fingerprint: proofs.get(transactionId)! };
}
async function stored(runId: string) {
  return sqlTransaction(
    fixture.pool,
    async (connection) => (await new PostgresTransaction(connection, user).getRun(runId))!,
  );
}
async function save(run: StoredRankedRun) {
  await sqlTransaction(fixture.pool, (connection) =>
    new PostgresTransaction(connection, user).saveRun(run),
  );
}
describe('new live authority and commercial ledger on the complete migration set', () => {
  it('does not mark partial or failed refund pagination as fully caught up', async () => {
    const end = clock,
      first = { start: clock - 86400000, end, page: null };
    await maintenance.synchronize('fixture.coverage', first, () =>
      Promise.resolve({ events: [], next: { ...first, page: 'next' } }),
    );
    expect(
      (
        await fixture.db.query<Record<string, unknown>>(
          'select caught_up_at from cpi_private.provider_sync where name=$1',
          ['fixture.coverage'],
        )
      ).rows[0].caught_up_at,
    ).toBeNull();
    await expect(
      maintenance.synchronize('fixture.coverage', first, () =>
        Promise.reject(new Error('provider offline')),
      ),
    ).rejects.toThrow();
    expect(
      (
        await fixture.db.query<{ cursor_private: { page: string } }>(
          'select cursor_private from cpi_private.provider_sync where name=$1',
          ['fixture.coverage'],
        )
      ).rows[0].cursor_private.page,
    ).toBe('next');
    clock++;
    await maintenance.synchronize('fixture.coverage', first, () =>
      Promise.resolve({ events: [], next: { ...first, end: clock, page: null } }),
    );
    expect(
      Number(
        (
          await fixture.db.query<Record<string, unknown>>(
            'select caught_up_at from cpi_private.provider_sync where name=$1',
            ['fixture.coverage'],
          )
        ).rows[0].caught_up_at,
      ),
    ).toBe(end);
  });
  it('starts approved v11, debits atomically once and accepts the strict mobile wire schema', async () => {
    await purchase('sp.500');
    const start = await authority.start(actor, { idempotencyKey: randomUUID() });
    expect(start.snapshot.economy?.assisted).toBe(false);
    const input = {
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
    const first = await spend(actor, input);
    expect(first.snapshot.sp).toBe(320);
    expect(first.snapshot.economy?.assisted).toBe(true);
    expect(await spend(actor, input)).toEqual(first);
    expect((await commerce.wallet(user)).sp).toBe(480);
    const run = await stored(start.snapshot.runId);
    expect(
      transitionRun(
        run.state,
        { type: 'test-resource', resource: 'sp', amount: 20, sequence: 2 },
        { rng: RANKED_RNG, activeTimeMs: 0, achievedAt: clock },
      ).accepted,
    ).toBe(false);
    const limited = applyServerResource(run.state, 'sp', 181, {
      rng: RANKED_RNG,
      activeTimeMs: 0,
      achievedAt: clock,
    });
    expect(limited.accepted).toBe(false);
    const half = { ...run, state: { ...run.state, sp: 319.5 } };
    await save(half);
    expect((await stored(run.state.runId)).state.sp).toBe(319.5);
    const end = await authority.execute(actor, {
      runId: run.state.runId,
      idempotencyKey: randomUUID(),
      sequence: first.snapshot.nextSequence,
      leaseToken: first.lease.token,
      command: { type: 'end' },
    });
    expect(end.snapshot.status).toBe('finished');
    expect(
      (
        await fixture.db.query('select 1 from cpi_private.assisted_results where run_id=$1', [
          run.state.runId,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await fixture.db.query('select 1 from cpi_private.verified_results where run_id=$1', [
          run.state.runId,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it('continues with a credit only after death and publishes free results separately', async () => {
    await purchase('credits.3');
    const start = await authority.start(actor, { idempotencyKey: randomUUID() });
    let run = await stored(start.snapshot.runId);
    const before = (await commerce.wallet(user)).credits;
    const input = {
      schemaVersion: 1,
      runId: start.snapshot.runId,
      idempotencyKey: randomUUID(),
      sequence: run.nextSequence,
      leaseToken: run.leaseToken,
      leaseGeneration: run.leaseGeneration,
      row: '1',
      life: 0,
      resource: 'credit',
      amount: 1,
    };
    const denied = await spend(actor, input);
    expect(denied.accepted).toBe(false);
    expect((await commerce.wallet(user)).credits).toBe(before);
    run = await stored(run.state.runId);
    clock += 13000;
    run = {
      ...run,
      state: transitionRun(
        run.state,
        { type: 'tick' },
        { rng: RANKED_RNG, activeTimeMs: 13000, achievedAt: clock },
      ).state,
    };
    await save(run);
    expect(run.state.status).toBe('dead');
    const restored = await spend(actor, {
      ...input,
      idempotencyKey: randomUUID(),
      sequence: run.nextSequence,
    });
    expect(restored.snapshot.sp).toBe(200);
    expect(restored.snapshot.revivesApplied).toBe(1);
    expect(restored.snapshot.economy?.creditContinues).toBe(1);
    expect((await commerce.wallet(user)).credits).toBe(before - 1);
    assertRunState((await stored(run.state.runId)).state, RANKED_RNG);
    await authority.execute(actor, {
      runId: run.state.runId,
      idempotencyKey: randomUUID(),
      sequence: restored.snapshot.nextSequence,
      leaseToken: restored.lease.token,
      command: { type: 'end' },
    });
    const free = await authority.start(actor, { idempotencyKey: randomUUID() });
    await authority.execute(actor, {
      runId: free.snapshot.runId,
      idempotencyKey: randomUUID(),
      sequence: free.snapshot.nextSequence,
      leaseToken: free.lease.token,
      command: { type: 'end' },
    });
    expect(
      (
        await fixture.db.query('select 1 from cpi_private.verified_results where run_id=$1', [
          free.snapshot.runId,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it('verifies a signed SSV fixture once and keeps live ad counters consistent', async () => {
    const start = await authority.start(actor, { idempotencyKey: randomUUID() });
    let run = await stored(start.snapshot.runId);
    clock += 13000;
    run = {
      ...run,
      state: transitionRun(
        run.state,
        { type: 'tick' },
        { rng: RANKED_RNG, activeTimeMs: 13000, achievedAt: clock },
      ).state,
    };
    await save(run);
    const config = randomUUID();
    await fixture.db.query(
      `insert into cpi_private.reward_sdk_configurations(id,environment,platform,sdk_version,ad_unit_id,ssv_ad_unit,reward_amount,reward_item,reviewed,families_reviewed,closeability_reviewed,enabled) values($1,'staging','android','25.4.0','ca-app-pub-3940256099942544/5224354917','5224354917','1','continue',true,true,true,true)`,
      [config],
    );
    await fixture.db.query(
      "update cpi_private.profiles_private set privacy_context='adult',context_updated_at=null where user_id=$1",
      [user],
    );
    await fixture.db.query(
      `insert into cpi_private.reward_authorizations(user_id,configuration_id,privacy_context,policy_version,verification_reference,prerequisites_satisfied,child_directed,under_age_of_consent,max_ad_content_rating,non_personalized,issued_at,valid_until) values($1,$2,'adult','fixture','fixture:verified',true,true,true,'G',true,$3,$4)`,
      [user, config, new Date(clock - 1000), new Date(clock + 600000)],
    );
    const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      service = new RewardService({
        database: fixture.pool,
        platform: 'android',
        environment: 'staging',
        now: () => clock,
        keys: { get: () => Promise.resolve(key.publicKey) },
      });
    const intent = await service.intent(actor, {
      runId: run.state.runId,
      idempotencyKey: randomUUID(),
    });
    const fields = new URLSearchParams({
      ad_network: '5450213213286189855',
      ad_unit: '5224354917',
      custom_data: intent.intent!.customData,
      reward_amount: '1',
      reward_item: 'continue',
      timestamp: String(clock),
      transaction_id: randomUUID().replaceAll('-', ''),
    }).toString();
    const query =
      fields +
      '&signature=' +
      sign('sha256', Buffer.from(fields), key.privateKey).toString('base64url') +
      '&key_id=123';
    await service.receiveGoogleSsv(query);
    await service.receiveGoogleSsv(query);
    const granted = await service.status(actor, { runId: run.state.runId });
    run = await stored(run.state.runId);
    const applied = await service.apply(actor, {
      runId: run.state.runId,
      idempotencyKey: randomUUID(),
      grantId: granted.grant!.id,
      sequence: run.nextSequence,
      leaseToken: run.leaseToken,
    });
    expect(applied.snapshot.economy?.adContinues).toBe(1);
    expect(applied.snapshot.economy?.assisted).toBe(false);
    assertRunState((await stored(run.state.runId)).state, RANKED_RNG);
    await authority.execute(actor, {
      runId: run.state.runId,
      idempotencyKey: randomUUID(),
      sequence: applied.snapshot.nextSequence,
      leaseToken: applied.lease.token,
      command: { type: 'end' },
    });
  });
  it('revokes refunded worlds, ignores stale replays, and restores only once after reversal', async () => {
    const bought = await purchase('theme.chaos');
    await commerce.equip(user, 'chaos');
    const event = {
      ...bought,
      platform: 'android' as const,
      environment: 'sandbox' as const,
      eventId: randomUUID(),
      effectiveAt: clock,
    };
    await maintenance.refund(event);
    expect((await commerce.wallet(user)).equipped).toBe('obsidian');
    expect((await commerce.wallet(user)).owned).not.toContain('chaos');
    await maintenance.refund({ ...event, eventId: randomUUID(), effectiveAt: clock + 1000 }, true);
    expect((await commerce.wallet(user)).owned).toContain('chaos');
    await maintenance.refund(event);
    expect((await commerce.wallet(user)).owned).toContain('chaos');
    const ownExport = (
      await fixture.db.query<{
        value: { purchases: unknown[]; spends: unknown[]; assistedResults: unknown[] };
      }>('select cpi_private.export_own_commerce($1,null,null,null,null) as value', [user])
    ).rows[0].value;
    expect(ownExport.purchases.length).toBeGreaterThan(0);
    expect(ownExport.spends.length).toBeGreaterThan(0);
    expect(ownExport.assistedResults).toHaveLength(2);
    expect(JSON.stringify(ownExport)).not.toContain('purchaseToken');
  });
  it('exports commerce with fresh OTP, consumes each proof once and completes deletion with financial tombstones', async () => {
    const subject = randomUUID();
    let code = '';
    const issuer = createAccountIssuer({
      database: fixture.pool,
      crypto,
      policy: {
        version: 'fixture',
        countries: { BG: { minimumAge: 16, neutralAgeScreenAllowed: true } },
      },
      directory: {
        async verifiedEmail(address) {
          await fixture.db.query(
            'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) on conflict do nothing',
            [subject, address],
          );
          return subject;
        },
        emailForSubject: () => Promise.resolve(subject + '@example.invalid'),
      },
      mailer: {
        send: (message) => {
          code = message.code;
          return Promise.resolve();
        },
      },
    });
    const context = { country: 'BG', rateKey: subject },
      permit = await issuer.eligibility(
        { schemaVersion: 2, age: 25, country: 'BG', platform: 'android', clientBuild: 1 },
        context,
      );
    if (!('permit' in permit)) throw new Error('No permit');
    await issuer.requestCode(
      { schemaVersion: 1, email: subject + '@example.invalid', eligibilityPermit: permit.permit },
      context,
    );
    const ticket = (await issuer.verifyCode({
        schemaVersion: 1,
        email: subject + '@example.invalid',
        eligibilityPermit: permit.permit,
        code,
      })) as { verifiedTicket: string },
      session = (await issuer.exchange(ticket.verifiedTicket)) as { accessToken: string };
    const actor = (await issuer.authenticate(session.accessToken))!,
      wallet = await commerce.wallet(subject);
    await commerce.verify(subject, {
      platform: 'android',
      sku: 'fixture.chaos',
      transactionId: randomUUID(),
      purchaseToken: randomUUID(),
      accountToken: wallet.accountToken,
    });
    const handler = createAccountLifecycleHandler({
      database: fixture.pool,
      authenticate: issuer.authenticate,
      verifyReauthentication: issuer.verifyReauthentication,
      revokeAllSessions: issuer.revokeAllSessions,
      allowOrigin: () => true,
      rateLimit: () => Promise.resolve(true),
      includeCommerce: true,
    });
    async function proof(purpose: 'export' | 'delete') {
      await fixture.db.query(
        'update cpi_private.account_challenges set resend_at=0 where user_id=$1',
        [subject],
      );
      await issuer.requestCode({ schemaVersion: 1, purpose }, context, actor);
      const ceremony = (await issuer.verifyCode({ schemaVersion: 1, purpose, code }, actor)) as {
        ceremony: string;
      };
      return (
        await issuer.reauthProof(actor, { schemaVersion: 1, purpose, ceremony: ceremony.ceremony })
      ).proof;
    }
    function request(endpoint: string, proof: string) {
      return handler(
        new Request('https://api.example/account/' + endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + session.accessToken,
          },
          body: JSON.stringify({ schemaVersion: 1, reauthProof: proof }),
        }),
      );
    }
    const exportProof = await proof('export'),
      exported = await request('export', exportProof);
    expect(exported.status).toBe(200);
    const text = await exported.text();
    expect(text).toContain('fixture.chaos');
    expect(text).not.toContain('purchaseToken');
    expect((await request('export', exportProof)).status).toBe(409);
    const deletion = await request('delete', await proof('delete'));
    expect(deletion.status).toBe(200);
    expect(await deletion.json()).toMatchObject({ status: 'deleted' });
    expect(await issuer.authenticate(session.accessToken)).toBeNull();
    expect(
      (await fixture.db.query('select 1 from auth.users where id=$1', [subject])).rows,
    ).toHaveLength(0);
    expect(
      (
        await fixture.db.query<Record<string, unknown>>(
          'select user_id from cpi_private.commerce_wallets where id=$1',
          [wallet.accountToken],
        )
      ).rows[0].user_id,
    ).toBeNull();
  });
});
