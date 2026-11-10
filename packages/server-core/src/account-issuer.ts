import { Buffer } from 'node:buffer';
import { randomInt, randomUUID } from 'node:crypto';
import type { SqlConnection, SqlPool } from './database.ts';
import type {
  AccountDirectory,
  AccountMailer,
  ProviderSignupDirectory,
} from './account-providers.ts';
import type { AccountPolicy, AccountRequestContext } from './account-policy.ts';
import { accountEligibility, validateAccountPolicy } from './account-policy.ts';
import type { PrivateCryptography } from './private-services.ts';
import { exactObject, isObject, sqlTransaction } from './private-services.ts';
import { createDurableRateLimit } from './durable-rate-limit.ts';
import { isNativeIdentityProvider, NativeIdentityRejected } from './native-identity.ts';
import type { NativeIdentity, NativeIdentityProvider } from './native-identity.ts';

const MINUTE = 60_000,
  DAY = 86400_000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
type Purpose = 'login' | 'export' | 'delete';
interface ProviderLinkProof {
  provider: NativeIdentityProvider;
  identityHash: string;
  subject: string;
  address: string;
  permit: string;
  appleRefresh?: string;
  displayName?: string;
}
export class AccountIssuerError extends Error {
  readonly status: number;
  constructor(status = 400) {
    super('Account request unavailable');
    this.name = 'AccountIssuerError';
    this.status = status;
  }
}
export interface IssuedAccountActor {
  readonly subject: string;
  readonly familyId: string;
  readonly deviceId: string;
  readonly platform: 'android' | 'ios' | 'web';
  readonly clientBuild: number;
  readonly privacyContext: 'teen' | 'adult';
  readonly country: string;
}
function email(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
      value,
    )
  )
    throw new AccountIssuerError();
  return value.toLowerCase();
}
function token(value: unknown): string {
  if (typeof value !== 'string' || !tokenPattern.test(value)) throw new AccountIssuerError();
  return value;
}
function number(value: unknown): number {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed))
    throw new AccountIssuerError(503);
  return parsed;
}
function str(value: unknown): string {
  if (typeof value !== 'string') throw new AccountIssuerError(503);
  return value;
}
function actor(row: Record<string, unknown>): IssuedAccountActor {
  return {
    subject: str(row.user_id),
    familyId: str(row.id),
    deviceId: str(row.device_id),
    platform: row.platform as IssuedAccountActor['platform'],
    clientBuild: number(row.client_build),
    privacyContext: row.privacy_context as IssuedAccountActor['privacyContext'],
    country: str(row.country),
  };
}
export function createAccountIssuer(options: {
  database: SqlPool;
  crypto: PrivateCryptography;
  directory: AccountDirectory;
  mailer: AccountMailer;
  identity?: NativeIdentity;
  policy: AccountPolicy;
  stagingTestEmails?: readonly string[];
  nativeSignup?: {
    directory: ProviderSignupDirectory;
    emails: Readonly<Record<NativeIdentityProvider, readonly string[]>>;
    directEntry?: boolean;
  };
  now?: () => number;
}) {
  const { database, crypto, nativeSignup } = options,
    now = options.now ?? Date.now;
  const policy = validateAccountPolicy(options.policy);
  const stagingTestEmails = new Set(
    (options.stagingTestEmails ?? []).map((address) => email(address)),
  );
  const stagingSessionEmails = new Set([
    ...stagingTestEmails,
    ...(nativeSignup?.emails.apple ?? []),
    ...(nativeSignup?.emails.google ?? []),
  ]);
  const directEntry =
    nativeSignup?.directEntry === true &&
    Object.keys(policy.countries).length === 1 &&
    policy.countries.BG?.minimumAge === 18 &&
    policy.countries.BG.neutralAgeScreenAllowed;
  const limit = createDurableRateLimit(database, crypto, now);
  const digest = (domain: string, value: string) => crypto.digest(domain, value);
  async function owner(connection: SqlConnection, subject: string) {
    const rows = (
      await connection.query(
        'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
        [subject],
      )
    ).rows;
    if (rows.length !== 1) throw new AccountIssuerError(401);
    const deleted = (
      await connection.query(
        'select 1 from cpi_private.account_deletion_requests where user_id=$1::uuid',
        [subject],
      )
    ).rows;
    if (deleted.length) throw new AccountIssuerError(401);
  }
  async function permittedHash(connection: SqlConnection, hash: string) {
    const row = (
      await connection.query(
        'select * from cpi_private.account_permits where token_hash=$1 and expires_at>$2 and not revoked',
        [hash, now()],
      )
    ).rows[0];
    if (!row || row.policy_version !== policy.version || !policy.countries[str(row.country)])
      throw new AccountIssuerError(410);
    return row;
  }
  function permitted(connection: SqlConnection, value: unknown) {
    return permittedHash(connection, digest('permit', token(value)));
  }
  async function authenticate(access: string): Promise<IssuedAccountActor | null> {
    if (!tokenPattern.test(access)) return null;
    const authenticated = await sqlTransaction(database, async (connection) => {
      const row = (
        await connection.query(
          `select f.* from cpi_private.account_families f
        join cpi_private.profiles_private p on p.user_id=f.user_id
        where f.access_hash=$1 and f.revoked_at is null and f.access_expires_at>$2 and f.expires_at>$2
        and p.privacy_context=f.privacy_context
        and not exists(select 1 from cpi_private.account_deletion_requests d where d.user_id=f.user_id)`,
          [digest('access', access), now()],
        )
      ).rows[0];
      return row && row.policy_version === policy.version && policy.countries[str(row.country)]
        ? actor(row)
        : null;
    });
    if (
      !authenticated ||
      (stagingTestEmails.size && !(await isStagingTestAccount(authenticated.subject)))
    )
      return null;
    return authenticated;
  }
  async function isStagingTestAccount(subject: string): Promise<boolean> {
    if (!stagingTestEmails.size) return false;
    try {
      return stagingSessionEmails.has(email(await options.directory.emailForSubject(subject)));
    } catch {
      return false;
    }
  }
  async function envelope(
    connection: SqlConnection,
    family: Record<string, unknown>,
    previousRefresh?: string,
  ) {
    const accessToken = crypto.token(),
      refreshToken = crypto.token(),
      stamp = now();
    const expiresAt = stamp + 15 * MINUTE;
    await connection.query(
      'update cpi_private.account_families set access_hash=$2,access_expires_at=$3 where id=$1::uuid',
      [family.id, digest('access', accessToken), expiresAt],
    );
    const response = {
      status: 'active' as const,
      subject: family.user_id,
      accessToken,
      refreshToken,
      expiresAt,
    };
    if (previousRefresh)
      await connection.query(
        'update cpi_private.account_refresh_tokens set rotated_at=$2,response_encrypted=$3 where token_hash=$1 and rotated_at is null',
        [previousRefresh, stamp, crypto.seal(response, 'refresh:' + previousRefresh)],
      );
    await connection.query(
      'insert into cpi_private.account_refresh_tokens(token_hash,family_id,expires_at) values($1,$2::uuid,$3)',
      [
        digest('refresh', refreshToken),
        family.id,
        Math.min(stamp + 30 * DAY, number(family.expires_at)),
      ],
    );
    return response;
  }
  async function eligibility(input: unknown, context: AccountRequestContext) {
    if (!(await limit('eligibility:' + context.rateKey, 20, 10 * MINUTE)))
      throw new AccountIssuerError(429);
    const decision = accountEligibility(policy, context, input);
    if (decision.status !== 'eligible') return decision;
    const permit = crypto.token(),
      expiresAt = now() + 15 * MINUTE;
    await sqlTransaction(database, async (connection) => {
      await connection.query(
        `insert into cpi_private.account_permits(token_hash,policy_version,country,privacy_context,platform,client_build,expires_at)
        values($1,$2,$3,$4,$5,$6,$7)`,
        [
          digest('permit', permit),
          policy.version,
          decision.country,
          decision.privacyContext,
          decision.platform,
          decision.clientBuild,
          expiresAt,
        ],
      );
    });
    return { status: 'eligible', permit, policyVersion: policy.version, expiresAt };
  }
  /** Lease before sending, provider idempotency after a crash. Codes expire even if the mail provider is offline. */
  async function deliverMail(id?: string, maximum = 20) {
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 20)
      throw new AccountIssuerError(503);
    const claimed = await sqlTransaction(database, async (connection) => {
      const rows = (
        await connection.query(
          `select id,payload_encrypted,purpose from cpi_private.account_challenges
        where mail_sent_at is null and payload_encrypted is not null and expires_at>$1 and mail_lease_until<$1
        and ($2::uuid is null or id=$2::uuid) order by expires_at limit $3 for update skip locked`,
          [now(), id ?? null, maximum],
        )
      ).rows;
      for (const row of rows)
        await connection.query(
          'update cpi_private.account_challenges set mail_lease_until=$2 where id=$1::uuid',
          [row.id, now() + MINUTE],
        );
      return rows;
    });
    let sent = 0;
    for (const row of claimed) {
      try {
        const payload = crypto.open(str(row.payload_encrypted), 'mail:' + str(row.id));
        if (
          !exactObject(payload, ['email', 'code']) ||
          typeof payload.code !== 'string' ||
          !/^\d{6}$/.test(payload.code)
        )
          throw new AccountIssuerError();
        await options.mailer.send({
          id: str(row.id),
          email: email(payload.email),
          code: payload.code,
          purpose: row.purpose as Purpose,
        });
        await sqlTransaction(database, async (connection) => {
          await connection.query(
            'update cpi_private.account_challenges set mail_sent_at=$2,payload_encrypted=null where id=$1::uuid',
            [row.id, now()],
          );
        });
        sent++;
      } catch {
        /* Durable lease expires; scheduler retries with the same provider idempotency key. */
      }
    }
    return { sent, attempted: claimed.length };
  }
  async function requestCode(
    input: unknown,
    context: AccountRequestContext,
    auth?: IssuedAccountActor,
    providerLink?: ProviderLinkProof,
  ) {
    const reauth = !!auth;
    if (
      !exactObject(
        input,
        reauth ? ['schemaVersion', 'purpose'] : ['schemaVersion', 'email', 'eligibilityPermit'],
      ) ||
      input.schemaVersion !== 1
    )
      throw new AccountIssuerError();
    const purpose: Purpose = reauth
      ? input.purpose === 'export' || input.purpose === 'delete'
        ? input.purpose
        : (() => {
            throw new AccountIssuerError();
          })()
      : 'login';
    // Permission validation precedes email normalization, directory access or mail delivery.
    if (!reauth)
      await sqlTransaction(database, (connection) =>
        permitted(connection, input.eligibilityPermit),
      );
    const address = auth
      ? email(await options.directory.emailForSubject(auth.subject))
      : email(providerLink?.address ?? input.email);
    if (
      stagingTestEmails.size &&
      !(auth || providerLink ? stagingSessionEmails : stagingTestEmails).has(address)
    )
      throw new AccountIssuerError(403);
    const emailHash = digest('email', address);
    if (
      !(await limit('mail-ip:' + context.rateKey, 12, 60 * MINUTE)) ||
      !(await limit('mail-address:' + emailHash, 6, 60 * MINUTE))
    )
      throw new AccountIssuerError(429);
    const result = await sqlTransaction(database, async (connection) => {
      if (auth) await owner(connection, auth.subject);
      const permit = auth ? null : await permitted(connection, input.eligibilityPermit);
      // Shared email lock closes concurrent edge requests without storing a raw address.
      await connection.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [emailHash]);
      const latest = (
        await connection.query(
          'select resend_at from cpi_private.account_challenges where email_hash=$1 order by resend_at desc limit 1',
          [emailHash],
        )
      ).rows[0];
      if (latest && number(latest.resend_at) > now()) throw new AccountIssuerError(429);
      const id = randomUUID(),
        code = String(randomInt(1_000_000)).padStart(6, '0'),
        expiresAt = Math.min(now() + 10 * MINUTE, permit ? number(permit.expires_at) : Infinity),
        resendAt = now() + MINUTE;
      // A new code invalidates every previous code for this address and purpose.
      await connection.query(
        'update cpi_private.account_challenges set expires_at=$3,payload_encrypted=null where email_hash=$1 and purpose=$2 and verified_at is null',
        [emailHash, purpose, now()],
      );
      await connection.query(
        `insert into cpi_private.account_challenges(id,email_hash,permit_hash,purpose,user_id,family_id,payload_encrypted,code_hash,expires_at,resend_at)
        values($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9,$10)`,
        [
          id,
          emailHash,
          permit?.token_hash ?? null,
          purpose,
          auth?.subject ?? null,
          auth?.familyId ?? null,
          crypto.seal({ email: address, code }, 'mail:' + id),
          digest('otp', id + ':' + code),
          expiresAt,
          resendAt,
        ],
      );
      return { id, status: 'accepted', expiresAt, resendAt };
    });
    await deliverMail(result.id);
    return { status: result.status, expiresAt: result.expiresAt, resendAt: result.resendAt };
  }
  async function verifyCode(
    input: unknown,
    auth?: IssuedAccountActor,
    providerLink?: ProviderLinkProof,
  ) {
    const reauth = !!auth;
    if (
      !exactObject(
        input,
        reauth
          ? ['schemaVersion', 'purpose', 'code']
          : ['schemaVersion', 'email', 'code', 'eligibilityPermit'],
      ) ||
      input.schemaVersion !== 1 ||
      typeof input.code !== 'string' ||
      !/^\d{6}$/.test(input.code)
    )
      throw new AccountIssuerError();
    const purpose: Purpose = auth
      ? input.purpose === 'export' || input.purpose === 'delete'
        ? input.purpose
        : (() => {
            throw new AccountIssuerError();
          })()
      : 'login';
    if (!auth)
      await sqlTransaction(database, (connection) =>
        permitted(connection, input.eligibilityPermit),
      );
    const address = auth
      ? email(await options.directory.emailForSubject(auth.subject))
      : email(input.email);
    if (
      stagingTestEmails.size &&
      !(auth || providerLink ? stagingSessionEmails : stagingTestEmails).has(address)
    )
      throw new AccountIssuerError(403);
    const emailHash = digest('email', address);
    if (!(await limit('verify:' + emailHash, 30, 10 * MINUTE))) throw new AccountIssuerError(429);
    const challenge = await sqlTransaction(database, async (connection) => {
      if (auth) await owner(connection, auth.subject);
      const permit = auth ? null : await permitted(connection, input.eligibilityPermit);
      const row = (
        await connection.query(
          `select * from cpi_private.account_challenges where email_hash=$1 and purpose=$2
        and ($3::uuid is null or family_id=$3::uuid) order by resend_at desc limit 1 for update`,
          [emailHash, purpose, auth?.familyId ?? null],
        )
      ).rows[0];
      if (
        !row ||
        number(row.expires_at) <= now() ||
        number(row.attempts) >= 5 ||
        (!auth && row.permit_hash !== permit?.token_hash)
      )
        return null;
      if (row.code_hash !== digest('otp', str(row.id) + ':' + str(input.code))) {
        await connection.query(
          'update cpi_private.account_challenges set attempts=attempts+1 where id=$1::uuid',
          [row.id],
        );
        return null; // Commit failed attempts; throwing here would roll the counter back.
      }
      if (!row.verified_at)
        await connection.query(
          'update cpi_private.account_challenges set verified_at=$2,payload_encrypted=null where id=$1::uuid',
          [row.id, now()],
        );
      return row;
    });
    if (!challenge) throw new AccountIssuerError(401);
    if (auth) {
      return sqlTransaction(database, async (connection) => {
        await owner(connection, auth.subject);
        const locked = (
          await connection.query(
            'select ticket_encrypted from cpi_private.account_challenges where id=$1::uuid for update',
            [challenge.id],
          )
        ).rows[0];
        if (locked?.ticket_encrypted)
          return crypto.open(str(locked.ticket_encrypted), 'challenge:' + str(challenge.id));
        const ceremony = crypto.token(),
          expiresAt = now() + 5 * MINUTE;
        const result = { ceremony, expiresAt };
        await connection.query(
          'insert into cpi_private.account_reauth(token_hash,family_id,purpose,verified_at,expires_at) values($1,$2::uuid,$3,$4,$5)',
          [digest('reauth', ceremony), auth.familyId, purpose, now(), expiresAt],
        );
        await connection.query(
          'update cpi_private.account_challenges set ticket_encrypted=$2 where id=$1::uuid',
          [challenge.id, crypto.seal(result, 'challenge:' + str(challenge.id))],
        );
        return result;
      });
    }
    const subject = providerLink?.subject ?? (await options.directory.verifiedEmail(address));
    return sqlTransaction(database, async (connection) => {
      if (providerLink) await lockProvider(connection, providerLink.identityHash);
      else
        await connection.query(
          'insert into cpi_private.profile_owners(user_id) values($1::uuid) on conflict do nothing',
          [subject],
        );
      await owner(connection, subject);
      const permit = await permitted(connection, input.eligibilityPermit);
      const prior = (
        await connection.query(
          'select privacy_context from cpi_private.profiles_private where user_id=$1::uuid for update',
          [subject],
        )
      ).rows[0];
      // A new self-reported answer cannot upgrade an already restricted/younger account.
      if (
        prior &&
        prior.privacy_context !== 'unknown' &&
        prior.privacy_context !== permit.privacy_context
      )
        throw new AccountIssuerError(403);
      const locked = (
        await connection.query(
          'select ticket_encrypted from cpi_private.account_challenges where id=$1::uuid for update',
          [challenge.id],
        )
      ).rows[0];
      if (locked?.ticket_encrypted)
        return crypto.open(str(locked.ticket_encrypted), 'challenge:' + str(challenge.id));
      if (providerLink && nativeSignup) {
        const existing = await nativeSignup.directory.lookup(
          connection,
          address,
          providerLink.identityHash,
        );
        if (existing?.subject !== subject || prior?.privacy_context !== 'adult')
          throw new AccountIssuerError(410);
        if (
          !(await attachProvider(
            connection,
            providerLink.provider,
            providerLink.identityHash,
            subject,
            providerLink.appleRefresh,
          ))
        )
          return { status: 'already_linked' };
        await rememberDisplayName(connection, subject, providerLink.displayName);
      } else {
        await connection.query(
          `insert into cpi_private.profiles_private(user_id,privacy_context,context_updated_at) values($1::uuid,$2,now())
          on conflict(user_id) do update set privacy_context=excluded.privacy_context,context_updated_at=excluded.context_updated_at`,
          [subject, permit.privacy_context],
        );
        await connection.query(
          "insert into cpi_private.consent_events(user_id,purpose,decision,policy_version,jurisdiction) values($1::uuid,'account','granted',$2,$3)",
          [subject, policy.version, permit.country],
        );
      }
      const verifiedTicket = crypto.token(),
        expiresAt = now() + 2 * MINUTE;
      await connection.query(
        'insert into cpi_private.account_tickets(token_hash,challenge_id,user_id,permit_hash,expires_at) values($1,$2::uuid,$3::uuid,$4,$5)',
        [digest('ticket', verifiedTicket), challenge.id, subject, permit.token_hash, expiresAt],
      );
      const response = { status: 'verified', verifiedTicket, expiresAt };
      await connection.query(
        'update cpi_private.account_challenges set user_id=$2::uuid,ticket_encrypted=$3 where id=$1::uuid',
        [challenge.id, subject, crypto.seal(response, 'challenge:' + str(challenge.id))],
      );
      return response;
    });
  }
  async function beginIdentity(
    input: unknown,
    context: AccountRequestContext,
    auth: IssuedAccountActor | null,
  ) {
    if (!options.identity) throw new AccountIssuerError(503);
    const direct = isObject(input) && input.schemaVersion === 2;
    if (
      !exactObject(
        input,
        direct
          ? ['schemaVersion', 'provider', 'clientBuild']
          : ['schemaVersion', 'provider', 'eligibilityPermit'],
      ) ||
      (!direct && input.schemaVersion !== 1) ||
      !isNativeIdentityProvider(input.provider) ||
      (direct &&
        (typeof input.clientBuild !== 'number' ||
          !Number.isInteger(input.clientBuild) ||
          input.clientBuild < 1 ||
          input.clientBuild > 2147483647))
    )
      throw new AccountIssuerError();
    if (
      !context.country ||
      !policy.countries[context.country] ||
      (direct && (!directEntry || auth)) ||
      (auth && (auth.platform !== 'ios' || input.eligibilityPermit !== null))
    )
      throw new AccountIssuerError(403);
    if (!(await limit('identity:' + context.rateKey, 20, 10 * MINUTE)))
      throw new AccountIssuerError(429);
    const country = context.country;
    const nonce = crypto.token();
    await sqlTransaction(database, async (connection) => {
      const permit = auth || direct ? null : await permitted(connection, input.eligibilityPermit);
      if (permit && permit.platform !== 'ios') throw new AccountIssuerError(403);
      await connection.query(
        'insert into cpi_private.account_provider_challenges(nonce_hash,provider,family_id,permit_hash,country,expires_at,direct_client_build) values($1,$2,$3::uuid,$4,$5,$6,$7)',
        [
          digest('identity-nonce', nonce),
          input.provider,
          auth?.familyId ?? null,
          permit?.token_hash ?? null,
          country,
          Math.min(now() + 5 * MINUTE, permit ? number(permit.expires_at) : Infinity),
          direct ? input.clientBuild : null,
        ],
      );
    });
    return { status: 'ready', nonce };
  }
  async function admitAdultTester(connection: SqlConnection, clientBuild: number) {
    // Only a verified provider identity from the closed adult beta reaches this point.
    const permit = crypto.token();
    const hash = digest('permit', permit);
    const expiresAt = now() + 15 * MINUTE;
    await connection.query(
      `insert into cpi_private.account_permits(token_hash,policy_version,country,privacy_context,platform,client_build,expires_at)
      values($1,$2,'BG','adult','ios',$3,$4)`,
      [hash, policy.version, clientBuild, expiresAt],
    );
    return { permit, hash, expiresAt };
  }
  async function rememberDisplayName(
    connection: SqlConnection,
    subject: string,
    displayName?: string,
  ) {
    if (displayName)
      await connection.query(
        'update cpi_private.profiles_private set provider_display_name=$2 where user_id=$1::uuid',
        [subject, displayName],
      );
  }
  async function attachProvider(
    connection: SqlConnection,
    provider: NativeIdentityProvider,
    identityHash: string,
    subject: string,
    appleRefresh?: string,
  ) {
    if (provider === 'apple' && !appleRefresh) throw new AccountIssuerError(503);
    const refresh = appleRefresh ? crypto.seal(appleRefresh, 'apple-identity:' + subject) : null;
    const linked = (
      await connection.query(
        'insert into cpi_private.account_provider_links(provider,identity_hash,user_id,apple_refresh_encrypted) values($1,$2,$3::uuid,$4) on conflict do nothing returning user_id',
        [provider, identityHash, subject, refresh],
      )
    ).rows[0];
    if (linked) return true;
    if ((await linkedOwner(connection, provider, identityHash)) !== subject) return false;
    if (refresh)
      await connection.query(
        'update cpi_private.account_provider_links set apple_refresh_encrypted=$3 where provider=$1 and identity_hash=$2',
        [provider, identityHash, refresh],
      );
    return true;
  }
  async function providerTicket(
    connection: SqlConnection,
    subject: string,
    permitHash: string,
    nonceHash: string,
  ) {
    await owner(connection, subject);
    const permit = await permittedHash(connection, permitHash);
    const profile = (
      await connection.query(
        'select privacy_context from cpi_private.profiles_private where user_id=$1::uuid for update',
        [subject],
      )
    ).rows[0];
    if (!profile || profile.privacy_context !== permit.privacy_context)
      throw new AccountIssuerError(403);
    const verifiedTicket = crypto.token();
    const expiresAt = Math.min(now() + 2 * MINUTE, number(permit.expires_at));
    await connection.query(
      'insert into cpi_private.account_tickets(token_hash,provider_nonce_hash,user_id,permit_hash,expires_at) values($1,$2,$3::uuid,$4,$5)',
      [digest('ticket', verifiedTicket), nonceHash, subject, permit.token_hash, expiresAt],
    );
    return { status: 'verified', verifiedTicket, expiresAt };
  }
  async function lockProvider(connection: SqlConnection, identityHash: string) {
    await connection.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [identityHash]);
  }
  async function linkedOwner(
    connection: SqlConnection,
    provider: NativeIdentityProvider,
    identityHash: string,
  ) {
    const row = (
      await connection.query(
        'select user_id from cpi_private.account_provider_links where provider=$1 and identity_hash=$2',
        [provider, identityHash],
      )
    ).rows[0];
    return row ? str(row.user_id) : null;
  }
  async function completeIdentity(
    input: unknown,
    context: AccountRequestContext,
    auth: IssuedAccountActor | null,
  ) {
    const identity = options.identity;
    if (!identity) throw new AccountIssuerError(503);
    if (
      !exactObject(input, ['schemaVersion', 'provider', 'nonce', 'credential']) ||
      (input.schemaVersion !== 1 && input.schemaVersion !== 2 && input.schemaVersion !== 3) ||
      !isNativeIdentityProvider(input.provider)
    )
      throw new AccountIssuerError();
    const direct = input.schemaVersion === 3;
    if (
      !context.country ||
      !policy.countries[context.country] ||
      (direct && (!directEntry || auth))
    )
      throw new AccountIssuerError(403);
    const provider = input.provider;
    const nonce = token(input.nonce);
    const nonceHash = digest('identity-nonce', nonce);
    // Atomically consume the challenge before contacting the provider.
    const challenge = await sqlTransaction(database, async (connection) => {
      const row = (
        await connection.query(
          'delete from cpi_private.account_provider_challenges where nonce_hash=$1 and provider=$2 and expires_at>$3 and country=$4 and family_id is not distinct from $5::uuid returning permit_hash,direct_client_build',
          [nonceHash, provider, now(), context.country, auth?.familyId ?? null],
        )
      ).rows[0];
      if (!row || direct !== (row.direct_client_build !== null)) throw new AccountIssuerError(410);
      if (!auth && !direct) await permittedHash(connection, str(row.permit_hash));
      return row;
    });
    let verified: Awaited<ReturnType<NativeIdentity['verify']>>;
    let linkRefresh: string | undefined;
    try {
      verified = await identity.verify(provider, input.credential, nonce);
      if (auth) linkRefresh = await verified.appleRefresh?.();
    } catch (error) {
      if (error instanceof NativeIdentityRejected) throw new AccountIssuerError(401);
      throw error;
    }
    const identityHash = digest('identity:' + provider, verified.subject);
    const address = verified.signupEmail?.toLowerCase();
    return sqlTransaction(database, async (connection) => {
      if (nativeSignup) await lockProvider(connection, identityHash);
      if (auth) {
        await owner(connection, auth.subject);
        const active = (
          await connection.query(
            'select 1 from cpi_private.account_families where id=$1::uuid and user_id=$2::uuid and revoked_at is null and expires_at>$3 and policy_version=$4 for update',
            [auth.familyId, auth.subject, now(), policy.version],
          )
        ).rows[0];
        if (!active) throw new AccountIssuerError(401);
        if (nativeSignup && address) {
          const existing = await nativeSignup.directory.lookup(connection, address, identityHash);
          if (existing && existing.subject !== auth.subject) return { status: 'already_linked' };
        }
        if (!(await attachProvider(connection, provider, identityHash, auth.subject, linkRefresh)))
          return { status: 'already_linked' };
        return { status: 'linked' };
      }

      const linked = await linkedOwner(connection, provider, identityHash);
      const clientBuild = direct ? number(challenge.direct_client_build) : null;
      if (linked) {
        const permitHash =
          clientBuild === null
            ? str(challenge.permit_hash)
            : (await admitAdultTester(connection, clientBuild)).hash;
        const result = await providerTicket(connection, linked, permitHash, nonceHash);
        if (direct) await rememberDisplayName(connection, linked, verified.displayName);
        return result;
      }
      // Older TestFlight builds keep their original sign-in and signup contract.
      if (!nativeSignup || input.schemaVersion === 1 || !address)
        return { status: 'link_required' };
      if (!nativeSignup.emails[provider].includes(address)) return { status: 'signup_unavailable' };
      const existing = await nativeSignup.directory.lookup(connection, address, identityHash);
      const collision = existing && !existing.matchesProvider ? existing.subject : null;
      if (collision && clientBuild === null) return { status: 'link_required' };
      if (collision) {
        const prior = (
          await connection.query(
            'select privacy_context from cpi_private.profiles_private where user_id=$1::uuid',
            [collision],
          )
        ).rows[0];
        if (prior?.privacy_context !== 'adult') return { status: 'link_required' };
        await owner(connection, collision);
      }
      const appleRefresh = await verified.appleRefresh?.();
      if (provider === 'apple' && !appleRefresh) throw new AccountIssuerError(503);
      if (clientBuild !== null) {
        const admission = await admitAdultTester(connection, clientBuild);
        if (!collision)
          return createProviderAccount(connection, {
            provider,
            identityHash,
            address,
            appleRefresh,
            displayName: verified.displayName,
            permitHash: admission.hash,
            nonceHash,
            offerProfile: true,
          });
        const linkToken = crypto.token();
        const hash = digest('identity-link', linkToken);
        await connection.query(
          'insert into cpi_private.account_provider_signups(token_hash,provider,identity_hash,permit_hash,country,payload_encrypted,expires_at) values($1,$2,$3,$4,$5,$6,$7)',
          [
            hash,
            provider,
            identityHash,
            admission.hash,
            context.country,
            crypto.seal(
              {
                subject: collision,
                address,
                permit: admission.permit,
                appleRefresh,
                displayName: verified.displayName,
              },
              'identity-link:' + hash,
            ),
            admission.expiresAt,
          ],
        );
        return { status: 'verify_existing', linkToken };
      }
      const permitHash = str(challenge.permit_hash);
      const permit = await permittedHash(connection, permitHash);
      const signupToken = crypto.token();
      const hash = digest('identity-signup', signupToken);
      const expiresAt = Math.min(now() + 5 * MINUTE, number(permit.expires_at));
      await connection.query(
        'insert into cpi_private.account_provider_signups(token_hash,provider,identity_hash,permit_hash,country,payload_encrypted,expires_at) values($1,$2,$3,$4,$5,$6,$7)',
        [
          hash,
          provider,
          identityHash,
          permitHash,
          context.country,
          crypto.seal({ address, appleRefresh: appleRefresh ?? null }, 'identity-signup:' + hash),
          expiresAt,
        ],
      );
      return { status: 'signup_available', signupToken };
    });
  }
  async function createProviderAccount(
    connection: SqlConnection,
    proof: {
      provider: NativeIdentityProvider;
      identityHash: string;
      address: string;
      appleRefresh?: string;
      displayName?: string;
      permitHash: string;
      nonceHash: string;
      offerProfile?: boolean;
    },
  ) {
    if (!nativeSignup) throw new AccountIssuerError(503);
    const { provider, identityHash, address, appleRefresh, permitHash, nonceHash } = proof;
    const permit = await permittedHash(connection, permitHash);
    const subject = await nativeSignup.directory.create(connection, address, identityHash);
    if (!subject) return { status: 'link_required' };
    await connection.query(
      'insert into cpi_private.profile_owners(user_id) values($1::uuid) on conflict do nothing',
      [subject],
    );
    await owner(connection, subject);
    const profile = (
      await connection.query(
        'insert into cpi_private.profiles_private(user_id,privacy_context,context_updated_at) values($1::uuid,$2,now()) on conflict do nothing returning user_id',
        [subject, permit.privacy_context],
      )
    ).rows[0];
    if (profile)
      await connection.query(
        "insert into cpi_private.consent_events(user_id,purpose,decision,policy_version,jurisdiction) values($1::uuid,'account','granted',$2,$3)",
        [subject, policy.version, permit.country],
      );
    if (!(await attachProvider(connection, provider, identityHash, subject, appleRefresh)))
      throw new AccountIssuerError(409);
    await rememberDisplayName(connection, subject, proof.displayName);
    const result = await providerTicket(connection, subject, permitHash, nonceHash);
    return profile && proof.offerProfile ? { ...result, offerProfile: true } : result;
  }
  async function signupIdentity(input: unknown, context: AccountRequestContext) {
    if (!nativeSignup) throw new AccountIssuerError(503);
    if (!exactObject(input, ['schemaVersion', 'signupToken']) || input.schemaVersion !== 1)
      throw new AccountIssuerError();
    if (!context.country || !policy.countries[context.country]) throw new AccountIssuerError(403);
    const hash = digest('identity-signup', token(input.signupToken));
    return sqlTransaction(database, async (connection) => {
      // A failed transaction leaves the proof available for retry. A successful one consumes it.
      const row = (
        await connection.query(
          'delete from cpi_private.account_provider_signups where token_hash=$1 and country=$2 and expires_at>$3 returning *',
          [hash, context.country, now()],
        )
      ).rows[0];
      if (!row || !isNativeIdentityProvider(row.provider)) throw new AccountIssuerError(410);
      const provider = row.provider;
      const identityHash = str(row.identity_hash);
      const permitHash = str(row.permit_hash);
      await lockProvider(connection, identityHash);
      const linked = await linkedOwner(connection, provider, identityHash);
      if (linked) return providerTicket(connection, linked, permitHash, hash);

      const data = crypto.open(str(row.payload_encrypted), 'identity-signup:' + hash);
      if (
        !isObject(data) ||
        typeof data.address !== 'string' ||
        (provider === 'apple' && typeof data.appleRefresh !== 'string')
      )
        throw new AccountIssuerError(503);
      if (!nativeSignup.emails[provider].includes(data.address)) throw new AccountIssuerError(403);
      return createProviderAccount(connection, {
        provider,
        identityHash,
        address: data.address,
        appleRefresh: provider === 'apple' ? str(data.appleRefresh) : undefined,
        permitHash,
        nonceHash: hash,
      });
    });
  }
  async function providerLinkProof(
    linkToken: unknown,
    context: AccountRequestContext,
  ): Promise<ProviderLinkProof> {
    if (!directEntry || !nativeSignup || context.country !== 'BG')
      throw new AccountIssuerError(403);
    const hash = digest('identity-link', token(linkToken));
    return sqlTransaction(database, async (connection) => {
      const row = (
        await connection.query(
          'select * from cpi_private.account_provider_signups where token_hash=$1 and country=$2 and expires_at>$3',
          [hash, context.country, now()],
        )
      ).rows[0];
      if (!row || !isNativeIdentityProvider(row.provider)) throw new AccountIssuerError(410);
      const data = crypto.open(str(row.payload_encrypted), 'identity-link:' + hash);
      if (
        !isObject(data) ||
        typeof data.address !== 'string' ||
        typeof data.subject !== 'string' ||
        !nativeSignup.emails[row.provider].includes(data.address)
      )
        throw new AccountIssuerError(410);
      const identityHash = str(row.identity_hash);
      const existing = await nativeSignup.directory.lookup(connection, data.address, identityHash);
      if (existing?.subject !== data.subject) throw new AccountIssuerError(410);
      return {
        provider: row.provider,
        identityHash,
        address: data.address,
        subject: data.subject,
        permit: token(data.permit),
        appleRefresh: row.provider === 'apple' ? str(data.appleRefresh) : undefined,
        displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
      };
    });
  }
  async function requestProviderLinkCode(input: unknown, context: AccountRequestContext) {
    if (!exactObject(input, ['schemaVersion', 'linkToken']) || input.schemaVersion !== 1)
      throw new AccountIssuerError();
    const link = await providerLinkProof(input.linkToken, context);
    return requestCode(
      { schemaVersion: 1, email: link.address, eligibilityPermit: link.permit },
      context,
      undefined,
      link,
    );
  }
  async function verifyProviderLinkCode(input: unknown, context: AccountRequestContext) {
    if (!exactObject(input, ['schemaVersion', 'linkToken', 'code']) || input.schemaVersion !== 1)
      throw new AccountIssuerError();
    const link = await providerLinkProof(input.linkToken, context);
    return verifyCode(
      { schemaVersion: 1, email: link.address, eligibilityPermit: link.permit, code: input.code },
      undefined,
      link,
    );
  }
  async function exchange(value: unknown) {
    const hash = digest('ticket', token(value));
    if (stagingTestEmails.size) {
      const subject = await sqlTransaction(
        database,
        async (connection) =>
          (
            await connection.query(
              'select user_id from cpi_private.account_tickets where token_hash=$1',
              [hash],
            )
          ).rows[0]?.user_id,
      );
      if (typeof subject !== 'string' || !(await isStagingTestAccount(subject)))
        throw new AccountIssuerError(403);
    }
    return sqlTransaction(database, async (connection) => {
      const subject = (
        await connection.query(
          'select user_id from cpi_private.account_tickets where token_hash=$1',
          [hash],
        )
      ).rows[0]?.user_id;
      if (typeof subject !== 'string') throw new AccountIssuerError(401);
      await owner(connection, subject);
      const ticket = (
        await connection.query(
          'select * from cpi_private.account_tickets where token_hash=$1 for update',
          [hash],
        )
      ).rows[0];
      if (!ticket || number(ticket.expires_at) <= now()) throw new AccountIssuerError(410);
      if (ticket.exchanged_at) {
        if (
          number(ticket.exchanged_at) + MINUTE < now() ||
          typeof ticket.response_encrypted !== 'string'
        )
          throw new AccountIssuerError(401);
        const response = crypto.open(ticket.response_encrypted, 'exchange:' + hash);
        if (!isObject(response) || typeof response.accessToken !== 'string')
          throw new AccountIssuerError(503);
        const active = (
          await connection.query(
            'select 1 from cpi_private.account_families where user_id=$1::uuid and access_hash=$2 and revoked_at is null',
            [subject, digest('access', response.accessToken)],
          )
        ).rows;
        if (!active.length) throw new AccountIssuerError(401);
        return response;
      }
      const permit = (
        await connection.query(
          'select * from cpi_private.account_permits where token_hash=$1 and not revoked and expires_at>$2',
          [ticket.permit_hash, now()],
        )
      ).rows[0];
      if (!permit || permit.policy_version !== policy.version) throw new AccountIssuerError(410);
      const family = (
        await connection.query(
          `insert into cpi_private.account_families(user_id,platform,client_build,policy_version,country,privacy_context,access_hash,access_expires_at,created_at,expires_at)
        values($1::uuid,$2,$3,$4,$5,$6,$7,$8,$8,$9) returning *`,
          [
            subject,
            permit.platform,
            permit.client_build,
            policy.version,
            permit.country,
            permit.privacy_context,
            digest('access', crypto.token()),
            now(),
            now() + (permit.platform === 'web' ? 30 * MINUTE : 90 * DAY),
          ],
        )
      ).rows[0];
      if (!family) throw new AccountIssuerError(503);
      const response = await envelope(connection, family);
      await connection.query(
        'update cpi_private.account_tickets set exchanged_at=$2,response_encrypted=$3 where token_hash=$1',
        [hash, now(), crypto.seal(response, 'exchange:' + hash)],
      );
      return response;
    });
  }
  async function refresh(value: unknown) {
    const hash = digest('refresh', token(value));
    if (stagingTestEmails.size) {
      const subject = await sqlTransaction(
        database,
        async (connection) =>
          (
            await connection.query(
              'select f.user_id from cpi_private.account_families f join cpi_private.account_refresh_tokens r on r.family_id=f.id where r.token_hash=$1',
              [hash],
            )
          ).rows[0]?.user_id,
      );
      if (typeof subject !== 'string' || !(await isStagingTestAccount(subject)))
        throw new AccountIssuerError(403);
    }
    const result = await sqlTransaction(database, async (connection) => {
      const found = (
        await connection.query(
          'select f.user_id from cpi_private.account_families f join cpi_private.account_refresh_tokens r on r.family_id=f.id where r.token_hash=$1',
          [hash],
        )
      ).rows[0];
      if (!found) return null;
      await owner(connection, str(found.user_id));
      const family = (
        await connection.query(
          'select f.* from cpi_private.account_families f join cpi_private.account_refresh_tokens r on r.family_id=f.id where r.token_hash=$1 for update of f',
          [hash],
        )
      ).rows[0];
      const current = (
        await connection.query(
          'select * from cpi_private.account_refresh_tokens where token_hash=$1 for update',
          [hash],
        )
      ).rows[0];
      if (
        !family ||
        !current ||
        family.revoked_at ||
        number(current.expires_at) <= now() ||
        number(family.expires_at) <= now() ||
        family.policy_version !== policy.version
      )
        return null;
      if (current.rotated_at) {
        if (
          number(current.rotated_at) + MINUTE >= now() &&
          typeof current.response_encrypted === 'string'
        )
          return crypto.open(current.response_encrypted, 'refresh:' + hash);
        await connection.query(
          'update cpi_private.account_families set revoked_at=$2 where id=$1::uuid',
          [family.id, now()],
        );
        return null; // Commit reuse revocation, including every rotated successor.
      }
      return envelope(connection, family, hash);
    });
    if (!result) throw new AccountIssuerError(401);
    return result;
  }
  async function revoke(value: unknown) {
    const hash = digest('refresh', token(value));
    await sqlTransaction(database, async (connection) => {
      await connection.query(
        'update cpi_private.account_families set revoked_at=coalesce(revoked_at,$2) where id in(select family_id from cpi_private.account_refresh_tokens where token_hash=$1)',
        [hash, now()],
      );
    });
    return { status: 'revoked' };
  }
  async function reauthProof(auth: IssuedAccountActor, input: unknown) {
    if (
      !exactObject(input, ['schemaVersion', 'ceremony', 'purpose']) ||
      input.schemaVersion !== 1 ||
      (input.purpose !== 'export' && input.purpose !== 'delete')
    )
      throw new AccountIssuerError();
    const hash = digest('reauth', token(input.ceremony));
    return sqlTransaction(database, async (connection) => {
      await owner(connection, auth.subject);
      const row = (
        await connection.query(
          'select * from cpi_private.account_reauth where token_hash=$1 and family_id=$2::uuid and purpose=$3 and expires_at>$4',
          [hash, auth.familyId, input.purpose, now()],
        )
      ).rows[0];
      if (!row) throw new AccountIssuerError(401);
      const nonce = randomUUID(),
        expiresAt = number(row.expires_at),
        verifiedAt = number(row.verified_at);
      const payload = Buffer.from(
        JSON.stringify({
          nonce,
          family: auth.familyId,
          subject: auth.subject,
          purpose: input.purpose,
          verifiedAt,
          expiresAt,
        }),
      ).toString('base64url');
      return { proof: payload + '.' + digest('reauth-proof', payload), expiresAt };
    });
  }
  async function verifyReauthentication(input: {
    subject: string;
    accessToken: string;
    proof: string;
    purpose: 'export' | 'delete';
  }) {
    const auth = await authenticate(input.accessToken);
    if (!auth || auth.subject !== input.subject || input.proof.length > 2048) return null;
    const [payload, signature, ...extras] = input.proof.split('.');
    if (!payload || !signature || extras.length || signature !== digest('reauth-proof', payload))
      return null;
    try {
      const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (
        !exactObject(value, ['nonce', 'family', 'subject', 'purpose', 'verifiedAt', 'expiresAt']) ||
        value.family !== auth.familyId ||
        value.subject !== auth.subject ||
        value.purpose !== input.purpose ||
        typeof value.nonce !== 'string' ||
        typeof value.verifiedAt !== 'number' ||
        typeof value.expiresAt !== 'number' ||
        value.expiresAt <= now() ||
        value.verifiedAt > now() ||
        value.verifiedAt < now() - 5 * MINUTE
      )
        return null;
      return {
        subject: auth.subject,
        purpose: input.purpose,
        proofId: value.nonce,
        verifiedAt: value.verifiedAt,
        expiresAt: value.expiresAt,
      };
    } catch {
      return null;
    }
  }
  async function revokeAllSessions(input: {
    subject: string;
    operationId: string;
    signal: AbortSignal;
  }) {
    if (input.signal.aborted) throw new AccountIssuerError(503);
    await sqlTransaction(database, async (connection) => {
      await connection.query(
        'update cpi_private.account_families set revoked_at=coalesce(revoked_at,$2) where user_id=$1::uuid',
        [input.subject, now()],
      );
    });
    if (options.identity) {
      const row = await sqlTransaction(
        database,
        async (connection) =>
          (
            await connection.query(
              "select apple_refresh_encrypted from cpi_private.account_provider_links where user_id=$1::uuid and provider='apple'",
              [input.subject],
            )
          ).rows[0],
      );
      if (row) {
        const refresh = crypto.open(
          str(row.apple_refresh_encrypted),
          'apple-identity:' + input.subject,
        );
        await options.identity.revokeApple(str(refresh), input.signal);
      }
    }
    return { status: 'revoked', subject: input.subject, operationId: input.operationId };
  }
  async function maintenance() {
    await sqlTransaction(database, async (connection) => {
      // Only brief retry envelopes survive rotation. Remove expired PII payloads promptly.
      if (options.identity)
        await connection.query(
          'delete from cpi_private.account_provider_challenges where expires_at<$1',
          [now()],
        );
      if (nativeSignup)
        await connection.query(
          'delete from cpi_private.account_provider_signups where expires_at<$1',
          [now()],
        );
      await connection.query('delete from cpi_private.account_challenges where expires_at<$1', [
        now(),
      ]);
      await connection.query('delete from cpi_private.account_permits where expires_at<$1', [
        now() - 15 * MINUTE,
      ]);
      await connection.query(
        'delete from cpi_private.account_families where expires_at<$1 or revoked_at<$2',
        [now(), now() - DAY],
      );
      await connection.query(
        'update cpi_private.account_refresh_tokens set response_encrypted=null where rotated_at<$1',
        [now() - MINUTE],
      );
      await connection.query(
        'update cpi_private.account_tickets set response_encrypted=null where exchanged_at<$1',
        [now() - MINUTE],
      );
      await connection.query('delete from cpi_private.account_reauth where expires_at<$1', [now()]);
      await connection.query('delete from cpi_private.account_rate_limits where window_start<$1', [
        now() - DAY,
      ]);
    });
  }
  return {
    eligibility,
    beginIdentity,
    completeIdentity,
    signupIdentity,
    requestProviderLinkCode,
    verifyProviderLinkCode,
    requestCode,
    verifyCode,
    exchange,
    refresh,
    revoke,
    authenticate,
    isStagingTestAccount,
    reauthProof,
    verifyReauthentication,
    revokeAllSessions,
    deliverMail,
    maintenance,
  };
}
export type AccountIssuer = ReturnType<typeof createAccountIssuer>;
