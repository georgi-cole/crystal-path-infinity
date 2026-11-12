import type { PurchaseVerifier } from './purchase-verification.ts';

/** A rejection may be a review receipt; both paths still perform full provider verification. */
export function withVerifiedReviewPurchases(
  live: PurchaseVerifier,
  review: PurchaseVerifier,
): PurchaseVerifier {
  return async (proof) => {
    const result = await live(proof);
    if (result.status !== 'rejected') return result;
    const tested = await review(proof);
    if (tested.status === 'verified' && tested.purchase.environment !== 'sandbox')
      return { status: 'rejected' };
    return tested;
  };
}
