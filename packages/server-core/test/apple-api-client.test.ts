import { Buffer } from 'node:buffer';
import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoundedAppleApiClient } from '../src/apple-api-client.ts';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const bundleId = 'com.example.game';
const keyId = 'EXAMPLE123';
const issuerId = '5a633ddb-d12f-4eed-9dc4-57988c704ee0';
const settings = {
  signingKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  keyId,
  issuerId,
  bundleId,
  environment: 'sandbox' as const,
};
afterEach(() => vi.unstubAllGlobals());

describe('App Store Server API authentication', () => {
  it('signs Apple API requests with ES256 and pins the Sandbox endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        hasMore: false,
        notificationHistory: [{ signedPayload: 'apple-payload' }],
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const client = createBoundedAppleApiClient(settings);
    await expect(
      client.getNotificationHistory('next&token', { startDate: 1000, endDate: 2000 }),
    ).resolves.toMatchObject({
      hasMore: false,
      notificationHistory: [{ signedPayload: 'apple-payload' }],
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://api.storekit-sandbox.apple.com/inApps/v1/notifications/history?paginationToken=next%26token',
    );
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      body: '{"startDate":1000,"endDate":2000}',
    });
    const [header, claims, signature] = new Headers(init?.headers)
      .get('authorization')!
      .slice(7)
      .split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: keyId,
      typ: 'JWT',
    });
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({ iss: issuerId, aud: 'appstoreconnect-v1', bid: bundleId });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(300);
    expect(
      verify(
        'sha256',
        Buffer.from(header + '.' + claims),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('rejects invalid identifiers and incomplete provider data', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ hasMore: 'false' })));
    vi.stubGlobal('fetch', fetcher);
    const client = createBoundedAppleApiClient(settings);
    await expect(client.getTransactionInfo('../notifications/history')).rejects.toThrow(
      'Invalid Apple transaction ID',
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.getTransactionInfo('1234')).rejects.toThrow(
      'Invalid Apple transaction response',
    );
    await expect(client.getNotificationHistory(null, {})).rejects.toThrow(
      'Invalid Apple history response',
    );
  });
});
