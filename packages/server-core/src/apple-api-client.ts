import { Buffer } from 'node:buffer';
import type { AppStoreServerAPIClient } from '@apple/app-store-server-library';
import { isObject, providerJson } from './private-services.ts';

/** Authenticate Apple API calls with P-256 Web Crypto in both Node and Supabase Edge. */
export function createBoundedAppleApiClient(options: {
  signingKey: string;
  keyId: string;
  issuerId: string;
  bundleId: string;
  environment: 'production' | 'sandbox';
}): Pick<AppStoreServerAPIClient, 'getTransactionInfo' | 'getNotificationHistory'> {
  const base =
    options.environment === 'production'
      ? 'https://api.storekit.apple.com'
      : 'https://api.storekit-sandbox.apple.com';
  const pem = /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----$/.exec(
    options.signingKey.trim(),
  );
  if (!pem) throw new Error('Invalid Apple API signing key');
  const pkcs8 = Buffer.from(pem[1], 'base64');
  let signingKey: CryptoKey | undefined;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'ES256', kid: options.keyId, typ: 'JWT' });

  async function request(path: string, body?: object) {
    signingKey ??= await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const iat = Math.floor(Date.now() / 1000);
    const input =
      header +
      '.' +
      encode({
        iss: options.issuerId,
        iat,
        exp: iat + 300,
        aud: 'appstoreconnect-v1',
        bid: options.bundleId,
      });
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      new TextEncoder().encode(input),
    );
    return providerJson(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer ' + input + '.' + Buffer.from(signature).toString('base64url'),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  return {
    async getTransactionInfo(transactionId) {
      if (!/^\d{1,200}$/.test(transactionId)) throw new Error('Invalid Apple transaction ID');
      const data = await request('/inApps/v1/transactions/' + transactionId);
      if (!isObject(data) || typeof data.signedTransactionInfo !== 'string')
        throw new Error('Invalid Apple transaction response');
      return { signedTransactionInfo: data.signedTransactionInfo };
    },
    async getNotificationHistory(paginationToken, body) {
      const query = paginationToken
        ? '?' + new URLSearchParams({ paginationToken }).toString()
        : '';
      const data = await request('/inApps/v1/notifications/history' + query, body);
      if (
        !isObject(data) ||
        typeof data.hasMore !== 'boolean' ||
        (data.paginationToken !== undefined && typeof data.paginationToken !== 'string')
      )
        throw new Error('Invalid Apple history response');
      const rows: unknown = data.notificationHistory ?? (data.hasMore ? null : []);
      if (!Array.isArray(rows) || rows.length > 20) throw new Error('Invalid Apple history page');
      const notificationHistory = rows.map((row: unknown) => {
        if (!isObject(row) || typeof row.signedPayload !== 'string')
          throw new Error('Invalid Apple history row');
        return { signedPayload: row.signedPayload };
      });
      return { hasMore: data.hasMore, paginationToken: data.paginationToken, notificationHistory };
    },
  };
}
