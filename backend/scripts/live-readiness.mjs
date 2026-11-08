import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolveMx } from 'node:dns/promises';
import pg from 'pg';
import { readLiveConfiguration } from '../../packages/server-core/src/live-configuration.ts';
import { createProjectSqlPool } from '../../packages/server-core/src/supabase-database.ts';
const path =
  process.argv.find((value) => value.startsWith('--env='))?.slice(6) ??
  new URL('../.env.live.local', import.meta.url);
let values;
try {
  values = parseEnv(await readFile(path, 'utf8'));
} catch {
  console.error('Private configuration is missing. Run prepare-live.mjs init first.');
  process.exit(1);
}
const names = [
  'CPI_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CPI_DATABASE_URL',
  'CPI_RESEND_API_KEY',
];
if (values.CPI_PURCHASES_ENABLED === 'true')
  names.push(
    'CPI_GOOGLE_CLIENT_EMAIL',
    'CPI_GOOGLE_PRIVATE_KEY',
    'CPI_APPLE_ISSUER_ID',
    'CPI_APPLE_KEY_ID',
    'CPI_APPLE_PRIVATE_KEY',
  );
const missing = names.filter((name) => !values[name] || /REPLACE|placeholder/i.test(values[name]));
if (missing.length) {
  console.log(
    JSON.stringify(
      { configured: false, missing, liveEnabled: values.CPI_LIVE_ENABLED === 'true' },
      null,
      2,
    ),
  );
  process.exit(1);
}
let config;
try {
  config = readLiveConfiguration((name) => (name === 'CPI_LIVE_ENABLED' ? 'true' : values[name]));
  if (!config) throw new Error();
} catch {
  console.log(
    JSON.stringify(
      {
        configured: false,
        reason:
          'Invalid project, reviewed policy, origins or private service configuration. See the setup guide.',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
const checks = {
  configuration: true,
  liveEnabled: values.CPI_LIVE_ENABLED === 'true',
  environment: config.environment,
  accountsPolicyCountries: Object.keys(config.policy.countries).length,
  rewardsEnabled: config.rewardsEnabled,
  purchasesEnabled: config.purchasesEnabled,
};
if (process.argv.includes('--online')) {
  if (config.environment === 'production' || process.argv.includes('--release')) {
    try {
      checks.supportMailDns = (await resolveMx('kolequant.com')).length > 0;
    } catch {
      checks.supportMailDns = false;
    }
  }
  try {
    const pool = createProjectSqlPool(
        config.projectRef,
        config.databaseUrl,
        (options) => new pg.Client(options),
        'cpi_runtime',
        config.databaseCa,
      ),
      connection = await pool.connect();
    try {
      checks.migrations =
        (
          await connection.query(
            'select version from cpi_private.live_service_schema where singleton',
          )
        ).rows[0]?.version === '20261107000600';
      const security = (
        await connection.query(
          `select bool_and(relrowsecurity and relforcerowsecurity) as safe from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cpi_private' and c.relkind='r'`,
        )
      ).rows[0];
      checks.privateTablesProtected = security?.safe === true;
      const operational = (
        await connection.query('select cpi_private.get_operations_policy() as policy')
      ).rows[0]?.policy;
      checks.newRunsUseLiveRules = operational?.startRuleset === 'infinity-v11-live';
      const worker = (
        await connection.query(
          'select name,last_success_at,last_failure_at,caught_up_at from cpi_private.provider_sync',
        )
      ).rows;
      checks.purchaseReconciliationFresh =
        !config.purchasesEnabled ||
        ['google.' + config.environment, 'apple.' + config.environment].every((name) =>
          worker.some(
            (row) =>
              row.name === name &&
              Number(row.caught_up_at) > Date.now() - 7200000 &&
              (!row.last_failure_at || Number(row.last_failure_at) < Number(row.last_success_at)),
          ),
        );
    } finally {
      connection.release();
    }
  } catch {
    checks.database = false;
  }
}
console.log(JSON.stringify(checks, null, 2));
const informational = new Set(['liveEnabled', 'rewardsEnabled', 'purchasesEnabled']);
if (
  process.argv.includes('--online') &&
  Object.entries(checks).some(([name, value]) => !informational.has(name) && value === false)
)
  process.exitCode = 1;
if (
  process.argv.includes('--release') &&
  (!checks.liveEnabled ||
    !checks.rewardsEnabled ||
    !checks.purchasesEnabled ||
    checks.accountsPolicyCountries === 0)
)
  process.exitCode = 1;
