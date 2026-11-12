import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { assertBuiltEnvironment } from '../../apps/mobile/config/environments.ts';
import { assertUnsignedPublicVariables } from '../../apps/mobile/config/release-build.ts';
import { DEMO_ADMOB } from '../../apps/mobile/config/publisher.ts';
import { STORE_KEY, STORE_PAYMENT_MODE } from '../../apps/mobile/src/store-catalog.ts';
import { pagesAccountBuildEnv } from './pages-account-config.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = join(repository, 'apps/mobile');
const output = join(app, 'dist-pages');
const base = '/crystal-path-infinity/';
const qaBase = `${base}tester/`;
const qaOutput = join(app, 'dist-qa');

// Pages inherits no public services from env files or the runner. Production
// accounts can only be added below after the exact gateway check succeeds.
assertUnsignedPublicVariables(loadEnv('production', app, 'VITE_'));
assertUnsignedPublicVariables(loadEnv('qa', app, 'VITE_'));
assertUnsignedPublicVariables(process.env);
assert.equal(STORE_PAYMENT_MODE, 'test', 'QA purchases must remain simulated.');
if (Object.keys(process.env).some((name) => name.startsWith('CPI_RELEASE_')))
  throw new Error('Pages preview is separate from unsigned native release preparation.');

const accountEnv = await pagesAccountBuildEnv(process.env);
Object.assign(process.env, accountEnv);
try {
  await build({ root: app, mode: 'campaign-web', base, build: { outDir: output } });
} finally {
  for (const name of Object.keys(accountEnv)) delete process.env[name];
}

const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
const built = JSON.parse(readFileSync(join(output, 'build-info.json'), 'utf8'));
assertBuiltEnvironment(built, 'production', manifest.version);
const campaign = JSON.parse(readFileSync(join(output, 'campaign-web-info.json'), 'utf8'));
assert.equal(campaign.audience, 'public-browser');
assert.equal(campaign.campaign, true);
assert.equal(campaign.missions, 30);
assert.equal(campaign.simulatedPurchases, false);
assert.equal(campaign.purchases, 'mobile-app-only');
assert.equal(campaign.ads, 'unavailable');
for (const path of ['qa-info.json', 'player-preview-info.json', 'tester', 'player']) {
  assert(!existsSync(join(output, path)), `Review content in the Pages artifact: ${path}`);
}
const html = readFileSync(join(output, 'index.html'), 'utf8');
assert.match(html, /id="root"/);
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
assert(
  assets.some((asset) => asset.endsWith('.js')),
  'Missing compiled application script.',
);
for (const asset of assets) {
  assert(asset.startsWith(base), `Asset is outside the Pages project path: ${asset}`);
  assert(existsSync(join(output, asset.slice(base.length))), `Missing built asset: ${asset}`);
}
const playerAppAsset = assets.find((asset) => /\/assets\/index-[^/]+\.js$/.test(asset));
assert(playerAppAsset, 'Missing player application bundle.');
const playerApp = readFileSync(join(output, playerAppAsset.slice(base.length)), 'utf8');
for (const price of ['testBuyPrice', 'previewBuyPrice']) {
  assert(!playerApp.includes(price), 'Player app must not include simulated store prices.');
}
if (accountEnv.VITE_ACCOUNT_API_BASE_URL)
  assert(
    playerApp.includes(accountEnv.VITE_ACCOUNT_API_BASE_URL),
    'Player account host is missing.',
  );

const demoIds = Object.values(DEMO_ADMOB).flatMap(({ appId, rewarded }) => [appId, rewarded]);
const publicScripts = readdirSync(join(output, 'assets')).filter((name) => name.endsWith('.js'));
for (const name of publicScripts) {
  const script = readFileSync(join(output, 'assets', name), 'utf8');
  assert(!demoIds.some((id) => script.includes(id)), 'Demo ad inventory in the public bundle.');
  assert(!script.includes('cpi-mystery-lab'), 'Tester controls in the public bundle.');
  assert(!script.includes(STORE_KEY), 'Simulated wallet in the public bundle.');
}

// Validate QA separately. The workflow only uploads the production directory.
await build({
  root: app,
  mode: 'qa',
  base: qaBase,
  build: { outDir: qaOutput },
});
const qaBuilt = JSON.parse(readFileSync(join(qaOutput, 'build-info.json'), 'utf8'));
assertBuiltEnvironment(qaBuilt, 'staging', manifest.version);
const qaInfo = JSON.parse(readFileSync(join(qaOutput, 'qa-info.json'), 'utf8'));
assert.deepEqual(qaInfo, { schemaVersion: 1, audience: 'qa', tools: true });
const qaHtml = readFileSync(join(qaOutput, 'index.html'), 'utf8');
assert.match(qaHtml, /id="root"/);
const qaAssets = [...qaHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
assert(
  qaAssets.some((asset) => asset.endsWith('.js')),
  'Missing QA application script.',
);
for (const asset of qaAssets) {
  assert(asset.startsWith(qaBase), `QA asset is outside the tester path: ${asset}`);
  assert(
    existsSync(join(qaOutput, asset.slice(qaBase.length))),
    `Missing QA built asset: ${asset}`,
  );
}
const qaAppAsset = qaAssets.find((asset) => /\/assets\/index-[^/]+\.js$/.test(asset));
assert(qaAppAsset, 'Missing QA application bundle.');
const qaApp = readFileSync(join(qaOutput, qaAppAsset.slice(qaBase.length)), 'utf8');
assert(qaApp.includes('testBuyPrice'), 'Tester app must include simulated test-store prices.');
if (accountEnv.VITE_ACCOUNT_API_BASE_URL)
  assert(
    !qaApp.includes(accountEnv.VITE_ACCOUNT_API_BASE_URL),
    'Production account configuration leaked into the tester app.',
  );

writeFileSync(join(output, '.nojekyll'), '');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repository,
  encoding: 'utf8',
}).trim();
const deployment = {
  schemaVersion: 1,
  kind: 'campaign-web',
  sourceSha,
  base,
  liveServices: {
    accounts: accountEnv.VITE_ACCOUNT_SERVICES_ENABLED === 'true' ? 'enabled' : 'disabled',
    ranked: 'disabled',
    ads: 'disabled',
  },
  purchases: 'mobile-app-only',
  campaign: true,
  missions: campaign.missions,
};
writeFileSync(join(output, 'deployment-info.json'), JSON.stringify(deployment, null, 2) + '\n');
const qaDeployment = {
  schemaVersion: 1,
  kind: 'guest-qa-tester-preview',
  sourceSha,
  base: qaBase,
  audience: 'qa-testers',
  liveServices: { accounts: 'disabled', ranked: 'disabled', ads: 'disabled' },
  purchases: 'simulated-test-only',
  charges: 'none',
  persistence: 'browser-local-only',
};
writeFileSync(join(qaOutput, 'deployment-info.json'), JSON.stringify(qaDeployment, null, 2) + '\n');
console.log(JSON.stringify({ player: deployment, tester: qaDeployment }));
