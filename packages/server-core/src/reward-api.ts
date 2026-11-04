import { createMountedPath } from './server-route.ts';
import { RewardError } from './reward-ssv.ts';
import type { RewardActor, RewardService } from './reward-service.ts';
import { OperationsPolicyError, operationsHttpStatus } from './operations-policy.ts';

export interface RewardApiOptions {
  readonly basePath?: string;
  readonly service: Pick<
    RewardService,
    'eligibility' | 'intent' | 'status' | 'apply' | 'receiveGoogleSsv'
  >;
  readonly authenticate: (
    token: string,
  ) => Promise<(RewardActor & { rewardsAllowed: boolean }) | null>;
  readonly allowOrigin: (origin: string | null) => boolean;
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
}
const PUBLIC_ERRORS = new Set([
  'invalid-reward-request',
  'invalid-reward-authentication',
  'reward-account-unavailable',
  'reward-run-unavailable',
  'reward-not-offered',
  'reward-already-pending',
  'reward-privacy-unavailable',
  'reward-idempotency-conflict',
  'reward-lease-lost',
  'reward-lease-expired',
  'reward-sequence-conflict',
  'reward-grant-unavailable',
  'reward-state-conflict',
  'invalid-ssv',
  'invalid-ssv-signature',
  'unknown-ssv-key',
  'reward-intent-unavailable',
  'reward-contract-mismatch',
  'reward-invalid-timestamp',
  'reward-transaction-conflict',
]);
function reply(value: unknown, status: number, origin: string | null) {
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
  return new Response(JSON.stringify(value), { status, headers });
}
async function body(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
    request.headers.has('content-encoding')
  )
    throw new RewardError('invalid-reward-request');
  const reader = request.body?.getReader();
  if (!reader) throw new RewardError('invalid-reward-request');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let text = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new RewardError('invalid-reward-request');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch {
    throw new RewardError('invalid-reward-request');
  } finally {
    reader.releaseLock();
  }
}

/** No host, ad unit, consent issuer, SDK or auth verifier is configured by this handler. */
export function createRewardHandler(options: RewardApiOptions) {
  const mount = createMountedPath(options.basePath);
  return async (request: Request): Promise<Response> => {
    let allowedOrigin: string | null = null;
    try {
      const url = new URL(request.url);
      const route = /^\/rewards\/(eligibility|intent|status|apply|ssv)$/.exec(
        mount(url.pathname) ?? '',
      )?.[1];
      if (!route) return reply({ code: 'not_found' }, 404, null);
      if (url.protocol !== 'https:' || url.hash)
        return reply({ code: 'invalid_request' }, 400, null);
      if (route === 'ssv') {
        if (request.method !== 'GET') return reply({ code: 'method_not_allowed' }, 405, null);
        if (!(await options.rateLimit(request, null)))
          return reply({ code: 'rate_limited' }, 429, null);
        const start = request.url.indexOf('?');
        if (start < 0) throw new RewardError('invalid-ssv');
        const verified = await options.service.receiveGoogleSsv(request.url.slice(start + 1));
        return reply(verified, 200, null);
      }
      const origin = request.headers.get('origin');
      if (!options.allowOrigin(origin)) return reply({ code: 'origin_denied' }, 403, null);
      allowedOrigin = origin;
      if (url.search) return reply({ code: 'invalid_request' }, 400, allowedOrigin);
      if (request.method === 'OPTIONS') {
        const headers = (request.headers.get('access-control-request-headers') ?? '')
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        if (
          request.headers.get('access-control-request-method') !== 'POST' ||
          headers.some((value) => value !== 'authorization' && value !== 'content-type')
        )
          return reply({ code: 'method_not_allowed' }, 405, allowedOrigin);
        return reply(null, 204, allowedOrigin);
      }
      if (request.method !== 'POST')
        return reply({ code: 'method_not_allowed' }, 405, allowedOrigin);
      if (!(await options.rateLimit(request, null)))
        return reply({ code: 'rate_limited' }, 429, allowedOrigin);
      const bearer = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(bearer))
        return reply({ code: 'account_required' }, 401, allowedOrigin);
      const actor = await options.authenticate(bearer.slice(7));
      if (actor?.rewardsAllowed !== true)
        return reply({ code: 'account_required' }, 401, allowedOrigin);
      if (!(await options.rateLimit(request, actor.subject)))
        return reply({ code: 'rate_limited' }, 429, allowedOrigin);
      const input = await body(request);
      const result =
        route === 'eligibility'
          ? await options.service.eligibility(actor, input)
          : route === 'intent'
            ? await options.service.intent(actor, input)
            : route === 'status'
              ? await options.service.status(actor, input)
              : await options.service.apply(actor, input);
      return reply(result, 200, allowedOrigin);
    } catch (error) {
      if (error instanceof OperationsPolicyError)
        return reply({ code: error.code }, operationsHttpStatus(error), allowedOrigin);
      const code =
        error instanceof RewardError && PUBLIC_ERRORS.has(error.code)
          ? error.code
          : 'service_unavailable';
      const status =
        code === 'service_unavailable'
          ? 503
          : code === 'invalid-ssv-signature'
            ? 403
            : code === 'invalid-ssv' || code === 'invalid-reward-request'
              ? 400
              : 409;
      return reply({ code }, status, allowedOrigin);
    }
  };
}
