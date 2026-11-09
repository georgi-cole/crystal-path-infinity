import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { APPLE_ROOT_G3 } from '../../packages/server-core/src/apple-root.ts';
import { privateJson, isObject } from '../../packages/server-core/src/private-services.ts';

let verifier;
const json = (payload, status) =>
  Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const kind = url.pathname;
    const token = request.headers.get('authorization') ?? '';
    const key = env.CPI_APPLE_SANDBOX_VERIFIER_KEY ?? '';
    if (
      request.method !== 'POST' ||
      url.search ||
      (kind !== '/transaction' && kind !== '/notification') ||
      !/^Bearer [a-f0-9]{64}$/.test(token) ||
      !/^[a-f0-9]{64}$/.test(key) ||
      !timingSafeEqual(Buffer.from(token.slice(7), 'hex'), Buffer.from(key, 'hex'))
    )
      return new Response(null, { status: 404 });

    let value;
    try {
      value = await privateJson(request, 65_600);
    } catch {
      return json({ code: 'invalid_request' }, 400);
    }
    if (
      !isObject(value) ||
      typeof value.signedPayload !== 'string' ||
      value.signedPayload.length > 65_536
    )
      return json({ code: 'invalid_request' }, 400);

    try {
      // jsrsasign initializes its random source at import time. Load it inside a request.
      const { SignedDataVerifier, Environment } = await import('@apple/app-store-server-library');
      verifier ??= new SignedDataVerifier(
        [APPLE_ROOT_G3],
        true,
        Environment.SANDBOX,
        'com.georgicole.crystalpath.infinity',
        6831790531,
      );
      const payload =
        kind === '/transaction'
          ? await verifier.verifyAndDecodeTransaction(value.signedPayload)
          : await verifier.verifyAndDecodeNotification(value.signedPayload);
      return json(payload, 200);
    } catch {
      return json({ code: 'verification_failed' }, 422);
    }
  },
};
