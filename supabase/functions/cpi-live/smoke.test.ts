import { createCpiLiveFunction } from './bootstrap.ts';
Deno.test('a clean live-function deployment is closed and starts no external service', async () => {
  const handler = createCpiLiveFunction(() => undefined);
  const response = await handler(
    new Request('https://example.supabase.co/functions/v1/cpi-live/eligibility', {
      method: 'POST',
    }),
  );
  if (response.status !== 503 || (await response.text()) !== '{"code":"service_unavailable"}')
    throw new Error('Unexpected live activation');
});
Deno.test('partial or shared-project configuration cannot activate the issuer', async () => {
  const handler = createCpiLiveFunction((name) =>
    name === 'CPI_LIVE_ENABLED'
      ? 'true'
      : name === 'CPI_PROJECT_REF'
        ? 'jbyguybxhezjhdbenevh'
        : undefined,
  );
  if (
    (
      await handler(
        new Request('https://example.supabase.co/functions/v1/cpi-live/session/exchange'),
      )
    ).status !== 503
  )
    throw new Error('Shared project activation');
});

Deno.test(
  'valid staging configuration boots and rejects an unauthenticated worker request',
  async () => {
    const project = 'abcdefghijklmnopqrst';
    const origin = `https://${project}.supabase.co`;
    const values: Record<string, string> = {
      CPI_LIVE_ENABLED: 'true',
      CPI_ENVIRONMENT: 'staging',
      CPI_PROJECT_REF: project,
      SUPABASE_URL: origin,
      SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
      CPI_DATABASE_URL: `postgresql://cpi_runtime:synthetic@db.${project}.supabase.co:5432/postgres`,
      CPI_PRIVATE_PEPPER: '1'.repeat(64),
      CPI_ENCRYPTION_KEY: '2'.repeat(64),
      CPI_GATEWAY_KEY: '3'.repeat(64),
      CPI_WORKER_KEY: '4'.repeat(64),
      CPI_ALLOWED_ORIGINS: 'https://staging.example.com',
      CPI_RESEND_API_KEY: 're_' + 's'.repeat(20),
      CPI_MAIL_FROM: 'login@example.com',
      CPI_ACCOUNT_POLICY: JSON.stringify({
        status: 'reviewed',
        reviewReference: 'synthetic-test',
        version: 'staging-test',
        countries: {},
      }),
      CPI_PURCHASES_ENABLED: 'false',
      CPI_REWARDS_ENABLED: 'false',
    };
    const handler = createCpiLiveFunction((name) => values[name]);
    const response = await handler(
      new Request(origin + '/functions/v1/cpi-live/_worker', { method: 'POST' }),
    );
    if (response.status !== 404) throw new Error('Staging function did not start safely');
  },
);
