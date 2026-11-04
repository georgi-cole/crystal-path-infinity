import { createMvpServer } from './server-app.ts';
import type { MvpServerHandlers, ServerHandler } from './server-app.ts';
import type { SqlPool } from './database.ts';
import { createProfileHandler } from './profile-api.ts';
import { createLeaderboardHandler } from './leaderboard-api.ts';

export const EDGE_FUNCTION_NAME = 'cpi-api';
export const DEVELOPMENT_PROJECT = 'jbyguybxhezjhdbenevh';
export interface EdgeConfiguration {
  readonly projectUrl: string;
  readonly publishableKey: string;
  readonly origins: readonly string[];
}
type Environment = (name: string) => string | undefined;

/** This first deployment targets development only. No environment switch opens services. */
export function readEdgeConfiguration(env: Environment): EdgeConfiguration {
  const projectUrl = `https://${DEVELOPMENT_PROJECT}.supabase.co`;
  if (env('SUPABASE_URL') !== projectUrl) throw new Error('Invalid development target');
  // Keep the platform-provided key server-side; it is never a service-role credential.
  const publishableKey = env('SUPABASE_ANON_KEY') ?? '';
  if (!publishableKey || publishableKey.length > 8192 || /\s/.test(publishableKey))
    throw new Error('Missing public Auth key');
  if (env('CPI_ENABLE_ACCOUNTS') && env('CPI_ENABLE_ACCOUNTS') !== 'false')
    throw new Error('Account activation requires a reviewed issuer');
  if (env('CPI_ENABLE_ADS') && env('CPI_ENABLE_ADS') !== 'false')
    throw new Error('Ad activation requires a reviewed provider');
  const origins = (env('CPI_ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);
  if (origins.length > 8) throw new Error('Invalid origin configuration');
  for (const origin of origins) {
    if (origin === 'capacitor://localhost' || origin === 'http://localhost') continue;
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password)
      throw new Error('Invalid origin configuration');
  }
  return Object.freeze({ projectUrl, publishableKey, origins: Object.freeze(origins) });
}

async function boundedObject(response: Response): Promise<Record<string, unknown> | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  let content = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65536) {
        await reader.cancel();
        return null;
      }
      content += decoder.decode(chunk.value, { stream: true });
    }
    content += decoder.decode();
    const result: unknown = JSON.parse(content);
    return result !== null && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Auth verifies the token remotely. User metadata never supplies authorization. */
export function createSupabaseIdentityVerifier(
  config: EdgeConfiguration,
  fetcher: typeof fetch = fetch,
): (token: string) => Promise<string | null> {
  // Validate again at the network boundary, including directly constructed configurations.
  if (config.projectUrl !== `https://${DEVELOPMENT_PROJECT}.supabase.co`)
    throw new Error('Invalid development target');
  return async (token) => {
    if (!/^[\x21-\x7e]{16,8192}$/.test(token)) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(config.projectUrl + '/auth/v1/user', {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, apikey: config.publishableKey },
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const user = await boundedObject(response);
      return user &&
        typeof user.id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) &&
        user.role === 'authenticated' &&
        user.is_anonymous === false &&
        typeof user.email_confirmed_at === 'string' &&
        Number.isFinite(Date.parse(user.email_confirmed_at))
        ? user.id
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function reply(code: string, status: number, origin: string | null = null) {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  if (origin) headers.set('access-control-allow-origin', origin);
  return new Response(JSON.stringify({ code }), { status, headers });
}

/**
 * Supabase strips /functions/v1 before invoking the isolate. Accept both documented
 * gateway shapes. Credential queries and signed callbacks are not accepted here.
 * Runtime entry supplies no handlers until the independent issuer is approved.
 */
export function createSupabaseEdgeHandler(
  config: EdgeConfiguration,
  handlers: MvpServerHandlers | ((basePath: string) => MvpServerHandlers) = {},
): ServerHandler {
  const servers = new Map(
    [`/${EDGE_FUNCTION_NAME}`, `/functions/v1/${EDGE_FUNCTION_NAME}`].map((basePath) => [
      basePath,
      createMvpServer({
        basePath,
        handlers: typeof handlers === 'function' ? handlers(basePath) : handlers,
      }),
    ]),
  );
  return async (request) => {
    try {
      const url = new URL(request.url);
      const base = [...servers.keys()].find((path) => url.pathname.startsWith(path + '/'));
      if (!base) return reply('not_found', 404);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
        return reply('invalid_request', 400);
      const origin = request.headers.get('origin');
      if (origin !== null && !config.origins.includes(origin)) return reply('origin_denied', 403);
      if (request.headers.has('cookie')) return reply('invalid_request', 400);
      if (request.method === 'OPTIONS') {
        if (
          !origin ||
          request.headers.get('access-control-request-method') !== 'POST' ||
          (request.headers.get('access-control-request-headers') ?? '')
            .split(',')
            .map((header) => header.trim().toLowerCase())
            .filter(Boolean)
            .some((header) => !['authorization', 'content-type', 'apikey'].includes(header))
        )
          return reply('invalid_request', 400);
        const response = reply('preflight', 200, origin);
        response.headers.set('access-control-allow-methods', 'POST');
        response.headers.set('access-control-allow-headers', 'authorization, content-type, apikey');
        return response;
      }
      if (request.method !== 'POST') return reply('method_not_allowed', 405, origin);
      const server = servers.get(base)!;
      const response = await server(request);
      response.headers.set('cache-control', 'no-store');
      response.headers.set('vary', 'Origin');
      if (origin) response.headers.set('access-control-allow-origin', origin);
      return response;
    } catch {
      return reply('service_unavailable', 503);
    }
  };
}

export interface ApprovedEdgeServices {
  readonly database: SqlPool;
  readonly verifyIdentity: (token: string) => Promise<string | null>;
  /** Independent fresh privacy/account authorization AND session-family revocation check. */
  readonly authorize: (subject: string, token: string) => Promise<boolean>;
  /** Shared durable limiter, including pre-authentication and authenticated requests. */
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
  readonly allowedRulesets: readonly string[];
  readonly allowedMappingVersions: readonly string[];
}

/** The deployed entry has no activation seam and exposes no environment failure details. */
export function createLockedEdgeHandler(env: Environment): ServerHandler {
  try {
    return createSupabaseEdgeHandler(readEdgeConfiguration(env));
  } catch {
    return () => Promise.resolve(reply('service_unavailable', 503));
  }
}

/** Available for an approved host; the shipped Deno entry deliberately does not inject it. */
export function createApprovedEdgeServices(
  config: EdgeConfiguration,
  services: ApprovedEdgeServices,
) {
  const authenticate = async (token: string) => {
    const subject = await services.verifyIdentity(token);
    if (!subject || (await services.authorize(subject, token)) !== true) return null;
    return { subject, profileAllowed: true, leaderboardAllowed: true };
  };
  return (basePath: string): MvpServerHandlers => ({
    profile: createProfileHandler({
      database: services.database,
      authenticate,
      rateLimit: services.rateLimit,
      allowOrigin: (origin) => origin === null || config.origins.includes(origin),
    }),
    leaderboard: createLeaderboardHandler({
      database: services.database,
      basePath,
      authenticate,
      rateLimit: services.rateLimit,
      allowedRulesets: services.allowedRulesets,
      allowedMappingVersions: services.allowedMappingVersions,
      allowOrigin: (origin) => origin === null || config.origins.includes(origin),
      allowPublicRead: () => false,
    }),
  });
}
