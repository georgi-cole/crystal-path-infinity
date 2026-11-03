import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CPI017_MIGRATION,
  assertCpi017Audit,
  assertSingleCpi017Preview,
  explainCpi017ReadOnlyQueryFailure,
} from '../scripts/check-cpi017-deploy-output.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/supabase-development-deploy.yml', import.meta.url),
  'utf8',
);

const goodPreview = [
  'Target: project The Crystal Path Infinity (jbyguybxhezjhdbenevh) · production',
  'DRY RUN: migrations will *not* be pushed to the database.',
  'Would push these migrations:',
  ' • 20261103000100_cpi017_foundation.sql',
  'Finished supabase db push.',
].join('\n');

test('matches the exact observed production-branch label on the DEV project and one migration', () => {
  assert.equal(assertSingleCpi017Preview(goodPreview), CPI017_MIGRATION);
});

test('refuses missing confirmation, unexpected migrations, duplicates and empty previews', () => {
  for (const output of [
    '',
    'Already up to date.',
    goodPreview.replace('DRY RUN:', 'DEPLOY:'),
    goodPreview.replace('Would push these migrations:', 'Migrations:'),
    goodPreview.replace(CPI017_MIGRATION, '20261103000100_other.sql'),
    goodPreview.replace('Finished supabase db push.', ' • 20261103000200_extra.sql'),
    goodPreview.replace('Finished supabase db push.', ' • 20261103000100_cpi017_foundation.sql'),
  ]) {
    assert.throws(() => assertSingleCpi017Preview(output));
  }
});

test('read-only SQL catalog checks require success markers, not absent or failed results', () => {
  assert.equal(assertCpi017Audit('│ CPI017_PRECHECK_OK │', 'CPI017_PRECHECK_OK'), true);
  assert.equal(assertCpi017Audit('CPI017_POSTCHECK_OK', 'CPI017_POSTCHECK_OK'), true);
  assert.throws(() => assertCpi017Audit('CPI017_PRECHECK_FAIL', 'CPI017_PRECHECK_OK'));
  assert.throws(() => assertCpi017Audit('CPI017_POSTCHECK_FAIL', 'CPI017_POSTCHECK_OK'));
  assert.throws(() => assertCpi017Audit('CPI017_POSTCHECK_OK', 'not-a-marker'));
});

test('read-only SQL failures suggest the least-privilege DB Read permission without exposing raw CLI errors', () => {
  const denied = 'HTTP 403 Forbidden: missing database_read; bearer sbp_fc_NEVER_PRINT_THIS';
  const advice = explainCpi017ReadOnlyQueryFailure(denied);
  assert.match(advice, /Database → Read/);
  assert.match(advice, /CPI_DEV_SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(advice, /sbp_fc_NEVER_PRINT_THIS/);

  const unknown = explainCpi017ReadOnlyQueryFailure(
    'opaque failure with password=SECRET_SHOULD_NOT_APPEAR',
  );
  assert.match(unknown, /unconfirmed reason/);
  assert.doesNotMatch(unknown, /SECRET_SHOULD_NOT_APPEAR/);

  assert.match(explainCpi017ReadOnlyQueryFailure('401 Unauthorized'), /authentication failed/);
  assert.match(explainCpi017ReadOnlyQueryFailure('syntax error at or near SELECT'), /rejected the query/);
});

test('workflow can never auto-deploy, requires exact project and a typed human confirmation', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /\$REQUESTED_CONFIRMATION" == 'APPLY CPI-017 TO DEVELOPMENT'/);
  assert.match(workflow, /\$REQUESTED_PROJECT_REF" == 'jbyguybxhezjhdbenevh'/);
  assert.match(workflow, /^    environment: cpi-development$/m);
  assert.match(workflow, /^      CPI_SUPABASE_DEV_REF: jbyguybxhezjhdbenevh$/m);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.CPI_DEV_SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(workflow, /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.CPI_DEV_SUPABASE_DB_PASSWORD \}\}/);
});

test('reviewed SQL is hash-pinned and not replaced by new/additional migrations', () => {
  const path = 'supabase/migrations/' + CPI017_MIGRATION;
  const sha = execFileSync('git', ['hash-object', path], { encoding: 'utf8' }).trim();
  assert.equal(sha, 'accc66e9e1a539c9527852f95595dacbe39959a7');
  assert.match(workflow, /git hash-object/);
  assert.match(workflow, /accc66e9e1a539c9527852f95595dacbe39959a7/);
  assert.match(workflow, /\$\{#sql_files\[@\]\}" -eq 1/);
});

test('only one CLI command can mutate remote SQL; all other database checks are read-only', () => {
  const commands = workflow
    .split('\n')
    .filter((line) => /^\s+(?:if ! )?supabase\s/.test(line))
    .map((line) => line.trim());
  assert.deepEqual(commands, [
    'supabase link --project-ref "$CPI_SUPABASE_DEV_REF"',
    'if ! supabase db query "$(cat backend/sql/cpi017-deploy-preflight.sql)" --read-only --remote="$CPI_SUPABASE_DEV_REF" > "$output" 2>&1; then',
    'supabase db push --dry-run --remote="$CPI_SUPABASE_DEV_REF" > "$output" 2>&1 || {',
    'supabase db push --yes --remote="$CPI_SUPABASE_DEV_REF"',
    'if ! supabase db query "$(cat backend/sql/cpi017-deploy-postcheck.sql)" --read-only --remote="$CPI_SUPABASE_DEV_REF" > "$output" 2>&1; then',
  ]);
  assert.doesNotMatch(workflow, /^\s+supabase\s+(?:db reset|migration repair|seed)/m);
  assert.doesNotMatch(workflow, /--include-(?:roles|seed|all)/);
  assert.equal(
    workflow.match(/check-cpi017-deploy-output\.mjs failure "\$output"/g)?.length,
    2,
  );
});

test('preflight and postcheck SQL are read-only, separate, and lack secret-bearing columns', () => {
  for (const file of ['cpi017-deploy-preflight.sql', 'cpi017-deploy-postcheck.sql']) {
    const sql = readFileSync(new URL('../sql/' + file, import.meta.url), 'utf8');
    assert.match(sql, /select case when/i);
    assert.doesNotMatch(sql, /\b(insert|update|delete|grant|revoke|alter|drop|create)\s+(?:table|schema|into|from|on)\b/i);
    assert.doesNotMatch(sql, /\b(email|password|access_token|service_role_key)\s*(?:,|from|as)/i);
  }
});
