import type { AppleSignedVerifier } from './apple-sandbox-verifier.ts';
import { isObject, providerJson } from './private-services.ts';

const base = 'https://crystal-path-apple-verifier.kolequant.workers.dev';

/** Environment selects a verifier, never authorizes a transaction or its account binding. */
export function createAppleProductionVerifier(
  key: string,
  environment: 'production' | 'sandbox',
): AppleSignedVerifier {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid production verifier configuration');
  async function verify(kind: 'transaction' | 'notification', signedPayload: string) {
    const value = await providerJson(base + '/' + environment + '/' + kind, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ signedPayload }),
    });
    if (!isObject(value)) throw new Error('Apple verification unavailable');
    return value;
  }
  return {
    verifyAndDecodeTransaction: (payload) => verify('transaction', payload),
    verifyAndDecodeNotification: (payload) => verify('notification', payload),
  };
}
