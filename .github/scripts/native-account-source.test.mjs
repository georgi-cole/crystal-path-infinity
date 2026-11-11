import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNativeAccountSource } from './native-account-source.mjs';
const sha = 'a'.repeat(40);
const checks = {
  check_runs: ['App required checks', 'Planning manifest and bootstrap'].map((name, index) => ({
    id: index + 1,
    name,
    head_sha: sha,
    app: { slug: 'github-actions' },
    status: 'completed',
    conclusion: 'success',
  })),
};
const preview = {
  repository: 'georgi-cole/crystal-path-infinity',
  sourceSha: sha,
  expectedSha: sha,
  checkoutSha: sha,
  currentBranchSha: sha,
  runAttempt: '1',
  preview: true,
  ref: 'refs/heads/codex/native-production-sign-in',
  internalOnly: 'true',
  mainRelation: 'ahead',
  pr: {
    state: 'OPEN',
    headRefOid: sha,
    headRefName: 'codex/native-production-sign-in',
    baseRefName: 'main',
  },
};
test('only the exact checked current review head may create an internal preview', () => {
  assert.doesNotThrow(() => assertNativeAccountSource(preview, checks));
  for (const change of [
    { expectedSha: 'b'.repeat(40) },
    { currentBranchSha: 'b'.repeat(40) },
    { checkoutSha: 'b'.repeat(40) },
    { runAttempt: '2' },
    { ref: 'refs/heads/unreviewed' },
    { internalOnly: 'false' },
    { mainRelation: 'diverged' },
    { pr: { ...preview.pr, state: 'CLOSED' } },
    { pr: { ...preview.pr, headRefOid: 'b'.repeat(40) } },
  ])
    assert.throws(() => assertNativeAccountSource({ ...preview, ...change }, checks));
  assert.throws(() =>
    assertNativeAccountSource(preview, {
      check_runs: checks.check_runs.map((item) => ({ ...item, conclusion: 'failure' })),
    }),
  );
});
test('ordinary store distribution still requires the exact checked current main', () => {
  assert.doesNotThrow(() =>
    assertNativeAccountSource({ ...preview, preview: false, ref: 'refs/heads/main' }, checks),
  );
  assert.throws(() => assertNativeAccountSource({ ...preview, preview: false }, checks));
});
