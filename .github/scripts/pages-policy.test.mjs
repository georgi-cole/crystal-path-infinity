import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the real workflow gate rather than a second copy of the policy.
// Its expression deliberately uses only operators shared by Actions and JS.
const workflow = readFileSync(new URL('../workflows/pages.yml', import.meta.url), 'utf8');
const deploy = workflow.split(/^ {2}deploy:\s*$/m)[1];
assert.ok(deploy, 'Missing Pages deploy job');
const condition = deploy.match(/^ {4}if: (.+)$/m)?.[1];
assert.ok(condition, 'Pages deploy must have an explicit publication gate');

for (const [event, ref, expected] of [
  ['push', 'refs/heads/main', true],
  ['workflow_dispatch', 'refs/heads/main', true],
  ['workflow_dispatch', 'refs/heads/codex/store-test-mode', true],
  ['push', 'refs/heads/codex/store-test-mode', false],
  ['pull_request', 'refs/heads/main', false],
  ['pull_request', 'refs/heads/codex/store-test-mode', false],
  ['pull_request', 'refs/pull/84/merge', false],
  ['pull_request_target', 'refs/heads/main', false],
  ['workflow_run', 'refs/heads/main', false],
  ['schedule', 'refs/heads/main', false],
  ['workflow_dispatch', 'refs/heads/other-preview', false],
  ['workflow_dispatch', 'refs/heads/design/obsidian-glass', false],
  ['workflow_dispatch', 'refs/heads/codex/store-test-mode-other', false],
  ['workflow_dispatch', 'refs/tags/codex/store-test-mode', false],
  ['push', 'refs/tags/main', false],
]) {
  test(`${event} on ${ref} ${expected ? 'may publish' : 'cannot publish'}`, () => {
    assert.equal(
      runInNewContext(condition, { github: { event_name: event, ref } }, { timeout: 1000 }),
      expected,
    );
  });
}
