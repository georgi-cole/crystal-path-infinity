import {
  createSupabaseEdgeHandler,
  createLockedEdgeHandler,
  createSupabaseIdentityVerifier,
  DEVELOPMENT_PROJECT,
} from '../../../packages/server-core/src/supabase-edge.ts';

const config = {
  projectUrl: `https://${DEVELOPMENT_PROJECT}.supabase.co`,
  publishableKey: 'synthetic-public-key',
  origins: ['capacitor://localhost'],
};
Deno.test(
  'Deno executes the actual server graph with all account and ad gates closed',
  async () => {
    const env: Record<string, string> = {
      SUPABASE_URL: config.projectUrl,
      SUPABASE_ANON_KEY: config.publishableKey,
      CPI_ALLOWED_ORIGINS: 'capacitor://localhost',
    };
    const handler = createLockedEdgeHandler((name) => env[name]);
    for (const mount of ['/cpi-api', '/functions/v1/cpi-api']) {
      for (const path of [
        '/eligibility',
        '/otp/request',
        '/session/exchange',
        '/profile/save',
        '/ranked/start',
        '/rewards/intent',
      ]) {
        const result = await handler(
          new Request(config.projectUrl + mount + path, {
            method: 'POST',
            headers: { origin: 'capacitor://localhost' },
            body: '{}',
          }),
        );
        if (result.status !== 503 || (await result.json()).code !== 'service_unavailable')
          throw new Error('Closed gate failed');
      }
    }
  },
);
Deno.test('Deno remote verifier rejects synthetic identity data without external I/O', async () => {
  const fake: typeof fetch = () =>
    Promise.resolve(
      Response.json({
        id: 'forged',
        role: 'authenticated',
        user_metadata: { profileAllowed: true },
      }),
    );
  const verify = createSupabaseIdentityVerifier(config, fake);
  if ((await verify('synthetic-test-token')) !== null) throw new Error('Forged identity accepted');
});

Deno.test(
  'missing environment and attempted activation keep the deployed handler closed',
  async () => {
    for (const env of [
      () => undefined,
      () => {
        throw new Error('secret environment details');
      },
    ]) {
      const response = await createLockedEdgeHandler(env)(
        new Request(config.projectUrl + '/cpi-api/otp/request', { method: 'POST', body: '{}' }),
      );
      if (response.status !== 503 || (await response.text()) !== '{"code":"service_unavailable"}')
        throw new Error('Startup failed open');
    }
    const result = await createSupabaseEdgeHandler(config)(
      new Request(config.projectUrl + '/cpi-api/otp/request', { method: 'POST', body: '{}' }),
    );
    if (result.status !== 503) throw new Error('Unconfigured issuer became available');
  },
);
