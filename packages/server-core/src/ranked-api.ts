import { RankedError } from './ranked.ts';
import type { RankedAuthority } from './ranked.ts';
import { createMountedPath } from './server-route.ts';
import { OperationsPolicyError, operationsHttpStatus } from './operations-policy.ts';

export interface VerifiedRankedAccount {
  readonly subject: string;
  /** Session/channel binding established by the trusted verifier, never the body. */
  readonly deviceId: string;
  /** Server-bound verified client build, never copied from a JSON body/header. */
  readonly clientBuild: number;
  /** Fresh server policy/privacy/account authorization, including revocation checks. */
  readonly rankedAllowed: boolean;
}

export interface RankedApiOptions {
  readonly basePath?: string;
  readonly authority: Pick<RankedAuthority, 'start' | 'execute' | 'recover' | 'active'>;
  readonly authenticate: (accessToken: string) => Promise<VerifiedRankedAccount | null>;
  readonly allowOrigin: (origin: string | null) => boolean;
  /** Shared durable limits must cover both pre-authentication and per-account traffic. */
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
}

const MAX_BODY_BYTES = 4096;
const PUBLIC_ERRORS = new Set([
  'invalid-request',
  'invalid-authentication',
  'active-run-exists',
  'run-not-found',
  'run-finished',
  'run-archived',
  'idempotency-conflict',
  'lease-lost',
  'lease-expired',
  'sequence-conflict',
  'recovery-required',
  'run-paused',
  'action-too-fast',
  'takeover-required',
  'incompatible-ruleset',
  'profile-unavailable',
]);

function response(body: unknown, status: number, origin: string | null): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  if (origin !== null) headers.set('access-control-allow-origin', origin);
  if (status === 204) {
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'Authorization, Content-Type');
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
  ) {
    throw new RankedError('invalid-request');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RankedError('invalid-request');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RankedError('invalid-request');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch {
    throw new RankedError('invalid-request');
  } finally {
    reader.releaseLock();
  }
}

/** Framework-neutral trusted HTTP boundary. No token issuer or deployment is configured. */
export function createRankedHandler(options: RankedApiOptions) {
  const mountedPath = createMountedPath(options.basePath);
  return async (request: Request): Promise<Response> => {
    let allowedOrigin: string | null = null;
    try {
      const origin = request.headers.get('origin');
      if (!options.allowOrigin(origin)) return response({ code: 'origin_denied' }, 403, null);
      allowedOrigin = origin;
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '') {
        return response({ code: 'invalid_request' }, 400, allowedOrigin);
      }
      const route = /^\/ranked\/(start|action|recover|active)$/.exec(
        mountedPath(url.pathname) ?? '',
      )?.[1];
      if (!route) return response({ code: 'not_found' }, 404, allowedOrigin);
      if (request.method === 'OPTIONS') {
        const headers = (request.headers.get('access-control-request-headers') ?? '')
          .split(',')
          .map((header) => header.trim().toLowerCase())
          .filter(Boolean);
        if (
          request.headers.get('access-control-request-method') !== 'POST' ||
          headers.some((header) => header !== 'authorization' && header !== 'content-type')
        ) {
          return response({ code: 'method_not_allowed' }, 405, allowedOrigin);
        }
        return response(null, 204, allowedOrigin);
      }
      if (request.method !== 'POST')
        return response({ code: 'method_not_allowed' }, 405, allowedOrigin);
      if (!(await options.rateLimit(request, null)))
        return response({ code: 'rate_limited' }, 429, allowedOrigin);
      const authorization = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(authorization))
        return response({ code: 'account_required' }, 401, allowedOrigin);
      const account = await options.authenticate(authorization.slice(7));
      if (
        account?.rankedAllowed !== true ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          account.subject,
        ) ||
        !/^[a-zA-Z0-9:_-]{1,120}$/.test(account.deviceId)
      ) {
        return response({ code: 'account_required' }, 401, allowedOrigin);
      }
      if (!(await options.rateLimit(request, account.subject)))
        return response({ code: 'rate_limited' }, 429, allowedOrigin);
      if (
        request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
        request.headers.has('content-encoding')
      )
        return response({ code: 'invalid_request' }, 400, allowedOrigin);
      const body = await readBody(request);
      const actor = {
        subject: account.subject,
        deviceId: account.deviceId,
        clientBuild: account.clientBuild,
      };
      const result =
        route === 'start'
          ? await options.authority.start(actor, body)
          : route === 'action'
            ? await options.authority.execute(actor, body)
            : route === 'recover'
              ? await options.authority.recover(actor, body)
              : await options.authority.active(actor, body);
      return response(result, 200, allowedOrigin);
    } catch (error) {
      if (error instanceof OperationsPolicyError)
        return response({ code: error.code }, operationsHttpStatus(error), allowedOrigin);
      const code =
        error instanceof RankedError && PUBLIC_ERRORS.has(error.code)
          ? error.code
          : 'service_unavailable';
      const status =
        code === 'service_unavailable'
          ? 503
          : code === 'invalid-request'
            ? 400
            : code === 'invalid-authentication'
              ? 401
              : code === 'run-not-found'
                ? 404
                : 409;
      return response({ code }, status, allowedOrigin);
    }
  };
}
