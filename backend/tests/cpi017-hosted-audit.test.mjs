import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PROJECT_REF,
  PRIVATE_TABLES,
  buildAuditChecks,
  checkAuditOutput,
  runRemoteAudit,
} from '../scripts/cpi017-hosted-audit.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/supabase-development-audit.yml', import.meta.url),
  'utf8',
);
const checks = buildAuditChecks();
const environment = Object.freeze({
  CPI_SUPABASE_DEV_REF: PROJECT_REF,
  SUPABASE_ACCESS_TOKEN: 'CI_FAKE_TOKEN',
  SUPABASE_DB_PASSWORD: 'CI_FAKE_PASSWORD',
});

test('audit covers every migration-created table and its forced RLS', () => {
  assert.equal(PRIVATE_TABLES.length, 10);
  assert.equal(checks.length, 52);
  const ids = new Set(checks.map((check) => check.id));
  assert.equal(ids.size, checks.length);
  for (const table of ['public.profiles_public', ...PRIVATE_TABLES.map((x) => 'cpi_private.' + x)]) {
    assert.ok(ids.has('exists-' + table));
    assert.ok(ids.has('forced-rls-' + table));
  }
  for (const role of ['anon', 'authenticated']) {
    assert.ok(ids.has('private-schema-no-usage-' + role));
    assert.ok(ids.has('public-profile-readable-' + role));
    assert.ok(ids.has('public-profile-no-write-' + role));
    for (const table of PRIVATE_TABLES) {
      assert.ok(ids.has('private-table-no-privileges-' + role + '-' + table));
    }
  }
  assert.ok(ids.has('private-schema-server-usage'));
  assert.ok(ids.has('server-ranked-writes'));
  assert.ok(ids.has('server-private-reads'));
  assert.ok(ids.has('public-profile-exact-columns'));
});

test('every hosted audit query is a single read-only SELECT of schema-qualified objects', () => {
  for (const check of checks) {
    assert.match(check.sql, /^select case when /);
    assert.equal((check.sql.match(/;/g) ?? []).length, 1, check.id);
    assert.doesNotMatch(check.sql, /--|\/\*|\\copy|\bpg_sleep\b/i);
    assert.doesNotMatch(check.sql, /\bfrom\s+(?!pg_catalog\.)/i, check.id);
    assert.doesNotMatch(check.sql, /\bjoin\b|\bunion\b|\bwith\b/i, check.id);
    assert.doesNotMatch(check.sql, /(?<![.\w])(?:to_regclass|has_table_privilege|has_schema_privilege|count)\s*\(/i);
    assert.ok(check.ok.endsWith('_OK'));
    assert.ok(check.fail.endsWith('_FAIL'));
    assert.ok(check.sql.includes(check.ok));
    assert.ok(check.sql.includes(check.fail));
  }
});

test('audit result parsing fails closed on rejection, empty output and ambiguity', () => {
  const check = checks[0];
  assert.equal(checkAuditOutput('│ ' + check.ok + ' │', check), 'pass');
  assert.equal(checkAuditOutput(check.fail, check), 'fail');
  assert.equal(checkAuditOutput(check.ok + '\n' + check.fail, check), 'inconclusive');
  assert.equal(checkAuditOutput('', check), 'inconclusive');
  assert.equal(checkAuditOutput('prefix_' + check.ok + '_suffix', check), 'inconclusive');
});

test('workflow is manual main-only, project-pinned, environment-scoped and never writes', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /^    environment: cpi-development$/m);
  assert.match(workflow, /^      CPI_SUPABASE_DEV_REF: jbyguybxhezjhdbenevh$/m);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.CPI_DEV_SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(workflow, /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.CPI_DEV_SUPABASE_DB_PASSWORD \}\}/);
  assert.match(workflow, /node backend\/scripts\/cpi017-hosted-audit\.mjs/);
  assert.doesNotMatch(workflow, /^\s+supabase\s+(?:db push|db reset|migration repair|db query|seed)/m);
  assert.doesNotMatch(workflow, /--yes|SUPABASE_YES/);
});

test('runner executes only read-only Supabase SQL against the exact approved development project', () => {
  let called = 0;
  const out = [];
  const err = [];
  const log = console.log;
  const error = console.error;
  console.log = (x) => out.push(String(x));
  console.error = (x) => err.push(String(x));
  try {
    const fake = (program, args, options) => {
      assert.equal(program, 'supabase');
      assert.deepEqual(args.slice(0, 2), ['db', 'query']);
      assert.deepEqual(args.slice(3), ['--read-only', '--remote=' + PROJECT_REF]);
      assert.ok(checks.some((x) => x.sql === args[2]));
      assert.equal(options.env.SUPABASE_ACCESS_TOKEN, environment.SUPABASE_ACCESS_TOKEN);
      called += 1;
      const marker = args[2].match(/then '([^']+_OK)' else /)?.[1];
      assert.ok(marker);
      return { status: 0, stdout: '│ ' + marker + ' │', stderr: '' };
    };
    assert.equal(runRemoteAudit(fake, environment), true);
    assert.equal(called, checks.length);
    assert.ok(out.some((x) => x.includes('PASSED')));
    assert.equal(err.length, 0);
  } finally {
    console.log = log;
    console.error = error;
  }
});

test('four CLI rejections abort the audit, never report a pass or expose raw secrets', () => {
  let called = 0;
  const captured = [];
  const oldLog = console.log;
  const oldError = console.error;
  console.log = (x) => captured.push(String(x));
  console.error = (x) => captured.push(String(x));
  try {
    const fake = () => {
      called += 1;
      return { status: 1, stdout: '', stderr: 'password=VERY_SECRET; token=OTHER_SECRET' };
    };
    assert.equal(runRemoteAudit(fake, environment), false);
    assert.equal(called, 4);
    assert.ok(captured.some((x) => x.includes('INCOMPLETE / FAILED')));
    assert.ok(captured.every((x) => !/VERY_SECRET|OTHER_SECRET/.test(x)));
  } finally {
    console.log = oldLog;
    console.error = oldError;
  }
});

test('remote audit rejects the wrong project before any SQL execution', () => {
  assert.throws(
    () => runRemoteAudit(() => { throw new Error('should not execute'); }, {
      ...environment,
      CPI_SUPABASE_DEV_REF: 'not-the-development-project',
    }),
  );
});
