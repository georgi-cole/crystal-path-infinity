import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { assertSourceChecks } from './unsigned-beta.mjs';

const env = process.env;
const command = (name, ...args) => execFileSync(name, args, { encoding: 'utf8' }).trim();
const git = (...args) => command('git', ...args);
const api = (...args) => JSON.parse(command('gh', 'api', ...args));
const repo = 'georgi-cole/crystal-path-infinity';
assert.equal(env.GITHUB_REPOSITORY, repo);
assert.equal(env.GITHUB_EVENT_NAME, 'push');
assert.equal(env.GITHUB_REF, 'refs/heads/codex/pawrachute-store-build-44');
assert.equal(env.GITHUB_RUN_ATTEMPT, '1', 'Dispatch a new candidate for a different build number');
assert.equal(git('rev-parse', 'HEAD'), env.GITHUB_SHA);

const request = api(`repos/${repo}/pulls/106`);
const source = git('rev-parse', 'HEAD^');
assert.equal(request.merged, true);
assert.equal(request.base.ref, 'main');
assert.equal(request.head.sha, env.CPI_APPROVED_SHA);
assert.equal(request.merge_commit_sha, source);
assert.equal(
  git('rev-parse', source + '^{tree}'),
  api(`repos/${repo}/git/commits/${env.CPI_APPROVED_SHA}`).tree.sha,
);
assertSourceChecks(
  api('--paginate', '--slurp', `repos/${repo}/commits/${env.CPI_APPROVED_SHA}/check-runs`),
  env.CPI_APPROVED_SHA,
);

const allowed = [
  '.github/scripts/ios-store-candidate.sh',
  '.github/scripts/pawrachute-android-store.sh',
  '.github/scripts/pawrachute-store-source.mjs',
  '.github/scripts/pawrachute-store-icon.java',
  '.github/workflows/pawrachute-store-build.yml',
  'apps/mobile/capacitor.config.ts',
  'apps/mobile/config/store-build.ts',
  'apps/mobile/scripts/generate-native.mjs',
  'apps/mobile/vite.config.ts',
];
assert.deepEqual(git('diff', '--name-only', source, 'HEAD').split('\n').sort(), allowed.sort());
assert.deepEqual(
  Object.keys(env)
    .filter((key) => key.startsWith('VITE_'))
    .sort(),
  ['VITE_GUEST_REWARDED_ADS_LIVE'],
);
assert.equal(env.VITE_GUEST_REWARDED_ADS_LIVE, 'true');
assert.equal(env.CPI_NATIVE_ADS, 'true');

for (const [path, expected] of [
  [
    'apps/mobile/brand-assets/native/ios/AppIcon.appiconset/AppIcon-512@2x.png',
    'f3c21d9f1aa4b7ad7738a791786a92f13463967393212189e3496075f627ccc9',
  ],
  [
    'apps/mobile/brand-assets/native/android/mipmap-xxxhdpi/ic_launcher.png',
    '3928e0331b971ba139635742230542d07d5a972e87a01d5fc19f1283e9d91904',
  ],
  [
    'apps/mobile/brand-assets/native/android/mipmap-xxxhdpi/ic_launcher_foreground.png',
    '77f44563480d2b3cfa2e6f0b8ba04d8d6b6f858055bef2a202dfd790186f1dd7',
  ],
]) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path);
}
appendFileSync(env.GITHUB_ENV, `CPI_MERGED_SOURCE_SHA=${source}\n`);
console.log(
  `Verified merged game tree ${source} against PR #106 and the approved Pawrachute artwork.`,
);
