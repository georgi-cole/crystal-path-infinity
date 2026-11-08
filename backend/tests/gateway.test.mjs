import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../gateway/worker.mjs';
import { verifyGatewayRequest } from '../../packages/server-core/src/trusted-gateway.ts';
const env = {
  CPI_EDGE_URL: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/cpi-live',
  CPI_GATEWAY_KEY: '7'.repeat(64),
  CPI_WORKER_KEY: '8'.repeat(64),
};
test('scheduled maintenance uses manual redirects and rejects redirect responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, env.CPI_EDGE_URL + '/_worker');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + env.CPI_WORKER_KEY);
    return Response.redirect('https://other.example/', 307);
  });
  let maintenance;
  await worker.scheduled({}, env, {
    waitUntil(pending) {
      maintenance = pending;
    },
  });
  assert.ok(maintenance);
  await assert.rejects(maintenance, /Crystal Path maintenance needs attention/);
});
test('gateway signs trusted country/peer, preserves raw bodies, and discards forged context headers', async () => {
  const original = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, init) => {
    forwarded = new Request(url, init);
    return new Response('{}');
  };
  try {
    const request = new Request('https://api.example/cpi/eligibility', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '192.0.2.1',
        'x-cpi-country': 'US',
        'x-cpi-peer': 'forged',
        'x-cpi-signature': 'forged',
      },
      body: '{"schemaVersion":2,"country":"BG","age":24,"platform":"android","clientBuild":1}',
    });
    Object.defineProperty(request, 'cf', { value: { country: 'BG' } });
    assert.equal((await worker.fetch(request, env)).status, 200);
    const context = await verifyGatewayRequest(forwarded, env.CPI_GATEWAY_KEY);
    assert.equal(context.country, 'BG');
    assert.match(context.rateKey, /^[a-f0-9]{64}$/);
    assert.equal(forwarded.headers.get('cf-connecting-ip'), null);
    const altered = new Request(forwarded.url, {
      method: 'POST',
      headers: forwarded.headers,
      body: '{}',
    });
    assert.equal(await verifyGatewayRequest(altered, env.CPI_GATEWAY_KEY), null);
  } finally {
    globalThis.fetch = original;
  }
});
test('gateway preserves encoded SSV query bytes', async () => {
  const original = globalThis.fetch;
  let target;
  globalThis.fetch = (url) => {
    target = String(url);
    return Promise.resolve(new Response('{}'));
  };
  try {
    const request = new Request(
      'https://api.example/cpi/rewards/ssv?custom_data=a%2Bb&signature=x%3D&key_id=1',
      { headers: { 'cf-connecting-ip': '192.0.2.2' } },
    );
    Object.defineProperty(request, 'cf', { value: { country: 'BG' } });
    await worker.fetch(request, env);
    assert.ok(target.endsWith('?custom_data=a%2Bb&signature=x%3D&key_id=1'));
  } finally {
    globalThis.fetch = original;
  }
});
test('gateway rejects oversized bodies and missing peer metadata', async () => {
  assert.equal(
    (
      await worker.fetch(
        new Request('https://api.example/cpi/eligibility', {
          method: 'POST',
          body: 'x'.repeat(80_001),
        }),
        env,
      )
    ).status,
    413,
  );
  assert.equal(
    (await worker.fetch(new Request('https://api.example/cpi/eligibility'), env)).status,
    503,
  );
});
