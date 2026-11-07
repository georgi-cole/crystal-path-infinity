import type { SqlPool } from './database.ts';
import type { PrivateCryptography } from './private-services.ts';
import { sqlTransaction } from './private-services.ts';

/** Fixed windows in PostgreSQL: all edge instances share the same counters. Keys are HMACs, not IPs/emails. */
export function createDurableRateLimit(
  database: SqlPool,
  crypto: PrivateCryptography,
  now: () => number = Date.now,
) {
  return async (key: string, maximum: number, windowMs: number): Promise<boolean> => {
    const start = Math.floor(now() / windowMs) * windowMs;
    const row = await sqlTransaction(
      database,
      async (connection) =>
        (
          await connection.query(
            `insert into cpi_private.account_rate_limits as r(key_hash,window_start,count) values($1,$2,1)
       on conflict(key_hash,window_start) do update set count=least(r.count+1,$3+1) returning count`,
            [crypto.digest('rate', key), start, maximum],
          )
        ).rows[0],
    );
    return typeof row?.count === 'number' && row.count <= maximum;
  };
}
