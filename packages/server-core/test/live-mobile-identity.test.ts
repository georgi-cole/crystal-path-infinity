import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AccountIssuerError } from '../src/account-issuer';
import { createLiveServer } from '../src/live-server';
import type { LiveServerOptions } from '../src/live-server';
import type { SqlPool } from '../src/database';

const gatewayKey = '7'.repeat(64);
const peer = '8'.repeat(64);

function signedCallback(url: string) {
  const route = new URL(url).pathname.replace('/functions/v1/cpi-live', '') + new URL(url).search;
  const time = String(Date.now());
  const country = 'BG';
  const bodyHash = createHash('sha256').update('').digest('hex');
  const signature = createHmac('sha256', Buffer.from(gatewayKey, 'hex'))
    .update(['GET', route, time, country, peer, bodyHash].join('\n'))
    .digest('hex');
  return new Request('https://edge.example/functions/v1/cpi-live' + route, {
    headers: {
      'x-cpi-time': time,
      'x-cpi-country': country,
      'x-cpi-peer': peer,
      'x-cpi-route': route,
      'x-cpi-signature': signature,
    },
  });
}

function live(callback: (request: Request) => Promise<Response>) {
  return createLiveServer({
    database: {} as SqlPool,
    issuer: {
      authenticate: vi.fn().mockResolvedValue(null),
    } as unknown as LiveServerOptions['issuer'],
    environment: 'staging',
    origins: [],
    gatewayKey,
    workerKey: '9'.repeat(64),
    rateLimit: vi.fn().mockResolvedValue(true),
    rewardsEnabled: false,
    purchasesEnabled: false,
    purchasePlatforms: [],
    commerce: {} as LiveServerOptions['commerce'],
    maintenance: {} as LiveServerOptions['maintenance'],
    mobileIdentity: { callback } as unknown as LiveServerOptions['mobileIdentity'],
  });
}

describe('mobile provider callback HTTP failures', () => {
  it('returns an expired handoff instead of disguising it as a service outage', async () => {
    const handler = live(() => Promise.reject(new AccountIssuerError(410)));
    const response = await handler(
      signedCallback(
        'https://edge.example/functions/v1/cpi-live/identity/mobile/callback?state=' +
          'A'.repeat(43),
      ),
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ code: 'expired' });
  });

  it('logs only a fixed operation and safe error type for internal callback failures', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const handler = live(() => Promise.reject(new Error('private-provider-response')));
      const sensitiveState = 'B'.repeat(43);
      const response = await handler(
        signedCallback(
          'https://edge.example/functions/v1/cpi-live/identity/mobile/callback?state=' +
            sensitiveState +
            '&code=private-oauth-code',
        ),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'service_unavailable' });
      const log = write.mock.calls.flat().join(' ');
      expect(log).toContain('mobile_identity_failure');
      expect(log).toContain('callback');
      expect(log).not.toContain(sensitiveState);
      expect(log).not.toContain('private-oauth-code');
      expect(log).not.toContain('private-provider-response');
    } finally {
      write.mockRestore();
    }
  });
});
