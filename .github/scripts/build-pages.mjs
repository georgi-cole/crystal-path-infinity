import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { assertBuiltEnvironment } from '../../apps/mobile/config/environments.ts';
import { assertUnsignedPublicVariables } from '../../apps/mobile/config/release-build.ts';
import { STORE_PAYMENT_MODE } from '../../apps/mobile/src/store-catalog.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = join(repository, 'apps/mobile');
const output = join(app, 'dist-pages');
const base = '/crystal-path-infinity/';
const qaBase = `${base}tester/`;
const qaOutput = join(app, 'dist-qa');

// This public preview must not inherit account/ad configuration from env files
// or the runner. Reuse the existing strict no-public-service-variable guard.
assertUnsignedPublicVariables(loadEnv('production', app, 'VITE_'));
assertUnsignedPublicVariables(loadEnv('qa', app, 'VITE_'));
assertUnsignedPublicVariables(process.env);
assert.equal(STORE_PAYMENT_MODE, 'test', 'QA purchases must remain simulated.');
if (Object.keys(process.env).some((name) => name.startsWith('CPI_RELEASE_')))
  throw new Error('Pages preview is separate from unsigned native release preparation.');

await build({ root: app, mode: 'production', base, build: { outDir: output } });

const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
const built = JSON.parse(readFileSync(join(output, 'build-info.json'), 'utf8'));
assertBuiltEnvironment(built, 'production', manifest.version);
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

writeFileSync(join(output, '.nojekyll'), '');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repository,
  encoding: 'utf8',
}).trim();
const deployment = {
  schemaVersion: 1,
  kind: 'guest-web-preview',
  sourceSha,
  base,
  liveServices: { accounts: 'disabled', ranked: 'disabled', ads: 'disabled' },
  purchases: 'unavailable-no-live-billing',
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
