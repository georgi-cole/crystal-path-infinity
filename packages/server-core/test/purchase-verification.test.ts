import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createApplePurchaseVerifier,
  createGooglePurchaseVerifier,
  createGooglePlayAccessToken,
  parsePurchaseProof,
} from '../src/purchase-verification.ts';
import type { PurchaseProof } from '../src/purchase-verification.ts';
const proof: PurchaseProof = {
  platform: 'android',
  sku: 'com.example.credits3',
  transactionId: 'GPA.1234',
  accountToken: 'ba000000-0000-4000-8000-000000000001',
  purchaseToken: 'private-receipt+with/slash',
};
function google(value: object, environment: 'production' | 'sandbox' = 'production') {
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }),
    ),
  );
  return {
    fetcher,
    verify: createGooglePurchaseVerifier({
      packageName: 'com.georgicole.crystalpath.infinity',
      environment,
      accessToken: () => Promise.resolve('private-google-access'),
      fetcher,
    }),
  };
}
const paid = {
  orderId: proof.transactionId,
  obfuscatedExternalAccountId: proof.accountToken,
  purchaseStateContext: { purchaseState: 'PURCHASED' },
  productLineItem: [
    { productId: proof.sku, productOfferDetails: { quantity: 1, refundableQuantity: 1 } },
  ],
};
describe('provider-authoritative purchase proofs', () => {
  it('uses only the fixed Google API with encoded token path and server authorization', async () => {
    const f = google(paid);
    const result = await f.verify(proof);
    expect(result).toMatchObject({
      status: 'verified',
      purchase: { accountToken: proof.accountToken, sku: proof.sku, environment: 'production' },
    });
    const [url, request] = f.fetcher.mock.calls[0];
    expect(url).toBe(
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.georgicole.crystalpath.infinity/purchases/productsv2/tokens/private-receipt%2Bwith%2Fslash',
    );
    expect(request).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { authorization: 'Bearer private-google-access' },
    });
    expect(JSON.stringify(result)).not.toContain('private-receipt');
  });
  it('rejects another account, wrong SKU, cancelled/refunded/test/multi-quantity payments', async () => {
    for (const value of [
      { ...paid, obfuscatedExternalAccountId: 'another-account' },
      { ...paid, orderId: 'another-order' },
      { ...paid, testPurchaseContext: {} },
      { ...paid, purchaseStateContext: { purchaseState: 'CANCELLED' } },
      {
        ...paid,
        productLineItem: [
          { productId: 'wrong', productOfferDetails: { quantity: 1, refundableQuantity: 1 } },
        ],
      },
      ...[
        { quantity: 2, refundableQuantity: 2 },
        { quantity: 1, refundableQuantity: 0 },
      ].map((productOfferDetails) => ({
        ...paid,
        productLineItem: [{ productId: proof.sku, productOfferDetails }],
      })),
    ])
      expect(await google(value).verify(proof)).toEqual({ status: 'rejected' });
    expect(
      await google({ ...paid, purchaseStateContext: { purchaseState: 'PENDING' } }).verify(proof),
    ).toEqual({ status: 'pending' });
    expect(
      await google({ ...paid, testPurchaseContext: {} }, 'sandbox').verify(proof),
    ).toMatchObject({ status: 'verified' });
  });
  it('does not accept a decoded Apple payload as a signed transaction', async () => {
    const verifier = createApplePurchaseVerifier({
      roots: [readFileSync(new URL('../certificates/AppleRootCA-G3.cer', import.meta.url))],
      bundleId: 'com.georgicole.crystalpath.infinity',
      appleAppId: 6831790531,
      environment: 'production',
    });
    const forged = Buffer.from(
      JSON.stringify({
        transactionId: 'fake',
        bundleId: 'com.georgicole.crystalpath.infinity',
        productId: proof.sku,
        appAccountToken: proof.accountToken,
        quantity: 1,
        environment: 'Production',
      }),
    ).toString('base64url');
    expect(
      await verifier({
        platform: 'ios',
        sku: proof.sku,
        accountToken: proof.accountToken,
        transactionId: 'fake',
        signedTransaction: 'eyJhbGciOiJub25lIn0.' + forged + '.',
      }),
    ).toEqual({ status: 'rejected' });
    expect(parsePurchaseProof({ ...proof, signedTransaction: 'both-platforms' })).toBeNull();
  });
  it('issues scoped Google assertions only to the OAuth endpoint and caches short-lived access', async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'scoped-provider-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const get = createGooglePlayAccessToken({
      clientEmail: 'billing@project.iam.gserviceaccount.com',
      privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      fetcher,
      now: () => 1800000000000,
    });
    expect(await Promise.all([get(), get()])).toEqual([
      'scoped-provider-access-token',
      'scoped-provider-access-token',
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const assertion = (init!.body as URLSearchParams).get('assertion')!;
    const [header, body, signature] = assertion.split('.');
    expect(
      createVerify('RSA-SHA256')
        .update(header + '.' + body)
        .verify(pair.publicKey, Buffer.from(signature, 'base64url')),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toMatchObject({
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      exp: 1800003600,
    });
  });
});
