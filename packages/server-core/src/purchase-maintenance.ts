import type { SqlPool } from './database.ts';
import type { PrivateCryptography } from './private-services.ts';
import { isObject, sqlTransaction } from './private-services.ts';
import { parsePurchaseProof } from './purchase-verification.ts';
import type { PurchaseProof } from './purchase-verification.ts';
import { randomUUID } from 'node:crypto';

export interface VerifiedRefund {
  readonly fingerprint: string;
  readonly platform: 'android' | 'ios';
  readonly environment: 'production' | 'sandbox';
  readonly transactionId: string;
  readonly eventId: string;
  readonly effectiveAt: number;
}
/** Only cryptographically verified Apple events or authenticated Google API results enter here. */
export function createPurchaseMaintenance(options: {
  database: SqlPool;
  crypto: PrivateCryptography;
  acknowledgeAndroid: (proof: PurchaseProof) => Promise<void>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  async function refund(event: VerifiedRefund, reverse = false) {
    if (
      !/^[a-f0-9]{64}$/.test(event.fingerprint) ||
      !event.transactionId ||
      event.transactionId.length > 256 ||
      !event.eventId ||
      event.eventId.length > 256 ||
      !Number.isSafeInteger(event.effectiveAt) ||
      event.effectiveAt < 0
    )
      throw new Error('Invalid provider event');
    return sqlTransaction(options.database, async (connection) => {
      await connection.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        'purchase:' + event.fingerprint,
      ]);
      const delivery = (
        await connection.query(
          'select d.*,w.user_id from cpi_private.purchase_deliveries d join cpi_private.commerce_wallets w on w.id=d.wallet_id where d.fingerprint=$1',
          [event.fingerprint],
        )
      ).rows[0];
      if (
        delivery &&
        (delivery.platform !== event.platform ||
          delivery.environment !== event.environment ||
          delivery.transaction_id !== event.transactionId)
      )
        throw new Error('Provider transaction mismatch');
      if (delivery?.user_id)
        await connection.query(
          'select user_id from cpi_private.profile_owners where user_id=$1::uuid for update',
          [delivery.user_id],
        );
      if (delivery)
        await connection.query(
          'select id from cpi_private.commerce_wallets where id=$1::uuid for update',
          [delivery.wallet_id],
        );
      const prior = (
        await connection.query(
          'select * from cpi_private.purchase_refunds where fingerprint=$1 for update',
          [event.fingerprint],
        )
      ).rows[0];
      if (prior && Number(prior.effective_at) >= event.effectiveAt) return { status: 'duplicate' };
      if (reverse) {
        if (!prior) {
          await connection.query(
            'insert into cpi_private.purchase_refunds(fingerprint,platform,environment,transaction_id,event_id,effective_at,reversed_at) values($1,$2,$3,$4,$5,$6,clock_timestamp())',
            [
              event.fingerprint,
              event.platform,
              event.environment,
              event.transactionId,
              event.eventId,
              event.effectiveAt,
            ],
          );
          return { status: 'recorded' };
        }
        await connection.query(
          'update cpi_private.purchase_refunds set reversed_at=clock_timestamp(),effective_at=$2,event_id=$3 where fingerprint=$1',
          [event.fingerprint, event.effectiveAt, event.eventId],
        );
        if (prior.reversed_at) return { status: 'ignored' };
        if (delivery?.revoked_at) {
          if (delivery.product_kind === 'theme')
            await connection.query(
              'update cpi_private.commerce_wallets set owned=case when $2=any(owned) then owned else array_append(owned,$2) end,revision=revision+1 where id=$1::uuid',
              [delivery.wallet_id, delivery.theme],
            );
          else {
            const column = delivery.product_kind === 'credit' ? 'credits' : delivery.product_kind;
            if (column !== 'sp' && column !== 'hints' && column !== 'credits')
              throw new Error('Unknown historical product');
            await connection.query(
              `update cpi_private.commerce_wallets set ${column}=${column}+$2,revision=revision+1 where id=$1::uuid`,
              [delivery.wallet_id, prior.applied_quantity],
            );
          }
          await connection.query(
            'update cpi_private.purchase_deliveries set revoked_at=null where fingerprint=$1',
            [event.fingerprint],
          );
          await connection.query(
            `update cpi_private.commerce_wallets w set blocked=exists(select 1 from cpi_private.purchase_deliveries d join cpi_private.purchase_refunds r using(fingerprint) where d.wallet_id=w.id and r.had_shortfall and r.reversed_at is null) where w.id=$1::uuid`,
            [delivery.wallet_id],
          );
        }
        return { status: 'reversed' };
      }
      if (prior && !prior.reversed_at) {
        await connection.query(
          'update cpi_private.purchase_refunds set effective_at=$2,event_id=$3 where fingerprint=$1',
          [event.fingerprint, event.effectiveAt, event.eventId],
        );
        return { status: 'duplicate' };
      }
      await connection.query(
        `insert into cpi_private.purchase_refunds(fingerprint,platform,environment,transaction_id,event_id,effective_at)
        values($1,$2,$3,$4,$5,$6) on conflict(fingerprint) do update set reversed_at=null,event_id=excluded.event_id,effective_at=excluded.effective_at,applied_quantity=0,had_shortfall=false`,
        [
          event.fingerprint,
          event.platform,
          event.environment,
          event.transactionId,
          event.eventId,
          event.effectiveAt,
        ],
      );
      if (!delivery) return { status: 'recorded' }; // Refund before delivery still prevents a later claim.
      if (!delivery.product_kind || !delivery.quantity)
        throw new Error('Historical product requires review');
      if (delivery.product_kind === 'theme') {
        const another =
          (
            await connection.query(
              'select 1 from cpi_private.purchase_deliveries where wallet_id=$1::uuid and theme=$2 and fingerprint<>$3 and revoked_at is null',
              [delivery.wallet_id, delivery.theme, event.fingerprint],
            )
          ).rows.length > 0;
        if (!another)
          await connection.query(
            `update cpi_private.commerce_wallets set owned=array_remove(owned,$2),equipped=case when equipped=$2 then 'obsidian' else equipped end,revision=revision+1 where id=$1::uuid`,
            [delivery.wallet_id, delivery.theme],
          );
      } else {
        const column = delivery.product_kind === 'credit' ? 'credits' : delivery.product_kind;
        if (column !== 'sp' && column !== 'hints' && column !== 'credits')
          throw new Error('Unknown product');
        const current = (
          await connection.query(
            `select ${column} as balance from cpi_private.commerce_wallets where id=$1::uuid`,
            [delivery.wallet_id],
          )
        ).rows[0];
        const balance = Number(current?.balance),
          quantity = Number(delivery.quantity);
        if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(quantity))
          throw new Error('Invalid wallet');
        const removed = Math.min(balance, quantity);
        await connection.query(
          `update cpi_private.commerce_wallets set ${column}=${column}-$2,blocked=blocked or $3,revision=revision+1 where id=$1::uuid`,
          [delivery.wallet_id, removed, balance < quantity],
        );
        await connection.query(
          'update cpi_private.purchase_refunds set applied_quantity=$2,had_shortfall=$3 where fingerprint=$1',
          [event.fingerprint, removed, balance < quantity],
        );
      }
      await connection.query(
        'update cpi_private.purchase_deliveries set revoked_at=clock_timestamp() where fingerprint=$1',
        [event.fingerprint],
      );
      await connection.query(
        'update cpi_private.purchase_completion_jobs set completed_at=$2,payload_encrypted=null where fingerprint=$1',
        [event.fingerprint, now()],
      );
      return { status: 'revoked' };
    });
  }
  async function completePurchases() {
    const jobs = await sqlTransaction(options.database, async (connection) => {
      const rows = (
        await connection.query(
          `select j.fingerprint,j.payload_encrypted,j.attempts from cpi_private.purchase_completion_jobs j
        join cpi_private.purchase_deliveries d using(fingerprint) where j.completed_at is null and j.next_attempt_at<=$1 and j.lease_until<$1 and d.revoked_at is null
        order by j.next_attempt_at limit 2 for update of j skip locked`,
          [now()],
        )
      ).rows;
      for (const row of rows)
        await connection.query(
          'update cpi_private.purchase_completion_jobs set lease_until=$2,attempts=attempts+1 where fingerprint=$1',
          [row.fingerprint, now() + 60_000],
        );
      return rows;
    });
    let completed = 0;
    for (const row of jobs) {
      const fingerprint = String(row.fingerprint);
      try {
        const proof = parsePurchaseProof(
          options.crypto.open(String(row.payload_encrypted), 'completion:' + fingerprint),
        );
        if (!proof || proof.platform !== 'android') throw new Error('Invalid private purchase');
        await options.acknowledgeAndroid(proof);
        await sqlTransaction(options.database, async (connection) => {
          await connection.query(
            'update cpi_private.purchase_completion_jobs set completed_at=$2,payload_encrypted=null where fingerprint=$1',
            [fingerprint, now()],
          );
        });
        completed++;
      } catch {
        const attempts = Number(row.attempts);
        await sqlTransaction(options.database, async (connection) => {
          await connection.query(
            'update cpi_private.purchase_completion_jobs set next_attempt_at=$2 where fingerprint=$1',
            [fingerprint, now() + Math.min(3_600_000, 60_000 * 2 ** Math.min(attempts, 6))],
          );
        });
      }
    }
    return { attempted: jobs.length, completed };
  }
  /** Persist the page cursor after every processed page; never advance past a failed provider event. */
  async function synchronize(
    name: string,
    first: unknown,
    page: (
      cursor: unknown,
    ) => Promise<{ events: readonly (VerifiedRefund & { reverse?: boolean })[]; next: unknown }>,
  ) {
    if (!/^[a-z0-9.-]{1,80}$/.test(name)) throw new Error('Invalid provider job');
    const leaseToken = randomUUID();
    const lease = await sqlTransaction(options.database, async (connection) => {
      await connection.query(
        'insert into cpi_private.provider_sync(name) values($1) on conflict do nothing',
        [name],
      );
      const row = (
        await connection.query('select * from cpi_private.provider_sync where name=$1 for update', [
          name,
        ])
      ).rows[0];
      if (!row || Number(row.lease_until) >= now()) return null;
      await connection.query(
        'update cpi_private.provider_sync set lease_until=$2,lease_token=$3::uuid where name=$1',
        [name, now() + 60_000, leaseToken],
      );
      return { cursor: row.cursor_private ?? first };
    });
    if (!lease) return { status: 'busy' };
    try {
      const result = await page(lease.cursor);
      if (result.events.length > 1000) throw new Error('Provider page too large');
      for (const event of [...result.events].sort((a, b) => a.effectiveAt - b.effectiveAt))
        await refund(event, event.reverse === true);
      await sqlTransaction(options.database, async (connection) => {
        await connection.query(
          'update cpi_private.provider_sync set cursor_private=$2::jsonb,lease_until=0,last_success_at=$3,caught_up_at=coalesce($5,caught_up_at) where name=$1 and lease_token=$4::uuid',
          [
            name,
            JSON.stringify(result.next),
            now(),
            leaseToken,
            isObject(result.next) &&
            result.next.page === null &&
            isObject(lease.cursor) &&
            typeof lease.cursor.end === 'number'
              ? Math.min(now(), lease.cursor.end)
              : null,
          ],
        );
      });
      return { status: 'synchronized', events: result.events.length };
    } catch {
      await sqlTransaction(options.database, async (connection) => {
        await connection.query(
          'update cpi_private.provider_sync set lease_until=0,last_failure_at=$2 where name=$1 and lease_token=$3::uuid',
          [name, now(), leaseToken],
        );
      });
      throw new Error('Provider synchronization unavailable');
    }
  }
  return { refund, completePurchases, synchronize };
}
export function syncCursor(value: unknown): { start: number; end: number; page: string | null } {
  if (
    !isObject(value) ||
    typeof value.start !== 'number' ||
    !Number.isSafeInteger(value.start) ||
    typeof value.end !== 'number' ||
    !Number.isSafeInteger(value.end) ||
    value.start < 0 ||
    value.end < value.start ||
    !(value.page === null || (typeof value.page === 'string' && value.page.length < 8192))
  )
    throw new Error('Invalid provider cursor');
  return { start: value.start, end: value.end, page: value.page };
}
