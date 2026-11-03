import { describe, expect, it } from 'vitest';
import { createSessionTransport } from '../src/account/session-gateway';

const BASE = 'https://accounts.example.net/v1/account/';
const SECRET = 'refresh-token-0123456789ABCDEF';
const TICKET = 'ticket-verified-0123456789ABCDEF';

describe('CPI-018 trusted session transport', () => {
  it('is unavailable without a specifically configured HTTPS account gateway', () => {
    for (const value of [
      undefined,
      '',
      '/v1/account',
      'http://accounts.example.net/v1/account',
      'https://accounts.example.net/',
      'https://alice:password@accounts.example.net/v1/account',
      'https://accounts.example.net/v1/account?refresh=secret',
      'https://accounts.example.net/v1/account#token',
      'https://accounts.example.net/auth/v1',
      'https://accounts.example.net/rest/v1',
      'not a URL',
    ]) {
      expect(createSessionTransport(value)).toBeNull();
    }
    expect(createSessionTransport(BASE)).not.toBeNull();
  });

  it('never initiates network traffic until an explicitly called session operation', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake: typeof fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      calls.push({ url, init: init ?? {} });
      return Promise.resolve(
        new Response(JSON.stringify({ status: 'revoked' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    const gateway = createSessionTransport(BASE, fake);
    expect(gateway).not.toBeNull();
    expect(calls).toEqual([]);
    await gateway?.exchange(TICKET);
    await gateway?.refresh(SECRET);
    expect(await gateway?.revoke(SECRET)).toEqual({ status: 'revoked' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://accounts.example.net/v1/account/session/exchange',
      'https://accounts.example.net/v1/account/session/refresh',
      'https://accounts.example.net/v1/account/session/revoke',
    ]);
    for (const call of calls) {
      expect(call.url).not.toContain(SECRET);
      expect(call.url).not.toContain(TICKET);
      expect(call.url).not.toContain('?');
      expect(call.init.method).toBe('POST');
      expect(call.init.credentials).toBe('omit');
      expect(call.init.redirect).toBe('error');
      expect(call.init.referrerPolicy).toBe('no-referrer');
      expect(call.init.cache).toBe('no-store');
    }
    expect(calls[0]?.init.body).toBe(
      JSON.stringify({ schemaVersion: 1, verifiedTicket: TICKET }),
    );
    expect(calls[1]?.init.body).toBe(JSON.stringify({ schemaVersion: 1, refreshToken: SECRET }));
    expect(calls[2]?.init.body).toBe(JSON.stringify({ schemaVersion: 1, refreshToken: SECRET }));
  });

  it('never surfaces raw HTTP response secrets or network exceptions', async () => {
    const fake: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ secret: SECRET, privateEmail: 'x@example.net' }), {
          status: 403,
        }),
      );
    const gateway = createSessionTransport(BASE, fake);
    try {
      await gateway?.refresh(SECRET);
      throw new Error('Expected request rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(SECRET);
      expect((error as Error).message).not.toContain('x@example.net');
    }
    const offline = createSessionTransport(BASE, () => Promise.reject(new Error('TOKEN=' + SECRET)));
    await expect(offline?.revoke(SECRET)).rejects.toThrow('Account session service unavailable');
  });
});
