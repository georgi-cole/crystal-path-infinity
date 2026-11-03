import type { SqlPool } from './database.ts';

export interface VerifiedAccount {
  readonly subject: string;
  /** Fresh trusted privacy/account authorization, including revocation checks. */
  readonly profileAllowed: boolean;
}
export interface ProfileApiOptions {
  readonly database: SqlPool;
  readonly authenticate: (accessToken: string) => Promise<VerifiedAccount | null>;
  readonly allowOrigin: (origin: string | null) => boolean;
  /** Durable server limiter; never a client cooldown or a process-local counter. */
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
}
const bands = new Set([
  'under_13',
  '13_15',
  '16_17',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_64',
  '65_plus',
]);
const errors = new Set([
  'CPI_PROFILE_USERNAME_INVALID',
  'CPI_PROFILE_USERNAME_RESERVED',
  'CPI_PROFILE_USERNAME_TAKEN',
  'CPI_PROFILE_COUNTRY_UNSUPPORTED',
  'CPI_PROFILE_COUNTRY_COOLDOWN',
  'CPI_PROFILE_ANALYTICS_NOT_ALLOWED',
  'CPI_PROFILE_BAND_INVALID',
]);
function object(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * Framework-independent server route. It cannot register users or mint eligibility.
 * Host MUST inject trusted token verification, policy checks and a durable limiter.
 */
export function createProfileHandler(options: ProfileApiOptions) {
  return async (request: Request): Promise<Response> => {
    let connection: Awaited<ReturnType<SqlPool['connect']>> | null = null;
    let began = false;
    let beginning = false;
    let committing = false;
    let broken: Error | undefined;
    const origin = request.headers.get('origin');
    function reply(body: unknown, status = 200): Response {
      const response = jsonReply(body, status);
      if (origin && options.allowOrigin(origin)) {
        response.headers.set('access-control-allow-origin', origin);
        response.headers.set('vary', 'Origin');
      }
      return response;
    }
    try {
      if (!options.allowOrigin(request.headers.get('origin')))
        return reply({ code: 'origin_denied' }, 403);
      if (request.method === 'OPTIONS') {
        const response = reply({}, 200);
        response.headers.set('access-control-allow-methods', 'POST');
        response.headers.set('access-control-allow-headers', 'authorization, content-type');
        return response;
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      const endpoint = new URL(request.url).pathname.split('/').pop();
      if (endpoint !== 'read' && endpoint !== 'save') return reply({ code: 'not_found' }, 404);
      if (!(await options.rateLimit(request, null))) return reply({ code: 'rate_limited' }, 429);
      const header = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(header))
        return reply({ code: 'account_required' }, 401);
      const actor = await options.authenticate(header.slice(7));
      if (actor?.profileAllowed !== true || !/^[0-9a-f-]{36}$/i.test(actor.subject))
        return reply({ code: 'account_required' }, 401);
      if (!(await options.rateLimit(request, actor.subject)))
        return reply({ code: 'rate_limited' }, 429);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
        return reply({ code: 'invalid_request' }, 400);
      const reader = request.body?.getReader();
      if (!reader) return reply({ code: 'invalid_request' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return reply({ code: 'invalid_request' }, 400);
        }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder().decode(bytes);
      let input: unknown;
      try {
        input = JSON.parse(text);
      } catch {
        return reply({ code: 'invalid_request' }, 400);
      }
      if (!object(input) || input.schemaVersion !== 1)
        return reply({ code: 'invalid_request' }, 400);
      const allowed =
        endpoint === 'read'
          ? ['schemaVersion']
          : ['schemaVersion', 'username', 'countryCode', 'analyticsAction', 'analyticsAgeBand'];
      if (
        Object.keys(input).length !== allowed.length ||
        Object.keys(input).some((key) => !allowed.includes(key))
      )
        return reply({ code: 'invalid_request' }, 400);
      if (
        endpoint === 'save' &&
        (typeof input.username !== 'string' ||
          input.username.length > 96 ||
          (input.countryCode !== null &&
            (typeof input.countryCode !== 'string' || !/^[A-Z]{2}$/.test(input.countryCode))) ||
          typeof input.analyticsAction !== 'string' ||
          !['keep', 'answer', 'withdraw'].includes(input.analyticsAction) ||
          (input.analyticsAction === 'answer'
            ? typeof input.analyticsAgeBand !== 'string' || !bands.has(input.analyticsAgeBand)
            : input.analyticsAgeBand !== null))
      )
        return reply({ code: 'invalid_request' }, 400);
      connection = await options.database.connect();
      beginning = true;
      await connection.query('begin');
      beginning = false;
      began = true;
      // The FK checks account existence; owner lock serializes profile/start edits.
      // A private mapping alone never publishes a profile or grants analytics.
      await connection.query(
        'insert into cpi_private.profile_owners(user_id) values($1::uuid) on conflict(user_id) do nothing',
        [actor.subject],
      );
      const account = await connection.query(
        'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
        [actor.subject],
      );
      if (account.rows.length !== 1) {
        await connection.query('rollback');
        began = false;
        return reply({ code: 'account_required' }, 401);
      }
      if (endpoint === 'save')
        await connection.query(
          'select cpi_private.save_profile($1::uuid,$2::text,$3::text,$4::text,$5::text)',
          [
            actor.subject,
            input.username,
            input.countryCode,
            input.analyticsAction === 'answer' ? 'set' : input.analyticsAction,
            input.analyticsAgeBand,
          ],
        );
      const result = await connection.query(
        `select cpi_private.get_profile_config() as config,
        coalesce(cpi_private.get_profile_owner($1::uuid), jsonb_build_object('profile',null,'analyticsAgeBand',null,
        'ageResponseAt',null,'analyticsAllowed',false,'countryChangeAvailableAt',null)) as owner`,
        [actor.subject],
      );
      committing = true;
      await connection.query('commit');
      committing = false;
      began = false;
      return reply(result.rows[0]);
    } catch (error) {
      if (beginning || committing) broken = new Error('Profile transaction outcome uncertain');
      if (connection && began) {
        try {
          await connection.query('rollback');
        } catch {
          broken = new Error('Profile transaction rollback failed');
        }
      }
      const code =
        error instanceof Error && errors.has(error.message) ? error.message : 'service_unavailable';
      return reply({ code }, code === 'service_unavailable' ? 503 : 409);
    } finally {
      connection?.release(broken);
    }
  };
}
