import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertSourceChecks, assertSourcePreparation } from './unsigned-beta.mjs';

const sourceSha = 'a'.repeat(40);
const release = { sourceSha, workflowRunId: '12345', buildNumber: 42 };
const context = {
  repository: 'georgi-cole/crystal-path-infinity',
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
  head: sourceSha,
  dirty: '',
  runId: '12345',
  runNumber: '42',
  runAttempt: '1',
};
test('unsigned source receipt cannot attest another checkout, dirty source or reused run counter', () => {
  assert.doesNotThrow(() => assertSourcePreparation(release, context));
  for (const changed of [
    { repository: 'other/product' },
    { event: 'pull_request' },
    { ref: 'refs/heads/feature' },
    { head: 'b'.repeat(40) },
    { dirty: ' M apps/mobile/src/App.tsx' },
    { runId: '12346' },
    { runNumber: '43' },
    { runAttempt: '2' },
  ])
    assert.throws(() => assertSourcePreparation(release, { ...context, ...changed }));
});
test('latest required results must succeed on the exact source SHA and trusted Actions app', () => {
  const checks = [
    'App required checks',
    'Planning manifest and bootstrap',
    'Development iOS build and simulator launch',
  ].map((name, index) => ({
    id: index + 1,
    name,
    head_sha: sourceSha,
    app: { slug: 'github-actions' },
    status: 'completed',
    conclusion: 'success',
  }));
  assert.doesNotThrow(() => assertSourceChecks({ check_runs: checks }, sourceSha));
  assert.throws(
    () => assertSourceChecks({ check_runs: checks.slice(0, 2) }, sourceSha),
    /iOS build and simulator launch/,
  );
  assert.throws(
    () =>
      assertSourceChecks(
        {
          check_runs: checks.map((check) =>
            check.id === 3
              ? { ...check, name: 'Development iOS compilation (simulator intentionally omitted)' }
              : check,
          ),
        },
        sourceSha,
      ),
    /iOS build and simulator launch/,
  );
  assert.throws(() =>
    assertSourceChecks(
      { check_runs: [...checks, { ...checks[0], id: 3, conclusion: 'failure' }] },
      sourceSha,
    ),
  );
  assert.throws(() =>
    assertSourceChecks(
      { check_runs: checks.map((item) => ({ ...item, head_sha: 'b'.repeat(40) })) },
      sourceSha,
    ),
  );
  assert.throws(() =>
    assertSourceChecks(
      { check_runs: checks.map((item) => ({ ...item, app: { slug: 'untrusted' } })) },
      sourceSha,
    ),
  );
});
test('unsigned packaging workflow is manual main-only, secret-free and cannot upload to stores', () => {
  const workflow = readFileSync(new URL('../workflows/unsigned-beta.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /if: github\.ref == 'refs\/heads\/main' && github\.repository == 'georgi-cole\/crystal-path-infinity'/,
  );
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
  assert.match(workflow, /environment: cpi-beta-preparation/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(
    workflow,
    /contents: write|id-token: write|secrets\.|upload_to_testflight|supply\b|fastlane|altool|notarytool|storePassword|keyPassword|p12|mobileprovision/,
  );
  assert.match(workflow, /CPI_RELEASE_BUILD_NUMBER: \$\{\{ github.run_number \}\}/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow, /bundleRelease/);
  assert.match(workflow, /unsigned-beta\.mjs prepare/);
});
