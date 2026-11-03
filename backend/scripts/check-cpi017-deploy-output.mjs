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
  // Do NOT infer a missing Management API PAT scope from generic PostgreSQL
  // "permission denied" text. Supabase's SQL service uses a separate
  // supabase_read_only_user role with its own object-level privileges.
  if (/permission denied for (?:schema|table|relation|function|sequence)|\bSQLSTATE\s*42501\b|\b42501\b/i.test(output)) {
    return 'The PostgreSQL read-only SQL role was denied an object or catalog reference. ' +
      'The basic SELECT probe can still succeed with the same token. Ensure all query ' +
      'entity references are schema-qualified; do not rotate the PAT based on this error. ' +
      'CPI-017 migration remains blocked.';
  }
  if (/missing_permissions[^\n]*database_read|\bdatabase_read\b[^\n]*missing|insufficient[-_ ]scope/i.test(output)) {
    return 'Supabase explicitly reported missing Database → Read permission. ' + scopes +
      ' CPI-017 migration remains blocked.';
  }
  if (/\b403\b|forbidden|access denied/i.test(output)) {
    return 'Supabase returned a forbidden response for this SQL query. ' +
      'A successful read-only SELECT 1 probe shows the token can access SQL; it does ' +
      'not establish whether this query was rejected by SQL or service-level permissions. ' +
      'Review schema qualification and catalog access before changing credentials. ' +
      'CPI-017 migration remains blocked.';
  }
  if (/\b401\b|unauthorized|invalid (?:access )?token|expired (?:access )?token/i.test(output)) {
    return 'Hosted read-only SQL authentication failed. Replace or check the project-scoped Supabase PAT in the correct GitHub environment. No migration applied by this step.';
  }
  if (/all entity references must be schema[- ]qualified|unqualified (?:name|reference|function)|schema[- ]qualified (?:entity|reference)/i.test(output)) {
    return 'The hosted read-only SQL validator rejected an unqualified entity reference. ' +
      'The new preflight uses explicitly pg_catalog-qualified built-in functions and no table aliases. ' +
      'This is a SQL validation failure, not evidence of a missing Supabase access-token permission.';
  }
  if (/syntax error|\b42601\b|invalid (?:sql|query)|unrecognized (?:option|flag)|unknown flag|unknown command/i.test(output)) {
    return 'The hosted read-only SQL request failed SQL syntax or CLI query validation (safe diagnostic: ' +
      (/\b42601\b/.test(output) ? 'SQLSTATE 42601' : 'query validation') +
      '). The query requires correction; do not bypass preflight or rotate credentials.';
  }
  if (/connection refused|timed out|timeout|no route to host|network|temporarily unavailable/i.test(output)) {
    return 'Hosted read-only SQL failed because of connectivity or service availability. Check the target project and retry a separate read-only preview first.';
  }
  return 'Hosted read-only SQL failed for an unconfirmed reason. The raw CLI error was withheld to avoid leaking credentials; use the updated read-only preview to diagnose the exact catalog preflight, and do not deploy or change the token based on this message alone.';
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
