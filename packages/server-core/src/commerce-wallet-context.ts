import type { SqlConnection } from './database.ts';

export interface CommerceWalletContext {
  /** Stable StoreKit/Play account binding; shared by this owner's two inventories. */
  readonly billingToken: string;
  readonly inventoryToken: string;
  readonly reviewWallet: boolean;
}

/** Called only after the real owner and their primary wallet are locked. */
export async function commerceWalletContext(
  connection: SqlConnection,
  subject: string,
  billingToken: string,
  reviewChoice?: boolean,
): Promise<CommerceWalletContext> {
  let row = (
    await connection.query(
      'select wallet_id,preferred from cpi_private.commerce_review_wallet_owners where user_id=$1::uuid for update',
      [subject],
    )
  ).rows[0];
  const reviewWallet = reviewChoice ?? row?.preferred === true;
  if (!reviewWallet) return { billingToken, inventoryToken: billingToken, reviewWallet: false };
  if (!row) {
    const created = (
      await connection.query(
        'insert into cpi_private.commerce_wallets(user_id) values(null) returning id',
      )
    ).rows[0];
    if (typeof created?.id !== 'string') throw new Error('Review inventory unavailable');
    row = (
      await connection.query(
        'insert into cpi_private.commerce_review_wallet_owners(user_id,wallet_id) values($1::uuid,$2::uuid) returning wallet_id,preferred',
        [subject, created.id],
      )
    ).rows[0];
  }
  if (typeof row?.wallet_id !== 'string') throw new Error('Review inventory unavailable');
  return { billingToken, inventoryToken: row.wallet_id, reviewWallet: true };
}
