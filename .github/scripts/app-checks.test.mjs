import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { assertAppGate, selectNativeChecks } from './app-checks.mjs';

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

test('a complete documentation/planning/template PR keeps native jobs off', (t) => {
  const f = fixture(t);
  f.put('docs/decisions/example.md', 'Document the observed result.\n');
  f.put('planning/backlog.json', '{"note":"updated acceptance"}\n');
  f.put('.github/ISSUE_TEMPLATE/task.yml', 'name: Task\n');
  f.put('apps/mobile/README.md', 'Correct installation instructions.\n');
  assert.equal(f.select(f.commit()).required, false);
});

test('runtime and root dependency changes require both native platforms', (t) => {
  const f = fixture(t);
  f.put('apps/mobile/src/App.tsx', 'export const title = "Updated title";\n');
  const runtimeHead = f.commit();
  assert.equal(f.select(runtimeHead).required, true);
  f.put('package.json', '{"version":"0.1.1"}\n');
  const after = f.commit();
  assert.equal(
    selectNativeChecks({
      eventName: 'push',
      event: { before: runtimeHead, after },
      repository: f.repository,
    }).required,
    true,
  );
});

test('moving runtime source into docs cannot hide the removed app path', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.repository, 'docs'), { recursive: true });
  renameSync(
    join(f.repository, 'apps/mobile/src/App.tsx'),
    join(f.repository, 'docs/App-example.tsx'),
  );
  assert.equal(f.select(f.commit()).required, true);
});

test('deleting runtime source still requires native verification', (t) => {
  const f = fixture(t);
  unlinkSync(join(f.repository, 'apps/mobile/src/App.tsx'));
  assert.equal(f.select(f.commit()).required, true);
});

test('new unclassified paths fail closed instead of assuming documentation', (t) => {
  const f = fixture(t);
  f.put('packages/new-core/engine.ts', 'export const next = 1;\n');
  const unknownHead = f.commit();
  assert.equal(f.select(unknownHead).required, true);
  f.put('apps/mobile/src/tutorial.md', 'Text imported into the app at runtime.\n');
  assert.equal(
    selectNativeChecks({
      eventName: 'push',
      event: { before: unknownHead, after: f.commit() },
      repository: f.repository,
    }).required,
    true,
  );
});

test('manual, unknown, missing and unavailable comparison contexts require native jobs', (t) => {
  const f = fixture(t);
  for (const context of [
    { eventName: 'workflow_dispatch', event: {} },
    { eventName: 'new-event', event: {} },
    { eventName: 'pull_request', event: {} },
    { eventName: 'push', event: { before: '0'.repeat(40), after: f.before } },
    { eventName: 'push', event: { before: 'f'.repeat(40), after: f.before } },
  ]) {
    assert.equal(selectNativeChecks({ ...context, repository: f.repository }).required, true);
  }
});

const results = (nativeRequired, quality = 'success', android = 'success', ios = 'success') => ({
  web: { result: quality, outputs: { native_required: nativeRequired } },
  android: { result: android },
  ios: { result: ios },
});

test('aggregate accepts real native success or explicitly selected non-runtime skips', () => {
  assert.match(assertAppGate(results('true')), /both native/);
  assert.match(
    assertAppGate(results('false', 'success', 'skipped', 'skipped')),
    /intentionally skipped/,
  );
});

test('aggregate rejects failed quality even if all expensive jobs were skipped', () => {
  for (const quality of ['failure', 'cancelled', 'skipped', undefined]) {
    const needs = results('false', 'success', 'skipped', 'skipped');
    needs.web.result = quality;
    assert.throws(() => assertAppGate(needs), /App quality did not succeed/);
  }
});

test('aggregate rejects missing selection and false native passes/skips', () => {
  for (const flag of [undefined, '', 'unknown']) {
    assert.throws(() => assertAppGate(results(flag)), /selection/);
  }
  for (const platform of ['android', 'ios']) {
    for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
      const needs = results('true');
      needs[platform].result = status;
      assert.throws(() => assertAppGate(needs), /must be success/);
    }
  }
  assert.throws(
    () => assertAppGate(results('false', 'success', 'success', 'skipped')),
    /must be skipped/,
  );
});
