import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { runServerIntegration } from './server-integration.mjs';
import { createLeaderboardHandler } from '../../packages/server-core/src/leaderboard-api.ts';
import { createMvpServer } from '../../packages/server-core/src/server-app.ts';

export async function runLeaderboardIntegration(admin, runtime) {
  await runServerIntegration(admin, runtime, async ({ runId, subject, runtimePool }) => {
    const connection = await runtimePool.connect();
    try {
      const existing = await connection.query(
        'select count(*)::text as count from cpi_private.verified_results where run_id=$1::uuid and published_at is not null',
        [runId],
      );
      assert.equal(
        existing.rows[0].count,
        '1',
        'End command publishes atomically before any separate publisher call',
      );
      const result = await connection.query(
        'select cpi_private.publish_ranked_result($1::uuid) as result',
        [runId],
      );
      assert.equal(result.rows[0].result.lastClearedRow, '1');
      assert.deepEqual(
        (
          await connection.query('select cpi_private.publish_ranked_result($1::uuid) as result', [
            runId,
          ])
        ).rows,
        result.rows,
      );
    } finally {
      connection.release();
    }
    const token = 'verified-leaderboard-test-token';
    const leaderboardHandler = createLeaderboardHandler({
      database: runtimePool,
      allowedRulesets: ['infinity-v1'],
      allowedMappingVersions: ['cpi-regions-2026-11-v1'],
      allowOrigin: (origin) => origin === 'capacitor://localhost',
      allowPublicRead: () => true,
      rateLimit: () => Promise.resolve(true),
      authenticate: (bearer) =>
        Promise.resolve(bearer === token ? { subject, leaderboardAllowed: true } : null),
    });
    const handler = createMvpServer({ handlers: { leaderboard: leaderboardHandler } });
    for (const scope of ['world', 'continent', 'country']) {
      const query = {
        schemaVersion: 1,
        rulesetVersion: 'infinity-v1',
        scope,
        region: scope === 'world' ? null : scope === 'continent' ? 'EU' : 'BG',
        mappingVersion: scope === 'world' ? null : 'cpi-regions-2026-11-v1',
      };
      for (const authenticated of [false, true]) {
        const response = await handler(
          new Request('https://example.invalid/leaderboard/read', {
            method: 'POST',
            headers: {
              origin: 'capacitor://localhost',
              'content-type': 'application/json',
              ...(authenticated ? { authorization: 'Bearer ' + token } : {}),
            },
            body: JSON.stringify(query),
          }),
        );
        assert.equal(response.status, 200, await response.clone().text());
        const data = await response.json();
        assert.equal(data.count, '1');
        assert.equal(data.top100[0].lastClearedRow, '1');
        assert.equal(data.top100[0].countryCode, 'BG');
        assert.equal(data.own?.rank ?? null, authenticated ? '1' : null);
        assert.equal(JSON.stringify(data).includes(subject), false);
        for (const forbidden of [
          'email',
          'analyticsAgeBand',
          'privacyContext',
          'checkpoint_private',
          'leaseToken',
          'hmac',
        ])
          assert.equal(JSON.stringify(data).includes(forbidden), false);
      }
    }
    console.log(
      'Authoritative positive score -> immutable publication -> guest/owner World/Europe/Bulgaria API projections passed.',
    );
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'cpi_ci');
  const { Pool } = await import('pg');
  const admin = new Pool({ max: 2 });
  const runtime = new Pool({ max: 4, options: '-c role=service_role' });
  try {
    await runLeaderboardIntegration(admin, runtime);
  } finally {
    await Promise.all([runtime.end(), admin.end()]);
  }
}
