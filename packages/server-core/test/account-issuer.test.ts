import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { SqlPool } from '../src/database.ts';
import { privateCryptography } from '../src/private-services.ts';
import { createAccountIssuer } from '../src/account-issuer.ts';
import { createAccountIssuerHandler } from '../src/account-issuer-api.ts';
import { accountEligibility } from '../src/account-policy.ts';

let db: PGlite,
  clock = 1_800_000_000_000,
  tail = Promise.resolve();
const pool: SqlPool = {
  async connect() {
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((r) => {
      release = r;
    });
    await prior;
    return {
      query: (text, values) => db.query<Record<string, unknown>>(text, values ? [...values] : []),
      release,
    };
  },
};
const policy = {
  version: 'account-test-v1',
  countries: {
    BG: { minimumAge: 16, neutralAgeScreenAllowed: true },
    US: { minimumAge: 13, neutralAgeScreenAllowed: true },
    FR: { minimumAge: 15, neutralAgeScreenAllowed: false },
  },
};
const context = { country: 'BG', rateKey: 'gateway-peer' };
const messages: { id: string; email: string; code: string; purpose: string }[] = [];
const directoryUsers = new Map<string, string>();
const issuer = createAccountIssuer({
  database: pool,
  crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
  policy,
  now: () => clock,
  directory: {
    async verifiedEmail(email) {
      let id = directoryUsers.get(email);
      if (!id) {
        id = randomUUID();
        directoryUsers.set(email, id);
        await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
          id,
          email,
        ]);
      }
      return id;
    },
    emailForSubject: (id) =>
      Promise.resolve([...directoryUsers].find(([, value]) => value === id)![0]),
  },
  mailer: {
    send: (message) => {
      messages.push(message);
      return Promise.resolve();
    },
  },
});
const api = createAccountIssuerHandler({
  issuer,
  basePath: '/cpi-live',
  context: () => Promise.resolve(context),
  allowOrigin: (o) => o === null,
});
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create schema auth;create schema cpi_private;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
    create table cpi_private.profile_owners(user_id uuid primary key references auth.users(id) on delete cascade);
    create table cpi_private.profiles_private(user_id uuid primary key references auth.users(id) on delete cascade,privacy_context text,context_updated_at timestamptz);
    create table cpi_private.consent_events(user_id uuid references auth.users(id) on delete cascade,purpose text,decision text,policy_version text,jurisdiction text);
    create table cpi_private.account_deletion_requests(user_id uuid references auth.users(id) on delete cascade);
  `);
  await db.exec(
    readFileSync(
      new URL('../../../supabase/migrations/20261107000200_account_issuer.sql', import.meta.url),
      'utf8',
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function post(path: string, input: unknown, bearer?: string) {
  return api(
    new Request('https://edge.example/cpi-live/' + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(bearer ? { authorization: 'Bearer ' + bearer } : {}),
      },
      body: JSON.stringify(input),
    }),
  );
}
async function login(address: string) {
  const decision = await issuer.eligibility(
    { schemaVersion: 2, age: 28, country: 'BG', platform: 'android', clientBuild: 1 },
    context,
  );
  expect(decision.status).toBe('eligible');
  if (!('permit' in decision)) throw new Error('missing permit');
  await issuer.requestCode(
    { schemaVersion: 1, email: address, eligibilityPermit: decision.permit },
    context,
  );
  const verified = await issuer.verifyCode({
    schemaVersion: 1,
    email: address,
    code: messages.at(-1)!.code,
    eligibilityPermit: decision.permit,
  });
  return {
    permit: decision.permit,
    verified: verified as { verifiedTicket: string },
    session: (await issuer.exchange((verified as { verifiedTicket: string }).verifiedTicket)) as {
      subject: string;
      accessToken: string;
      refreshToken: string;
    },
  };
}
describe('private account issuer with real PostgreSQL semantics', () => {
  it('decides jurisdiction before email and never treats analytics/ad flags as permission', async () => {
    expect(
      accountEligibility(policy, context, {
        schemaVersion: 2,
        age: 14,
        country: 'BG',
        platform: 'android',
        clientBuild: 1,
      }),
    ).toEqual({ status: 'parental_review' });
    expect(
      accountEligibility(
        policy,
        { ...context, country: 'FR' },
        { schemaVersion: 2, age: 40, country: 'BG', platform: 'android', clientBuild: 1 },
      ),
    ).toEqual({ status: 'unavailable' });
    expect(accountEligibility(policy, context, { schemaVersion: 1, adult: true })).toEqual({
      status: 'unavailable',
    });
    const response = await post('otp/request', {
      schemaVersion: 1,
      email: 'child@example.com',
      eligibilityPermit: 'x'.repeat(43),
    });
    expect(response.status).toBe(410);
    expect(messages).toHaveLength(0);
    expect(directoryUsers.size).toBe(0);
  });
  it('verifies email, exchanges once, replays a lost response briefly, and never stores raw codes/tokens', async () => {
    const { verified, session } = await login('one@example.com');
    expect(await issuer.authenticate(session.accessToken)).toMatchObject({
      subject: session.subject,
      platform: 'android',
      privacyContext: 'adult',
    });
    expect(await issuer.exchange(verified.verifiedTicket)).toEqual(session);
    const rows = await db.query<{ code_hash: string; payload_encrypted: string | null }>(
      'select code_hash,payload_encrypted from cpi_private.account_challenges',
    );
    expect(rows.rows[0].payload_encrypted).toBeNull();
    expect(rows.rows[0].code_hash).not.toContain(messages.at(-1)!.code);
    const refresh = (await issuer.refresh(session.refreshToken)) as {
      accessToken: string;
      refreshToken: string;
    };
    expect(refresh.refreshToken).not.toBe(session.refreshToken);
    expect(await issuer.refresh(session.refreshToken)).toEqual(refresh);
    expect(await issuer.authenticate(session.accessToken)).toBeNull();
    await issuer.revoke(session.refreshToken);
    expect(await issuer.authenticate(refresh.accessToken)).toBeNull();
    await expect(issuer.exchange(verified.verifiedTicket)).rejects.toThrow();
  });
  it('commits wrong-code attempts, stops after five, and serializes resend cooldowns', async () => {
    const decision = await issuer.eligibility(
      { schemaVersion: 2, age: 25, country: 'BG', platform: 'ios', clientBuild: 1 },
      context,
    );
    if (!('permit' in decision)) throw new Error('no permit');
    await issuer.requestCode(
      { schemaVersion: 1, email: 'attempts@example.com', eligibilityPermit: decision.permit },
      context,
    );
    const code = messages.at(-1)!.code,
      wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(
        issuer.verifyCode({
          schemaVersion: 1,
          email: 'attempts@example.com',
          code: wrong,
          eligibilityPermit: decision.permit,
        }),
      ).rejects.toThrow();
    await expect(
      issuer.verifyCode({
        schemaVersion: 1,
        email: 'attempts@example.com',
        code,
        eligibilityPermit: decision.permit,
      }),
    ).rejects.toThrow();
    await expect(
      issuer.requestCode(
        { schemaVersion: 1, email: 'attempts@example.com', eligibilityPermit: decision.permit },
        context,
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('revokes the whole rotated family on late reuse and blocks pending deletion', async () => {
    const { session } = await login('reuse@example.com');
    const successor = (await issuer.refresh(session.refreshToken)) as { accessToken: string };
    clock += 61000;
    await expect(issuer.refresh(session.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await issuer.authenticate(successor.accessToken)).toBeNull();
    const next = await login('delete@example.com');
    await db.query('insert into cpi_private.account_deletion_requests(user_id) values($1)', [
      next.session.subject,
    ]);
    expect(await issuer.authenticate(next.session.accessToken)).toBeNull();
    await expect(issuer.refresh(next.session.refreshToken)).rejects.toThrow();
  });
  it('issues fresh purpose-bound reauthentication proofs; export cannot authorize deletion', async () => {
    const { session } = await login('reauth@example.com');
    const auth = (await issuer.authenticate(session.accessToken))!;
    clock += 61000;
    await issuer.requestCode({ schemaVersion: 1, purpose: 'export' }, context, auth);
    const ceremony = (await issuer.verifyCode(
      { schemaVersion: 1, purpose: 'export', code: messages.at(-1)!.code },
      auth,
    )) as { ceremony: string };
    const proof = await issuer.reauthProof(auth, {
      schemaVersion: 1,
      ceremony: ceremony.ceremony,
      purpose: 'export',
    });
    expect(
      await issuer.verifyReauthentication({
        subject: auth.subject,
        accessToken: session.accessToken,
        proof: proof.proof,
        purpose: 'export',
      }),
    ).toMatchObject({ subject: auth.subject, purpose: 'export' });
    expect(
      await issuer.verifyReauthentication({
        subject: auth.subject,
        accessToken: session.accessToken,
        proof: proof.proof,
        purpose: 'delete',
      }),
    ).toBeNull();
    clock += 300001;
    expect(
      await issuer.verifyReauthentication({
        subject: auth.subject,
        accessToken: session.accessToken,
        proof: proof.proof,
        purpose: 'export',
      }),
    ).toBeNull();
  });
  it('keeps all account tables inaccessible to raw authenticated users', async () => {
    await db.exec('set role authenticated');
    try {
      await expect(db.query('select * from cpi_private.account_families')).rejects.toThrow();
    } finally {
      await db.exec('reset role');
    }
  });
});
