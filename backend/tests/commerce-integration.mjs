import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createCommerceService } from '../../packages/server-core/src/commerce-service.ts';

// Isolated PostgreSQL only. The provider fixture is deliberately synthetic, never live billing evidence.
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'cpi_ci');
const admin = new Pool({ max: 2 });
const runtime = new Pool({ max: 4, options: '-c role=service_role' });
const guest = new Pool({ max: 1, options: '-c role=authenticated' });
const a = randomUUID(),
  b = randomUUID();
const sku = 'fixture.credits.3';
const service = createCommerceService({
  database: runtime,
  economyReady: true,
  products: [{ platform: 'android', key: 'credits.3', sku, kind: 'credit', quantity: 3 }],
  verifyPurchase: (proof) =>
    Promise.resolve({
      status: 'verified',
      purchase: {
        platform: proof.platform,
        sku: proof.sku,
        transactionId: proof.transactionId,
        accountToken: proof.accountToken,
        fingerprint: createHash('sha256').update(proof.purchaseToken).digest('hex'),
        environment: 'sandbox',
      },
    }),
});
try {
  await admin.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
    a,
    a + '@example.invalid',
    b,
    b + '@example.invalid',
  ]);
  const first = await service.wallet(a),
    second = await service.wallet(b);
  const proof = {
    platform: 'android',
    sku,
    transactionId: randomUUID(),
    accountToken: first.accountToken,
    purchaseToken: randomUUID(),
  };
  const replies = await Promise.all(Array.from({ length: 16 }, () => service.verify(a, proof)));
  assert.ok(replies.every((reply) => reply.status === 'granted' && reply.wallet.credits === 3));
  assert.equal((await service.wallet(a)).revision, 1);
  await assert.rejects(service.verify(b, { ...proof, accountToken: second.accountToken }));
  assert.equal((await service.wallet(b)).credits, 0);
  await assert.rejects(guest.query('select * from cpi_private.commerce_wallets'));
  await assert.rejects(guest.query('select * from cpi_private.purchase_deliveries'));
  const allocationId = randomUUID();
  const amounts = { sp: 0, hints: 0, credits: 2, shields: 0, seasonChanges: 0 };
  const transfers = await Promise.all(
    Array.from({ length: 16 }, () => service.allocate(a, allocationId, amounts)),
  );
  assert.ok(transfers.every((reply) => reply.allocation.operationId === allocationId));
  assert.equal((await service.wallet(a)).credits, 1);
  await assert.rejects(service.allocate(b, allocationId, amounts));
  await assert.rejects(service.allocate(a, allocationId, { ...amounts, credits: 1 }));
  await assert.rejects(service.allocate(a, randomUUID(), amounts));
  await assert.rejects(service.acknowledgeAllocation(b, allocationId));
  await assert.rejects(guest.query('select * from cpi_private.offline_supply_allocations'));
  assert.equal((await service.pendingAllocations(a)).allocations.length, 1);
  assert.equal((await service.pendingAllocations(b)).allocations.length, 0);
  await service.acknowledgeAllocation(a, allocationId);
  await service.acknowledgeAllocation(a, allocationId);
  assert.equal((await service.pendingAllocations(a)).allocations.length, 0);
  await admin.query('delete from auth.users where id=$1', [a]);
  assert.equal(
    (
      await admin.query('select user_id from cpi_private.commerce_wallets where id=$1', [
        first.accountToken,
      ])
    ).rows[0].user_id,
    null,
  );
  await assert.rejects(service.verify(b, { ...proof, accountToken: second.accountToken }));
  assert.equal((await service.wallet(b)).credits, 0);
  console.log(
    'PostgreSQL service-role commerce: concurrent purchase and offline-transfer retries, exactly one grant/debit, changed-request and cross-account rejection, private-table denial, repeat acknowledgement and post-deletion tombstone passed. Synthetic provider only.',
  );
} finally {
  await admin.query('delete from auth.users where id in ($1,$2)', [a, b]);
  await Promise.all([runtime.end(), guest.end(), admin.end()]);
}
