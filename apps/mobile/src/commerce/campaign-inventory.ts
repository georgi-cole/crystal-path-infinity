import type { CampaignProgress } from '../campaign-test';
import type { CommerceWallet, OfflineAllocation, OfflineSupplyAmounts } from './commerce-types';
import { ADVENTURE_COMMERCE_PRODUCTS } from './adventure-products';
import type { CampaignOffer } from '../campaign-test';
import { ownsStyle } from '../campaign-test';
import type { BridgeStyle } from '../campaign-content';

export function offlineSupplyCapacity(
  progress: CampaignProgress,
  wallet: CommerceWallet,
): OfflineSupplyAmounts {
  return {
    sp: Math.min(wallet.sp, Math.max(0, 10000 - progress.reserveSp)),
    hints: Math.min(wallet.hints, Math.max(0, 10000 - progress.reserveHints)),
    credits: Math.min(wallet.credits, Math.max(0, 10000 - progress.continues)),
    shields: Math.min(wallet.shields, Math.max(0, 10000 - progress.shields)),
    seasonChanges: Math.min(wallet.seasonChanges, Math.max(0, 10000 - progress.seasonChanges)),
  };
}
/** Called only after a server transfer, never in response to a local purchase button. */
export function receiveOfflineSupplies(
  progress: CampaignProgress,
  allocation: OfflineAllocation,
): CampaignProgress {
  if (progress.supplyAllocations?.includes(allocation.operationId)) return progress;
  const next = {
    ...progress,
    reserveSp: progress.reserveSp + allocation.sp,
    reserveHints: progress.reserveHints + allocation.hints,
    continues: progress.continues + allocation.credits,
    shields: progress.shields + allocation.shields,
    seasonChanges: progress.seasonChanges + allocation.seasonChanges,
    supplyAllocations: [...(progress.supplyAllocations ?? []), allocation.operationId],
  };
  if (
    next.supplyAllocations.length > 100 ||
    [next.reserveSp, next.reserveHints, next.continues, next.shields, next.seasonChanges].some(
      (amount) => !Number.isSafeInteger(amount) || amount > 10000 || amount < 0,
    )
  )
    throw new Error('There is not enough room for these supplies.');
  return next;
}
export function applyPaidEntitlements(
  progress: CampaignProgress,
  wallet: Pick<CommerceWallet, 'unlocks' | 'owned' | 'equipped'>,
): CampaignProgress {
  const permanent = ADVENTURE_COMMERCE_PRODUCTS.filter((p) => !p.consumable);
  const paid = new Set(permanent.map((p) => p.offerId));
  const offers = [
    ...progress.offers.filter((id) => !paid.has(id)),
    ...permanent
      .filter((p) => wallet.unlocks.includes(p.key))
      .map((p) => p.offerId as CampaignOffer),
  ];
  const gear =
    progress.gear && offers.includes(('gear:' + progress.gear) as CampaignOffer)
      ? progress.gear
      : null;
  const style = Object.fromEntries(
    Object.entries(progress.style).filter(([, id]) =>
      ownsStyle({ cleared: progress.cleared, offers }, id),
    ),
  ) as BridgeStyle;
  return {
    ...progress,
    offers,
    gear,
    style,
    ownedWorlds: wallet.owned,
    world: wallet.owned.includes(progress.world) ? progress.world : wallet.equipped,
    clockFree:
      wallet.unlocks.includes('unlock.no_clock') &&
      (!progress.offers.includes('clock-free') || progress.clockFree),
  };
}
/** First sign-in carries guest-earned progress, never another account's paid inventory. */
export function seedAccountCampaign(progress: CampaignProgress): CampaignProgress {
  return {
    ...applyPaidEntitlements(progress, { unlocks: [], owned: ['obsidian'], equipped: 'obsidian' }),
    supplyAllocations: [],
  };
}
