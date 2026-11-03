import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateProjectManifest, validateMobileBuildVariableNames } from '../scripts/validate-environments.mjs';
const fixture = () => ({
  schemaVersion: 1,
  projects: {
    development: { projectRef: 'a'.repeat(20), apiUrl: 'https://' + 'a'.repeat(20) + '.supabase.co' },
    staging: { projectRef: 'b'.repeat(20), apiUrl: 'https://' + 'b'.repeat(20) + '.supabase.co' },
    production: { projectRef: 'c'.repeat(20), apiUrl: 'https://' + 'c'.repeat(20) + '.supabase.co' },
  },
});
test('requires three real, separate project identities with matching HTTPS origins', () => {
  assert.equal(validateProjectManifest(fixture()), true);
  const sameRef = fixture();
  sameRef.projects.production = sameRef.projects.staging;
  assert.throws(() => validateProjectManifest(sameRef), /different Supabase projects/);
  const mismatch = fixture();
  mismatch.projects.staging.apiUrl = 'https://a'.padEnd(35,'a');
  assert.throws(() => validateProjectManifest(mismatch), /invalid/);
  const http = fixture();
  http.projects.development.apiUrl = http.projects.development.apiUrl.replace('https:','http:');
  assert.throws(() => validateProjectManifest(http), /invalid/);
  const noProduction = fixture();
  delete noProduction.projects.production;
  assert.throws(() => validateProjectManifest(noProduction), /Exactly/);
});
test('rejects credentials in the manifest and any production credentials exposed via Vite', () => {
  for (const key of ['serviceRoleKey', 'dbPassword', 'secret', 'accessToken', 'databaseUrl']) {
    const data = fixture();
    data.projects.production[key] = 'never';
    assert.throws(() => validateProjectManifest(data), /Secrets/);
  }
  assert.equal(validateMobileBuildVariableNames(['VITE_CPI_SUPABASE_URL','CPI_SERVER_SERVICE_ROLE_KEY']),true);
  for (const variable of ['VITE_SUPABASE_SERVICE_ROLE_KEY','VITE_DATABASE_URL','VITE_JWT_SECRET','VITE_DATABASE_PASSWORD']) {
    assert.throws(() => validateMobileBuildVariableNames([variable]), /server-only/);
  }
});
test('the committed example is deliberately not a deployable backend manifest', () => {
  const path = new URL('../projects.example.json', import.meta.url);
  const template = JSON.parse(readFileSync(path,'utf8'));
  assert.equal(validateProjectManifest(template, { allowTemplate:true }),true);
  assert.throws(() => validateProjectManifest(template), /invalid/);
});
