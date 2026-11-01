import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nonNativeFiles = new Set([
  'LICENSE',
  '.github/CODEOWNERS',
  '.github/workflows/planning.yml',
  'scripts/bootstrap_github.py',
  'scripts/validate_plan.py',
  'scripts/test_bootstrap.py',
  'eslint.config.mjs',
  'prettier.config.mjs',
  '.prettierrc.json',
  '.prettierignore',
  'apps/mobile/README.md',
  'spikes/mobile/README.md',
  '.github/pull_request_template.md',
]);

function isDocumentationOrPlanning(path) {
  return (
    (!path.includes('/') && path.endsWith('.md')) ||
    path.startsWith('docs/') ||
    path.startsWith('planning/') ||
    path.startsWith('.github/ISSUE_TEMPLATE/') ||
    nonNativeFiles.has(path)
  );
}

/** Native verification is optional only for a known, complete non-runtime diff. */
export function selectNativeChecks({ eventName, event, repository = '.' }) {
  if (eventName === 'workflow_dispatch') {
    return { required: true, reason: 'Manual dispatch verifies both native platforms.' };
  }

  let before;
  let after;
  let separator;
  if (eventName === 'pull_request') {
    before = event?.pull_request?.base?.sha;
    after = event?.pull_request?.head?.sha;
    separator = '...';
  } else if (eventName === 'push') {
    before = event?.before;
    after = event?.after;
    separator = '..';
  } else {
    return { required: true, reason: 'Unknown event; native verification is required.' };
  }

  const validCommit = (value) =>
    typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) && !/^0+$/.test(value);
  if (!validCommit(before) || !validCommit(after)) {
    return {
      required: true,
      reason: 'Missing comparison revision; native verification is required.',
    };
  }

  try {
    // --no-renames includes both sides when source is moved into a docs directory.
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--no-renames', '-z', `${before}${separator}${after}`, '--'],
      {
        cwd: repository,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const paths = output.split('\0').filter(Boolean);
    const required = paths.some((path) => !isDocumentationOrPlanning(path));
    return {
      required,
      reason: required
        ? 'Application, dependency, toolchain, workflow, or unclassified files changed.'
        : 'Complete diff contains only documentation, planning, templates, or quality configuration.',
      changedFiles: paths.length,
    };
  } catch {
    return { required: true, reason: 'Comparison unavailable; native verification is required.' };
  }
}

/** A skipped native job is valid only after successful quality and explicit selection. */
export function assertAppGate(needs) {
  if (needs?.web?.result !== 'success') {
    throw new Error(`App quality did not succeed: ${needs?.web?.result ?? 'missing'}`);
  }
  const required = needs.web.outputs?.native_required;
  if (required !== 'true' && required !== 'false') {
    throw new Error('Native-check selection is missing or invalid.');
  }
  const expected = required === 'true' ? 'success' : 'skipped';
  for (const platform of ['android', 'ios']) {
    if (needs?.[platform]?.result !== expected) {
      throw new Error(
        `${platform} must be ${expected}; observed ${needs?.[platform]?.result ?? 'missing'}`,
      );
    }
  }
  return required === 'true'
    ? 'App quality and both native build/launch jobs passed.'
    : 'App quality passed; native jobs were intentionally skipped for the reviewed non-runtime diff.';
}

function main() {
  if (process.argv[2] === 'select') {
    let decision;
    try {
      decision = selectNativeChecks({
        eventName: process.env.GITHUB_EVENT_NAME,
        event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      });
    } catch {
      decision = {
        required: true,
        reason: 'Event context unavailable; native verification is required.',
      };
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `required=${decision.required}\n`);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Native verification\n\nRequired: **${decision.required}**. ${decision.reason}\n`,
    );
    console.log(JSON.stringify(decision));
  } else if (process.argv[2] === 'gate') {
    console.log(assertAppGate(JSON.parse(process.env.APP_CHECK_RESULTS)));
  } else {
    throw new Error('Usage: node .github/scripts/app-checks.mjs select|gate');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
