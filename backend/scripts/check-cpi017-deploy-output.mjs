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
    if (!['preview', 'audit'].includes(mode) || !path) {
      throw new Error('Usage: node check-cpi017-deploy-output.mjs preview|audit OUTPUT_FILE [MARKER]');
    }
    const content = readFileSync(path, 'utf8');
    if (mode === 'preview') {
      assertSingleCpi017Preview(content);
      console.log('Dry run verified: exactly the reviewed CPI-017 migration is pending.');
    } else {
      assertCpi017Audit(content, marker);
      console.log('Read-only Supabase catalog audit passed: ' + marker);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
