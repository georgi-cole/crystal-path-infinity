import { parseEnv } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { readLiveConfiguration } from '../../packages/server-core/src/live-configuration.ts';
const root = new URL('../', import.meta.url),
  values = parseEnv(await readFile(new URL('.env.live.local', root), 'utf8'));
try {
  if (!readLiveConfiguration((name) => values[name])) throw new Error();
} catch {
  console.error('Complete and review the private configuration first. No secrets were exported.');
  process.exit(1);
}
const names = [
  'CPI_LIVE_ENABLED',
  'CPI_ENVIRONMENT',
  'CPI_PROJECT_REF',
  'CPI_DATABASE_URL',
  'CPI_PRIVATE_PEPPER',
  'CPI_ENCRYPTION_KEY',
  'CPI_GATEWAY_KEY',
  'CPI_WORKER_KEY',
  'CPI_ALLOWED_ORIGINS',
  'CPI_RESEND_API_KEY',
  'CPI_MAIL_FROM',
  'CPI_ACCOUNT_POLICY',
  'CPI_REWARDS_ENABLED',
  'CPI_PURCHASES_ENABLED',
];
if (values.CPI_PURCHASES_ENABLED === 'true')
  names.push(
    'CPI_COMMERCE_PRODUCTS',
    'CPI_GOOGLE_CLIENT_EMAIL',
    'CPI_GOOGLE_PRIVATE_KEY',
    'CPI_APPLE_ISSUER_ID',
    'CPI_APPLE_KEY_ID',
    'CPI_APPLE_PRIVATE_KEY',
  );
// SUPABASE_* is reserved and supplied by the hosted function. Never deploy bootstrap/admin credentials.
const text = names.map((name) => name + '=' + JSON.stringify(values[name])).join('\n') + '\n';
await writeFile(new URL('.env.edge.upload.local', root), text, { mode: 0o600 });
console.log('Prepared ignored backend/.env.edge.upload.local. No secret values were printed.');
