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
