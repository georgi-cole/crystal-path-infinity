import { createHash } from 'node:crypto';
import type { AccountIssuer, IssuedAccountActor } from './account-issuer.ts';
import { AccountIssuerError } from './account-issuer.ts';
import type { AccountRequestContext } from './account-policy.ts';
import type { SqlPool } from './database.ts';
import { exactObject, isObject, sqlTransaction } from './private-services.ts';
import type { PrivateCryptography } from './private-services.ts';

export const MOBILE_IDENTITY_CALLBACK =
  'https://crystalpath-api.kolequant.xyz/cpi/identity/mobile/callback';
export const STAGING_MOBILE_IDENTITY_CALLBACK =
  'https://crystal-path-staging-api.kolequant.workers.dev/cpi/identity/mobile/callback';
const returnBase = 'com.georgicole.crystalpath.infinity:/signin';
const opaque = /^[A-Za-z0-9_-]{43}$/;
function token(value: unknown): string {
  if (typeof value !== 'string' || !opaque.test(value)) throw new AccountIssuerError();
  return value;
}
/** Provider proofs stay encrypted on the server. The OS return link contains only state. */
export function createMobileIdentity(options: {
  database: SqlPool;
  crypto: PrivateCryptography;
  issuer: AccountIssuer;
  googleClientId: string;
  appleClientId: string;
  callback?: typeof MOBILE_IDENTITY_CALLBACK | typeof STAGING_MOBILE_IDENTITY_CALLBACK;
  now?: () => number;
}) {
  const { database, crypto, issuer } = options;
  const callback = options.callback ?? MOBILE_IDENTITY_CALLBACK;
  if (![MOBILE_IDENTITY_CALLBACK, STAGING_MOBILE_IDENTITY_CALLBACK].includes(callback))
    throw new AccountIssuerError();
  const now = options.now ?? Date.now;
  const digest = (domain: string, value: string) =>
    crypto.digest('mobile-identity:' + domain, value);
  return {
    async begin(input: unknown, context: AccountRequestContext, auth: IssuedAccountActor | null) {
      if (!exactObject(input, ['provider', 'eligibilityPermit'])) throw new AccountIssuerError();
      const opened = await issuer.beginIdentity({ schemaVersion: 5, ...input }, context, auth);
      const flowToken = crypto.token(),
        state = crypto.token(),
        verifier = crypto.token();
      const hash = digest('flow', flowToken);
      const expires = now() + 5 * 60_000;
      await sqlTransaction(database, async (connection) => {
        await connection.query(
          'insert into cpi_private.account_mobile_identity(token_hash,state_hash,provider,family_id,country,request_encrypted,expires_at) values($1,$2,$3,$4::uuid,$5,$6,$7)',
          [
            hash,
            digest('state', state),
            input.provider,
            auth?.familyId ?? null,
            context.country,
            crypto.seal({ nonce: opened.nonce, verifier }, 'mobile-request:' + hash),
            expires,
          ],
        );
      });
      const url = new URL(
        input.provider === 'google'
          ? 'https://accounts.google.com/o/oauth2/v2/auth'
          : 'https://appleid.apple.com/auth/authorize',
      );
      const parameters: Record<string, string> = {
        client_id: input.provider === 'google' ? options.googleClientId : options.appleClientId,
        redirect_uri: callback,
        state,
        nonce: opened.nonce,
        response_type: input.provider === 'google' ? 'code' : 'code id_token',
        scope: input.provider === 'google' ? 'openid email profile' : 'name email',
      };
      if (input.provider === 'google')
        Object.assign(parameters, {
          prompt: 'select_account',
          code_challenge_method: 'S256',
          code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        });
      else parameters.response_mode = 'form_post';
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      return { status: 'ready', flowToken, state, url: url.href };
    },
    async callback(request: Request): Promise<Response> {
      if (new URL(request.url).search.length > 16_384) throw new AccountIssuerError(413);
      if (request.method !== 'GET' && request.method !== 'POST')
        return new Response(null, { status: 405 });
      let fields: URLSearchParams;
      if (request.method === 'GET') fields = new URL(request.url).searchParams;
      else {
        if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
          return new Response(null, { status: 415 });
        const chunks: Uint8Array[] = [];
        let size = 0;
        const reader = request.body?.getReader();
        if (reader)
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > 16_384) throw new AccountIssuerError(413);
              chunks.push(part.value);
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          bytes.set(part, offset);
          offset += part.length;
        }
        fields = new URLSearchParams(new TextDecoder().decode(bytes));
      }
      const state = token(fields.get('state'));
      if (fields.getAll('state').length !== 1) throw new AccountIssuerError();
      const payload: Record<string, string> = {};
      for (const field of ['code', 'id_token', 'error']) {
        const values = fields.getAll(field);
        if (
          values.length > 1 ||
          (values[0] &&
            (values[0].length > 8192 ||
              [...values[0]].some((character) => character.charCodeAt(0) < 32)))
        )
          throw new AccountIssuerError();
        if (values[0]) payload[field] = values[0];
      }
      await sqlTransaction(database, async (connection) => {
        const row = (
          await connection.query(
            'select token_hash,provider from cpi_private.account_mobile_identity where state_hash=$1 and expires_at>$2 and response_encrypted is null for update',
            [digest('state', state), now()],
          )
        ).rows[0];
        if (!row) throw new AccountIssuerError(410);
        if (
          (!payload.error && !payload.code) ||
          (row.provider === 'apple' && !payload.error && !payload.id_token)
        )
          throw new AccountIssuerError();
        await connection.query(
          'update cpi_private.account_mobile_identity set response_encrypted=$2 where token_hash=$1',
          [row.token_hash, crypto.seal(payload, 'mobile-response:' + String(row.token_hash))],
        );
      });
      const target = returnBase + '?state=' + state;
      // Edge ingress downgrades HTML to plain text. An HTTP redirect is captured
      // directly by ASWebAuthenticationSession / Android's registered callback.
      return new Response(null, {
        status: 303,
        headers: {
          location: target,
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        },
      });
    },
    async complete(
      input: unknown,
      context: AccountRequestContext,
      auth: IssuedAccountActor | null,
    ) {
      if (!exactObject(input, ['flowToken', 'eligibilityPermit'])) throw new AccountIssuerError();
      const hash = digest('flow', token(input.flowToken));
      const row = await sqlTransaction(database, async (connection) => {
        const found = (
          await connection.query(
            'delete from cpi_private.account_mobile_identity where token_hash=$1 and country=$2 and family_id is not distinct from $3::uuid and expires_at>$4 and response_encrypted is not null returning *',
            [hash, context.country, auth?.familyId ?? null, now()],
          )
        ).rows[0];
        if (!found) throw new AccountIssuerError(410);
        return found;
      });
      const opened = crypto.open(String(row.request_encrypted), 'mobile-request:' + hash);
      const response = crypto.open(String(row.response_encrypted), 'mobile-response:' + hash);
      if (!isObject(opened) || !isObject(response)) throw new AccountIssuerError();
      if (response.error) return { status: 'cancelled' };
      return issuer.completeIdentity(
        {
          schemaVersion: 5,
          provider: row.provider,
          nonce: opened.nonce,
          eligibilityPermit: input.eligibilityPermit,
          credential:
            row.provider === 'google'
              ? { code: response.code, verifier: opened.verifier }
              : { identityToken: response.id_token, code: response.code },
        },
        context,
        auth,
      );
    },
    async maintenance() {
      await sqlTransaction(database, async (connection) => {
        await connection.query(
          'delete from cpi_private.account_mobile_identity where expires_at<$1',
          [now()],
        );
      });
    },
  };
}
