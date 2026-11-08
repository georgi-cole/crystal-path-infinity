import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
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

test('edge secret export preserves signup policy JSON and database CA newlines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cpi-edge-export-'));
  const input = join(dir, 'source.env');
  const output = join(dir, 'upload.env');
  const projectRef = 'c'.repeat(20);
  const policy = JSON.stringify({
    status: 'reviewed',
    reviewReference: 'owner review "web" #1',
    version: 'closed-v1',
    countries: {},
  });
  const databaseCa = '-----BEGIN CERTIFICATE-----\\nfixture-ca\\n-----END CERTIFICATE-----\\n';
  try {
    writeFileSync(
      input,
      [
        'CPI_LIVE_ENABLED=true',
        'CPI_ENVIRONMENT=production',
        'CPI_PROJECT_REF=' + projectRef,
        'SUPABASE_URL=https://' + projectRef + '.supabase.co',
        'SUPABASE_SERVICE_ROLE_KEY=fixture-service-role',
        'CPI_DATABASE_URL=postgresql://cpi_runtime:fixture@db.' +
          projectRef +
          '.supabase.co:5432/postgres',
        "CPI_DATABASE_CA='" + databaseCa + "'",
        'CPI_RUNTIME_DB_PASSWORD=fixture-admin-password',
        'CPI_PRIVATE_PEPPER=' + '1'.repeat(64),
        'CPI_ENCRYPTION_KEY=' + '2'.repeat(64),
        'CPI_GATEWAY_KEY=' + '3'.repeat(64),
        'CPI_WORKER_KEY=' + '4'.repeat(64),
        'CPI_ALLOWED_ORIGINS=https://georgi-cole.github.io',
        'CPI_RESEND_API_KEY=re_fixture_key_for_export_only',
        'CPI_MAIL_FROM=crystal-path@auth.kolequant.xyz',
        "CPI_ACCOUNT_POLICY='" + policy + "'",
        'CPI_PURCHASES_ENABLED=false',
        'CPI_REWARDS_ENABLED=false',
      ].join('\n') + '\n',
    );
    execFileSync(process.execPath, [
      '--experimental-strip-types',
      fileURLToPath(new URL('../scripts/export-live-secrets.mjs', import.meta.url)),
      '--env=' + input,
      '--out=' + output,
    ]);
    const exported = parseEnv(readFileSync(output, 'utf8'));
    assert.equal(exported.CPI_ACCOUNT_POLICY, policy);
    assert.equal(exported.CPI_DATABASE_CA, databaseCa);
    assert.equal(exported.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(exported.CPI_RUNTIME_DB_PASSWORD, undefined);
  } finally {
    rmSync(input, { force: true });
    rmSync(output, { force: true });
    rmdirSync(dir);
  }
});
