import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { assertBuiltEnvironment } from '../../apps/mobile/config/environments.ts';
import { assertUnsignedPublicVariables } from '../../apps/mobile/config/release-build.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = join(repository, 'apps/mobile');
const output = join(app, 'dist');
const base = '/crystal-path-infinity/';

// This public preview must not inherit account/ad configuration from env files
// or the runner. Reuse the existing strict no-public-service-variable guard.
assertUnsignedPublicVariables(loadEnv('production', app, 'VITE_'));
assertUnsignedPublicVariables(process.env);
if (Object.keys(process.env).some((name) => name.startsWith('CPI_RELEASE_')))
  throw new Error('Pages preview is separate from unsigned native release preparation.');

await build({ root: app, mode: 'production', base });

const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
const built = JSON.parse(readFileSync(join(output, 'build-info.json'), 'utf8'));
assertBuiltEnvironment(built, 'production', manifest.version);
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
};
writeFileSync(join(output, 'deployment-info.json'), JSON.stringify(deployment, null, 2) + '\n');
console.log(JSON.stringify(deployment));
