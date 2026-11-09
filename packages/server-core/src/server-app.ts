import { createMountedPath } from './server-route.ts';
import { withOperationMetrics } from './operations-metrics.ts';
import type { OperationEndpoint, OperationsMetrics } from './operations-metrics.ts';

export type ServerHandler = (request: Request) => Promise<Response>;
export interface MvpServerHandlers {
  readonly profile?: ServerHandler;
  readonly ranked?: ServerHandler;
  readonly pendingRuns?: ServerHandler;
  readonly leaderboard?: ServerHandler;
  readonly account?: ServerHandler;
  readonly moderation?: ServerHandler;
  readonly rewards?: ServerHandler;
  readonly operations?: ServerHandler;
  readonly commerce?: ServerHandler;
  /** Requires the separately approved jurisdiction/guardian/OTP/session issuer. */
  readonly approvedAccountIssuer?: ServerHandler;
}
export interface MvpServerOptions {
  readonly basePath?: string;
  readonly handlers: MvpServerHandlers;
  readonly metrics?: OperationsMetrics;
  /** Fixed server configuration, never a request-supplied metric dimension. */
  readonly rulesetVersion?: string;
}
interface Route {
  readonly handler: keyof MvpServerHandlers;
  readonly metric: OperationEndpoint | null;
}
const routes: Readonly<Record<string, Route>> = {
  '/profile/read': { handler: 'profile', metric: 'profile_read' },
  '/profile/save': { handler: 'profile', metric: 'profile_save' },
  '/ranked/start': { handler: 'ranked', metric: 'ranked_start' },
  '/ranked/action': { handler: 'ranked', metric: 'ranked_action' },
  '/ranked/active': { handler: 'ranked', metric: 'ranked_active' },
  '/ranked/recover': { handler: 'ranked', metric: 'ranked_recover' },
  '/ranked/archive': { handler: 'pendingRuns', metric: 'ranked_archive' },
  '/ranked/saved': { handler: 'pendingRuns', metric: 'ranked_saved' },
  '/leaderboard/read': { handler: 'leaderboard', metric: 'leaderboard_read' },
  '/account/export': { handler: 'account', metric: 'account_export' },
  '/account/delete': { handler: 'account', metric: 'account_delete' },
  '/account/status': { handler: 'account', metric: 'account_status' },
  '/moderation/report': { handler: 'moderation', metric: 'name_report' },
  '/moderation/queue': { handler: 'moderation', metric: 'moderation_queue' },
  '/moderation/review': { handler: 'moderation', metric: 'moderation_review' },
  '/rewards/eligibility': { handler: 'rewards', metric: 'reward_eligibility' },
  '/rewards/intent': { handler: 'rewards', metric: 'reward_intent' },
  '/rewards/status': { handler: 'rewards', metric: 'reward_status' },
  '/rewards/apply': { handler: 'rewards', metric: 'reward_apply' },
  '/rewards/ssv': { handler: 'rewards', metric: 'reward_ssv' },
  '/operations/status': { handler: 'operations', metric: 'operations_status' },
  '/eligibility': { handler: 'approvedAccountIssuer', metric: null },
  '/otp/request': { handler: 'approvedAccountIssuer', metric: null },
  '/otp/verify': { handler: 'approvedAccountIssuer', metric: null },
  '/identity/begin': { handler: 'approvedAccountIssuer', metric: null },
  '/identity/complete': { handler: 'approvedAccountIssuer', metric: null },
  '/identity/signup': { handler: 'approvedAccountIssuer', metric: null },
  '/session/exchange': { handler: 'approvedAccountIssuer', metric: null },
  '/session/refresh': { handler: 'approvedAccountIssuer', metric: null },
  '/session/revoke': { handler: 'approvedAccountIssuer', metric: null },
  '/reauth/request': { handler: 'approvedAccountIssuer', metric: null },
  '/reauth/verify': { handler: 'approvedAccountIssuer', metric: null },
  '/reauth/proof': { handler: 'approvedAccountIssuer', metric: null },
  '/commerce/catalog': { handler: 'commerce', metric: null },
  '/commerce/wallet': { handler: 'commerce', metric: null },
  '/commerce/begin': { handler: 'commerce', metric: null },
  '/commerce/verify': { handler: 'commerce', metric: null },
  '/commerce/equip': { handler: 'commerce', metric: null },
};
function unavailable(code: string, status: number) {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Fixed host router. It starts no listener, proxies no URL and invents no account issuer. */
export function createMvpServer(options: MvpServerOptions): ServerHandler {
  const mounted = createMountedPath(options.basePath);
  if (
    options.rulesetVersion !== undefined &&
    !/^[A-Za-z0-9._-]{1,80}$/.test(options.rulesetVersion)
  )
    throw new TypeError('Invalid server ruleset');
  return async (request) => {
    let result: Response | null = null;
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        return unavailable('invalid_request', 400);
      const path = mounted(url.pathname);
      const route = path === null ? undefined : routes[path];
      if (!route) return unavailable('not_found', 404);
      // Only the signed provider callback accepts query data. Never rewrite or
      // reconstruct its Request: signature validation needs the original bytes.
      if (url.search && path !== '/rewards/ssv') return unavailable('invalid_request', 400);
      const handler = options.handlers[route.handler];
      if (!handler) return unavailable('service_unavailable', 503);
      const run = async () => {
        result = await handler(request);
        return result;
      };
      return options.metrics && route.metric
        ? await withOperationMetrics(
            options.metrics,
            route.metric,
            options.rulesetVersion ?? null,
            run,
          )
        : await run();
    } catch {
      // A diagnostics failure after a successful operation cannot erase its
      // response or cause a committed reward/recovery to be reported as failed.
      return result ?? unavailable('service_unavailable', 503);
    }
  };
}
