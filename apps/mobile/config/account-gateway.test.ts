import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountEntry } from '../src/account/account-entry';
import { createOtpGateway } from '../src/account/otp-gateway';

describe('CPI-018 trusted OTP gateway boundary', () => {
  it('has no active email input or request route while account API is not configured', () => {
    expect(createOtpGateway(undefined)).toBeNull();
    expect(createOtpGateway('http://example.com/v1/account')).toBeNull();
    expect(createOtpGateway('https://example.com/auth/v1')).toBeNull();
    expect(createOtpGateway('https://x:y@example.com/v1/account')).toBeNull();
    const html = renderToStaticMarkup(createElement(AccountEntry, { online: true }));
    expect(html).toContain('Account setup is not available');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="password"');
  });

  it('sends no email to public Supabase Auth and never leaks it to URL or referrer', async () => {
    const observed: Array<{ url: string; options: RequestInit }> = [];
    const fake: typeof fetch = (input, init) => {
      observed.push({ url: String(input), options: init ?? {} });
      return Promise.resolve(
        new Response(JSON.stringify({ status: 'accepted', expiresAt: 2_000_000_000_000 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    const gateway = createOtpGateway('https://account.example.net/v1/account/', fake);
    expect(gateway).not.toBeNull();
    await gateway?.eligibility();
    await gateway?.requestCode('someone@example.org', 'opaque-permit-1234567890123456789');
    await gateway?.verifyCode('someone@example.org', '123456', 'opaque-permit-1234567890123456789');
    expect(observed).toHaveLength(3);
    expect(observed.map((x) => x.url)).toEqual([
      'https://account.example.net/v1/account/eligibility',
      'https://account.example.net/v1/account/otp/request',
      'https://account.example.net/v1/account/otp/verify',
    ]);
    expect(observed[0].options.body).toBe(JSON.stringify({ schemaVersion: 1 }));
    expect(observed[1].options.body).toContain('"email":"someone@example.org"');
    for (const call of observed) {
      expect(call.url).not.toContain('@');
      expect(call.url).not.toContain('/auth/v1');
      expect(call.options.credentials).toBe('omit');
      expect(call.options.redirect).toBe('error');
      expect(call.options.referrerPolicy).toBe('no-referrer');
      expect(call.options.cache).toBe('no-store');
    }
  });

  it('never forwards service errors or response bodies to the UI', async () => {
    const fake: typeof fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ email: 'private@example.org' }), { status: 429 }));
    const gateway = createOtpGateway('https://account.example.net/v1/account', fake);
    await expect(gateway?.requestCode('private@example.org', 'ticket')).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });
});
