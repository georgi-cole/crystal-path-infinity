import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../apple-receipt-verifier/worker.mjs';

const key = 'a'.repeat(64);
const env = { CPI_APPLE_VERIFIER_ENVIRONMENTS: 'production-and-review', CPI_APPLE_VERIFIER_KEY: key };
const request = (path, token = key, payload = { signedPayload: 'invalid-jws' }) =>
  new Request('https://verifier.example' + path, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

test('production helper hides unauthenticated and unknown paths, without weakening the staging route', async () => {
  for (const path of ['/transaction', '/production/other', '/sandbox/transaction?payload=forbidden'])
    assert.equal((await worker.fetch(request(path), env)).status, 404);
  assert.equal((await worker.fetch(request('/production/transaction', 'b'.repeat(64)), env)).status, 404);
  assert.equal((await worker.fetch(request('/production/transaction', ''), env)).status, 404);
  assert.equal((await worker.fetch(request('/production/transaction', key, {}), env)).status, 400);
  assert.equal((await worker.fetch(request('/production/transaction'), { CPI_APPLE_SANDBOX_VERIFIER_KEY: key })).status, 404);
});

test('both protected environments and legacy Sandbox reject unsigned transaction and notification payloads', async () => {
  for (const environment of ['production', 'sandbox']) {
    for (const kind of ['transaction', 'notification']) {
      const response = await worker.fetch(request('/' + environment + '/' + kind), env);
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { code: 'verification_failed' });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  assert.equal((await worker.fetch(request('/transaction'), { CPI_APPLE_SANDBOX_VERIFIER_KEY: key })).status, 422);
});
