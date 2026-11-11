import assert from 'node:assert/strict';
import test from 'node:test';
import { pagesAccountBuildEnv } from './pages-account-config.mjs';

const publication = {
  CPI_PAGES_ACCOUNTS_ENABLED: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
};
const noRequest = () => assert.fail('An unapproved build must not contact the account gateway.');

test('account activation is opt-in and reserved for publication from main', async () => {
  assert.deepEqual(await pagesAccountBuildEnv({}, noRequest), {});
  for (const override of [
    { GITHUB_REF: 'refs/heads/codex/web-email-accounts' },
    { GITHUB_EVENT_NAME: 'pull_request' },
  ])
    await assert.rejects(
      pagesAccountBuildEnv({ ...publication, ...override }, noRequest),
      /Only a main Pages publication/,
    );
});

test('accounts use the fixed production gateway with a verified Pages origin', async () => {
  const env = await pagesAccountBuildEnv(publication, (url, request) => {
    assert.equal(url, 'https://crystalpath-api.kolequant.xyz/cpi/eligibility');
    assert.equal(request.method, 'OPTIONS');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.origin, 'https://georgi-cole.github.io');
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': request.headers.origin,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'Authorization, Content-Type',
      },
    });
  });
  assert.deepEqual(env, {
    VITE_ACCOUNT_SERVICES_ENABLED: 'true',
    VITE_ACCOUNT_API_BASE_URL: 'https://crystalpath-api.kolequant.xyz/cpi',
  });
  const providers = await pagesAccountBuildEnv(
    { ...publication, CPI_PAGES_WEB_PROVIDER_SIGN_IN: 'true' },
    () =>
      new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': 'https://georgi-cole.github.io',
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'Authorization, Content-Type',
        },
      }),
  );
  assert.equal(providers.VITE_WEB_PROVIDER_SIGN_IN, 'true');
  await assert.rejects(
    pagesAccountBuildEnv(publication, () => new Response(null, { status: 204 })),
    /allow the exact Pages origin/,
  );
});
