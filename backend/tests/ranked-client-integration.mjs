import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRankedClient } from '../../apps/mobile/src/ranked/ranked-client.ts';
import { createRankedHandler } from '../../packages/server-core/src/ranked-api.ts';
import { PostgresRankedRepository } from '../../packages/server-core/src/postgres-ranked.ts';
import { RankedAuthority } from '../../packages/server-core/src/ranked.ts';
import { enableFixtureOperations } from './operations-fixture.mjs';
import { createMvpServer } from '../../packages/server-core/src/server-app.ts';

/** Actual mobile transport/parsing -> authenticated handler -> private SQL adapter. */
export async function runRankedClientIntegration(adminPool, runtimePool) {
  const admin = await adminPool.connect();
  const a = '00000000-0000-4000-8000-000000000581';
  const b = '00000000-0000-4000-8000-000000000582';
  const tokenA = 'synthetic-mobile-integration-token-A';
  const tokenB = 'synthetic-mobile-integration-token-B';
  let now = Date.now();
  let subject = a;
  let scope = Object.freeze({});
  const observers = new Set();
  const requests = new Set();
  const session = {
    accountScope: () => scope,
    subscribeAccountScope(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    async withAccountRequest(operation) {
      if (!scope) throw new Error('synthetic-session-unavailable');
      const epoch = scope;
      const owner = subject;
      const controller = new AbortController();
      requests.add(controller);
      try {
        const result = await operation({
          accessToken: owner === a ? tokenA : tokenB,
          signal: controller.signal,
        });
        if (epoch !== scope || owner !== subject || controller.signal.aborted)
          throw new Error('synthetic-session-changed');
        return result;
      } finally {
        requests.delete(controller);
      }
    },
  };
  function changeSession(nextSubject) {
    for (const request of requests) request.abort();
    requests.clear();
    scope = nextSubject === null ? null : Object.freeze({});
    if (nextSubject !== null) subject = nextSubject;
    for (const observer of observers) observer();
  }
  const authority = new RankedAuthority({
    repository: new PostgresRankedRepository(runtimePool),
    now: () => now,
  });
  const rankedHandler = createRankedHandler({
    basePath: '/cpi',
    authority,
    authenticate: (token) =>
      Promise.resolve(
        token === tokenA
          ? { subject: a, deviceId: 'trusted-mobile-device-A', clientBuild: 1, rankedAllowed: true }
          : token === tokenB
            ? {
                subject: b,
                deviceId: 'trusted-mobile-device-B',
                clientBuild: 1,
                rankedAllowed: true,
              }
            : null,
      ),
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    rateLimit: () => Promise.resolve(true),
  });
  const handler = createMvpServer({ basePath: '/cpi', handlers: { ranked: rankedHandler } });
  const bodies = [];
  let dropAfterCommit = false;
  const bridge = async (input, init) => {
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    assert.equal(new URL(address).origin, 'https://ranked-mobile.example.invalid');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.cache, 'no-store');
    const body = JSON.parse(init.body);
    assert.equal(Object.hasOwn(body, 'subject'), false);
    assert.equal(Object.hasOwn(body, 'deviceId'), false);
    assert.equal(Object.hasOwn(body, 'checkpoint'), false);
    bodies.push({ path: new URL(address).pathname, body: init.body });
    const headers = new Headers(init.headers);
    headers.set('origin', 'capacitor://localhost');
    now += 200;
    const result = await handler(new Request(address, { ...init, headers }));
    const text = await result.clone().text();
    assert.ok(
      result.status === 200 || result.status === 409,
      'Unexpected ranked route status ' + result.status,
    );
    for (const privateField of [
      '"stream"',
      '"mysteryRng"',
      '"privacyContext"',
      '"analyticsAgeBand"',
      '"subject"',
    ]) {
      assert.equal(text.includes(privateField), false);
    }
    if (dropAfterCommit && new URL(address).pathname === '/cpi/ranked/action') {
      dropAfterCommit = false;
      throw new Error('simulated-response-loss-after-durable-commit');
    }
    return result;
  };
  const makeClient = () => {
    const client = createRankedClient({
      baseUrl: 'https://ranked-mobile.example.invalid/cpi',
      session,
      fetcher: bridge,
    });
    assert.ok(client);
    return client;
  };
  let client = makeClient();
  let restorePolicy = () => Promise.resolve();
  try {
    restorePolicy = await enableFixtureOperations(admin);
    await admin.query('insert into auth.users(id,email) values ($1::uuid,$2),($3::uuid,$4)', [
      a,
      'mobile-ranked-a@example.invalid',
      b,
      'mobile-ranked-b@example.invalid',
    ]);
    const runtime = await runtimePool.connect();
    try {
      await runtime.query(
        'select cpi_private.save_profile($1::uuid,$2::text,$3::text,$4::text,null)',
        [a, 'mobile_ranked_a', 'BG', 'keep'],
      );
      await runtime.query(
        'select cpi_private.save_profile($1::uuid,$2::text,$3::text,$4::text,null)',
        [b, 'mobile_ranked_b', 'CA', 'keep'],
      );
    } finally {
      runtime.release();
    }
    assert.equal(await client.lookupActive(), null);
    await client.start();
    assert.equal(client.snapshot().phase, 'ready');
    assert.equal(client.snapshot().run.sp, 300);
    assert.equal(client.snapshot().run.lastClearedRow, '0');
    const runId = client.snapshot().run.runId;
    await client.command({ type: 'resume' });
    await client.command({ type: 'hint', row: '1', life: 0 });
    const side = client.snapshot().run.current.revealedSafeSide;
    assert.ok(side === 'left' || side === 'right');
    assert.equal(client.snapshot().run.hints, 1);
    dropAfterCommit = true;
    await client.command({ type: 'choose', row: '1', life: 0, side });
    assert.equal(client.snapshot().phase, 'retry');
    assert.equal(client.snapshot().run.lastClearedRow, '0', 'unconfirmed progress stays unchanged');
    const committed = await admin.query(
      'select last_cleared_row from cpi_private.ranked_runs where id=$1::uuid',
      [runId],
    );
    assert.equal(
      committed.rows[0].last_cleared_row,
      '1',
      'server committed before the response was lost',
    );
    const original = bodies.at(-1).body;
    await client.retry();
    assert.equal(
      bodies.at(-1).body,
      original,
      'retry uses the exact committed command identity and payload',
    );
    assert.equal(client.snapshot().phase, 'ready');
    assert.equal(client.snapshot().run.lastClearedRow, '1');
    assert.equal(client.snapshot().run.currentRow, '2');
    assert.equal(
      client.snapshot().run.history[0].index,
      '0',
      'real zero-based history parses without a fixture assumption',
    );
    const ledger = await admin.query(
      'select count(*)::text as count from cpi_private.ranked_action_audit where run_id=$1::uuid',
      [runId],
    );
    assert.equal(
      ledger.rows[0].count,
      '3',
      'resume, hint and one choice; retry did not duplicate the action',
    );

    client.dispose();
    client = makeClient();
    assert.equal(client.snapshot().run, null, 'restarted client has no local checkpoint or run ID');
    const before = await admin.query(
      'select checkpoint_private from cpi_private.ranked_runs where id=$1::uuid',
      [runId],
    );
    assert.equal(await client.lookupActive(), runId);
    const after = await admin.query(
      'select checkpoint_private from cpi_private.ranked_runs where id=$1::uuid',
      [runId],
    );
    assert.deepEqual(
      after.rows[0],
      before.rows[0],
      'active discovery does not rotate or advance the run',
    );
    await client.recover(runId);
    assert.equal(client.snapshot().phase, 'ready');
    assert.equal(client.snapshot().run.paused, true);
    assert.equal(client.snapshot().run.lastClearedRow, '1');
    assert.equal(client.snapshot().run.hints, 1);
    assert.equal(client.snapshot().run.region.countryCode, 'BG');
    await client.command({ type: 'end' });
    assert.equal(client.snapshot().phase, 'finished');
    const final = await admin.query(
      'select server_validated,status,last_cleared_row,hints from cpi_private.ranked_runs where id=$1::uuid',
      [runId],
    );
    assert.deepEqual(final.rows[0], {
      server_validated: true,
      status: 'finished',
      last_cleared_row: '1',
      hints: 1,
    });
    const published = await admin.query(
      'select last_cleared_row,published_at from cpi_private.verified_results where run_id=$1::uuid',
      [runId],
    );
    assert.equal(
      published.rows.length,
      1,
      'End publishes one final result in the same durable transaction',
    );
    assert.equal(published.rows[0].last_cleared_row, '1');
    assert.ok(published.rows[0].published_at);
    const otherDevice = await authority.start(
      { subject: a, deviceId: 'trusted-mobile-other-device', clientBuild: 1 },
      { idempotencyKey: randomUUID() },
    );
    await client.start();
    assert.equal(client.snapshot().phase, 'recovery');
    assert.equal(
      client.snapshot().run,
      null,
      'stale finished result is retired when another active run exists',
    );
    const currentId = await client.lookupActive();
    assert.equal(currentId, otherDevice.snapshot.runId);
    await client.recover(currentId);
    assert.equal(
      client.snapshot().phase,
      'lease_lost',
      'the other live device needs explicit takeover',
    );
    await client.recover(currentId, true);
    assert.equal(client.snapshot().run.runId, otherDevice.snapshot.runId);
    assert.equal(
      client.snapshot().run.lastClearedRow,
      '0',
      'a different run never inherits old progress',
    );
    changeSession(null);
    assert.equal(
      client.snapshot().run,
      null,
      'sign-out synchronously clears the displayed account result',
    );
    assert.equal(client.snapshot().phase, 'unavailable');
    changeSession(b);
    assert.equal(await client.lookupActive(), null, 'account B cannot discover account A run');
    assert.equal(client.snapshot().run, null);
    assert.equal(JSON.stringify(client.snapshot()).includes(runId), false);
    console.log(
      'Mobile ranked HTTP + PostgreSQL: confirmed-only progress, exact lost-response retry, restart discovery/recovery and account isolation passed.',
    );
  } finally {
    client.dispose();
    await admin.query('delete from auth.users where id in ($1::uuid,$2::uuid)', [a, b]);
    await restorePolicy();
    admin.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'cpi_ci');
  const { Pool } = await import('pg');
  const admin = new Pool({ max: 2 });
  const runtime = new Pool({ max: 2, options: '-c role=service_role' });
  try {
    await runRankedClientIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
