// Cloudflare Worker. Deploy separately from the game; no credentials are ever bundled into the client.
import { webIdentityCallback } from './web-identity-callback.mjs';
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, text) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Gateway unavailable');
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret.match(/../g), (b) => parseInt(b, 16)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}
export default {
  async scheduled(_event, env, ctx) {
    const target = new URL(env.CPI_EDGE_URL);
    if (
      target.protocol !== 'https:' ||
      !/^[a-z]{20}\.supabase\.co$/.test(target.hostname) ||
      target.pathname !== '/functions/v1/cpi-live' ||
      target.search ||
      target.hash ||
      target.username ||
      target.password
    )
      throw new Error('Invalid scheduled gateway target');
    ctx.waitUntil(
      fetch(target.href + '/_worker', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.CPI_WORKER_KEY },
        redirect: 'manual',
        signal: AbortSignal.timeout(120000),
      }).then(async (response) => {
        await response.body?.cancel();
        if (!response.ok) throw new Error('Crystal Path maintenance needs attention');
      }),
    );
  },
  async fetch(request, env) {
    try {
      const callback = await webIdentityCallback(request);
      if (callback) return callback;
      const incoming = new URL(request.url),
        base = '/cpi';
      if (
        !incoming.pathname.startsWith(base + '/') ||
        !['GET', 'POST', 'OPTIONS'].includes(request.method)
      )
        return new Response(null, { status: 404 });
      const route = incoming.pathname.slice(base.length) + incoming.search;
      // Only the fixed edge function, never a request-selected destination.
      const upstream = new URL(env.CPI_EDGE_URL);
      if (
        upstream.protocol !== 'https:' ||
        !/^[a-z]{20}\.supabase\.co$/.test(upstream.hostname) ||
        upstream.pathname !== '/functions/v1/cpi-live' ||
        upstream.search ||
        upstream.hash ||
        upstream.username ||
        upstream.password
      )
        throw new Error('Gateway unavailable');
      const reader = request.body?.getReader(),
        chunks = [];
      let length = 0;
      if (reader)
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > 80_000) return new Response(null, { status: 413 });
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      const body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      const country =
        typeof request.cf?.country === 'string' && /^[A-Z]{2}$/.test(request.cf.country)
          ? request.cf.country
          : 'XX';
      const address = request.headers.get('cf-connecting-ip');
      if (!address) throw new Error('Gateway unavailable');
      // Separate key domains. The raw peer address never reaches the application database.
      const peer = await hmac(env.CPI_GATEWAY_KEY, 'peer\0' + address),
        time = String(Date.now());
      const signature = await hmac(
        env.CPI_GATEWAY_KEY,
        [
          request.method,
          route,
          time,
          country,
          peer,
          hex(await crypto.subtle.digest('SHA-256', body)),
        ].join('\n'),
      );
      const headers = new Headers();
      for (const name of [
        'authorization',
        'content-type',
        'origin',
        'access-control-request-method',
        'access-control-request-headers',
      ]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      if (request.headers.has('cookie') || request.headers.has('content-encoding'))
        return new Response(null, { status: 400 });
      headers.set('x-cpi-time', time);
      headers.set('x-cpi-country', country);
      headers.set('x-cpi-peer', peer);
      headers.set('x-cpi-route', route);
      headers.set('x-cpi-signature', signature);
      return await fetch(upstream.origin + upstream.pathname + route, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? body : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      return new Response('{"code":"service_unavailable"}', {
        status: 503,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
  },
};
