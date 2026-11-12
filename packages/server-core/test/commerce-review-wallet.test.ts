import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createCommerceService } from '../src/commerce-service.ts';
import { createPurchaseMaintenance } from '../src/purchase-maintenance.ts';
import { privateCryptography } from '../src/private-services.ts';
import type { SqlPool } from '../src/database.ts';
import type { PurchaseProof, PurchaseVerifier } from '../src/purchase-verification.ts';

const owner = 'fb000000-0000-4000-8000-000000000001';
const other = 'fb000000-0000-4000-8000-000000000002';
const sku = 'com.example.review.credits';
let db: PGlite;
let tail: Promise<void> = Promise.resolve();
const pool: SqlPool = {
  async connect() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise((done) => {
      release = done;
    });
    await previous;
    return {
      query: (sql, values) => db.query<Record<string, unknown>>(sql, values ? [...values] : []),
      release,
    };
  },
};
const fingerprint = (id: string) => createHash('sha256').update(id).digest('hex');
const verify: PurchaseVerifier = (proof) =>
  Promise.resolve(
    proof.transactionId === 'rejected'
      ? { status: 'rejected' }
      : {
          status: 'verified',
          purchase: {
            ...proof,
            environment: proof.transactionId.startsWith('review-') ? 'sandbox' : 'production',
            fingerprint: fingerprint(proof.transactionId),
          },
        },
  );
const service = createCommerceService({
  database: pool,
  economyReady: true,
  reviewWallets: true,
  products: [{ key: 'credits.3', sku, kind: 'credit', quantity: 3, platform: 'android' }],
  verifyPurchase: verify,
});
let billingToken: string;
let reviewInventory: string;
const proof = (transactionId: string): PurchaseProof => ({
  platform: 'android',
  sku,
  transactionId,
  accountToken: billingToken,
  purchaseToken: transactionId,
});

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(
    'create schema auth; create role anon; create role authenticated; create role service_role; create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_app_meta_data jsonb);',
  );
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(new URL(name, migrations), 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [owner, other]);
  billingToken = (await service.begin(owner, 'android', 'credits.3', false)).accountToken;
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe('production review purchase inventory', () => {
  it('keeps verified sandbox grants outside the primary wallet and rejects replay across owners', async () => {
    const first = await service.verify(owner, proof('review-one'));
    expect(first.status).toBe('granted');
    const review = await service.wallet(owner, true);
    reviewInventory = review.inventoryToken!;
    expect(review).toMatchObject({ accountToken: billingToken, reviewWallet: true, credits: 3 });
    expect(reviewInventory).not.toBe(billingToken);
    expect(await service.wallet(owner, false)).toMatchObject({ reviewWallet: false, credits: 0 });
    expect(
      (
        await db.query('select credits from cpi_private.commerce_wallets where user_id=$1::uuid', [
          owner,
        ])
      ).rows,
    ).toEqual([{ credits: 0 }]);
    expect(
      (
        await db.query('select user_id from cpi_private.commerce_wallets where id=$1::uuid', [
          reviewInventory,
        ])
      ).rows,
    ).toEqual([{ user_id: null }]);
    await service.verify(owner, proof('review-one'));
    expect((await service.wallet(owner, true)).credits).toBe(3);
    await expect(service.verify(other, proof('review-one'))).rejects.toThrow();
    expect((await service.wallet(other, false)).credits).toBe(0);
  });

  it('keeps live grants and review transfers independent despite a shared billing binding', async () => {
    await service.verify(owner, proof('live-one'));
    expect(await service.wallet(owner)).toMatchObject({
      accountToken: billingToken,
      inventoryToken: billingToken,
      reviewWallet: false,
      credits: 3,
    });
    const operationId = 'fb000000-0000-4000-8000-000000000010';
    const amounts = { sp: 0, hints: 0, credits: 2, shields: 0, seasonChanges: 0 };
    const transfer = await service.allocate(owner, operationId, amounts, true);
    expect(transfer.wallet).toMatchObject({
      inventoryToken: reviewInventory,
      reviewWallet: true,
      credits: 1,
    });
    expect((await service.wallet(owner, false)).credits).toBe(3);
    await expect(service.allocate(owner, operationId, amounts, false)).rejects.toThrow();
    await expect(service.acknowledgeAllocation(other, operationId, true)).rejects.toThrow();
    expect((await service.pendingAllocations(owner, true)).allocations).toHaveLength(1);
    expect((await service.pendingAllocations(owner, false)).allocations).toHaveLength(0);
    await service.acknowledgeAllocation(owner, operationId, true);
  });

  it('exports review data and applies review refunds without removing live credits', async () => {
    const maintenance = createPurchaseMaintenance({
      database: pool,
      crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
      acknowledgeAndroid: () => Promise.reject(new Error('Refund must not acknowledge a purchase')),
    });
    await maintenance.refund({
      fingerprint: fingerprint('review-one'),
      platform: 'android',
      environment: 'sandbox',
      transactionId: 'review-one',
      eventId: 'review-refund',
      effectiveAt: Date.now(),
    });
    expect((await service.wallet(owner, false)).credits).toBe(3);
    const exported = (
      await db.query<{ value: Record<string, unknown> }>(
        'select cpi_private.export_own_commerce($1::uuid,null,null,null,null) as value',
        [owner],
      )
    ).rows[0].value;
    expect(exported.wallet).toMatchObject({ credits: 3 });
    expect(exported.reviewWallet).toMatchObject({
      environment: 'sandbox',
      credits: 0,
      blocked: true,
    });
    expect(exported.purchases).toHaveLength(2);
    const transfers = (
      await db.query<{ value: { allocations: unknown[] } }>(
        'select cpi_private.export_own_offline_supplies($1::uuid,null) as value',
        [owner],
      )
    ).rows[0].value;
    expect(transfers.allocations).toHaveLength(1);
  });

  it('never grants a review balance for a rejected proof or an untrusted inventory selection', async () => {
    const emptyReview = await service.wallet(other, true);
    expect(emptyReview.credits).toBe(0);
    expect(
      await service.verify(other, { ...proof('rejected'), accountToken: emptyReview.accountToken }),
    ).toEqual({ status: 'rejected' });
    expect((await service.wallet(other, true)).credits).toBe(0);
    const legacy = createCommerceService({
      database: pool,
      economyReady: true,
      products: [],
      verifyPurchase: verify,
    });
    await expect(legacy.wallet(other, true)).rejects.toThrow();
  });
});
