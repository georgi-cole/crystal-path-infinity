import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createCommerceService } from '../src/commerce-service.ts';
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
      'select count(*)::int as count from cpi_private.purchase_deliveries',
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
