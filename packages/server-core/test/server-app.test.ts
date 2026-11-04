import { describe, expect, it, vi } from 'vitest';
import { createMvpServer } from '../src/server-app.ts';
import { OperationsMetrics } from '../src/operations-metrics.ts';

describe('fixed MVP host routing', () => {
  it('mounts the exact service namespace and leaves raw SSV bytes untouched', async () => {
    const handler = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response('{"status":"accepted"}'));
    const server = createMvpServer({ basePath: '/cpi', handlers: { rewards: handler } });
    const request = new Request(
      'https://example.invalid/cpi/rewards/ssv?ad_unit=x%2Fy&signature=a%2Bb&key_id=7',
    );
    expect((await server(request)).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request);
    expect(handler.mock.calls[0][0].url).toBe(request.url);
    expect((await server(new Request('https://example.invalid/rewards/ssv'))).status).toBe(404);
    expect(
      (await server(new Request('https://example.invalid/cpi/rewards/ssv/extra'))).status,
    ).toBe(404);
  });
  it('never forwards arbitrary Auth routes or account data to an unapproved issuer', async () => {
    const handler = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response('ok'));
    const server = createMvpServer({ handlers: { profile: handler } });
    expect((await server(new Request('https://example.invalid/auth/v1/otp'))).status).toBe(404);
    const result = await server(
      new Request('https://example.invalid/otp/request', {
        method: 'POST',
        body: '{"email":"private@example.invalid"}',
      }),
    );
    expect(result.status).toBe(503);
    expect(await result.text()).toBe('{"code":"service_unavailable"}');
    expect(handler).not.toHaveBeenCalled();
  });
  it('uses distinct pending-run, operations and ordinary ranked handlers', async () => {
    const ranked = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response('ranked'));
    const saved = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response('saved'));
    const server = createMvpServer({ handlers: { ranked, pendingRuns: saved } });
    expect(await (await server(new Request('https://example.invalid/ranked/saved'))).text()).toBe(
      'saved',
    );
    expect(await (await server(new Request('https://example.invalid/ranked/active'))).text()).toBe(
      'ranked',
    );
    expect(
      (await server(new Request('https://example.invalid/profile/read?user=private'))).status,
    ).toBe(400);
  });
  it('isolates diagnostic failures and emits no exception, body, credential or query text', async () => {
    const metrics = new OperationsMetrics({ enabled: true });
    vi.spyOn(metrics, 'record').mockImplementation(() => {
      throw new Error('private diagnostics');
    });
    const server = createMvpServer({
      handlers: { ranked: () => Promise.resolve(new Response('committed', { status: 200 })) },
      metrics,
    });
    const response = await server(new Request('https://example.invalid/ranked/action'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('committed');
    const failed = createMvpServer({
      handlers: { account: () => Promise.reject(new Error('raw credential')) },
    });
    expect(await (await failed(new Request('https://example.invalid/account/delete'))).text()).toBe(
      '{"code":"service_unavailable"}',
    );
  });
});
