import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { assertAppGate, selectNativeChecks } from './app-checks.mjs';
import { classifyNativeFailure } from './native-failure-diagnostics.mjs';

function fixture(t) {
  const repository = mkdtempSync(join(tmpdir(), 'cpi-app-checks-'));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  const put = (path, content) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), content);
  };
  const commit = () => {
    git('add', '-A');
    git(
      '-c',
      'user.name=CPI fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    );
    return git('rev-parse', 'HEAD');
  };
  git('init', '--quiet', '--initial-branch=main');
  put('apps/mobile/src/App.tsx', 'export const title = "Crystal Path";\n');
  put('apps/mobile/README.md', 'Application instructions.\n');
  put('package.json', '{"version":"0.1.0"}\n');
  const before = commit();
  const select = (after) =>
    selectNativeChecks({
      eventName: 'pull_request',
      event: { pull_request: { base: { sha: before }, head: { sha: after } } },
      repository,
    });
  return { repository, before, put, commit, select };
}

test('docs, planning, quality config and isolated spike changes select none', (t) => {
  const f = fixture(t);
  f.put('docs/decisions/example.md', 'Document the observed result.\n');
  f.put('planning/backlog.json', '{"note":"updated acceptance"}\n');
  f.put('.github/ISSUE_TEMPLATE/task.yml', 'name: Task\n');
  f.put('apps/mobile/README.md', 'Correct installation instructions.\n');
  f.put('spikes/mobile/example.ts', 'export const isolated = true;\n');
  const decision = f.select(f.commit());
  assert.equal(decision.mode, 'none');
  assert.equal(decision.changedFiles, 5);
});

test('ordinary UI/assets/game engine changes select single-launch smoke', (t) => {
  const f = fixture(t);
  f.put('apps/mobile/src/App.tsx', 'export const title = "Updated title";\n');
  f.put('apps/mobile/public/scene.svg', '<svg/>\n');
  f.put('packages/game-core/src/rounds.ts', 'export const rounds = 10;\n');
  const decision = f.select(f.commit());
  assert.equal(decision.mode, 'smoke');
  assert.match(decision.reason, /one real native launch/);
});

test('native bridge, lifecycle, toolchain and workflow changes always select full', (t) => {
  const f = fixture(t);
  const paths = [
    'apps/mobile/src/native-clock.ts',
    'apps/mobile/src/lifecycle.test.ts',
    'apps/mobile/scripts/smoke-native.mjs',
    'apps/mobile/config/native-smoke.ts',
    'apps/mobile/package.json',
    'apps/mobile/android/app/build.gradle',
    'apps/mobile/ios/App/Info.plist',
    '.github/workflows/mobile-app.yml',
    '.github/scripts/app-checks.mjs',
    'package-lock.json',
  ];
  for (const path of paths) {
    f.put(path, 'native CI impact\n');
    assert.equal(f.select(f.commit()).mode, 'full', path);
  }
});

test('moving a runtime source to docs cannot hide deleted app code', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.repository, 'docs'), { recursive: true });
  renameSync(
    join(f.repository, 'apps/mobile/src/App.tsx'),
    join(f.repository, 'docs/App-example.tsx'),
  );
  assert.equal(f.select(f.commit()).mode, 'smoke');
});

test('deleting runtime source still checks the compiled native app', (t) => {
  const f = fixture(t);
  unlinkSync(join(f.repository, 'apps/mobile/src/App.tsx'));
  assert.equal(f.select(f.commit()).mode, 'smoke');
});

test('unknown code and dependency changes fail closed to full', (t) => {
  const f = fixture(t);
  f.put('packages/new-core/engine.ts', 'export const next = 1;\n');
  const unknownHead = f.commit();
  assert.equal(f.select(unknownHead).mode, 'full');
  f.put('package.json', '{"version":"0.1.1"}\n');
  const after = f.commit();
  assert.equal(
    selectNativeChecks({
      eventName: 'push',
      event: { before: unknownHead, after },
      repository: f.repository,
    }).mode,
    'full',
  );
});

test('combined docs and UI are smoke; combined UI and native are full', (t) => {
  const f = fixture(t);
  f.put('docs/guide.md', 'guide\n');
  f.put('apps/mobile/src/App.tsx', 'export const title = "Second";\n');
  assert.equal(f.select(f.commit()).mode, 'smoke');
  f.put('apps/mobile/src/native-clock.ts', 'export const clock = 1;\n');
  assert.equal(f.select(f.commit()).mode, 'full');
});

test('nightly and manual select full; unknown or missing git context fails closed', (t) => {
  const f = fixture(t);
  for (const context of [
    { eventName: 'workflow_dispatch', event: {} },
    { eventName: 'schedule', event: {} },
    { eventName: 'new-event', event: {} },
    { eventName: 'pull_request', event: {} },
    { eventName: 'push', event: { before: '0'.repeat(40), after: f.before } },
    { eventName: 'push', event: { before: 'f'.repeat(40), after: f.before } },
  ]) {
    assert.equal(selectNativeChecks({ ...context, repository: f.repository }).mode, 'full');
  }
});

const results = (mode, quality = 'success', android = 'success', ios = 'success') => ({
  web: { result: quality, outputs: { native_mode: mode } },
  android: { result: android },
  ios: { result: ios },
});

test('aggregate accepts native success for smoke/full or intentional none skips', () => {
  for (const mode of ['smoke', 'full']) {
    assert.match(assertAppGate(results(mode)), new RegExp(mode));
  }
  assert.match(
    assertAppGate(results('none', 'success', 'skipped', 'skipped')),
    /intentionally skipped/,
  );
});

test('aggregate rejects failed quality even when native jobs were skipped', () => {
  for (const quality of ['failure', 'cancelled', 'skipped', undefined]) {
    const needs = results('none', 'success', 'skipped', 'skipped');
    needs.web.result = quality;
    assert.throws(() => assertAppGate(needs), /App quality did not succeed/);
  }
});

test('aggregate rejects missing profile, masked native failures and improper skips', () => {
  for (const flag of [undefined, '', 'true', 'unknown']) {
    assert.throws(() => assertAppGate(results(flag)), /selection/);
  }
  for (const mode of ['smoke', 'full']) {
    for (const platform of ['android', 'ios']) {
      for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
        const needs = results(mode);
        needs[platform].result = status;
        assert.throws(() => assertAppGate(needs), /must be success/);
      }
    }
  }
  assert.throws(
    () => assertAppGate(results('none', 'success', 'success', 'skipped')),
    /must be skipped/,
  );
});

test('failure classification never mistakes a target ANR for runner success', () => {
  const anr =
    '1793639689.646 621 2636 E ActivityManager: ANR in ' +
    'com.georgicole.crystalpath.infinity.dev (MainActivity)';
  assert.equal(classifyNativeFailure({ platform: 'android', appLog: anr }).category, 'app-anr');
  assert.equal(
    classifyNativeFailure({
      platform: 'android',
      failure: 'Timed out waiting for Android native pause after Home (30s)',
      appLog: anr,
    }).category,
    'app-anr',
  );
  assert.equal(
    classifyNativeFailure({
      platform: 'android',
      appLog: 'E ActivityManager: ANR in com.android.launcher3',
    }).category,
    'unclassified',
  );
});

test('failure classification distinguishes lifecycle, compile, setup and unknown', () => {
  assert.equal(
    classifyNativeFailure({
      platform: 'android',
      failure: 'Timed out waiting for Android native pause after Home (30s)',
    }).category,
    'lifecycle-or-readiness',
  );
  assert.equal(
    classifyNativeFailure({ platform: 'ios', buildLog: 'xcodebuild: error: SwiftCompile' })
      .category,
    'native-build',
  );
  assert.equal(
    classifyNativeFailure({ platform: 'android', failure: 'device offline' }).category,
    'emulator-provisioning',
  );
  assert.equal(
    classifyNativeFailure({ platform: 'ios', failure: 'unrecognized' }).category,
    'unclassified',
  );
});
