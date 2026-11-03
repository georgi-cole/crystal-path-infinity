// Fail-closed verifier for Supabase CLI v3's read-only preview and catalog audit.
// The input is a temporary CI log, never a credential or a connection string.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CPI017_MIGRATION = '20261103000100_cpi017_foundation.sql';
export const CPI017_AUDIT_MARKERS = ['CPI017_PRECHECK_OK', 'CPI017_POSTCHECK_OK'];

function normalize(output) {
  return output.replace(/\x1b\[[0-9;]*m/g, '');
}

export function assertSingleCpi017Preview(rawOutput) {
  if (typeof rawOutput !== 'string') throw new Error('No Supabase CLI output.');
  const output = normalize(rawOutput);
  if (!output.includes('DRY RUN: migrations will *not* be pushed to the database.')) {
    throw new Error('CLI did not confirm a non-mutating dry run.');
  }
  if (!output.includes('Would push these migrations:')) {
    throw new Error('No explicit pending migration list. Do not apply.');
  }
  const matches = [...output.matchAll(/^\s*[•*\-]\s+([0-9]{14}_[a-zA-Z0-9_-]+\.sql)\s*$/gm)];
  const pending = matches.map((match) => match[1]);
  if (pending.length !== 1 || pending[0] !== CPI017_MIGRATION) {
    throw new Error('Pending migrations differ from the one reviewed CPI-017 migration.');
  }
  return CPI017_MIGRATION;
}

/**
 * Classifies a failed hosted read-only SQL call without ever echoing raw CLI
 * stderr, which could contain an access token, DB URL or credentials.
 * A diagnosis is guidance, never evidence that the mutation was applied.
 */
export function explainCpi017ReadOnlyQueryFailure(rawOutput) {
  const output = typeof rawOutput === 'string' ? normalize(rawOutput).slice(-16_384) : '';
  const scopes =
    'Supabase project-scoped PAT needs Database → Read, alongside Project Settings → Read, ' +
    'API Keys → Read and API Key Secrets → Read. Update only the GitHub cpi-development ' +
    'environment secret CPI_DEV_SUPABASE_ACCESS_TOKEN (never share it in logs/chat).';
  if (/\b403\b|forbidden|insufficient[-_ ]scope|missing permissions?|\bdatabase_read\b|permission denied|access denied/i.test(output)) {
    return 'Hosted read-only SQL was denied by Supabase. ' + scopes + ' No migration applied by this step.';
  }
  if (/\b401\b|unauthorized|invalid (?:access )?token|expired (?:access )?token/i.test(output)) {
    return 'Hosted read-only SQL authentication failed. Replace or check the project-scoped Supabase PAT in the correct GitHub environment. No migration applied by this step.';
  }
  if (/syntax error|invalid (?:sql|query)|unrecognized (?:option|flag)|unknown flag|unknown command/i.test(output)) {
    return 'Hosted read-only SQL failed because the CLI rejected the query or flags. Inspect the pinned CLI v3 syntax and read-only SQL tests; do not bypass preflight.';
  }
  if (/connection refused|timed out|timeout|no route to host|network|temporarily unavailable/i.test(output)) {
    return 'Hosted read-only SQL failed because of connectivity or service availability. Check the target project and retry a separate read-only preview first.';
  }
  return 'Hosted read-only SQL failed for an unconfirmed reason. ' + scopes + ' The raw CLI error was deliberately withheld to avoid credential leakage; do not bypass preflight.';
}

export function assertCpi017Audit(rawOutput, marker) {
  if (!CPI017_AUDIT_MARKERS.includes(marker)) {
    throw new Error('Unexpected database audit marker.');
  }
  if (typeof rawOutput !== 'string') throw new Error('No database audit output.');
  const result = normalize(rawOutput);
  if (!result.includes(marker)) {
    throw new Error('Database catalog audit did not return the expected success marker.');
  }
  const failMarker = marker.replace('_OK', '_FAIL');
  if (result.includes(failMarker)) {
    throw new Error('The database catalog audit reported a failed security check.');
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , mode, path, marker] = process.argv;
    if (!['preview', 'audit', 'failure'].includes(mode) || !path) {
      throw new Error('Usage: node check-cpi017-deploy-output.mjs preview|audit|failure OUTPUT_FILE [MARKER]');
    }
    const content = readFileSync(path, 'utf8');
    if (mode === 'preview') {
      assertSingleCpi017Preview(content);
      console.log('Dry run verified: exactly the reviewed CPI-017 migration is pending.');
    } else if (mode === 'failure') {
      // Never output the raw CLI log: secrets, endpoints or URLs may be present.
      console.error('::error::' + explainCpi017ReadOnlyQueryFailure(content));
      process.exitCode = 1;
    } else {
      assertCpi017Audit(content, marker);
      console.log('Read-only Supabase catalog audit passed: ' + marker);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
