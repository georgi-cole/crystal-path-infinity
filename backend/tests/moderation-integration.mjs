import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runServerIntegration } from './server-integration.mjs';
import { createModerationHandler } from '../../packages/server-core/src/moderation-api.ts';
import { createAccountLifecycleHandler } from '../../packages/server-core/src/account-lifecycle.ts';
import { createMvpServer } from '../../packages/server-core/src/server-app.ts';

export async function runModerationIntegration(adminPool, runtimePool) {
  await runServerIntegration(adminPool, runtimePool, async ({ runId, subject }) => {
    const admin = await adminPool.connect();
    const reporter = '00000000-0000-4000-8000-000000000481';
    const reporterToken = 'trusted-reporter-test-token';
    const staffToken = 'trusted-staff-test-token';
    const moderationHandler = createModerationHandler({
      database: runtimePool,
      allowOrigin: (origin) => origin === 'capacitor://localhost',
      rateLimit: () => Promise.resolve(true),
      authenticateReporter: (token) =>
        Promise.resolve(
          token === reporterToken ? { subject: reporter, reportAllowed: true } : null,
        ),
      authenticateModerator: (token) =>
        Promise.resolve(
          token === staffToken
            ? { actorReference: 'test-staff-1', canReadQueue: true, canReview: true }
            : null,
        ),
    });
    const handler = createMvpServer({ handlers: { moderation: moderationHandler } });
    const request = (route, token, body) =>
      new Request('https://example.invalid/moderation/' + route, {
        method: 'POST',
        headers: {
          origin: 'capacitor://localhost',
          'content-type': 'application/json',
          authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ schemaVersion: 1, ...body }),
      });
    try {
      await admin.query('insert into auth.users(id,email) values ($1::uuid,$2)', [
        reporter,
        'reporter@example.invalid',
      ]);
      await admin.query('select cpi_private.save_profile($1::uuid,$2,$3)', [
        reporter,
        'mod_reporter',
        'CA',
      ]);
      await admin.query('select cpi_private.publish_ranked_result($1::uuid)', [runId]);
      const target = (
        await admin.query(
          'select public_id from cpi_private.profile_owners where user_id=$1::uuid',
          [subject],
        )
      ).rows[0].public_id;
      for (let index = 0; index < 2; index++)
        assert.equal(
          (
            await handler(
              request('report', reporterToken, { targetPublicId: target, reason: 'impersonation' }),
            )
          ).status,
          200,
        );
      assert.equal(
        (
          await admin.query(
            'select count(*)::text as count from cpi_private.name_reports where reporter_user_id=$1::uuid',
            [reporter],
          )
        ).rows[0].count,
        '1',
      );
      assert.equal(
        (await handler(request('queue', reporterToken, { afterAt: null, afterId: null }))).status,
        403,
      );
      const queueResponse = await handler(
        request('queue', staffToken, { afterAt: null, afterId: null }),
      );
      assert.equal(queueResponse.status, 200, await queueResponse.clone().text());
      const queue = await queueResponse.json();
      assert.equal(queue.cases.length, 1);
      assert.equal(JSON.stringify(queue).includes(reporter), false);
      const caseId = queue.cases[0].caseId;
      for (const [decision, count] of [
        ['hide_player', '0'],
        ['restore_player', '1'],
      ]) {
        const response = await handler(
          request('review', staffToken, {
            caseId,
            decisionId: randomUUID(),
            decision,
            runId: null,
          }),
        );
        assert.equal(response.status, 200, await response.clone().text());
        for (const [scope, region, mapping] of [
          ['world', null, null],
          ['continent', 'EU', 'cpi-regions-2026-11-v1'],
          ['country', 'BG', 'cpi-regions-2026-11-v1'],
        ]) {
          const read = await admin.query(
            'select cpi_private.read_leaderboard($1,$2,$3,$4,null) as board',
            ['infinity-v1', scope, region, mapping],
          );
          assert.equal(read.rows[0].board.count, count);
        }
      }
      const accountHandler = createAccountLifecycleHandler({
        database: runtimePool,
        authenticate: () => Promise.resolve({ subject: reporter }),
        allowOrigin: () => true,
        rateLimit: () => Promise.resolve(true),
        verifyReauthentication: ({ purpose }) => {
          const now = Date.now();
          return Promise.resolve({
            subject: reporter,
            purpose,
            proofId: randomUUID(),
            verifiedAt: now,
            expiresAt: now + 60_000,
          });
        },
        revokeAllSessions: () => Promise.resolve(null),
      });
      const lifecycle = createMvpServer({ handlers: { account: accountHandler } });
      const exported = await lifecycle(
        new Request('https://example.invalid/account/export', {
          method: 'POST',
          headers: {
            origin: 'capacitor://localhost',
            'content-type': 'application/json',
            authorization: 'Bearer ' + reporterToken,
          },
          body: JSON.stringify({
            schemaVersion: 1,
            reauthProof: 'approved-reauth-proof-placeholder',
          }),
        }),
      );
      assert.equal(exported.status, 200, await exported.clone().text());
      const data = await exported.json();
      assert.equal(data.reports.length, 1);
      assert.equal(data.reports[0].targetPublicId, target);
      assert.equal(data.next.report, null);
      console.log(
        'Actual report/staff routes: durable duplicates, ordinary-token denial, hide/restore all scopes and own-report export passed.',
      );
    } finally {
      await admin.query('delete from auth.users where id=$1::uuid', [reporter]);
      admin.release();
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'cpi_ci');
  const { Pool } = await import('pg');
  const admin = new Pool({ max: 3 });
  const runtime = new Pool({ max: 4, options: '-c role=service_role' });
  try {
    await runModerationIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
