// CPI-017 deployment guard. A checked-in TEMPLATE cannot be used as a live
// project manifest. This tool never accepts, prints or stores server secrets.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKEND_ENVIRONMENTS = ['development', 'staging', 'production'];
const forbidden = /(?:secret|password|token|private.?key|service.?role|database.?url|db.?url|connection.?string)/i;
const projectRefPattern = /^[a-z0-9]{20}$/;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate only public project identity metadata. Never serialize credentials. */
export function validateProjectManifest(value, { allowTemplate = false } = {}) {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.projects)) {
    throw new TypeError('Invalid standalone backend environment manifest.');
  }
  const projectNames = Object.keys(value.projects).sort();
  if (projectNames.join(',') !== [...BACKEND_ENVIRONMENTS].sort().join(',')) {
    throw new Error('Exactly development, staging and production projects are required.');
  }
  const seenRefs = new Set();
  const seenHosts = new Set();
  for (const environment of BACKEND_ENVIRONMENTS) {
    const project = value.projects[environment];
    if (!record(project)) throw new TypeError('Invalid project metadata: ' + environment);
    for (const key of Object.keys(project)) {
      if (forbidden.test(key)) throw new Error('Secrets are forbidden in backend project manifests.');
      if (key !== 'projectRef' && key !== 'apiUrl') {
        throw new Error('Unexpected backend project metadata field.');
      }
    }
    if (typeof project.projectRef !== 'string' || typeof project.apiUrl !== 'string') {
      throw new TypeError('Missing public project reference and API URL.');
    }
    if (allowTemplate && project.projectRef === 'REPLACE_' + environment.toUpperCase()) {
      if (project.apiUrl !== 'https://REPLACE_' + environment.toUpperCase() + '.supabase.co') {
        throw new Error('Template project URL mismatch.');
      }
      continue;
    }
    if (!projectRefPattern.test(project.projectRef) ||
        project.apiUrl !== 'https://' + project.projectRef + '.supabase.co') {
      throw new Error('Backend project reference or URL is invalid.');
    }
    if (seenRefs.has(project.projectRef) || seenHosts.has(project.apiUrl)) {
      throw new Error('Production, staging and development MUST use three different Supabase projects.');
    }
    seenRefs.add(project.projectRef);
    seenHosts.add(project.apiUrl);
  }
  if (!allowTemplate && seenRefs.size !== BACKEND_ENVIRONMENTS.length) {
    throw new Error('Backend projects are not fully provisioned.');
  }
  return true;
}

/** Check env var names, not values. No service key may be included in Vite. */
export function validateMobileBuildVariableNames(names) {
  for (const name of names) {
    if (name.startsWith('VITE_') && forbidden.test(name)) {
      throw new Error('A server-only backend credential was configured as a public VITE_ variable.');
    }
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const filename = process.argv[2];
    if (!filename || process.argv.length > 3) {
      throw new Error('Usage: node backend/scripts/validate-environments.mjs PATH_TO_PRIVATE_PROJECT_MANIFEST');
    }
    validateProjectManifest(JSON.parse(readFileSync(filename, 'utf8')));
    validateMobileBuildVariableNames(Object.keys(process.env));
    console.log('CPI-017: three distinct project identities validated (no secrets read or printed).');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
