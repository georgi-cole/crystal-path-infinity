import { describe, expect, it, vi } from 'vitest';
import { withVerifiedReviewPurchases } from '../src/purchase-review-verification.ts';
import type { PurchaseProof, PurchaseVerifier } from '../src/purchase-verification.ts';

const proof: PurchaseProof = {
  platform: 'ios',
  sku: 'com.example.item',
  transactionId: '12345',
  accountToken: 'fb000000-0000-4000-8000-000000000001',
  signedTransaction: 'untrusted-signed-payload',
};
const verified = (environment: 'sandbox' | 'production') => ({
  status: 'verified' as const,
  purchase: { ...proof, environment, fingerprint: 'a'.repeat(64), nativeConsumable: true },
});

describe('verified review receipt fallback', () => {
  it('keeps a live result and pending purchases out of the fallback', async () => {
    const review = vi.fn<PurchaseVerifier>();
    expect(
      await withVerifiedReviewPurchases(
        () => Promise.resolve(verified('production')),
        review,
      )(proof),
    ).toEqual(verified('production'));
    expect(
      await withVerifiedReviewPurchases(
        () => Promise.resolve({ status: 'pending' }),
        review,
      )(proof),
    ).toEqual({ status: 'pending' });
    expect(review).not.toHaveBeenCalled();
  });
  it('requires full secondary verification and preserves its sandbox classification', async () => {
    const review = vi.fn<PurchaseVerifier>().mockResolvedValue(verified('sandbox'));
    expect(
      await withVerifiedReviewPurchases(
        () => Promise.resolve({ status: 'rejected' }),
        review,
      )(proof),
    ).toEqual(verified('sandbox'));
    expect(review).toHaveBeenCalledWith(proof);
    review.mockResolvedValue({ status: 'rejected' });
    expect(
      await withVerifiedReviewPurchases(
        () => Promise.resolve({ status: 'rejected' }),
        review,
      )(proof),
    ).toEqual({ status: 'rejected' });
    review.mockResolvedValue(verified('production'));
    expect(
      await withVerifiedReviewPurchases(
        () => Promise.resolve({ status: 'rejected' }),
        review,
      )(proof),
    ).toEqual({ status: 'rejected' });
  });
});
