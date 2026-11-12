import { commerceWalletContext } from './commerce-wallet-context.ts';
import type { CommerceWalletContext } from './commerce-wallet-context.ts';
import type { SqlPool, SqlConnection } from './database.ts';
import type { PurchaseProof, PurchaseVerifier, VerifiedPurchase } from './purchase-verification.ts';
import type { PrivateCryptography } from './private-services.ts';
import { createHash } from 'node:crypto';
import { parseOfflineSupplies } from './offline-supplies.ts';
import type { OfflineAllocation } from './offline-supplies.ts';
import {
  commerceResourceColumn,
  isAdventureUnlock,
  isConsumableProduct,
} from './adventure-products.ts';
const themes = ['obsidian', 'chaos', 'jelly', 'wilds', 'league', 'puppy', 'kitten'];
export interface CommerceProduct {
  readonly key: string;
  readonly sku: string;
  readonly platform: 'android' | 'ios';
  readonly kind: 'sp' | 'hints' | 'credit' | 'theme' | 'shields' | 'season_changes' | 'unlock';
  readonly quantity: number;
  readonly theme?: string;
  readonly unlock?: string;
  /** Keep retired SKU mappings immutable for restore; exclude them from new checkouts. */
  readonly available?: boolean;
}
export interface CommerceWallet {
  readonly inventoryToken?: string;
  readonly reviewWallet?: boolean;
  revision: number;
  accountToken: string;
  sp: number;
  hints: number;
  credits: number;
  shields: number;
  seasonChanges: number;
  unlocks: string[];
  owned: string[];
  equipped: string;
}
export class CommerceError extends Error {
  constructor() {
    super('Commerce unavailable');
    this.name = 'CommerceError';
  }
}
function count(value: unknown): number {
  const parsed =
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0)
    throw new CommerceError();
  return parsed;
}
function wallet(row: Record<string, unknown> | undefined): CommerceWallet {
  if (
    !row ||
    typeof row.id !== 'string' ||
    !Array.isArray(row.owned) ||
    !row.owned.includes('obsidian') ||
    new Set(row.owned).size !== row.owned.length ||
    row.owned.some((t) => !themes.includes(t as string)) ||
    typeof row.equipped !== 'string' ||
    !row.owned.includes(row.equipped) ||
    row.blocked !== false ||
    (row.unlocks !== undefined &&
      (!Array.isArray(row.unlocks) ||
        new Set(row.unlocks).size !== row.unlocks.length ||
        row.unlocks.some((key) => !isAdventureUnlock(key))))
  )
    throw new CommerceError();
  return {
    revision: count(row.revision),
    accountToken: row.id.toLowerCase(),
    sp: count(row.sp),
    hints: count(row.hints),
    credits: count(row.credits),
    shields: count(row.shields ?? 0),
    seasonChanges: count(row.season_changes ?? 0),
    unlocks: (row.unlocks ?? []) as string[],
    owned: row.owned as string[],
    equipped: row.equipped,
  };
}
/** Grants are immutable and idempotent. Neither price nor resource quantity comes from the receipt/client. */
export function createCommerceService(options: {
  database: SqlPool;
  products: readonly CommerceProduct[];
  verifyPurchase: PurchaseVerifier;
  /** Only a host with v11 server spending, refund processing and account-data lifecycle may activate. */
  economyReady: boolean;
  /** Required by the live host for durable Android acknowledgement; no raw token is logged. */
  completionCrypto?: PrivateCryptography;
  /** Isolated production review inventories; never used by official resource spending. */
  reviewWallets?: boolean;
}) {
  const products = options.products.map((product) => ({ ...product }));
  const keys = new Set<string>(),
    skus = new Set<string>();
  for (const product of products) {
    const pk = product.platform + ':' + product.key,
      ps = product.platform + ':' + product.sku;
    if (
      (product.available !== false && keys.has(pk)) ||
      skus.has(ps) ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(product.key) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(product.sku) ||
      /^(test\.|REPLACE|placeholder)/i.test(product.sku) ||
      !Number.isSafeInteger(product.quantity) ||
      product.quantity < 1 ||
      product.quantity > 100000 ||
      !['sp', 'hints', 'credit', 'theme', 'shields', 'season_changes', 'unlock'].includes(
        product.kind,
      ) ||
      (product.kind === 'unlock'
        ? product.quantity !== 1 ||
          !isAdventureUnlock(product.unlock) ||
          product.key !== product.unlock
        : product.unlock !== undefined) ||
      (product.kind !== 'theme' && product.theme !== undefined) ||
      (product.available !== undefined && typeof product.available !== 'boolean') ||
      (product.platform !== 'android' && product.platform !== 'ios') ||
      (product.kind === 'theme' &&
        (product.quantity !== 1 || !product.theme || !themes.slice(1).includes(product.theme)))
    )
      throw new CommerceError();
    if (product.available !== false) keys.add(pk);
    skus.add(ps);
  }
  function ready(subject: string) {
    if (
      !options.economyReady ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject)
    )
      throw new CommerceError();
  }
  async function transaction<T>(
    subject: string,
    work: (
      connection: SqlConnection,
      current: CommerceWallet,
      context: CommerceWalletContext,
    ) => Promise<T>,
    fingerprint?: string,
    reviewChoice?: boolean,
  ): Promise<T> {
    ready(subject);
    if (reviewChoice !== undefined && (!options.reviewWallets || typeof reviewChoice !== 'boolean'))
      throw new CommerceError();
    const connection = await options.database.connect();
    let broken: Error | undefined;
    try {
      await connection.query('begin');
      if (fingerprint)
        await connection.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
          'purchase:' + fingerprint,
        ]);
      await connection.query(
        'insert into cpi_private.profile_owners(user_id) values($1::uuid) on conflict do nothing',
        [subject],
      );
      const owner = await connection.query(
        'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
        [subject],
      );
      const deleting = await connection.query(
        'select 1 from cpi_private.account_deletion_requests where user_id=$1::uuid',
        [subject],
      );
      if (owner.rows.length !== 1 || deleting.rows.length) throw new CommerceError();
      await connection.query(
        'insert into cpi_private.commerce_wallets(user_id) values($1::uuid) on conflict(user_id) do nothing',
        [subject],
      );
      const primary = wallet(
        (
          await connection.query(
            'select * from cpi_private.commerce_wallets where user_id=$1::uuid for update',
            [subject],
          )
        ).rows[0],
      );
      const context = options.reviewWallets
        ? await commerceWalletContext(connection, subject, primary.accountToken, reviewChoice)
        : {
            billingToken: primary.accountToken,
            inventoryToken: primary.accountToken,
            reviewWallet: false,
          };
      const current = context.reviewWallet
        ? wallet(
            (
              await connection.query(
                'select * from cpi_private.commerce_wallets where id=$1::uuid and user_id is null for update',
                [context.inventoryToken],
              )
            ).rows[0],
          )
        : primary;
      const result = await work(connection, current, context);
      await connection.query('commit');
      return result;
    } catch {
      broken = new CommerceError();
      try {
        await connection.query('rollback');
      } catch {
        broken = new CommerceError();
      }
      throw new CommerceError();
    } finally {
      connection.release(broken);
    }
  }
  function wire(current: CommerceWallet, context: CommerceWalletContext): CommerceWallet {
    return options.reviewWallets
      ? {
          ...current,
          accountToken: context.billingToken,
          inventoryToken: context.inventoryToken,
          reviewWallet: context.reviewWallet,
        }
      : current;
  }
  async function read(
    connection: SqlConnection,
    accountToken: string,
    context: CommerceWalletContext,
  ) {
    return wire(
      wallet(
        (
          await connection.query('select * from cpi_private.commerce_wallets where id=$1::uuid', [
            accountToken,
          ])
        ).rows[0],
      ),
      context,
    );
  }
  function matches(purchase: VerifiedPurchase, proof: PurchaseProof) {
    return (
      purchase.platform === proof.platform &&
      purchase.sku === proof.sku &&
      purchase.transactionId === proof.transactionId &&
      purchase.accountToken === proof.accountToken &&
      /^[0-9a-f]{64}$/.test(purchase.fingerprint) &&
      (purchase.environment === 'sandbox' || purchase.environment === 'production')
    );
  }
  const operationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function allocation(row: Record<string, unknown>): OfflineAllocation {
    return {
      operationId: String(row.id),
      sp: count(row.sp),
      hints: count(row.hints),
      credits: count(row.credits),
      shields: count(row.shields),
      seasonChanges: count(row.season_changes),
    };
  }
  return {
    reviewWalletsEnabled: options.reviewWallets === true,
    /** A transfer is debited once on the server, then saved atomically with the local inventory. */
    allocate(subject: string, operationId: string, input: unknown, reviewChoice?: boolean) {
      const amounts = parseOfflineSupplies(input);
      if (!operationPattern.test(operationId) || !amounts) throw new CommerceError();
      const requestHash = createHash('sha256').update(JSON.stringify(amounts)).digest('hex');
      return transaction(
        subject,
        async (connection, current, context) => {
          const prior = (
            await connection.query(
              'select * from cpi_private.offline_supply_allocations where id=$1::uuid',
              [operationId],
            )
          ).rows[0];
          if (prior) {
            if (prior.wallet_id !== current.accountToken || prior.request_hash !== requestHash)
              throw new CommerceError();
            return { allocation: allocation(prior), wallet: wire(current, context) };
          }
          if (
            amounts.sp > current.sp ||
            amounts.hints > current.hints ||
            amounts.credits > current.credits ||
            amounts.shields > current.shields ||
            amounts.seasonChanges > current.seasonChanges
          )
            throw new CommerceError();
          const pending = await connection.query(
            'select id from cpi_private.offline_supply_allocations where wallet_id=$1::uuid and acknowledged_at is null limit 100',
            [current.accountToken],
          );
          if (pending.rows.length >= 100) throw new CommerceError();
          await connection.query(
            'update cpi_private.commerce_wallets set sp=sp-$2,hints=hints-$3,credits=credits-$4,shields=shields-$5,season_changes=season_changes-$6,revision=revision+1 where id=$1::uuid',
            [
              current.accountToken,
              amounts.sp,
              amounts.hints,
              amounts.credits,
              amounts.shields,
              amounts.seasonChanges,
            ],
          );
          const inserted = await connection.query(
            'insert into cpi_private.offline_supply_allocations(id,wallet_id,request_hash,sp,hints,credits,shields,season_changes) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) returning *',
            [
              operationId,
              current.accountToken,
              requestHash,
              amounts.sp,
              amounts.hints,
              amounts.credits,
              amounts.shields,
              amounts.seasonChanges,
            ],
          );
          return {
            allocation: allocation(inserted.rows[0]),
            wallet: await read(connection, current.accountToken, context),
          };
        },
        undefined,
        reviewChoice,
      );
    },
    pendingAllocations(subject: string, reviewChoice?: boolean) {
      return transaction(
        subject,
        async (connection, current, context) => ({
          allocations: (
            await connection.query(
              'select * from cpi_private.offline_supply_allocations where wallet_id=$1::uuid and acknowledged_at is null order by created_at,id limit 100',
              [current.accountToken],
            )
          ).rows.map(allocation),
          wallet: wire(current, context),
        }),
        undefined,
        reviewChoice,
      );
    },
    acknowledgeAllocation(subject: string, operationId: string, reviewChoice?: boolean) {
      if (!operationPattern.test(operationId)) throw new CommerceError();
      return transaction(
        subject,
        async (connection, current) => {
          const updated = await connection.query(
            'update cpi_private.offline_supply_allocations set acknowledged_at=coalesce(acknowledged_at,clock_timestamp()) where id=$1::uuid and wallet_id=$2::uuid returning id',
            [operationId, current.accountToken],
          );
          if (updated.rows.length !== 1) throw new CommerceError();
          return { acknowledged: operationId };
        },
        undefined,
        reviewChoice,
      );
    },
    catalog(subject: string, platform: PurchaseProof['platform']) {
      ready(subject);
      return products
        .filter((p) => p.platform === platform && p.available !== false)
        .map((p) => ({ key: p.key, sku: p.sku, consumable: isConsumableProduct(p.kind) }));
    },
    wallet: (subject: string, reviewChoice?: boolean) =>
      transaction(
        subject,
        (_connection, current, context) => Promise.resolve(wire(current, context)),
        undefined,
        reviewChoice,
      ),
    begin(
      subject: string,
      platform: PurchaseProof['platform'],
      key: string,
      reviewChoice?: boolean,
    ) {
      const product = products.find(
        (p) => p.platform === platform && p.key === key && p.available !== false,
      );
      if (!product) throw new CommerceError();
      return transaction(
        subject,
        (_connection, _current, context) =>
          Promise.resolve({
            accountToken: context.billingToken,
            sku: product.sku,
          }),
        undefined,
        reviewChoice,
      );
    },
    async verify(subject: string, proof: PurchaseProof) {
      ready(subject);
      const product = products.find((p) => p.platform === proof.platform && p.sku === proof.sku);
      if (!product) return { status: 'rejected' as const };
      // Verify outside the DB transaction; provider latency must not hold a wallet lock.
      const verified = await options.verifyPurchase(proof);
      if (verified.status !== 'verified') return verified;
      if (!matches(verified.purchase, proof)) throw new CommerceError();
      if (
        proof.platform === 'ios' &&
        verified.purchase.nativeConsumable !== isConsumableProduct(product.kind)
      )
        return { status: 'rejected' as const };
      return transaction(
        subject,
        async (connection, current, context) => {
          if (context.billingToken !== proof.accountToken) throw new CommerceError();
          const refund = await connection.query(
            'select 1 from cpi_private.purchase_refunds where reversed_at is null and (fingerprint=$1 or (platform=$2 and environment=$3 and transaction_id=$4))',
            [
              verified.purchase.fingerprint,
              proof.platform,
              verified.purchase.environment,
              proof.transactionId,
            ],
          );
          if (refund.rows.length) return { status: 'rejected' as const };
          const result = await connection.query(
            `insert into cpi_private.purchase_deliveries(fingerprint,wallet_id,platform,environment,transaction_id,sku,product_key,product_kind,quantity,theme,unlock_key)
           values($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing returning fingerprint`,
            [
              verified.purchase.fingerprint,
              current.accountToken,
              proof.platform,
              verified.purchase.environment,
              proof.transactionId,
              proof.sku,
              product.key,
              product.kind,
              product.quantity,
              product.theme ?? null,
              product.unlock ?? null,
            ],
          );
          if (result.rows.length) {
            if (product.kind === 'theme')
              await connection.query(
                `update cpi_private.commerce_wallets set owned=case when $2=any(owned) then owned else array_append(owned,$2) end, revision=revision+1 where id=$1::uuid`,
                [current.accountToken, product.theme!],
              );
            else if (product.kind === 'unlock')
              await connection.query(
                `update cpi_private.commerce_wallets set unlocks=case when $2=any(unlocks) then unlocks else array_append(unlocks,$2) end, revision=revision+1 where id=$1::uuid`,
                [current.accountToken, product.unlock!],
              );
            else {
              const column = commerceResourceColumn(product.kind);
              await connection.query(
                `update cpi_private.commerce_wallets set ${column}=${column}+$2, revision=revision+1 where id=$1::uuid`,
                [current.accountToken, product.quantity],
              );
            }
          } else {
            const existing = (
              await connection.query(
                'select wallet_id,sku,product_key,transaction_id from cpi_private.purchase_deliveries where fingerprint=$1',
                [verified.purchase.fingerprint],
              )
            ).rows[0];
            if (
              !existing ||
              existing.wallet_id !== current.accountToken ||
              existing.sku !== product.sku ||
              existing.product_key !== product.key ||
              existing.transaction_id !== proof.transactionId
            )
              throw new CommerceError();
          }
          if (options.reviewWallets)
            await connection.query(
              'update cpi_private.commerce_review_wallet_owners set preferred=$2 where user_id=$1::uuid',
              [subject, context.reviewWallet],
            );
          if (proof.platform === 'android' && options.completionCrypto)
            await connection.query(
              `insert into cpi_private.purchase_completion_jobs(fingerprint,payload_encrypted,next_attempt_at) values($1,$2,$3) on conflict do nothing`,
              [
                verified.purchase.fingerprint,
                options.completionCrypto.seal(proof, 'completion:' + verified.purchase.fingerprint),
                Date.now() + 600_000,
              ],
            );
          return {
            status: 'granted' as const,
            transactionId: proof.transactionId,
            consumable: isConsumableProduct(product.kind),
            wallet: await read(connection, current.accountToken, context),
          };
        },
        verified.purchase.fingerprint,
        options.reviewWallets ? verified.purchase.environment === 'sandbox' : undefined,
      );
    },
    equip(subject: string, theme: string, reviewChoice?: boolean) {
      if (!themes.includes(theme)) throw new CommerceError();
      return transaction(
        subject,
        async (connection, current, context) => {
          if (!current.owned.includes(theme)) throw new CommerceError();
          await connection.query(
            'update cpi_private.commerce_wallets set equipped=$2,revision=revision+1 where id=$1::uuid',
            [current.accountToken, theme],
          );
          return read(connection, current.accountToken, context);
        },
        undefined,
        reviewChoice,
      );
    },
  };
}
