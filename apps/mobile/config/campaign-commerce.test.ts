import { describe, expect, it } from 'vitest';
import { EMPTY_CAMPAIGN_PROGRESS, readCampaignSave, writeCampaignSave } from '../src/campaign-test';
import {
  applyPaidEntitlements,
  offlineSupplyCapacity,
  receiveOfflineSupplies,
  seedAccountCampaign,
} from '../src/commerce/campaign-inventory';
import { parseOfflineAllocation } from '../src/commerce/commerce-gateway';
import type { CommerceWallet } from '../src/commerce/commerce-types';
const wallet: CommerceWallet = {
  revision: 1,
  accountToken: 'ba000000-0000-4000-8000-000000000001',
  sp: 500,
  hints: 10,
  credits: 3,
  shields: 10,
  seasonChanges: 10,
  unlocks: [],
  owned: ['obsidian'],
  equipped: 'obsidian',
};
const allocation = {
  operationId: 'bb000000-0000-4000-8000-000000000001',
  sp: 500,
  hints: 10,
  credits: 3,
  shields: 10,
  seasonChanges: 10,
};
describe('account-owned offline Infinity supplies', () => {
  it('carries guest-earned Campaign progress into a first account without paid cosmetics or transfer receipts', () => {
    const seeded = seedAccountCampaign({
      ...EMPTY_CAMPAIGN_PROGRESS,
      cleared: ['light-the-lighthouse'],
      reserveHints: 3,
      style: { lighting: 'torches' },
      offers: ['clock-free', 'gear:umbrella'],
      gear: 'umbrella',
      world: 'jelly',
      clockFree: true,
      supplyAllocations: [allocation.operationId],
    });
    expect(seeded).toMatchObject({
      cleared: ['light-the-lighthouse'],
      reserveHints: 3,
      style: { lighting: 'torches' },
      offers: [],
      gear: null,
      world: 'obsidian',
      clockFree: false,
      supplyAllocations: [],
    });
  });
  it('saves the inventory and transfer receipt together and survives a replay after restart', () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const first = receiveOfflineSupplies(EMPTY_CAMPAIGN_PROGRESS, allocation);
    writeCampaignSave(storage, first, null, null);
    const restored = readCampaignSave(storage).progress;
    expect(receiveOfflineSupplies(restored, allocation)).toBe(restored);
    expect(restored).toMatchObject({
      reserveHints: 10,
      reserveSp: 500,
      continues: 3,
      shields: 10,
      seasonChanges: 10,
      supplyAllocations: [allocation.operationId],
    });
    expect(offlineSupplyCapacity({ ...restored, reserveHints: 9999 }, wallet).hints).toBe(1);
    expect(() =>
      receiveOfflineSupplies(
        { ...restored, reserveHints: 9999 },
        { ...allocation, operationId: 'bb000000-0000-4000-8000-000000000002' },
      ),
    ).toThrow();
  });
  it('removes another account or refunded paid items while preserving earned Campaign art and local supplies', () => {
    const old = {
      ...EMPTY_CAMPAIGN_PROGRESS,
      cleared: ['light-the-lighthouse' as const],
      reserveHints: 4,
      offers: ['gear:umbrella' as const, 'clock-free' as const, 'prism-kit' as const],
      gear: 'umbrella' as const,
      style: { lighting: 'torches' as const, tiles: 'prism-glass' as const },
      world: 'jelly' as const,
      clockFree: true,
    };
    const next = applyPaidEntitlements(old, wallet);
    expect(next).toMatchObject({
      gear: null,
      world: 'obsidian',
      clockFree: false,
      reserveHints: 4,
      offers: [],
      style: { lighting: 'torches' },
    });
    expect(next.style.tiles).toBeUndefined();
    const granted = applyPaidEntitlements(EMPTY_CAMPAIGN_PROGRESS, {
      ...wallet,
      unlocks: ['unlock.no_clock', 'gear.umbrella'],
    });
    expect(granted.clockFree).toBe(true);
    expect(granted.offers).toEqual(expect.arrayContaining(['clock-free', 'gear:umbrella']));
    expect(
      applyPaidEntitlements(
        { ...granted, clockFree: false },
        { ...wallet, unlocks: ['unlock.no_clock'] },
      ).clockFree,
    ).toBe(false);
  });
  it('rejects malformed transfer payloads before they can become supplies', () => {
    expect(parseOfflineAllocation(allocation)).toEqual(allocation);
    for (const value of [
      { ...allocation, hints: -1 },
      { ...allocation, shields: 1.5 },
      { ...allocation, sp: 10001 },
      { ...allocation, operationId: 'fake' },
      { ...allocation, free: true },
    ])
      expect(parseOfflineAllocation(value)).toBeNull();
  });
});
