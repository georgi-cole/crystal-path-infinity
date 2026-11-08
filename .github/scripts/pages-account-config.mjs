const productionApi = 'https://api.crystalpath.kolequant.com/cpi';
const pagesOrigin = 'https://georgi-cole.github.io';

export async function pagesAccountBuildEnv(env, request = fetch) {
  if (env.CPI_PAGES_ACCOUNTS_ENABLED !== 'true') return {};
  if (
    env.GITHUB_REF !== 'refs/heads/main' ||
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
  )
    throw new Error('Only a main Pages publication may enable production accounts.');

  const response = await request(productionApi + '/eligibility', {
    method: 'OPTIONS',
    headers: {
      origin: pagesOrigin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const methods = response.headers.get('access-control-allow-methods')?.split(/\s*,\s*/);
  const headers = response.headers
    .get('access-control-allow-headers')
    ?.toLowerCase()
    .split(/\s*,\s*/);
  if (
    response.status !== 204 ||
    response.headers.get('access-control-allow-origin') !== pagesOrigin ||
    !methods?.includes('POST') ||
    !['authorization', 'content-type'].every((header) => headers?.includes(header))
  )
    throw new Error('The production account gateway must allow the exact Pages origin.');

  return {
    VITE_ACCOUNT_SERVICES_ENABLED: 'true',
    VITE_ACCOUNT_API_BASE_URL: productionApi,
  };
}
