import type { SignedDataVerifier } from '@apple/app-store-server-library';
import { isObject, providerJson } from './private-services.ts';

export type AppleSignedVerifier = Pick<
  SignedDataVerifier,
  'verifyAndDecodeTransaction' | 'verifyAndDecodeNotification'
>;

const STAGING_VERIFIER = 'https://crystal-path-staging-apple-verifier.kolequant.workers.dev';

/** Use the isolated Worker for Apple's online X.509 checks on staging. */
export function createAppleSandboxVerifier(key: string): AppleSignedVerifier {
  async function verify(kind: 'transaction' | 'notification', signedPayload: string) {
    const value = await providerJson(STAGING_VERIFIER + '/' + kind, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ signedPayload }),
    });
    if (!isObject(value)) throw new Error('Apple verification unavailable');
    return value;
  }

  return {
    async verifyAndDecodeTransaction(payload) {
      return await verify('transaction', payload);
    },
    async verifyAndDecodeNotification(payload) {
      return await verify('notification', payload);
    },
  };
}
