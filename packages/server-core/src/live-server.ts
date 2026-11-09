import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { LIVE_RULESET_VERSION, RULESET_VERSION } from '@crystal-path-infinity/game-core';
import type { SqlPool } from './database.ts';
import type { AccountIssuer } from './account-issuer.ts';
import type { AccountRequestContext } from './account-policy.ts';
import type { createCommerceService } from './commerce-service.ts';
import { createMvpServer } from './server-app.ts';
import { createAccountIssuerHandler } from './account-issuer-api.ts';
import { createAccountLifecycleHandler, processAccountDeletion } from './account-lifecycle.ts';
import { createProfileHandler } from './profile-api.ts';
import { createLeaderboardHandler } from './leaderboard-api.ts';
import { createRankedHandler } from './ranked-api.ts';
import { RankedAuthority } from './ranked.ts';
import type { RankedActor } from './ranked.ts';
import { PostgresRankedRepository } from './postgres-ranked.ts';
import { createPendingRunsHandler } from './pending-runs-api.ts';
import { PendingRunsService } from './pending-runs.ts';
import { createModerationHandler } from './moderation-api.ts';
import {
  createOperationsStatusHandler,
  OperationsPolicyError,
  operationsHttpStatus,
} from './operations-policy.ts';
import { createCommerceHandler } from './commerce-api.ts';
import { createResourceService } from './resource-service.ts';
import { createRewardHandler } from './reward-api.ts';
import { RewardService } from './reward-service.ts';
import { isObject, privateJson, sqlTransaction } from './private-services.ts';
import { verifyGatewayRequest } from './trusted-gateway.ts';
import { RankedError } from './ranked.ts';
import { SSV_CONSOLE_NONCE, verifySsvConsole } from './ssv-console.ts';
import { createGoogleRewardKeys } from './reward-ssv.ts';
import type { createPurchaseMaintenance } from './purchase-maintenance.ts';
import type {
  createApplePurchaseJobs,
  createGooglePurchaseJobs,
} from './purchase-provider-jobs.ts';

function reply(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
export interface LiveServerOptions {
  readonly database: SqlPool;
  readonly issuer: AccountIssuer;
  readonly environment: 'development' | 'staging' | 'production';
  readonly origins: readonly string[];
  readonly gatewayKey: string;
  readonly workerKey: string;
  readonly rateLimit: (key: string, maximum: number, windowMs: number) => Promise<boolean>;
  readonly rewardsEnabled: boolean;
  readonly purchasesEnabled: boolean;
  readonly purchasePlatforms: readonly ('android' | 'ios')[];
  readonly commerce: ReturnType<typeof createCommerceService>;
  readonly maintenance: ReturnType<typeof createPurchaseMaintenance>;
  readonly googleJobs?: ReturnType<typeof createGooglePurchaseJobs>;
  readonly appleJobs?: ReturnType<typeof createApplePurchaseJobs>;
}
/** Separate host. Raw Supabase sessions, client reward callbacks and client wallet totals authorize nothing. */
export function createLiveServer(options: LiveServerOptions) {
  const consoleKeys = createGoogleRewardKeys();
  const basePath = '/functions/v1/cpi-live',
    contexts = new WeakMap<Request, AccountRequestContext>();
  const allowOrigin = (origin: string | null) =>
    origin === null || options.origins.includes(origin);
  const rateLimit = (request: Request, subject: string | null) =>
    options.rateLimit(
      subject ? 'subject:' + subject : 'peer:' + (contexts.get(request)?.rateKey ?? 'provider'),
      subject ? 180 : 360,
      60_000,
    );
  const auth = options.issuer.authenticate;
  const authenticate = async (token: string) => {
    const actor = await auth(token);
    if (!actor) return null;
    const purchasePlatformAllowed =
      actor.platform !== 'web' && options.purchasePlatforms.includes(actor.platform);
    return {
      ...actor,
      profileAllowed: true,
      leaderboardAllowed: true,
      rankedAllowed: true,
      reportAllowed: true,
      purchasesAllowed: options.purchasesEnabled && purchasePlatformAllowed,
      rewardsAllowed: options.rewardsEnabled && actor.platform !== 'web',
    };
  };
  const repository = new PostgresRankedRepository(options.database);
  const authorities = new Map(
    [RULESET_VERSION, LIVE_RULESET_VERSION].map((rulesetVersion) => [
      rulesetVersion,
      new RankedAuthority({ repository, rulesetVersion }),
    ]),
  );
  async function authority(actor: RankedActor, body: unknown, active = false) {
    const row = await sqlTransaction(
      options.database,
      async (connection) =>
        (
          await connection.query(
            active
              ? "select ruleset_version from cpi_private.ranked_runs where user_id=$1::uuid and lease_active and status<>'finished'"
              : 'select ruleset_version from cpi_private.ranked_runs where user_id=$1::uuid and id=$2::uuid',
            active
              ? [actor.subject]
              : [
                  actor.subject,
                  isObject(body) &&
                  typeof body.runId === 'string' &&
                  /^[a-f0-9-]{36}$/.test(body.runId)
                    ? body.runId
                    : null,
                ],
          )
        ).rows[0],
    );
    const selected = authorities.get(
      typeof row?.ruleset_version === 'string' ? row.ruleset_version : LIVE_RULESET_VERSION,
    );
    if (!selected) throw new RankedError('incompatible-ruleset');
    return selected;
  }
  const ranked = createRankedHandler({
    basePath,
    authenticate,
    allowOrigin,
    rateLimit,
    authority: {
      start: (actor, body) => authorities.get(LIVE_RULESET_VERSION)!.start(actor, body),
      active: async (actor, body) => (await authority(actor, body, true)).active(actor, body),
      execute: async (actor, body) => (await authority(actor, body)).execute(actor, body),
      recover: async (actor, body) => (await authority(actor, body)).recover(actor, body),
    },
  });
  const rewardServices = {
    android: new RewardService({
      database: options.database,
      environment: options.environment,
      platform: 'android',
    }),
    ios: new RewardService({
      database: options.database,
      environment: options.environment,
      platform: 'ios',
    }),
  };
  const rewardHandlers = {
    android: createRewardHandler({
      basePath,
      service: rewardServices.android,
      authenticate,
      allowOrigin,
      rateLimit,
    }),
    ios: createRewardHandler({
      basePath,
      service: rewardServices.ios,
      authenticate,
      allowOrigin,
      rateLimit,
    }),
  };
  const resources = createResourceService({ database: options.database });
  const account = createAccountLifecycleHandler({
    database: options.database,
    authenticate,
    allowOrigin,
    rateLimit,
    verifyReauthentication: options.issuer.verifyReauthentication,
    revokeAllSessions: options.issuer.revokeAllSessions,
    includeCommerce: true,
  });
  const commerce = createCommerceHandler({
    basePath,
    service: options.commerce,
    authenticate,
    allowOrigin,
    rateLimit,
    checkoutReady: (platform) =>
      sqlTransaction(options.database, async (connection) => {
        const result = await connection.query(
          'select 1 from cpi_private.provider_sync where name=$1 and caught_up_at>$2 and (last_failure_at is null or last_failure_at<last_success_at)',
          [
            (platform === 'android' ? 'google.' : 'apple.') + options.environment,
            Date.now() - 2 * 3600_000,
          ],
        );
        return result.rows.length === 1;
      }),
  });
  const server = createMvpServer({
    basePath,
    rulesetVersion: LIVE_RULESET_VERSION,
    handlers: {
      profile: createProfileHandler({
        database: options.database,
        authenticate,
        allowOrigin,
        rateLimit,
      }),
      ranked,
      account,
      commerce,
      approvedAccountIssuer: createAccountIssuerHandler({
        issuer: options.issuer,
        basePath,
        allowOrigin,
        context: (request) => Promise.resolve(contexts.get(request) ?? null),
      }),
      pendingRuns: createPendingRunsHandler({
        basePath,
        service: new PendingRunsService({ database: options.database }),
        authenticate,
        allowOrigin,
        rateLimit,
      }),
      leaderboard: createLeaderboardHandler({
        basePath,
        database: options.database,
        authenticate,
        allowOrigin,
        rateLimit,
        allowPublicRead: () => false,
        allowedRulesets: [RULESET_VERSION, LIVE_RULESET_VERSION],
        allowedMappingVersions: ['cpi-regions-2026-11-v1'],
      }),
      moderation: createModerationHandler({
        basePath,
        database: options.database,
        authenticateReporter: authenticate,
        authenticateModerator: () => Promise.resolve(null),
        allowOrigin,
        rateLimit,
      }),
      operations: createOperationsStatusHandler({
        basePath,
        database: options.database,
        allowOrigin,
        allowPublicRead: () => true,
        rateLimit: (request) => rateLimit(request, null),
      }),
      rewards: async (request) => {
        const path = new URL(request.url).pathname;
        if (path.endsWith('/ssv')) {
          // Selection is untrusted; the chosen service still verifies Google's complete raw signature and immutable intent contract.
          const unit = new URL(request.url).searchParams.get('ad_unit');
          const platform = await sqlTransaction(
            options.database,
            async (connection) =>
              (
                await connection.query(
                  'select platform,ssv_ad_unit,reward_amount,reward_item,ad_networks from cpi_private.reward_sdk_configurations where ssv_ad_unit=$1 and environment=$2',
                  [unit, options.environment],
                )
              ).rows,
          );
          if (
            platform.length !== 1 ||
            (platform[0].platform !== 'android' && platform[0].platform !== 'ios')
          )
            return reply({ code: 'invalid_ssv' }, 400);
          if (new URL(request.url).searchParams.get('custom_data') === SSV_CONSOLE_NONCE) {
            const contract = platform[0],
              offset = request.url.indexOf('?');
            if (
              offset < 0 ||
              typeof contract.ssv_ad_unit !== 'string' ||
              typeof contract.reward_amount !== 'string' ||
              typeof contract.reward_item !== 'string' ||
              !Array.isArray(contract.ad_networks) ||
              contract.ad_networks.some((value) => typeof value !== 'string')
            )
              return reply({ code: 'invalid_ssv' }, 400);
            return reply(
              await verifySsvConsole(request.url.slice(offset + 1), consoleKeys, {
                unit: contract.ssv_ad_unit,
                amount: contract.reward_amount,
                item: contract.reward_item,
                networks: contract.ad_networks as string[],
              }),
            );
          }
          return rewardHandlers[platform[0].platform](request);
        }
        const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
        const actor = token ? await authenticate(token) : null;
        if (!actor || actor.platform === 'web' || !actor.rewardsAllowed)
          return reply({ code: 'account_required' }, 401);
        if (path.endsWith('/eligibility'))
          await sqlTransaction(options.database, async (connection) => {
            await connection.query(
              'select cpi_private.issue_launch_reward_authorization($1::uuid,$2,$3)',
              [actor.familyId, options.environment, contexts.get(request)?.country ?? null],
            );
          });
        return rewardHandlers[actor.platform](request);
      },
    },
  });
  async function worker() {
    const tasks: Record<string, unknown> = {},
      failures: string[] = [];
    const run = async (name: string, action: () => Promise<unknown>) => {
      try {
        tasks[name] = await action();
      } catch {
        failures.push(name);
      }
    };
    await run('mail', () => options.issuer.deliverMail(undefined, 2));
    await run('purchaseCompletion', options.maintenance.completePurchases);
    const end = Date.now(),
      start = end - 29 * 86400_000;
    if (options.googleJobs)
      await run('googleRefunds', () =>
        options.maintenance.synchronize(
          'google.' + options.environment,
          { start, end, page: null },
          options.googleJobs!.voidedPage,
        ),
      );
    if (options.appleJobs)
      await run('appleRefunds', () =>
        options.maintenance.synchronize(
          'apple.' + options.environment,
          { start, end, page: null },
          options.appleJobs!.historyPage,
        ),
      );
    await run('deletions', async () => {
      const rows = await sqlTransaction(
        options.database,
        async (connection) =>
          (
            await connection.query(
              'select request_id from cpi_private.account_deletion_requests order by requested_at limit 10',
            )
          ).rows,
      );
      for (const row of rows)
        await processAccountDeletion(
          { database: options.database, revokeAllSessions: options.issuer.revokeAllSessions },
          String(row.request_id),
        );
      return { processed: rows.length };
    });
    await run('cleanup', options.issuer.maintenance);
    return reply({ tasks, failures }, failures.length ? 503 : 200);
  }
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        return reply({ code: 'invalid_request' }, 400);
      if (url.pathname === basePath + '/_worker') {
        const key = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
        if (
          request.method !== 'POST' ||
          url.search ||
          key.length !== options.workerKey.length ||
          !timingSafeEqual(Buffer.from(key), Buffer.from(options.workerKey))
        )
          return reply({ code: 'not_found' }, 404);
        return worker();
      }
      if (url.pathname === basePath + '/commerce/apple-notifications') {
        if (!options.appleJobs || request.method !== 'POST' || url.search)
          return reply({ code: 'not_found' }, 404);
        if (!(await options.rateLimit('apple-callback', 10000, 60_000)))
          return reply({ code: 'rate_limited' }, 429);
        const body = await privateJson(request, 73_728);
        if (!isObject(body) || typeof body.signedPayload !== 'string')
          return reply({ code: 'invalid_request' }, 400);
        const event = await options.appleJobs.notification(body.signedPayload);
        if (event) await options.maintenance.refund(event, event.reverse === true);
        return reply({ status: 'received' });
      }
      if (!url.pathname.startsWith(basePath + '/')) return reply({ code: 'not_found' }, 404);
      const provider = url.pathname === basePath + '/rewards/ssv';
      if (!provider) {
        if (Number(request.headers.get('content-length') ?? 0) > 80_000)
          return reply({ code: 'invalid_request' }, 413);
        const context = await verifyGatewayRequest(request, options.gatewayKey);
        if (!context) return reply({ code: 'service_unavailable' }, 503);
        contexts.set(request, context);
      }
      if (!(await rateLimit(request, null))) return reply({ code: 'rate_limited' }, 429);
      if (!allowOrigin(request.headers.get('origin'))) return reply({ code: 'origin_denied' }, 403);
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('origin');
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-methods': 'GET, POST',
            'access-control-allow-headers': 'Authorization, Content-Type',
            ...(origin ? { 'access-control-allow-origin': origin } : {}),
            vary: 'Origin',
            'cache-control': 'no-store',
          },
        });
      }
      if (url.pathname === basePath + '/commerce/spend') {
        const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1],
          actor = token ? await authenticate(token) : null;
        if (request.method !== 'POST' || url.search || !actor?.purchasesAllowed)
          return reply({ code: 'account_required' }, 401);
        let response: Response;
        try {
          response = reply(await resources(actor, await privateJson(request)));
        } catch (error) {
          const codes = new Set([
            'invalid-request',
            'account-unavailable',
            'run-not-found',
            'lease-lost',
            'lease-expired',
            'sequence-conflict',
            'idempotency-conflict',
            'stale-resource-request',
            'resource-unavailable',
          ]);
          if (error instanceof OperationsPolicyError)
            response = reply({ code: error.code }, operationsHttpStatus(error));
          else {
            const code =
              error instanceof RankedError && codes.has(error.code)
                ? error.code
                : 'service_unavailable';
            response = reply(
              { code },
              code === 'service_unavailable'
                ? 503
                : code === 'invalid-request'
                  ? 400
                  : code === 'account-unavailable'
                    ? 401
                    : code === 'run-not-found'
                      ? 404
                      : 409,
            );
          }
        }
        const origin = request.headers.get('origin');
        if (origin) response.headers.set('access-control-allow-origin', origin);
        return response;
      }
      const response = await server(request);
      const origin = request.headers.get('origin');
      if (origin) response.headers.set('access-control-allow-origin', origin);
      return response;
    } catch {
      return reply({ code: 'service_unavailable' }, 503);
    }
  };
}
