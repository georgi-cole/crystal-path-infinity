import assert from 'node:assert/strict';
import { assertSourceChecks } from './unsigned-beta.mjs';

/** A checked review branch may produce only an internal TestFlight preview. */
export function assertNativeAccountSource(context, checks) {
  assert.equal(context.repository, 'georgi-cole/crystal-path-infinity');
  assert.match(context.sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(context.expectedSha, context.sourceSha);
  assert.equal(context.checkoutSha, context.sourceSha);
  assert.equal(context.currentBranchSha, context.sourceSha);
  assert.equal(context.runAttempt, '1');
  if (context.preview) {
    assert.equal(context.ref, 'refs/heads/codex/native-production-sign-in');
    assert.equal(context.internalOnly, 'true');
    assert.equal(context.mainRelation, 'ahead');
    assert.deepEqual(context.pr, {
      state: 'OPEN',
      headRefOid: context.sourceSha,
      headRefName: 'codex/native-production-sign-in',
      baseRefName: 'main',
    });
  } else assert.equal(context.ref, 'refs/heads/main');
  assertSourceChecks(checks, context.sourceSha);
}
