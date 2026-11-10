import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { createAccountIssuer } from '../../packages/server-core/src/account-issuer.ts';
import { createSupabaseAccountDirectory } from '../../packages/server-core/src/account-providers.ts';
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
const providerAccounts = [];
const googleNew = user + '.google@example.invalid';
const googleRace = user + '.race@example.invalid';
const appleNew = user + '@private.icloud.com';
const directGoogle = user + '.direct@example.invalid';
const directApple = user + '.direct@privaterelay.appleid.com';
const existingEmail = user + '@example.invalid';
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
  const directory = createSupabaseAccountDirectory({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    serviceKey: 's'.repeat(40),
    database: runtime,
    async fetcher(url, init) {
      assert.equal(url, 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/users');
      assert.equal(init.method, 'POST');
      const input = JSON.parse(init.body);
      const subject = randomUUID();
      assert.equal(input.email_confirm, true);
      assert.match(input.app_metadata.cpi_provider_signup, /^[a-f0-9]{64}$/);
      await admin.query(
        'insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',
        [subject, input.email, input.app_metadata],
      );
      providerAccounts.push(subject);
      // Exercise recovery when the Auth write commits but the caller loses its response.
      return new Response(null, { status: 503 });
    },
  });
  const issuer = createAccountIssuer({
    database: runtime,
    crypto,
    policy: {
      version: 'fixture-live',
      countries: { BG: { minimumAge: 18, neutralAgeScreenAllowed: true } },
    },
    identity: {
      verify: (provider, credential) =>
        Promise.resolve(
          typeof credential === 'string'
            ? { subject: credential }
            : {
                subject: credential.subject,
                signupEmail: credential.email,
                displayName: credential.displayName,
                ...(provider === 'apple'
                  ? { appleRefresh: () => Promise.resolve('fixture-apple-refresh') }
                  : {}),
              },
        ),
      revokeApple: () => Promise.resolve(),
    },
    stagingTestEmails: [user + '@example.invalid', 'backup@example.invalid'],
    nativeSignup: {
      directory: directory.providerSignup,
      emails: {
        google: [googleNew, googleRace, directGoogle, existingEmail],
        apple: [appleNew, directApple, existingEmail],
      },
      directEntry: true,
    },
    directory: {
      verifiedEmail: () => Promise.resolve(user),
      async emailForSubject(subject) {
        const result = await admin.query('select email from auth.users where id=$1', [subject]);
        return result.rows[0]?.email ?? '';
      },
    },
    mailer: {
      send: (message) => {
        lastMail = message;
        return Promise.resolve();
      },
    },
  });
  assert.equal(await issuer.isStagingTestAccount(user), true);
  assert.equal(await issuer.isStagingTestAccount(randomUUID()), false);
  const context = { country: 'BG', rateKey: 'ci:' + randomUUID() };
  const permit = await issuer.eligibility(
    { schemaVersion: 2, age: 27, country: 'BG', platform: 'android', clientBuild: 1 },
    context,
  );
  assert.equal(permit.status, 'eligible');
  await assert.rejects(
    () =>
      issuer.requestCode(
        { schemaVersion: 1, email: directGoogle, eligibilityPermit: permit.permit },
        context,
      ),
    (error) => error.status === 403,
  );
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

  // The provider link belongs to the authenticated iPhone family.
  await runtime.query("update cpi_private.account_families set platform='ios' where id=$1", [
    actor.familyId,
  ]);
  const iphone = await issuer.authenticate(rotated[0].accessToken);
  assert.ok(iphone);
  const link = await issuer.beginIdentity(
    { schemaVersion: 1, provider: 'google', eligibilityPermit: null },
    context,
    iphone,
  );
  const linkProof = {
    schemaVersion: 1,
    provider: 'google',
    nonce: link.nonce,
    credential: 'fixture-google-id',
  };
  await assert.rejects(() => issuer.completeIdentity(linkProof, context, null), { status: 410 });
  await assert.rejects(
    () => issuer.completeIdentity(linkProof, context, { ...iphone, familyId: randomUUID() }),
    { status: 410 },
  );
  assert.equal((await issuer.completeIdentity(linkProof, context, iphone)).status, 'linked');
  await runtime.query("update cpi_private.account_families set platform='android' where id=$1", [
    actor.familyId,
  ]);

  const iphonePermit = await issuer.eligibility(
    { schemaVersion: 2, age: 27, country: 'BG', platform: 'ios', clientBuild: 1 },
    context,
  );
  await assert.rejects(
    () =>
      issuer.beginIdentity(
        { schemaVersion: 1, provider: 'google', eligibilityPermit: permit.permit },
        context,
        null,
      ),
    { status: 403 },
  );
  const signIn = await issuer.beginIdentity(
    { schemaVersion: 1, provider: 'google', eligibilityPermit: iphonePermit.permit },
    context,
    null,
  );
  const signInProof = { ...linkProof, nonce: signIn.nonce };
  const providerTicket = await issuer.completeIdentity(signInProof, context, null);
  assert.equal(providerTicket.status, 'verified');
  const linkedSession = await issuer.exchange(providerTicket.verifiedTicket);
  assert.equal(linkedSession.subject, user);
  assert.equal((await issuer.authenticate(linkedSession.accessToken)).platform, 'ios');
  await assert.rejects(() => issuer.completeIdentity(signInProof, context, null), { status: 410 });
  await issuer.revoke(linkedSession.refreshToken);

  async function offer(provider, subject, email, schemaVersion = 2) {
    const challenge = await issuer.beginIdentity(
      { schemaVersion: 1, provider, eligibilityPermit: iphonePermit.permit },
      context,
      null,
    );
    return issuer.completeIdentity(
      { schemaVersion, provider, nonce: challenge.nonce, credential: { subject, email } },
      context,
      null,
    );
  }
  const confirm = (signupToken) =>
    issuer.signupIdentity({ schemaVersion: 1, signupToken }, context);
  const noSignupMail = lastMail;
  assert.equal((await offer('google', 'old-client', googleNew, 1)).status, 'link_required');
  assert.equal(
    (await offer('google', 'unapproved', 'unauthorized@example.invalid')).status,
    'signup_unavailable',
  );
  assert.equal(
    (await offer('google', 'existing-email-claim', user + '@example.invalid')).status,
    'link_required',
  );
  assert.equal(providerAccounts.length, 0);

  const drafts = await Promise.all([
    offer('google', 'fresh-google', googleNew),
    offer('google', 'fresh-google', googleNew),
  ]);
  assert.ok(drafts.every((draft) => draft.status === 'signup_available'));
  assert.equal(providerAccounts.length, 0);
  const tickets = await Promise.all(drafts.map((draft) => confirm(draft.signupToken)));
  assert.ok(tickets.every((ticket) => ticket.status === 'verified'));
  const newSessions = await Promise.all(
    tickets.map((ticket) => issuer.exchange(ticket.verifiedTicket)),
  );
  assert.ok(newSessions.every((session) => session.subject === providerAccounts[0]));
  assert.notEqual(newSessions[0].subject, user);
  assert.equal(providerAccounts.length, 1);
  await assert.rejects(() => confirm(drafts[0].signupToken), { status: 410 });
  const next = await offer('google', 'fresh-google', googleNew);
  assert.equal((await issuer.exchange(next.verifiedTicket)).subject, newSessions[0].subject);

  const raceDraft = await offer('google', 'email-race', googleRace);
  assert.equal(raceDraft.status, 'signup_available');
  const earlierOwner = randomUUID();
  await admin.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
    earlierOwner,
    googleRace,
  ]);
  providerAccounts.push(earlierOwner);
  assert.equal((await confirm(raceDraft.signupToken)).status, 'link_required');

  const appleDraft = await offer('apple', 'fresh-apple', appleNew);
  assert.equal(appleDraft.status, 'signup_available');
  const appleTicket = await confirm(appleDraft.signupToken);
  const appleSession = await issuer.exchange(appleTicket.verifiedTicket);
  const appleLink = (
    await runtime.query(
      "select apple_refresh_encrypted from cpi_private.account_provider_links where user_id=$1 and provider='apple'",
      [appleSession.subject],
    )
  ).rows[0];
  assert.equal(
    crypto.open(appleLink.apple_refresh_encrypted, 'apple-identity:' + appleSession.subject),
    'fixture-apple-refresh',
  );
  const googleActor = await issuer.authenticate(newSessions[0].accessToken);
  assert.ok(googleActor);
  const crossLink = await issuer.beginIdentity(
    { schemaVersion: 1, provider: 'apple', eligibilityPermit: null },
    context,
    googleActor,
  );
  assert.equal(
    (
      await issuer.completeIdentity(
        {
          schemaVersion: 2,
          provider: 'apple',
          nonce: crossLink.nonce,
          credential: { subject: 'unlinked-apple', email: appleNew },
        },
        context,
        googleActor,
      )
    ).status,
    'already_linked',
  );
  assert.equal(lastMail, noSignupMail);

  const directBegin = (provider, location = context) =>
    issuer.beginIdentity({ schemaVersion: 2, provider, clientBuild: 33 }, location, null);
  async function directSignIn(provider, subject, email, displayName) {
    const challenge = await directBegin(provider);
    return issuer.completeIdentity(
      {
        schemaVersion: 3,
        provider,
        nonce: challenge.nonce,
        credential: { subject, email, displayName },
      },
      context,
      null,
    );
  }
  await assert.rejects(() => directBegin('google', { ...context, country: 'US' }), { status: 403 });
  const wrongVersion = await directBegin('google');
  await assert.rejects(
    () =>
      issuer.completeIdentity(
        {
          schemaVersion: 2,
          provider: 'google',
          nonce: wrongVersion.nonce,
          credential: { subject: 'direct-test', email: directGoogle },
        },
        context,
        null,
      ),
    { status: 410 },
  );
  assert.equal(
    (await directSignIn('google', 'unapproved-direct', 'unapproved@example.invalid')).status,
    'signup_unavailable',
  );
  const directCount = providerAccounts.length;
  const [googleEntry, repeatEntry] = await Promise.all([
    directSignIn('google', 'direct-google', directGoogle, 'Crystal Tester'),
    directSignIn('google', 'direct-google', directGoogle),
  ]);
  const directSession = await issuer.exchange(googleEntry.verifiedTicket);
  assert.equal((await issuer.exchange(repeatEntry.verifiedTicket)).subject, directSession.subject);
  assert.equal(
    [googleEntry, repeatEntry].filter((ticket) => ticket.offerProfile === true).length,
    1,
  );
  assert.equal((await issuer.authenticate(directSession.accessToken)).clientBuild, 33);
  assert.equal(providerAccounts.length, directCount + 1);
  const privateGoogle = (
    await runtime.query('select cpi_private.get_profile_owner($1) as owner', [
      directSession.subject,
    ])
  ).rows[0].owner;
  assert.equal(privateGoogle.profile, null);
  assert.equal(privateGoogle.providerDisplayName, 'Crystal Tester');
  await runtime.query("select cpi_private.save_profile($1,null,'BG','keep',null)", [
    directSession.subject,
  ]);
  const countryOnly = (
    await runtime.query('select cpi_private.get_profile_owner($1) as owner', [
      directSession.subject,
    ])
  ).rows[0].owner;
  assert.equal(countryOnly.profile, null);
  assert.equal(countryOnly.countryCode, 'BG');
  const appleEntry = await directSignIn('apple', 'direct-apple', directApple, 'Apple Tester');
  assert.equal(appleEntry.status, 'verified');
  assert.equal(appleEntry.offerProfile, true);
  assert.notEqual((await issuer.exchange(appleEntry.verifiedTicket)).subject, user);
  assert.equal(lastMail, noSignupMail);

  // A matched address requires one explicit email proof before the provider is attached.
  const existingApple = await directSignIn(
    'apple',
    'existing-apple',
    existingEmail,
    'Existing Tester',
  );
  assert.equal(existingApple.status, 'verify_existing');
  assert.equal(Object.hasOwn(existingApple, 'verifiedTicket'), false);
  await assert.rejects(() => confirm(existingApple.linkToken), { status: 410 });
  await runtime.query(
    'update cpi_private.account_challenges set resend_at=0 where user_id=$1 and verified_at is not null',
    [user],
  );
  const linkRequest = { schemaVersion: 1, linkToken: existingApple.linkToken };
  await assert.rejects(
    () => issuer.requestProviderLinkCode(linkRequest, { ...context, country: 'US' }),
    { status: 403 },
  );
  assert.equal((await issuer.requestProviderLinkCode(linkRequest, context)).status, 'accepted');
  const correct = lastMail.code;
  await assert.rejects(
    () =>
      issuer.verifyProviderLinkCode(
        { ...linkRequest, code: correct === '000000' ? '000001' : '000000' },
        context,
      ),
    { status: 401 },
  );
  const verifiedApple = await issuer.verifyProviderLinkCode(
    { ...linkRequest, code: correct },
    context,
  );
  const existingAppleSession = await issuer.exchange(verifiedApple.verifiedTicket);
  assert.equal(existingAppleSession.subject, user);
  assert.equal(
    (await issuer.verifyProviderLinkCode({ ...linkRequest, code: correct }, context))
      .verifiedTicket,
    verifiedApple.verifiedTicket,
  );
  const returnApple = await directSignIn('apple', 'existing-apple');
  assert.equal((await issuer.exchange(returnApple.verifiedTicket)).subject, user);
  assert.equal(providerAccounts.length, directCount + 2);

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
  const wallet = await commerce.wallet(user);
  assert.equal((await commerce.wallet(linkedSession.subject)).accountToken, wallet.accountToken);
  assert.equal(
    (await commerce.wallet(existingAppleSession.subject)).accountToken,
    wallet.accountToken,
  );
  assert.notEqual((await commerce.wallet(directSession.subject)).accountToken, wallet.accountToken);
  assert.notEqual(
    (await commerce.wallet(newSessions[0].subject)).accountToken,
    wallet.accountToken,
  );
  const proof = {
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
    await admin.query('delete from auth.users where id=any($1::uuid[])', [
      [user, ...providerAccounts],
    ]);
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
