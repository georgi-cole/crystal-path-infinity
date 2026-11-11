import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createCommerceService } from '../src/commerce-service.ts';
import { createHash } from 'node:crypto';
import { createPurchaseMaintenance } from '../src/purchase-maintenance.ts';
import { privateCryptography } from '../src/private-services.ts';
import type { SqlPool } from '../src/database.ts';
import type { PurchaseProof, PurchaseVerification } from '../src/purchase-verification.ts';
const user = 'fa000000-0000-4000-8000-000000000001',
  other = 'fa000000-0000-4000-8000-000000000002';
const sku = 'com.example.credits3';
let database: PGlite;
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
      query: (text, values) =>
        Promise.resolve(database.query<Record<string, unknown>>(text, values ? [...values] : [])),
      release,
    };
  },
};
const product = {
  key: 'credits.3',
  sku,
  kind: 'credit' as const,
  quantity: 3,
  platform: 'android' as const,
};
let verification: PurchaseVerification | null = null;
const service = createCommerceService({
  database: pool,
  economyReady: true,
  products: [
    product,
    {
      key: 'theme.chaos',
      sku: 'com.example.chaos',
      kind: 'theme',
      theme: 'chaos',
      quantity: 1,
      platform: 'android',
    },
  ],
  verifyPurchase: (proof) =>
    Promise.resolve(
      verification ?? {
        status: 'verified',
        purchase: {
          ...proof,
          fingerprint: 'a'.repeat(64),
          environment: 'sandbox',
        },
      },
    ),
});
beforeAll(async () => {
  database = await PGlite.create();
  await database.exec(`create schema auth;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_app_meta_data jsonb);`);
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await database.exec(readFileSync(new URL(name, migrations), 'utf8'));
  await database.query('insert into auth.users(id) values($1),($2)', [user, other]);
}, 30000);
afterAll(async () => {
  await database?.close();
});
describe('commerce delivery against embedded PostgreSQL', () => {
  it('transfers offline supplies once and keeps interrupted delivery recoverable only by its owner', async () => {
    await database.query(
      'insert into cpi_private.commerce_wallets(user_id,sp,hints,credits,shields,season_changes) values($1::uuid,100,10,3,10,10) on conflict(user_id) do nothing',
      [user],
    );
    const operationId = 'bb000000-0000-4000-8000-000000000001';
    const amounts = { sp: 25, hints: 2, credits: 1, shields: 5, seasonChanges: 2 };
    const [first, replay] = await Promise.all([
      service.allocate(user, operationId, amounts),
      service.allocate(user, operationId, amounts),
    ]);
    expect(first.allocation).toEqual({ ...amounts, operationId });
    expect(replay.allocation).toEqual(first.allocation);
    expect(await service.wallet(user)).toMatchObject({
      sp: 75,
      hints: 8,
      credits: 2,
      shields: 5,
      seasonChanges: 8,
    });
    await expect(service.allocate(user, operationId, { ...amounts, hints: 3 })).rejects.toThrow();
    await expect(service.allocate(other, operationId, amounts)).rejects.toThrow();
    await expect(service.acknowledgeAllocation(other, operationId)).rejects.toThrow();
    expect((await service.pendingAllocations(other)).allocations).toEqual([]);
    expect((await service.pendingAllocations(user)).allocations).toEqual([first.allocation]);
    await service.acknowledgeAllocation(user, operationId);
    await service.acknowledgeAllocation(user, operationId);
    expect((await service.pendingAllocations(user)).allocations).toEqual([]);
    for (const input of [
      { ...amounts, shields: 999 },
      { ...amounts, sp: -1 },
      { ...amounts, credits: 0.5 },
      { ...amounts, free: 100 },
    ])
      await expect(
        Promise.resolve().then(() =>
          service.allocate(user, 'bb000000-0000-4000-8000-000000000002', input),
        ),
      ).rejects.toThrow();
    // Keep this suite's older receipt-delivery fixtures independent of the transfer.
    await database.query(
      'update cpi_private.commerce_wallets set sp=0,hints=0,credits=0,shields=0,season_changes=0 where user_id=$1::uuid',
      [user],
    );
  });
  it('stacks new supply packs once per payment and restores/refunds permanent gear independently', async () => {
    const products = [
      {
        key: 'shields.10',
        sku: 'com.example.shields10',
        kind: 'shields' as const,
        quantity: 10,
        platform: 'android' as const,
      },
      {
        key: 'season_changes.10',
        sku: 'com.example.seasons10',
        kind: 'season_changes' as const,
        quantity: 10,
        platform: 'android' as const,
      },
      {
        key: 'gear.umbrella',
        sku: 'com.example.umbrella',
        kind: 'unlock' as const,
        unlock: 'gear.umbrella',
        quantity: 1,
        platform: 'android' as const,
      },
    ];
    const fingerprint = (transaction: string) =>
      createHash('sha256').update(transaction).digest('hex');
    const adventure = createCommerceService({
      database: pool,
      economyReady: true,
      products,
      verifyPurchase: (proof) =>
        Promise.resolve({
          status: 'verified',
          purchase: {
            ...proof,
            fingerprint: fingerprint(proof.transactionId),
            environment: 'sandbox',
          },
        }),
    });
    const wallet = await adventure.wallet(other);
    const proof = (sku: string, transactionId: string): PurchaseProof => ({
      platform: 'android',
      sku,
      transactionId,
      purchaseToken: 'test-provider-proof',
      accountToken: wallet.accountToken,
    });
    await adventure.verify(other, proof(products[0].sku, 'shield-a'));
    await adventure.verify(other, proof(products[0].sku, 'shield-a'));
    await adventure.verify(other, proof(products[0].sku, 'shield-b'));
    await adventure.verify(other, proof(products[1].sku, 'season-a'));
    await adventure.verify(other, proof(products[2].sku, 'umbrella-a'));
    await adventure.verify(other, proof(products[2].sku, 'umbrella-b'));
    expect(await adventure.wallet(other)).toMatchObject({
      shields: 20,
      seasonChanges: 10,
      unlocks: ['gear.umbrella'],
    });
    expect(adventure.catalog(other, 'android').map((p) => p.consumable)).toEqual([
      true,
      true,
      false,
    ]);
    const maintenance = createPurchaseMaintenance({
      database: pool,
      crypto: privateCryptography('1'.repeat(64), '2'.repeat(64)),
      acknowledgeAndroid: async () => {},
    });
    const refund = (transactionId: string, effectiveAt: number) => ({
      fingerprint: fingerprint(transactionId),
      platform: 'android' as const,
      environment: 'sandbox' as const,
      transactionId,
      eventId: 'event-' + effectiveAt,
      effectiveAt,
    });
    await maintenance.refund(refund('umbrella-a', 1));
    expect((await adventure.wallet(other)).unlocks).toEqual(['gear.umbrella']);
    await maintenance.refund(refund('umbrella-b', 2));
    expect((await adventure.wallet(other)).unlocks).toEqual([]);
    await maintenance.refund(refund('umbrella-b', 3), true);
    expect((await adventure.wallet(other)).unlocks).toEqual(['gear.umbrella']);
    await maintenance.refund(refund('shield-a', 4));
    expect((await adventure.wallet(other)).shields).toBe(10);
    await maintenance.refund(refund('shield-a', 5), true);
    expect((await adventure.wallet(other)).shields).toBe(20);
  });
  it('credits a verified transaction once, even when delivery acknowledgement is lost', async () => {
    const wallet = await service.wallet(user);
    const proof: PurchaseProof = {
      platform: 'android',
      sku,
      transactionId: 'order1',
      purchaseToken: 'provider-token',
      accountToken: wallet.accountToken,
    };
    const [first, duplicate] = await Promise.all([
      service.verify(user, proof),
      service.verify(user, proof),
    ]);
    expect(first.status).toBe('granted');
    expect(duplicate.status).toBe('granted');
    expect((await service.wallet(user)).credits).toBe(3);
    const count = await database.query<{ count: number }>(
      'select count(*)::int as count from cpi_private.purchase_deliveries where sku=$1',
      [sku],
    );
    expect(count.rows[0].count).toBe(1);
    const foreign = await service.wallet(other);
    await expect(
      service.verify(other, { ...proof, accountToken: foreign.accountToken }),
    ).rejects.toThrow();
    expect((await service.wallet(other)).credits).toBe(0);
  });
  it('grants nothing for pending or rejected payments and cannot equip an unowned world', async () => {
    const wallet = await service.wallet(other);
    const proof: PurchaseProof = {
      platform: 'android',
      sku,
      transactionId: 'order2',
      purchaseToken: 'pending',
      accountToken: wallet.accountToken,
    };
    verification = { status: 'pending' };
    expect(await service.verify(other, proof)).toEqual({ status: 'pending' });
    verification = { status: 'rejected' };
    expect(await service.verify(other, proof)).toEqual({ status: 'rejected' });
    verification = null;
    expect((await service.wallet(other)).credits).toBe(0);
    await expect(service.equip(other, 'chaos')).rejects.toThrow();
    expect((await service.wallet(other)).equipped).toBe('obsidian');
  });
  it('retains the replay barrier after Auth deletion without retaining the user ID', async () => {
    const old = await service.wallet(user);
    await database.query('delete from auth.users where id=$1', [user]);
    const retained = await database.query<{ user_id: string | null }>(
      'select user_id from cpi_private.commerce_wallets where id=$1',
      [old.accountToken],
    );
    expect(retained.rows[0].user_id).toBeNull();
    const foreign = await service.wallet(other);
    await expect(
      service.verify(other, {
        platform: 'android',
        sku,
        transactionId: 'order1',
        purchaseToken: 'provider-token',
        accountToken: foreign.accountToken,
      }),
    ).rejects.toThrow();
    expect((await service.wallet(other)).credits).toBe(0);
  });
  it('keeps the catalog closed until spending, refunds and lifecycle integration are deployed', () => {
    const disabled = createCommerceService({
      database: pool,
      economyReady: false,
      products: [product],
      verifyPurchase: () => Promise.resolve({ status: 'rejected' }),
    });
    expect(() => disabled.catalog(other, 'android')).toThrow();
    expect(() =>
      createCommerceService({
        database: pool,
        economyReady: true,
        products: [{ ...product, sku: 'test.credits.3' }],
        verifyPurchase: () => Promise.resolve({ status: 'rejected' }),
      }),
    ).toThrow();
  });
  it('keeps retired SKUs restorable without offering them for another checkout', async () => {
    const catalog = createCommerceService({
      database: pool,
      economyReady: true,
      products: [{ ...product, sku: 'com.example.retired', available: false }, product],
      verifyPurchase: (proof) =>
        Promise.resolve({
          status: 'verified',
          purchase: {
            platform: proof.platform,
            environment: 'sandbox',
            sku: proof.sku,
            transactionId: proof.transactionId,
            accountToken: proof.accountToken,
            fingerprint: 'b'.repeat(64),
          },
        }),
    });
    expect(catalog.catalog(other, 'android')).toEqual([
      { key: product.key, sku: product.sku, consumable: true },
    ]);
    expect(await catalog.begin(other, 'android', product.key)).toMatchObject({ sku: product.sku });
    const wallet = await catalog.wallet(other);
    expect(
      await catalog.verify(other, {
        platform: 'android',
        sku: 'com.example.retired',
        transactionId: 'legacy-order',
        accountToken: wallet.accountToken,
        purchaseToken: 'legacy-token',
      }),
    ).toMatchObject({ status: 'granted', consumable: true, wallet: { credits: 3 } });
  });
});
