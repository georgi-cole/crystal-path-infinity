import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createAccountIssuer } from '../src/account-issuer';
import {
  createMobileIdentity,
  MOBILE_IDENTITY_CALLBACK,
  STAGING_MOBILE_IDENTITY_CALLBACK,
} from '../src/mobile-identity';
import { privateCryptography } from '../src/private-services';
import type { SqlPool } from '../src/database';
let db: PGlite;
const pool: SqlPool = {
  connect() {
    return Promise.resolve({
      query: (text, values) => db.query<Record<string, unknown>>(text, values ? [...values] : []),
      release() {},
    });
  },
};
const context = { country: 'US', rateKey: 'web-fixture' };
const policy = {
  version: 'public-web-fixture',
  countries: { US: { minimumAge: 13, neutralAgeScreenAllowed: true } },
};
const users = new Map<string, { id: string; marker?: string }>();
const messages: { code: string }[] = [];
const identity = {
  verify: (provider: 'apple' | 'google', credential: unknown) => {
    const subject =
      typeof credential === 'string' ? credential : String((credential as { code: string }).code);
    return Promise.resolve({
      subject,
      signupEmail: subject + '@gmail.com',
      ...(provider === 'apple' ? { appleRefresh: () => Promise.resolve('apple-refresh') } : {}),
    });
  },
  revokeApple: () => Promise.resolve(),
};
function issuer(staging = false, mobile = false) {
  return createAccountIssuer({
    database: pool,
    crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
    policy: staging
      ? {
          version: 'staging-mobile-fixture',
          countries: { BG: { minimumAge: 18, neutralAgeScreenAllowed: true } },
        }
      : policy,
    publicWebEntry: !staging,
    stagingTestEmails: staging ? ['stage@gmail.com', 'stage2@gmail.com'] : undefined,
    directory: {
      verifiedEmail: (email) => Promise.resolve(users.get(email)!.id),
      emailForSubject: (id) =>
        Promise.resolve(
          [...users].find(([, user]) => user.id === id)?.[0] ?? 'existing@example.com',
        ),
    },
    mailer: {
      send: (message) => {
        messages.push(message);
        return Promise.resolve();
      },
    },
    identity,
    mobileIdentity: mobile ? identity : undefined,
    nativeSignup: {
      emails: { apple: [], google: [] },
      directory: {
        lookup: (_connection, email, marker) => {
          const user = users.get(email);
          return Promise.resolve(
            user ? { subject: user.id, matchesProvider: user.marker === marker } : null,
          );
        },
        async create(connection, email, marker) {
          const id = randomUUID();
          users.set(email, { id, marker });
          await connection.query(
            'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
            [id, email],
          );
          return id;
        },
      },
    },
  });
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create schema auth;create schema cpi_private;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
    create table cpi_private.profile_owners(user_id uuid primary key references auth.users(id));
    create table cpi_private.profiles_private(user_id uuid primary key references auth.users(id),privacy_context text,context_updated_at timestamptz,provider_display_name text);
    create table cpi_private.consent_events(user_id uuid,purpose text,decision text,policy_version text,jurisdiction text);
    create table cpi_private.account_deletion_requests(user_id uuid);`);
  for (const file of [
    '20261107000200_account_issuer.sql',
    '20261109000100_native_provider_identity.sql',
    '20261109000200_native_provider_signup.sql',
    '20261111000100_mobile_identity_handoff.sql',
  ])
    await db.exec(
      readFileSync(new URL('../../../supabase/migrations/' + file, import.meta.url), 'utf8'),
    );
  await db.exec(
    'alter table cpi_private.account_provider_challenges add column direct_client_build integer',
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe('public browser provider admission', () => {
  it.each(['android', 'ios'] as const)(
    'screens sandbox %s entry and admits only existing allowed testers',
    async (platform) => {
      const service = issuer(true, true);
      const stageContext = { country: 'BG', rateKey: 'sandbox-' + platform };
      expect(
        await service.eligibility(
          { schemaVersion: 2, age: 17, country: 'BG', platform, clientBuild: 59 },
          stageContext,
        ),
      ).toEqual({ status: 'parental_review' });
      const permit = await service.eligibility(
        { schemaVersion: 2, age: 27, country: 'BG', platform, clientBuild: 59 },
        stageContext,
      );
      const other = await service.eligibility(
        { schemaVersion: 2, age: 27, country: 'BG', platform, clientBuild: 59 },
        stageContext,
      );
      if (!('permit' in permit) || !('permit' in other)) throw Error('permit expected');
      for (const provider of ['google', 'apple'] as const) {
        const begin = () =>
          service.beginIdentity(
            { schemaVersion: 5, provider, eligibilityPermit: permit.permit },
            stageContext,
            null,
          );
        const mismatch = await begin();
        await expect(
          service.completeIdentity(
            {
              schemaVersion: 5,
              provider,
              nonce: mismatch.nonce,
              credential: 'stage',
              eligibilityPermit: other.permit,
            },
            stageContext,
            null,
          ),
        ).rejects.toMatchObject({ status: 403 });
        const denied = await begin();
        expect(
          await service.completeIdentity(
            {
              schemaVersion: 5,
              provider,
              nonce: denied.nonce,
              credential: 'not-a-tester-' + platform,
              eligibilityPermit: permit.permit,
            },
            stageContext,
            null,
          ),
        ).toEqual({ status: 'signup_unavailable' });
        const allowed = await begin();
        const reply = await service.completeIdentity(
          {
            schemaVersion: 5,
            provider,
            nonce: allowed.nonce,
            credential: provider === 'apple' ? 'stage2' : 'stage',
            eligibilityPermit: permit.permit,
          },
          stageContext,
          null,
        );
        expect(reply.status).toBe('verified');
        if (!('verifiedTicket' in reply) || typeof reply.verifiedTicket !== 'string')
          throw Error('ticket expected');
        const session = await service.exchange(reply.verifiedTicket);
        expect(await service.authenticate(String(session.accessToken))).toMatchObject({
          platform,
          country: 'BG',
          privacyContext: 'adult',
        });
      }
    },
  );

  it.each([
    { platform: 'android', name: 'production', callbackUrl: MOBILE_IDENTITY_CALLBACK },
    { platform: 'ios', name: 'production', callbackUrl: MOBILE_IDENTITY_CALLBACK },
    { platform: 'android', name: 'sandbox', callbackUrl: STAGING_MOBILE_IDENTITY_CALLBACK },
    { platform: 'ios', name: 'sandbox', callbackUrl: STAGING_MOBILE_IDENTITY_CALLBACK },
  ] as const)(
    'returns $platform via $name without putting proofs in the return link',
    async ({ platform, name, callbackUrl }) => {
      const service = issuer(false, true);
      const mobile = createMobileIdentity({
        database: pool,
        crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
        issuer: service,
        googleClientId: '123-production.apps.googleusercontent.com',
        appleClientId: 'com.georgicole.crystalpath.infinity.web',
        callback: callbackUrl,
      });
      const permit = await service.eligibility(
        { schemaVersion: 2, age: 15, country: 'US', platform, clientBuild: 45 },
        context,
      );
      if (!('permit' in permit)) throw new Error('permit expected');
      const begin = await mobile.begin(
        { provider: 'google', eligibilityPermit: permit.permit },
        context,
        null,
      );
      const authorize = new URL(begin.url);
      expect(authorize.searchParams.get('redirect_uri')).toBe(callbackUrl);
      expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
      await expect(
        mobile.callback(new Request(callbackUrl + '?state=' + 'x'.repeat(43) + '&code=unknown')),
      ).rejects.toMatchObject({ status: 410 });
      const code = 'mobile-' + platform + '-' + name;
      const callback = await mobile.callback(
        new Request(callbackUrl + '?state=' + begin.state + '&code=' + code),
      );
      expect(callback.status).toBe(303);
      expect(callback.headers.get('location')).toBe(
        'com.georgicole.crystalpath.infinity:/signin?state=' + begin.state,
      );
      expect(callback.headers.get('location')).not.toContain(code);
      expect(callback.headers.get('location')).not.toContain(begin.flowToken);
      expect(await callback.text()).toBe('');
      expect(callback.headers.get('cache-control')).toBe('no-store');
      await expect(
        mobile.callback(new Request(callbackUrl + '?state=' + begin.state + '&code=replaced')),
      ).rejects.toMatchObject({ status: 410 });
      await expect(
        mobile.complete(
          { flowToken: 'y'.repeat(43), eligibilityPermit: permit.permit },
          context,
          null,
        ),
      ).rejects.toMatchObject({ status: 410 });
      const completed = await mobile.complete(
        { flowToken: begin.flowToken, eligibilityPermit: permit.permit },
        context,
        null,
      );
      if (!('verifiedTicket' in completed)) throw new Error('verified ticket expected');
      const session = await service.exchange(completed.verifiedTicket);
      if (typeof session.accessToken !== 'string') throw new Error('session expected');
      const actor = await service.authenticate(session.accessToken);
      expect(actor).toMatchObject({ platform, privacyContext: 'teen' });
      await expect(
        mobile.complete(
          { flowToken: begin.flowToken, eligibilityPermit: permit.permit },
          context,
          null,
        ),
      ).rejects.toMatchObject({ status: 410 });
      const webPermit = await service.eligibility(
        { schemaVersion: 2, age: 15, country: 'US', platform: 'web', clientBuild: 1 },
        context,
      );
      if (!('permit' in webPermit)) throw new Error('permit expected');
      const webBegin = await service.beginIdentity(
        { schemaVersion: 4, provider: 'google', eligibilityPermit: webPermit.permit },
        context,
        null,
      );
      const webResult = await service.completeIdentity(
        {
          schemaVersion: 4,
          provider: 'google',
          eligibilityPermit: webPermit.permit,
          nonce: webBegin.nonce,
          credential: code,
        },
        context,
        null,
      );
      if (!('verifiedTicket' in webResult)) throw new Error('ticket expected');
      expect((await service.exchange(webResult.verifiedTicket)).subject).toBe(actor?.subject);
    },
  );
  it('handles Apple form-post, cancellation and expired proof cleanup without creating an account', async () => {
    const service = issuer(false, true);
    let now = Date.now();
    const mobile = createMobileIdentity({
      database: pool,
      crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
      issuer: service,
      googleClientId: '123-production.apps.googleusercontent.com',
      appleClientId: 'com.georgicole.crystalpath.infinity.web',
      now: () => now,
    });
    const permit = await service.eligibility(
      { schemaVersion: 2, age: 18, country: 'US', platform: 'ios', clientBuild: 45 },
      context,
    );
    if (!('permit' in permit)) throw new Error('permit expected');
    const begin = await mobile.begin(
      { provider: 'apple', eligibilityPermit: permit.permit },
      context,
      null,
    );
    expect(new URL(begin.url).searchParams.get('response_mode')).toBe('form_post');
    const callback = await mobile.callback(
      new Request(MOBILE_IDENTITY_CALLBACK, {
        method: 'POST',
        body: new URLSearchParams({ state: begin.state, error: 'access_denied' }),
      }),
    );
    expect(callback.status).toBe(303);
    expect(
      await mobile.complete(
        { flowToken: begin.flowToken, eligibilityPermit: permit.permit },
        context,
        null,
      ),
    ).toEqual({ status: 'cancelled' });
    const pending = await mobile.begin(
      { provider: 'google', eligibilityPermit: permit.permit },
      context,
      null,
    );
    now += 6 * 60_000;
    await mobile.maintenance();
    await expect(
      mobile.callback(
        new Request(MOBILE_IDENTITY_CALLBACK + '?state=' + pending.state + '&code=expired'),
      ),
    ).rejects.toMatchObject({ status: 410 });
  });
  it('creates a teen account from a screened web permit, exchanges a session and rejects replay', async () => {
    const service = issuer();
    const permit = await service.eligibility(
      { schemaVersion: 2, age: 15, country: 'US', platform: 'web', clientBuild: 1 },
      context,
    );
    if (!('permit' in permit)) throw new Error('permit expected');
    const begin = await service.beginIdentity(
      { schemaVersion: 4, provider: 'google', eligibilityPermit: permit.permit },
      context,
      null,
    );
    const proof = {
      schemaVersion: 4,
      provider: 'google',
      nonce: begin.nonce,
      eligibilityPermit: permit.permit,
      credential: 'fresh-web',
    };
    const reply = await service.completeIdentity(proof, context, null);
    expect(reply.status).toBe('verified');
    if (!('verifiedTicket' in reply) || typeof reply.verifiedTicket !== 'string')
      throw new Error('ticket expected');
    const session = await service.exchange(reply.verifiedTicket);
    if (typeof session.accessToken !== 'string') throw new Error('session expected');
    const actor = await service.authenticate(session.accessToken);
    expect(actor).toMatchObject({ platform: 'web', privacyContext: 'teen', country: 'US' });
    await expect(service.completeIdentity(proof, context, null)).rejects.toMatchObject({
      status: 410,
    });
  });
  it('does not turn native staging permits or provider schema strings into public signup', async () => {
    const service = issuer();
    const permit = await service.eligibility(
      { schemaVersion: 2, age: 25, country: 'US', platform: 'ios', clientBuild: 1 },
      context,
    );
    if (!('permit' in permit)) throw new Error('permit expected');
    await expect(
      service.beginIdentity(
        { schemaVersion: 4, provider: 'apple', eligibilityPermit: permit.permit },
        context,
        null,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.completeIdentity(
        { schemaVersion: '1', provider: 'google', nonce: 'a'.repeat(43), credential: 'fake' },
        context,
        null,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      issuer(true).beginIdentity(
        { schemaVersion: 4, provider: 'google', eligibilityPermit: permit.permit },
        context,
        null,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([4, 5])(
    'requires control of an existing email before attaching a provider (schema %s)',
    async (schemaVersion) => {
      const id = randomUUID();
      const address = 'collision' + schemaVersion + '@gmail.com';
      users.set(address, { id });
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
        id,
        address,
      ]);
      await db.query('insert into cpi_private.profile_owners(user_id) values($1)', [id]);
      await db.query(
        "insert into cpi_private.profiles_private(user_id,privacy_context) values($1,'teen')",
        [id],
      );
      const service = issuer(false, schemaVersion === 5);
      const permit = await service.eligibility(
        {
          schemaVersion: 2,
          age: 15,
          country: 'US',
          platform: schemaVersion === 5 ? 'ios' : 'web',
          clientBuild: 1,
        },
        context,
      );
      if (!('permit' in permit)) throw new Error('permit expected');
      const begin = await service.beginIdentity(
        { schemaVersion, provider: 'google', eligibilityPermit: permit.permit },
        context,
        null,
      );
      const reply = await service.completeIdentity(
        {
          schemaVersion,
          provider: 'google',
          nonce: begin.nonce,
          eligibilityPermit: permit.permit,
          credential: 'collision' + schemaVersion,
        },
        context,
        null,
      );
      expect(reply.status).toBe('verify_existing');
      if (!('linkToken' in reply)) throw new Error('link proof expected');
      expect(
        (await db.query('select * from cpi_private.account_provider_links where user_id=$1', [id]))
          .rows,
      ).toHaveLength(0);
      await service.requestProviderLinkCode(
        { schemaVersion: 1, linkToken: reply.linkToken },
        context,
      );
      await expect(
        service.verifyProviderLinkCode(
          { schemaVersion: 1, linkToken: reply.linkToken, code: 'wrong' },
          context,
        ),
      ).rejects.toMatchObject({ status: 400 });
      const verified = await service.verifyProviderLinkCode(
        { schemaVersion: 1, linkToken: reply.linkToken, code: messages.at(-1)!.code },
        context,
      );
      if (
        !verified ||
        typeof verified !== 'object' ||
        !('verifiedTicket' in verified) ||
        typeof verified.verifiedTicket !== 'string'
      )
        throw new Error('ticket expected');
      expect((await service.exchange(verified.verifiedTicket)).subject).toBe(id);
      expect(
        (await db.query('select * from cpi_private.profile_owners where user_id=$1', [id])).rows,
      ).toHaveLength(1);
    },
  );
});
