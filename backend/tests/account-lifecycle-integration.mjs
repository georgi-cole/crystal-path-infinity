import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  createAccountLifecycleHandler,
  processAccountDeletion,
} from '../../packages/server-core/src/account-lifecycle.ts';

export async function runAccountLifecycleIntegration(adminPool, runtimePool) {
  const admin = await adminPool.connect();
  const subject = '00000000-0000-4000-8000-000000000461';
  const other = '00000000-0000-4000-8000-000000000462';
  const token = 'account-lifecycle-test-token';
  let revoke = false;
  const options = {
    database: runtimePool,
    allowOrigin: (origin) => origin === 'capacitor://localhost',
    rateLimit: () => Promise.resolve(true),
    authenticate: (bearer) => Promise.resolve(bearer === token ? { subject } : null),
    verifyReauthentication: ({ purpose }) => {
      const now = Date.now();
      return Promise.resolve({
        subject,
        purpose,
        proofId: randomUUID(),
        verifiedAt: now,
        expiresAt: now + 60_000,
      });
    },
    revokeAllSessions: ({ subject: owner, operationId }) =>
      Promise.resolve(
        revoke ? { status: 'revoked', subject: owner, operationId } : { status: 'unconfirmed' },
      ),
  };
  const handler = createAccountLifecycleHandler(options);
  const request = (endpoint, body) =>
    new Request('https://example.invalid/account/' + endpoint, {
      method: 'POST',
      headers: {
        origin: 'capacitor://localhost',
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ schemaVersion: 1, ...body }),
    });
  try {
    await admin.query('insert into auth.users(id,email) values ($1::uuid,$2),($3::uuid,$4)', [
      subject,
      'lifecycle-a@example.invalid',
      other,
      'lifecycle-b@example.invalid',
    ]);
    await admin.query('select cpi_private.save_profile($1::uuid,$2,$3)', [
      subject,
      'lifecycle_player',
      'BG',
    ]);
    await admin.query('select cpi_private.save_profile($1::uuid,$2,$3)', [
      other,
      'lifecycle_other',
      'CA',
    ]);
    const exported = await handler(
      request('export', { reauthProof: 'verified-proof-placeholder-123456' }),
    );
    assert.equal(exported.status, 200, await exported.clone().text());
    const data = await exported.json();
    assert.equal(data.profile.username, 'lifecycle_player');
    assert.equal(data.privateProfile.analyticsAgeBand, null);
    for (const forbidden of [
      'lifecycle_other',
      '@example.invalid',
      'checkpoint_private',
      'routeRng',
      'refreshToken',
    ])
      assert.equal(JSON.stringify(data).includes(forbidden), false);
    const pending = await handler(
      request('delete', { reauthProof: 'verified-proof-placeholder-234567' }),
    );
    assert.equal(pending.status, 202, await pending.clone().text());
    const receipt = await pending.json();
    assert.equal(receipt.status, 'revocation_pending');
    assert.equal(
      (
        await admin.query('select count(*)::text as count from auth.users where id=$1::uuid', [
          subject,
        ])
      ).rows[0].count,
      '1',
    );
    const runtime = await runtimePool.connect();
    try {
      await assert.rejects(
        runtime.query('select cpi_private.save_profile($1::uuid,$2,$3)', [
          subject,
          'frozen_change',
          'BG',
        ]),
        /CPI_ACCOUNT_DELETION_PENDING/,
      );
    } finally {
      runtime.release();
    }
    revoke = true;
    const completed = await processAccountDeletion(options, receipt.requestId);
    assert.equal(completed.status, 'deleted');
    assert.deepEqual(await processAccountDeletion(options, receipt.requestId), completed);
    assert.equal(
      (
        await admin.query('select count(*)::text as count from auth.users where id=$1::uuid', [
          subject,
        ])
      ).rows[0].count,
      '0',
    );
    assert.equal(
      (
        await admin.query(
          'select count(*)::text as count from public.profiles_public where username=$1',
          ['lifecycle_player'],
        )
      ).rows[0].count,
      '0',
    );
    assert.equal(
      (
        await admin.query('select count(*)::text as count from auth.users where id=$1::uuid', [
          other,
        ])
      ).rows[0].count,
      '1',
    );
    const status = await handler(request('status', { requestId: receipt.requestId }));
    assert.equal((await status.json()).status, 'deleted');
    console.log(
      'Actual lifecycle route + SQL: own export, failed revoke, frozen writes, worker recovery, deletion and A/B isolation passed.',
    );
  } finally {
    await admin.query('delete from auth.users where id in ($1::uuid,$2::uuid)', [subject, other]);
    admin.release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'cpi_ci');
  const { Pool } = await import('pg');
  const admin = new Pool({ max: 2 });
  const runtime = new Pool({ max: 4, options: '-c role=service_role' });
  try {
    await runAccountLifecycleIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
