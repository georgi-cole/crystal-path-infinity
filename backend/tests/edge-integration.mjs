import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  createApprovedEdgeServices,
  createSupabaseEdgeHandler,
  createSupabaseIdentityVerifier,
  DEVELOPMENT_PROJECT,
} from '../../packages/server-core/src/supabase-edge.ts';
import { createEdgeSqlPool } from '../../packages/server-core/src/supabase-database.ts';

/** Actual HTTP/handler/SQL boundary; synthetic Auth replies and policy approvals only. */
export async function runEdgeIntegration(adminPool, runtimePool) {
  const config = {
    projectUrl: `https://${DEVELOPMENT_PROJECT}.supabase.co`,
    publishableKey: 'synthetic-public-key',
    origins: ['capacitor://localhost'],
  };
  const a = '00000000-0000-4000-8000-000000000891';
  const b = '00000000-0000-4000-8000-000000000892';
  const tokens = new Map([
    ['synthetic-account-a-token', a],
    ['synthetic-account-b-token', b],
  ]);
  let policyAllowed = true;
  let limiting = false;
  const verified = createSupabaseIdentityVerifier(config, async (_url, init) => {
    const token = init.headers.authorization.slice(7);
    const id = tokens.get(token);
    return id
      ? Response.json({
          id,
          role: 'authenticated',
          is_anonymous: false,
          email_confirmed_at: '2026-11-04T00:00:00Z',
        })
      : Response.json({}, { status: 401 });
  });
  const database = createEdgeSqlPool(
    `postgresql://postgres:synthetic@db.${DEVELOPMENT_PROJECT}.supabase.co:5432/postgres`,
    () => {
      let connection;
      return {
        async connect() {
          connection = await runtimePool.connect();
        },
        query: (sql, values) => connection.query(sql, values),
        async end() {
          connection?.release();
        },
      };
    },
  );
  const server = createSupabaseEdgeHandler(
    config,
    createApprovedEdgeServices(config, {
      database,
      verifyIdentity: verified,
      authorize: () => Promise.resolve(policyAllowed),
      rateLimit: () => Promise.resolve(!limiting),
      allowedRulesets: ['infinity-v1'],
      allowedMappingVersions: ['countries-v1'],
    }),
  );
  const admin = await adminPool.connect();
  const post = async (path, body, token = 'synthetic-account-a-token', expected = 200) => {
    const response = await server(
      new Request(config.projectUrl + '/functions/v1/cpi-api/' + path, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          origin: 'capacitor://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ schemaVersion: 1, ...body }),
      }),
    );
    assert.equal(response.status, expected, `${path} returned ${response.status}`);
    return response.json();
  };
  try {
    await admin.query('insert into auth.users(id,email) values($1::uuid,$2),($3::uuid,$4)', [
      a,
      'edge-a@example.invalid',
      b,
      'edge-b@example.invalid',
    ]);
    await post('profile/save', {
      username: 'EdgePilotA',
      countryCode: 'BG',
      analyticsAction: 'keep',
      analyticsAgeBand: null,
    });
    await post(
      'profile/save',
      {
        username: 'EdgePilotB',
        countryCode: 'US',
        analyticsAction: 'keep',
        analyticsAgeBand: null,
      },
      'synthetic-account-b-token',
    );
    const own = await post('profile/read', {});
    const other = await post('profile/read', {}, 'synthetic-account-b-token');
    assert.equal(own.owner.profile.username, 'edgepilota');
    assert.ok(!JSON.stringify(own).includes('edgepilotb'));
    assert.equal(other.owner.profile.username, 'edgepilotb');
    assert.ok(!JSON.stringify(other).includes('edgepilota'));
    assert.ok(!JSON.stringify(own).includes(a));
    await post(
      'profile/save',
      {
        username: 'AttemptOwner',
        countryCode: 'BG',
        analyticsAction: 'keep',
        analyticsAgeBand: null,
        userId: b,
      },
      undefined,
      400,
    );
    await post('profile/read', {}, 'synthetic-forged-token', 401);
    policyAllowed = false;
    await post('profile/read', {}, undefined, 401);
    policyAllowed = true;
    limiting = true;
    await post('profile/read', {}, undefined, 429);
    limiting = false;
    await post('otp/request', { email: 'must-not-collect@example.invalid' }, undefined, 503);
    await post('rewards/intent', {}, undefined, 503);
    await post('ranked/start', {}, undefined, 503);
    console.log(
      'Edge HTTP + remote identity boundary + actual profile SQL: A/B isolation, denied policy, limiter, role selection, closed signup/ad/ranked gates passed.',
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
  const runtime = new Pool({ max: 4, options: '-c role=service_role' });
  try {
    await runEdgeIntegration(admin, runtime);
  } finally {
    await Promise.all([admin.end(), runtime.end()]);
  }
}
