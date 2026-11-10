import type { AccountIssuer } from './account-issuer.ts';
import { AccountIssuerError } from './account-issuer.ts';
import type { AccountRequestContext } from './account-policy.ts';
import { exactObject, privateJson } from './private-services.ts';
import { createMountedPath } from './server-route.ts';

export function createAccountIssuerHandler(options: {
  issuer: AccountIssuer;
  basePath: string;
  context: (request: Request) => Promise<AccountRequestContext | null>;
  allowOrigin: (origin: string | null) => boolean;
}) {
  const mounted = createMountedPath(options.basePath);
  return async (request: Request) => {
    const origin = request.headers.get('origin');
    const allowed = options.allowOrigin(origin);
    const reply = (value: unknown, status = 200) =>
      new Response(status === 204 ? null : JSON.stringify(value), {
        status,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          vary: 'Origin',
          ...(allowed && origin ? { 'access-control-allow-origin': origin } : {}),
          ...(status === 204
            ? {
                'access-control-allow-methods': 'POST',
                'access-control-allow-headers': 'Authorization, Content-Type',
              }
            : {}),
        },
      });
    try {
      const url = new URL(request.url),
        path = mounted(url.pathname);
      if (!allowed) return reply({ code: 'origin_denied' }, 403);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        request.headers.has('cookie')
      )
        return reply({ code: 'invalid_request' }, 400);
      if (
        !path ||
        !/^\/(eligibility|otp\/(request|verify)|identity\/(begin|complete|signup|link\/(request|verify))|session\/(exchange|refresh|revoke)|reauth\/(request|verify|proof))$/.test(
          path,
        )
      )
        return reply({ code: 'not_found' }, 404);
      if (request.method === 'OPTIONS') return reply(null, 204);
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      const context = await options.context(request);
      if (!context) return reply({ code: 'service_unavailable' }, 503);
      const input = await privateJson(request, path === '/identity/complete' ? 12_288 : 8192);
      if (path === '/eligibility') return reply(await options.issuer.eligibility(input, context));
      if (path === '/otp/request') return reply(await options.issuer.requestCode(input, context));
      if (path === '/otp/verify') return reply(await options.issuer.verifyCode(input));
      if (path.startsWith('/identity/')) {
        const header = request.headers.get('authorization');
        if (path === '/identity/link/request' || path === '/identity/link/verify') {
          if (header) return reply({ code: 'invalid_request' }, 400);
          return reply(
            path.endsWith('/request')
              ? await options.issuer.requestProviderLinkCode(input, context)
              : await options.issuer.verifyProviderLinkCode(input, context),
          );
        }
        if (path === '/identity/signup') {
          if (header) return reply({ code: 'invalid_request' }, 400);
          return reply(await options.issuer.signupIdentity(input, context));
        }
        const bearer = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        const auth = bearer ? await options.issuer.authenticate(bearer) : null;
        if (header && !auth) return reply({ code: 'account_required' }, 401);
        return reply(
          path === '/identity/begin'
            ? await options.issuer.beginIdentity(input, context, auth)
            : await options.issuer.completeIdentity(input, context, auth),
        );
      }
      if (path.startsWith('/reauth/')) {
        const bearer = request.headers
          .get('authorization')
          ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        const auth = bearer ? await options.issuer.authenticate(bearer) : null;
        if (!auth) return reply({ code: 'account_required' }, 401);
        if (path === '/reauth/request')
          return reply(await options.issuer.requestCode(input, context, auth));
        if (path === '/reauth/verify') return reply(await options.issuer.verifyCode(input, auth));
        return reply(await options.issuer.reauthProof(auth, input));
      }
      const field = path === '/session/exchange' ? 'verifiedTicket' : 'refreshToken';
      if (!exactObject(input, ['schemaVersion', field]) || input.schemaVersion !== 1)
        return reply({ code: 'invalid_request' }, 400);
      if (path === '/session/exchange') return reply(await options.issuer.exchange(input[field]));
      if (path === '/session/refresh') return reply(await options.issuer.refresh(input[field]));
      return reply(await options.issuer.revoke(input[field]));
    } catch (error) {
      const status = error instanceof AccountIssuerError ? error.status : 503;
      return reply(
        {
          code:
            status === 429
              ? 'rate_limited'
              : status === 410
                ? 'expired'
                : status === 401
                  ? 'invalid_code'
                  : 'service_unavailable',
        },
        status,
      );
    }
  };
}
