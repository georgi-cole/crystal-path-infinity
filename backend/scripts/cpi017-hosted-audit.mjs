// CPI-017 hosted security audit. One restricted SELECT per test, no hosted mutation.
// SQL identifiers are a fixed source whitelist; no user input becomes SQL.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_REF = 'jbyguybxhezjhdbenevh';
export const PRIVATE_TABLES = Object.freeze([
  'profile_owners',
  'profiles_private',
  'consent_events',
  'parental_authorizations',
  'ranked_runs',
  'run_actions',
  'reward_intents',
  'reward_transactions',
  'revive_grants',
  'verified_results',
]);

export function buildAuditChecks() {
  const checks = [];
  function add(id, condition, source = '') {
    const label = 'CPI017_AUDIT_' + id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    checks.push({
      id,
      ok: label + '_OK',
      fail: label + '_FAIL',
      sql:
        'select case when ' +
        condition +
        " then '" + label + "_OK' else '" + label + "_FAIL' end as cpi017_audit" +
        source +
        ';',
    });
  }
  const tables = ['public.profiles_public', ...PRIVATE_TABLES.map((name) => 'cpi_private.' + name)];
  for (const table of tables) {
    add('exists-' + table, "pg_catalog.to_regclass('" + table + "') is not null");
  }
  // The previous large aggregate/JOIN statement was rejected by the hosted
  // read-only API. Here each query has at most one fully qualified FROM.
  for (const table of tables) {
    add(
      'forced-rls-' + table,
      'pg_catalog.pg_class.relrowsecurity and pg_catalog.pg_class.relforcerowsecurity',
      " from pg_catalog.pg_class where pg_catalog.pg_class.oid = pg_catalog.to_regclass('" +
        table + "')",
    );
  }
  for (const role of ['anon', 'authenticated']) {
    add(
      'private-schema-no-usage-' + role,
      "not pg_catalog.has_schema_privilege('" + role + "','cpi_private','USAGE')",
    );
  }
  add(
    'private-schema-server-usage',
    "pg_catalog.has_schema_privilege('service_role','cpi_private','USAGE')",
  );
  for (const role of ['anon', 'authenticated']) {
    add(
      'public-profile-readable-' + role,
      "pg_catalog.has_table_privilege('" + role + "','public.profiles_public','SELECT')",
    );
    add(
      'public-profile-no-write-' + role,
      "not pg_catalog.has_table_privilege('" +
        role + "','public.profiles_public','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
    );
    for (const table of PRIVATE_TABLES) {
      add(
        'private-table-no-privileges-' + role + '-' + table,
        "not pg_catalog.has_table_privilege('" +
          role + "','cpi_private." + table +
          "','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",
      );
    }
  }
  add(
    'server-ranked-writes',
    "pg_catalog.has_table_privilege('service_role','cpi_private.ranked_runs','INSERT')",
  );
  add(
    'server-private-reads',
    "pg_catalog.has_table_privilege('service_role','cpi_private.profiles_private','SELECT')",
  );
  add(
    'public-profile-exact-columns',
    "pg_catalog.count(*) = 5 and pg_catalog.count(*) filter (where " +
      "pg_catalog.pg_attribute.attname in (" +
      "'country_code','created_at','public_id','updated_at','username')) = 5",
    ' from pg_catalog.pg_attribute where ' +
      "pg_catalog.pg_attribute.attrelid = pg_catalog.to_regclass('public.profiles_public') " +
      'and pg_catalog.pg_attribute.attnum > 0 ' +
      'and not pg_catalog.pg_attribute.attisdropped',
  );
  return checks;
}

export function checkAuditOutput(stdout, check) {
  const content = String(stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '');
  const ok = new RegExp('(?:^|[^A-Z0-9_])' + check.ok + '(?:$|[^A-Z0-9_])').test(content);
  const fail = new RegExp('(?:^|[^A-Z0-9_])' + check.fail + '(?:$|[^A-Z0-9_])').test(content);
  if (ok && !fail) return 'pass';
  if (fail && !ok) return 'fail';
  return 'inconclusive';
}

export function runRemoteAudit(spawn = spawnSync, env = process.env) {
  assert.equal(env.CPI_SUPABASE_DEV_REF, PROJECT_REF, 'Only approved development target allowed');
  assert.ok(env.SUPABASE_ACCESS_TOKEN, 'Scoped cpi-development access token missing');
  assert.ok(env.SUPABASE_DB_PASSWORD, 'Development database password missing');
  const checks = buildAuditChecks();
  let passed = 0;
  let failed = 0;
  let rejected = 0;
  for (const check of checks) {
    // Never output the SQL, stderr, credentials or raw database response.
    const result = spawn(
      'supabase',
      ['db', 'query', check.sql, '--read-only', '--remote=' + PROJECT_REF],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 262144, env },
    );
    if (result.error || result.status !== 0) {
      rejected += 1;
      console.error('CPI-017 audit [' + check.id + ']: QUERY REJECTED / INCONCLUSIVE.');
      if (rejected >= 4) {
        console.error('Four query errors; stopping to avoid unnecessary Management API traffic.');
        break;
      }
      continue;
    }
    const verdict = checkAuditOutput(result.stdout, check);
    if (verdict === 'pass') {
      passed += 1;
      console.log('CPI-017 audit [' + check.id + ']: PASS.');
    } else if (verdict === 'fail') {
      failed += 1;
      console.error('CPI-017 audit [' + check.id + ']: SECURITY CHECK FAILED.');
    } else {
      rejected += 1;
      console.error('CPI-017 audit [' + check.id + ']: OUTPUT UNRECOGNIZED / INCONCLUSIVE.');
      if (rejected >= 4) break;
    }
  }
  const complete = passed === checks.length && failed === 0 && rejected === 0;
  console.log(
    'CPI-017 read-only hosted security audit: ' +
      (complete ? 'PASSED' : 'INCOMPLETE / FAILED') +
      ' (' + passed + '/' + checks.length + ' passed, ' +
      failed + ' failed, ' + rejected + ' inconclusive).',
  );
  console.log('No migration or remote database write was attempted.');
  return complete;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--emit-local-sql') {
    process.stdout.write(buildAuditChecks().map((check) => check.sql).join('\n') + '\n');
  } else if (process.argv.length === 2) {
    try {
      if (!runRemoteAudit()) process.exitCode = 1;
    } catch {
      console.error('CPI-017 hosted audit could not start. Check the protected environment and target.');
      process.exitCode = 1;
    }
  } else {
    console.error('Usage: node backend/scripts/cpi017-hosted-audit.mjs [--emit-local-sql]');
    process.exitCode = 1;
  }
}
