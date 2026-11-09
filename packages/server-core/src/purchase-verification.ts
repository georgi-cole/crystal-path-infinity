import { Buffer } from 'node:buffer';
import { createHash, createSign } from 'node:crypto';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';
import type { AppleSignedVerifier } from './apple-sandbox-verifier.ts';
import type {
  AppStoreServerAPIClient,
  JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';

export interface PurchaseProof {
  readonly platform: 'android' | 'ios';
  readonly sku: string;
  readonly transactionId: string;
  readonly accountToken: string;
  readonly purchaseToken?: string;
  readonly signedTransaction?: string;
}
export interface VerifiedPurchase {
  readonly fingerprint: string;
  readonly platform: PurchaseProof['platform'];
  readonly environment: 'production' | 'sandbox';
  readonly sku: string;
  readonly transactionId: string;
  readonly accountToken: string;
  readonly nativeConsumable?: boolean;
}
export type PurchaseVerification =
  { status: 'pending' | 'rejected' } | { status: 'verified'; purchase: VerifiedPurchase };
export type PurchaseVerifier = (proof: PurchaseProof) => Promise<PurchaseVerification>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePurchaseProof(value: unknown): PurchaseProof | null {
  if (
    !record(value) ||
    (value.platform !== 'android' && value.platform !== 'ios') ||
    typeof value.sku !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.sku) ||
    typeof value.accountToken !== 'string' ||
    !uuid.test(value.accountToken) ||
    !bounded(value.transactionId, 200)
  )
    return null;
  if (value.platform === 'android') {
    if (!bounded(value.purchaseToken, 8192) || value.signedTransaction !== undefined) return null;
    return {
      platform: 'android',
      sku: value.sku,
      transactionId: value.transactionId,
      accountToken: value.accountToken.toLowerCase(),
      purchaseToken: value.purchaseToken,
    };
  }
  if (!bounded(value.signedTransaction, 65536) || value.purchaseToken !== undefined) return null;
  return {
    platform: 'ios',
    sku: value.sku,
    transactionId: value.transactionId,
    accountToken: value.accountToken.toLowerCase(),
    signedTransaction: value.signedTransaction,
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function bounded(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= limit &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}
function verified(
  proof: PurchaseProof,
  environment: VerifiedPurchase['environment'],
  nativeConsumable?: boolean,
): PurchaseVerification {
  return {
    status: 'verified',
    purchase: {
      platform: proof.platform,
      environment,
      sku: proof.sku,
      transactionId: proof.transactionId,
      accountToken: proof.accountToken.toLowerCase(),
      ...(nativeConsumable === undefined ? {} : { nativeConsumable }),
      fingerprint: createHash('sha256')
        .update(
          proof.platform + ':' + environment + ':' + (proof.purchaseToken ?? proof.transactionId),
        )
        .digest('hex'),
    },
  };
}
/** Apple's verifier validates the signature, certificate chain, bundle and environment, including online revocation. */
export function createApplePurchaseVerifier(options: {
  roots: readonly Buffer[];
  signedVerifier?: AppleSignedVerifier;
  bundleId: string;
  appleAppId: number;
  environment: 'production' | 'sandbox';
  api: Pick<AppStoreServerAPIClient, 'getTransactionInfo'>;
}): PurchaseVerifier {
  if (
    !options.roots.length ||
    !/^[A-Za-z0-9.-]+$/.test(options.bundleId) ||
    !Number.isSafeInteger(options.appleAppId) ||
    options.appleAppId <= 0
  )
    throw new Error('Invalid Apple verifier configuration');
  const environment =
    options.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
  const verifier =
    options.signedVerifier ??
    new SignedDataVerifier(
      [...options.roots],
      true,
      environment,
      options.bundleId,
      options.appleAppId,
    );
  function acceptable(transaction: JWSTransactionDecodedPayload, proof: PurchaseProof) {
    return (
      transaction.transactionId === proof.transactionId &&
      transaction.productId === proof.sku &&
      transaction.bundleId === options.bundleId &&
      transaction.environment === environment &&
      transaction.appAccountToken?.toLowerCase() === proof.accountToken.toLowerCase() &&
      transaction.quantity === 1 &&
      transaction.revocationDate === undefined &&
      transaction.inAppOwnershipType === 'PURCHASED' &&
      (transaction.type === 'Consumable' || transaction.type === 'Non-Consumable')
    );
  }
  return async (proof) => {
    if (proof.platform !== 'ios' || !parsePurchaseProof(proof)) return { status: 'rejected' };
    try {
      const device = await verifier.verifyAndDecodeTransaction(proof.signedTransaction!);
      if (!acceptable(device, proof)) return { status: 'rejected' };
      // OCSP checks certificate revocation, not a later refund of the purchase.
      // Re-read the canonical transaction from Apple's authenticated server API.
      const latest = await options.api.getTransactionInfo(proof.transactionId);
      if (!bounded(latest.signedTransactionInfo, 65536)) return { status: 'rejected' };
      const transaction = await verifier.verifyAndDecodeTransaction(latest.signedTransactionInfo);
      if (!acceptable(transaction, proof)) return { status: 'rejected' };
      return verified(proof, options.environment, transaction.type === 'Consumable');
    } catch {
      return { status: 'rejected' };
    }
  };
}
async function json(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Provider unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Provider unavailable');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0,
    content = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) throw new Error('Provider unavailable');
      content += decoder.decode(part.value, { stream: true });
    }
    const value: unknown = JSON.parse(content + decoder.decode());
    if (!record(value)) throw new Error('Provider unavailable');
    return value;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
/** Server-only Google service-account assertion. No keys, access tokens or receipts enter client configuration. */
export function createGooglePlayAccessToken(options: {
  clientEmail: string;
  privateKey: string;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/.test(options.clientEmail))
    throw new Error('Invalid Google issuer');
  const fetcher = options.fetcher ?? fetch,
    now = options.now ?? Date.now;
  let cached: { value: string; until: number } | null = null;
  let pending: Promise<string> | null = null;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return async (): Promise<string> => {
    if (cached && cached.until > now()) return cached.value;
    if (pending) return pending;
    pending = (async () => {
      const issued = Math.floor(now() / 1000);
      const input =
        encode({ alg: 'RS256', typ: 'JWT' }) +
        '.' +
        encode({
          iss: options.clientEmail,
          scope: 'https://www.googleapis.com/auth/androidpublisher',
          aud: 'https://oauth2.googleapis.com/token',
          iat: issued,
          exp: issued + 3600,
        });
      const signature = createSign('RSA-SHA256')
        .update(input)
        .sign(options.privateKey)
        .toString('base64url');
      const response = await json(
        await fetcher('https://oauth2.googleapis.com/token', {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: input + '.' + signature,
          }),
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        }),
      );
      if (
        !bounded(response.access_token, 8192) ||
        response.token_type !== 'Bearer' ||
        typeof response.expires_in !== 'number' ||
        response.expires_in < 120 ||
        response.expires_in > 3600
      )
        throw new Error('Provider unavailable');
      cached = { value: response.access_token, until: now() + (response.expires_in - 60) * 1000 };
      return cached.value;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}
/** Google Play Developer API is authoritative; client Billing callbacks do not prove payment. */
export function createGooglePurchaseVerifier(options: {
  packageName: string;
  environment: 'production' | 'sandbox';
  accessToken: () => Promise<string>;
  fetcher?: typeof fetch;
}): PurchaseVerifier {
  if (!/^[A-Za-z0-9_.]+$/.test(options.packageName)) throw new Error('Invalid Android package');
  const fetcher = options.fetcher ?? fetch;
  return async (proof) => {
    if (proof.platform !== 'android' || !parsePurchaseProof(proof)) return { status: 'rejected' };
    // A transport/provider failure must be retried, never recorded as a verified purchase.
    const purchase = await json(
      await fetcher(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
          encodeURIComponent(options.packageName) +
          '/purchases/productsv2/tokens/' +
          encodeURIComponent(proof.purchaseToken!),
        {
          headers: {
            accept: 'application/json',
            authorization: 'Bearer ' + (await options.accessToken()),
          },
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      ),
    );
    const sandbox = purchase.testPurchaseContext !== undefined;
    if (
      sandbox !== (options.environment === 'sandbox') ||
      purchase.orderId !== proof.transactionId ||
      typeof purchase.obfuscatedExternalAccountId !== 'string' ||
      purchase.obfuscatedExternalAccountId.toLowerCase() !== proof.accountToken.toLowerCase()
    )
      return { status: 'rejected' };
    const state = record(purchase.purchaseStateContext)
      ? purchase.purchaseStateContext.purchaseState
      : null;
    if (state === 'PENDING') return { status: 'pending' };
    if (
      state !== 'PURCHASED' ||
      !Array.isArray(purchase.productLineItem) ||
      purchase.productLineItem.length !== 1
    )
      return { status: 'rejected' };
    const line: unknown = purchase.productLineItem[0];
    if (
      !record(line) ||
      line.productId !== proof.sku ||
      !record(line.productOfferDetails) ||
      line.productOfferDetails.quantity !== 1 ||
      line.productOfferDetails.refundableQuantity !== 1 ||
      line.productOfferDetails.rentOfferDetails !== undefined ||
      line.productOfferDetails.preorderOfferDetails !== undefined
    )
      return { status: 'rejected' };
    return verified(proof, options.environment);
  };
}
