import { RankedError } from './ranked.ts';
import type { RankedApiOptions } from './ranked-api.ts';
import type { PendingRunsService } from './pending-runs.ts';
import { createMountedPath } from './server-route.ts';
export interface PendingRunsApiOptions {
  readonly basePath?: string;
  readonly service: Pick<PendingRunsService, 'archive' | 'saved'>;
  readonly authenticate: RankedApiOptions['authenticate'];
  readonly allowOrigin: (origin: string | null) => boolean;
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
}
const errors = new Set([
  'invalid-request',
  'invalid-authentication',
  'run-not-found',
  'run-archived',
  'archive-not-pending',
  'idempotency-conflict',
  'lease-lost',
  'lease-expired',
  'sequence-conflict',
]);
async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new RankedError('invalid-request');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new RankedError('invalid-request');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    throw new RankedError('invalid-request');
  } finally {
    reader.releaseLock();
  }
}
/** Strict account-only archive/discovery. Saving never finishes or forfeits a run. */
export function createPendingRunsHandler(options: PendingRunsApiOptions) {
  const path = createMountedPath(options.basePath);
  return async (request: Request): Promise<Response> => {
    let origin: string | null = null;
    const reply = (value: unknown, status = 200) => {
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        vary: 'Origin',
      });
      if (origin) headers.set('access-control-allow-origin', origin);
      return new Response(status === 204 ? null : JSON.stringify(value), { status, headers });
    };
    try {
      const candidate = request.headers.get('origin');
      if (!options.allowOrigin(candidate)) return reply({ code: 'origin_denied' }, 403);
      origin = candidate;
      const url = new URL(request.url);
      const route = /^\/ranked\/(archive|saved)$/.exec(path(url.pathname) ?? '')?.[1];
      if (url.protocol !== 'https:' || url.search || url.hash || !route)
        return reply({ code: 'not_found' }, 404);
      if (request.method === 'OPTIONS') {
        if (
          request.headers.get('access-control-request-method') !== 'POST' ||
          (request.headers.get('access-control-request-headers') ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .some((s) => s !== 'authorization' && s !== 'content-type')
        )
          return reply({ code: 'method_not_allowed' }, 405);
        const result = reply(null, 204);
        result.headers.set('access-control-allow-methods', 'POST, OPTIONS');
        result.headers.set('access-control-allow-headers', 'Authorization, Content-Type');
        return result;
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      if (!(await options.rateLimit(request, null))) return reply({ code: 'rate_limited' }, 429);
      const header = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(header))
        return reply({ code: 'account_required' }, 401);
      const account = await options.authenticate(header.slice(7));
      if (
        account?.rankedAllowed !== true ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          account.subject,
        ) ||
        !/^[A-Za-z0-9:_-]{1,120}$/.test(account.deviceId)
      )
        return reply({ code: 'account_required' }, 401);
      if (!(await options.rateLimit(request, account.subject)))
        return reply({ code: 'rate_limited' }, 429);
      if (
        request.signal.aborted ||
        request.headers.has('content-encoding') ||
        request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
      )
        return reply({ code: 'invalid_request' }, 400);
      const input = await body(request);
      return reply(
        route === 'archive'
          ? await options.service.archive(account, input)
          : await options.service.saved(account, input),
      );
    } catch (error) {
      const code =
        error instanceof RankedError && errors.has(error.code) ? error.code : 'service_unavailable';
      return reply(
        { code },
        code === 'service_unavailable'
          ? 503
          : code === 'invalid-request'
            ? 400
            : code === 'run-not-found'
              ? 404
              : 409,
      );
    }
  };
}
