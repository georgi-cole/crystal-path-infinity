import assert from 'node:assert/strict';
import test from 'node:test';
import { webIdentityCallback } from '../gateway/web-identity-callback.mjs';

test('OAuth callback sends bounded proofs only to the Pages origin with no storage or caching', async () => {
  const fields = new URLSearchParams({
    state: 'a'.repeat(43),
    code: 'provider-code',
    id_token: '</script><script>alert(1)</script>',
  });
  const response = await webIdentityCallback(
    new Request('https://crystalpath-api.kolequant.xyz/cpi/identity/web-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: fields,
    }),
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("'https://georgi-cole.github.io'"));
  assert.ok(!html.includes('</script><script>alert'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(response.headers.get('set-cookie'), null);
});
test('unrelated routes, malformed state, oversized proofs and wrong content types do not produce a callback page', async () => {
  assert.equal(await webIdentityCallback(new Request('https://api.example/other')), null);
  assert.equal(
    (
      await webIdentityCallback(
        new Request('https://api.example/cpi/identity/web-callback?state=wrong'),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await webIdentityCallback(
        new Request('https://api.example/cpi/identity/web-callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
      )
    ).status,
    415,
  );
});
