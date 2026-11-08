import { createMountedPath } from './server-route.ts';
import { parsePurchaseProof } from './purchase-verification.ts';
import type { createCommerceService } from './commerce-service.ts';

export function createCommerceHandler(options: {
  basePath?: string;
  service: ReturnType<typeof createCommerceService>;
  authenticate(token: string): Promise<{ subject: string; purchasesAllowed: boolean } | null>;
  allowOrigin(origin: string | null): boolean;
  rateLimit(request: Request, subject: string | null): Promise<boolean>;
}) {
  const mount = createMountedPath(options.basePath);
  return async (request: Request): Promise<Response> => {
    let origin: string | null = null;
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          vary: 'Origin',
          ...(origin ? { 'access-control-allow-origin': origin } : {}),
        },
      });
    try {
      const url = new URL(request.url);
      const route = /^\/commerce\/(catalog|wallet|begin|verify|equip)$/.exec(
        mount(url.pathname) ?? '',
      )?.[1];
      if (!route) return reply({ code: 'not_found' }, 404);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        request.headers.has('cookie')
      )
        return reply({ code: 'invalid_request' }, 400);
      if (!options.allowOrigin(request.headers.get('origin')))
        return reply({ code: 'origin_denied' }, 403);
      origin = request.headers.get('origin');
      if (request.method === 'OPTIONS') {
        const result = reply({});
        result.headers.set('access-control-allow-methods', 'POST');
        result.headers.set('access-control-allow-headers', 'Authorization, Content-Type');
        return result;
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      if (!(await options.rateLimit(request, null))) return reply({ code: 'rate_limited' }, 429);
      const header = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(header))
        return reply({ code: 'account_required' }, 401);
      const actor = await options.authenticate(header.slice(7));
      if (actor?.purchasesAllowed !== true) return reply({ code: 'account_required' }, 401);
      if (!(await options.rateLimit(request, actor.subject)))
        return reply({ code: 'rate_limited' }, 429);
      if (
        request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
        request.headers.has('content-encoding')
      )
        return reply({ code: 'invalid_request' }, 400);
      const reader = request.body?.getReader();
      if (!reader) return reply({ code: 'invalid_request' }, 400);
      let text = '',
        size = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 73728) return reply({ code: 'invalid_request' }, 400);
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const input: unknown = JSON.parse(text);
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return reply({ code: 'invalid_request' }, 400);
      const value = input as Record<string, unknown>;
      const extra =
        route === 'begin'
          ? 'key'
          : route === 'verify'
            ? 'proof'
            : route === 'equip'
              ? 'theme'
              : null;
      if (
        value.schemaVersion !== 1 ||
        (value.platform !== 'android' && value.platform !== 'ios') ||
        Object.keys(value).some(
          (key) => key !== 'schemaVersion' && key !== 'platform' && key !== extra,
        )
      )
        return reply({ code: 'invalid_request' }, 400);
      if (route === 'catalog')
        return reply({
          schemaVersion: 1,
          platform: value.platform,
          products: options.service.catalog(actor.subject, value.platform),
        });
      if (route === 'wallet')
        return reply({ schemaVersion: 1, wallet: await options.service.wallet(actor.subject) });
      if (route === 'begin' && typeof value.key === 'string')
        return reply({
          schemaVersion: 1,
          ...(await options.service.begin(actor.subject, value.platform, value.key)),
        });
      if (route === 'equip' && typeof value.theme === 'string')
        return reply({
          schemaVersion: 1,
          wallet: await options.service.equip(actor.subject, value.theme),
        });
      if (route === 'verify') {
        const proof = parsePurchaseProof(value.proof);
        if (!proof || proof.platform !== value.platform)
          return reply({ code: 'invalid_request' }, 400);
        return reply({ schemaVersion: 1, ...(await options.service.verify(actor.subject, proof)) });
      }
      return reply({ code: 'invalid_request' }, 400);
    } catch {
      // Provider errors may contain emails, tokens, receipts or keys. They never leave the server.
      return reply({ code: 'commerce_unavailable' }, 503);
    }
  };
}
