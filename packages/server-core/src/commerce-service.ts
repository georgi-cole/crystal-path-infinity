import type { SqlPool, SqlConnection } from './database.ts';
import type { PurchaseProof, PurchaseVerifier, VerifiedPurchase } from './purchase-verification.ts';
const themes = ['obsidian', 'chaos', 'jelly', 'wilds', 'league', 'puppy', 'kitten'];
export interface CommerceProduct {
  readonly key: string;
  readonly sku: string;
  readonly platform: 'android' | 'ios';
  readonly kind: 'sp' | 'hints' | 'credit' | 'theme';
  readonly quantity: number;
  readonly theme?: string;
  /** Keep retired SKU mappings immutable for restore; exclude them from new checkouts. */
  readonly available?: boolean;
}
export interface CommerceWallet {
  revision: number;
  accountToken: string;
  sp: number;
  hints: number;
  credits: number;
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
    row.blocked !== false
  )
    throw new CommerceError();
  return {
    revision: count(row.revision),
    accountToken: row.id.toLowerCase(),
    sp: count(row.sp),
    hints: count(row.hints),
    credits: count(row.credits),
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
      !['sp', 'hints', 'credit', 'theme'].includes(product.kind) ||
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
    work: (connection: SqlConnection, current: CommerceWallet) => Promise<T>,
  ): Promise<T> {
    ready(subject);
    const connection = await options.database.connect();
    let broken: Error | undefined;
    try {
      await connection.query('begin');
      await connection.query(
        'insert into cpi_private.commerce_wallets(user_id) values($1::uuid) on conflict(user_id) do nothing',
        [subject],
      );
      const current = wallet(
        (
          await connection.query(
            'select * from cpi_private.commerce_wallets where user_id=$1::uuid for update',
            [subject],
          )
        ).rows[0],
      );
      const result = await work(connection, current);
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
  async function read(connection: SqlConnection, accountToken: string) {
    return wallet(
      (
        await connection.query('select * from cpi_private.commerce_wallets where id=$1::uuid', [
          accountToken,
        ])
      ).rows[0],
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
  return {
    catalog(subject: string, platform: PurchaseProof['platform']) {
      ready(subject);
      return products
        .filter((p) => p.platform === platform && p.available !== false)
        .map((p) => ({ key: p.key, sku: p.sku, consumable: p.kind !== 'theme' }));
    },
    wallet: (subject: string) =>
      transaction(subject, (_connection, current) => Promise.resolve(current)),
    begin(subject: string, platform: PurchaseProof['platform'], key: string) {
      const product = products.find(
        (p) => p.platform === platform && p.key === key && p.available !== false,
      );
      if (!product) throw new CommerceError();
      return transaction(subject, (_connection, current) =>
        Promise.resolve({
          accountToken: current.accountToken,
          sku: product.sku,
        }),
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
        verified.purchase.nativeConsumable !== (product.kind !== 'theme')
      )
        return { status: 'rejected' as const };
      return transaction(subject, async (connection, current) => {
        if (current.accountToken !== proof.accountToken) throw new CommerceError();
        const result = await connection.query(
          `insert into cpi_private.purchase_deliveries(fingerprint,wallet_id,platform,environment,transaction_id,sku,product_key)
           values($1,$2::uuid,$3,$4,$5,$6,$7) on conflict do nothing returning fingerprint`,
          [
            verified.purchase.fingerprint,
            current.accountToken,
            proof.platform,
            verified.purchase.environment,
            proof.transactionId,
            proof.sku,
            product.key,
          ],
        );
        if (result.rows.length) {
          if (product.kind === 'theme')
            await connection.query(
              `update cpi_private.commerce_wallets set owned=case when $2=any(owned) then owned else array_append(owned,$2) end, revision=revision+1 where id=$1::uuid`,
              [current.accountToken, product.theme!],
            );
          else {
            const column = product.kind === 'credit' ? 'credits' : product.kind;
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
        return {
          status: 'granted' as const,
          transactionId: proof.transactionId,
          consumable: product.kind !== 'theme',
          wallet: await read(connection, current.accountToken),
        };
      });
    },
    equip(subject: string, theme: string) {
      if (!themes.includes(theme)) throw new CommerceError();
      return transaction(subject, async (connection, current) => {
        if (!current.owned.includes(theme)) throw new CommerceError();
        await connection.query(
          'update cpi_private.commerce_wallets set equipped=$2,revision=revision+1 where id=$1::uuid',
          [current.accountToken, theme],
        );
        return read(connection, current.accountToken);
      });
    },
  };
}
