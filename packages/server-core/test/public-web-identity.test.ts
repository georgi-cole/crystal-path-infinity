import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createAccountIssuer } from '../src/account-issuer';
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
function issuer(staging = false) {
  return createAccountIssuer({
    database: pool,
    crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
    policy,
    publicWebEntry: !staging,
    stagingTestEmails: staging ? ['stage@example.com', 'stage2@example.com'] : undefined,
    directory: {
      verifiedEmail: (email) => Promise.resolve(users.get(email)!.id),
      emailForSubject: () => Promise.resolve('existing@example.com'),
    },
    mailer: {
      send: (message) => {
        messages.push(message);
        return Promise.resolve();
      },
    },
    identity: {
      verify: (provider, credential) =>
        Promise.resolve({
          subject: String(credential),
          signupEmail: String(credential) + '@gmail.com',
          ...(provider === 'apple' ? { appleRefresh: () => Promise.resolve('apple-refresh') } : {}),
        }),
      revokeApple: () => Promise.resolve(),
    },
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
  it('requires control of an existing email before attaching the provider and preserves its owner', async () => {
    const id = randomUUID();
    users.set('collision@gmail.com', { id });
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
      id,
      'collision@gmail.com',
    ]);
    await db.query('insert into cpi_private.profile_owners(user_id) values($1)', [id]);
    await db.query(
      "insert into cpi_private.profiles_private(user_id,privacy_context) values($1,'teen')",
      [id],
    );
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
    const reply = await service.completeIdentity(
      {
        schemaVersion: 4,
        provider: 'google',
        nonce: begin.nonce,
        eligibilityPermit: permit.permit,
        credential: 'collision',
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
  });
});
