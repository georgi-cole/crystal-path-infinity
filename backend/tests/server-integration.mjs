import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createProfileHandler } from '../../packages/server-core/src/profile-api.ts';
import { PostgresRankedRepository } from '../../packages/server-core/src/postgres-ranked.ts';
import { RankedAuthority, RankedError } from '../../packages/server-core/src/ranked.ts';

/** Exact production SQL adapter and handlers, against a disposable real SQL engine. */
export async function runServerIntegration(adminPool, runtimePool, verifyPublished = null) {
  const admin = await adminPool.connect();
  const a = '00000000-0000-4000-8000-000000000451';
  const b = '00000000-0000-4000-8000-000000000452';
  const token = 'server-integration-token';
  let now = Date.now();
  const actor = { subject: a, deviceId: 'trusted-device-a' };
  const authority = new RankedAuthority({
    repository: new PostgresRankedRepository(runtimePool),
    now: () => now,
  });
  const profile = createProfileHandler({
    database: runtimePool,
    authenticate: (bearer) =>
      Promise.resolve(bearer === token ? { subject: a, profileAllowed: true } : null),
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    rateLimit: () => Promise.resolve(true),
  });
  try {
    await admin.query('insert into auth.users(id,email) values ($1::uuid,$2),($3::uuid,$4)', [
      a,
      'integration-a@example.invalid',
      b,
      'integration-b@example.invalid',
    ]);
    const saved = await profile(
      new Request('https://example.invalid/cpi/profile/save', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
          origin: 'capacitor://localhost',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          username: 'sql_integration',
          countryCode: 'BG',
          analyticsAction: 'keep',
          analyticsAgeBand: null,
        }),
      }),
    );
    assert.equal(saved.status, 200, await saved.clone().text());
    const body = await saved.json();
    assert.equal(body.owner.profile.username, 'sql_integration');
    assert.equal(body.config.countries.length, 249);
    assert.equal(body.owner.analyticsAllowed, false);
    const startKeys = [randomUUID(), randomUUID()];
    const starts = await Promise.allSettled(
      startKeys.map((idempotencyKey) => authority.start(actor, { idempotencyKey })),
    );
    assert.equal(
      starts.filter((entry) => entry.status === 'fulfilled').length,
      1,
      'one durable active run per account',
    );
    const winningIndex = starts.findIndex((entry) => entry.status === 'fulfilled');
    assert.ok(winningIndex >= 0);
    const start = starts[winningIndex].value;
    assert.deepEqual(
      await authority.start(actor, { idempotencyKey: startKeys[winningIndex] }),
      start,
      'lost start response is exactly recoverable',
    );
    assert.equal(start.snapshot.region.countryCode, 'BG');
    assert.equal(JSON.stringify(start).includes('hmac-sha256'), false);
    let reply = await authority.execute(actor, {
      runId: start.snapshot.runId,
      sequence: start.snapshot.nextSequence,
      idempotencyKey: randomUUID(),
      leaseToken: start.lease.token,
      command: { type: 'resume' },
    });
    now += 1000;
    const command = {
      runId: start.snapshot.runId,
      sequence: reply.snapshot.nextSequence,
      idempotencyKey: randomUUID(),
      leaseToken: reply.lease.token,
      command: { type: 'hint', row: reply.snapshot.currentRow, life: 0 },
    };
    const hints = await Promise.all([
      authority.execute(actor, command),
      authority.execute(actor, command),
    ]);
    assert.deepEqual(hints[0], hints[1], 'concurrent duplicate returns one committed receipt');
    assert.equal(hints[0].snapshot.hints, 1);
    assert.equal(hints[0].snapshot.activeTimeMs, 1000);
    const ledger = await admin.query(
      'select count(*)::text as count from cpi_private.ranked_action_audit where run_id=$1::uuid',
      [start.snapshot.runId],
    );
    assert.equal(ledger.rows[0].count, '2');
    now += 1000;
    const cleared = await authority.execute(actor, {
      runId: start.snapshot.runId,
      sequence: hints[0].snapshot.nextSequence,
      idempotencyKey: randomUUID(),
      leaseToken: hints[0].lease.token,
      command: {
        type: 'choose',
        row: hints[0].snapshot.currentRow,
        life: 0,
        side: hints[0].snapshot.current.revealedSafeSide,
      },
    });
    assert.equal(cleared.snapshot.lastClearedRow, '1');
    await assert.rejects(
      authority.execute({ subject: b, deviceId: actor.deviceId }, command),
      (error) => error instanceof RankedError && error.code === 'run-not-found',
    );
    const takeover = await authority.recover(
      { subject: a, deviceId: 'trusted-device-b' },
      { runId: start.snapshot.runId, idempotencyKey: randomUUID(), takeover: true },
    );
    await assert.rejects(
      authority.execute(actor, {
        ...command,
        idempotencyKey: randomUUID(),
        sequence: takeover.snapshot.nextSequence,
      }),
      (error) => error instanceof RankedError && error.code === 'lease-lost',
    );
    assert.equal(takeover.snapshot.hints, 1);
    const final = await authority.execute(
      { subject: a, deviceId: 'trusted-device-b' },
      {
        runId: start.snapshot.runId,
        sequence: takeover.snapshot.nextSequence,
        idempotencyKey: randomUUID(),
        leaseToken: takeover.lease.token,
        command: { type: 'end' },
      },
    );
    assert.equal(final.snapshot.status, 'finished');
    const run = await admin.query(
      'select server_validated,status,last_cleared_row,sp,hints,country_snapshot from cpi_private.ranked_runs where id=$1::uuid',
      [start.snapshot.runId],
    );
    assert.deepEqual(run.rows[0], {
      server_validated: true,
      status: 'finished',
      last_cleared_row: '1',
      sp: 300,
      hints: 1,
      country_snapshot: 'BG',
    });
    if (verifyPublished)
      await verifyPublished({ runId: start.snapshot.runId, subject: a, runtimePool });
    console.log(
      'Profile route + durable ranked adapter: identity, concurrency, exact retry, private state, takeover and finalization passed.',
    );
  } finally {
    await admin.query('delete from auth.users where id in ($1::uuid,$2::uuid)', [a, b]);
    admin.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'cpi_ci');
  const { Pool } = await import('pg');
  const admin = new Pool({ max: 2 });
  // Independent server-role connections prove the actual runtime grants, not superuser access.
  const runtime = new Pool({ max: 4, options: '-c role=service_role' });
  try {
    await runServerIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
