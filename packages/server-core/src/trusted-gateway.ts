import { Buffer } from 'node:buffer';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AccountRequestContext } from './account-policy.ts';

/** Signed by our Worker from request.cf.country and the connecting peer; browser headers are never trusted. */
export async function verifyGatewayRequest(
  request: Request,
  secret: string,
  now = Date.now(),
): Promise<AccountRequestContext | null> {
  if (!/^[a-f0-9]{64}$/.test(secret)) return null;
  const timestamp = request.headers.get('x-cpi-time') ?? '',
    country = request.headers.get('x-cpi-country') ?? '',
    peer = request.headers.get('x-cpi-peer') ?? '',
    signature = request.headers.get('x-cpi-signature') ?? '';
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 60_000 ||
    !/^([A-Z]{2}|XX)$/.test(country) ||
    !/^[a-f0-9]{64}$/.test(peer) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null;
  const url = new URL(request.url);
  const bodyHash = createHash('sha256');
  if (request.method !== 'GET' && request.method !== 'OPTIONS') {
    const reader = request.clone().body?.getReader();
    let size = 0;
    if (reader)
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 80_000) {
            void reader.cancel().catch(() => undefined);
            return null;
          }
          bodyHash.update(part.value);
        }
      } finally {
        reader.releaseLock();
      }
  }
  // Mount-independent suffix is signed, so proxy and edge use identical bytes.
  const route = request.headers.get('x-cpi-route') ?? '';
  const routePath = route.split('?')[0];
  const routeSearch = route.includes('?') ? route.slice(route.indexOf('?')) : '';
  // Supabase's ingress can serialize provider query spaces as '+' instead of
  // '%20'. Mobile identity consumes decoded fields, so permit equivalent ordered
  // fields there while still authenticating the ORIGINAL Worker-signed bytes.
  // SSV and all other routes retain byte-for-byte query matching.
  const sameQuery =
    url.search === routeSearch ||
    (routePath === '/identity/mobile/callback' &&
      new URLSearchParams(url.search).toString() === new URLSearchParams(routeSearch).toString());
  if (!/^\/[a-z/]+(?:\?[^\r\n]*)?$/.test(route) || !url.pathname.endsWith(routePath) || !sameQuery)
    return null;
  const canonical = [request.method, route, timestamp, country, peer, bodyHash.digest('hex')].join(
    '\n',
  );
  const expected = createHmac('sha256', Buffer.from(secret, 'hex')).update(canonical).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
    ? { country: country === 'XX' ? null : country, rateKey: peer }
    : null;
}
