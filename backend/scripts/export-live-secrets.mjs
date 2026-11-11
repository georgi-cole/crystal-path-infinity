import { parseEnv } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { readLiveConfiguration } from '../../packages/server-core/src/live-configuration.ts';
const root = new URL('../', import.meta.url);
const envPath =
  process.argv.find((arg) => arg.startsWith('--env='))?.slice(6) ??
  new URL('.env.live.local', root);
const outputPath =
  process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ??
  new URL('.env.edge.upload.local', root);
const values = parseEnv(await readFile(envPath, 'utf8'));
let config;
try {
  config = readLiveConfiguration((name) => values[name]);
  if (!config) throw new Error();
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
if (values.CPI_DATABASE_CA) names.push('CPI_DATABASE_CA');
if (config.environment === 'staging') names.push('CPI_STAGING_TEST_EMAILS');
if (config.publicWebEntry)
  names.push(
    'CPI_WEB_IDENTITY_ENABLED',
    'CPI_IDENTITY_GOOGLE_WEB_CLIENT_ID',
    'CPI_IDENTITY_GOOGLE_WEB_CLIENT_SECRET',
    'CPI_IDENTITY_APPLE_WEB_KEY_ID',
    'CPI_IDENTITY_APPLE_WEB_PRIVATE_KEY',
  );
if (values.CPI_PURCHASES_ENABLED === 'true') {
  names.push('CPI_COMMERCE_PRODUCTS');
  if (config.purchasePlatforms.includes('android'))
    names.push('CPI_GOOGLE_CLIENT_EMAIL', 'CPI_GOOGLE_PRIVATE_KEY');
  if (config.appleSandboxVerifierKey) names.push('CPI_APPLE_SANDBOX_VERIFIER_KEY');
  if (config.purchasePlatforms.includes('ios'))
    names.push('CPI_APPLE_ISSUER_ID', 'CPI_APPLE_KEY_ID', 'CPI_APPLE_PRIVATE_KEY');
}
// SUPABASE_* is reserved and supplied by the hosted function. Never deploy bootstrap/admin credentials.
// Supabase CLI's dotenv parser preserves escaped quotes and expands newline escapes in double quotes.
// Literal quotes keep JSON and escaped PEM newlines intact for the runtime.
const text =
  names
    .map((name) => {
      const value =
        name === 'CPI_ACCOUNT_POLICY' || name === 'CPI_COMMERCE_PRODUCTS'
          ? values[name].replaceAll("'", '\\u0027')
          : values[name];
      const quote = ["'", '`'].find((candidate) => !value.includes(candidate));
      if (quote && !value.endsWith('\\')) return name + '=' + quote + value + quote;
      if (value === value.trim() && !/[#\r\n]/.test(value) && !/^["'`]/.test(value))
        return name + '=' + value;
      throw new Error('Cannot safely export edge secret ' + name);
    })
    .join('\n') + '\n';
await writeFile(outputPath, text, { mode: 0o600 });
console.log('Prepared edge secret upload. No secret values were printed.');
