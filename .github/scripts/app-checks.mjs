import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nonNativeFiles = new Set([
  'LICENSE',
  '.github/CODEOWNERS',
  '.github/workflows/planning.yml',
  '.github/workflows/mobile-spike.yml',
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
    path.startsWith('spikes/mobile/') ||
    path.startsWith('.github/ISSUE_TEMPLATE/') ||
    nonNativeFiles.has(path)
  );
}

/**
 * Only known web/game files qualify for a one-launch native smoke. Everything
 * unclassified (including toolchains, native projects and CI) runs the full
 * lifecycle suite. Do not infer safety from a .ts/.md extension alone.
 */
function classifyFile(path) {
  if (isDocumentationOrPlanning(path)) return 'none';
  if (
    path === 'apps/mobile/index.html' ||
    path.startsWith('apps/mobile/public/') ||
    path.startsWith('apps/mobile/src/') ||
    (path.startsWith('packages/game-core/') && !path.endsWith('/package.json'))
  ) {
    // Native bindings, clocks and lifecycle integration can live inside src/.
    // They must not be downgraded to the ordinary UI smoke profile.
    const nativeSegment =
      /^(?:native|capacitor|webview|bridge|lifecycle|foreground[-_.]?clock|platform|android|ios|device|permissions?)/i;
    if (path.split('/').some((segment) => nativeSegment.test(segment))) return 'full';
    return 'smoke';
  }
  return 'full';
}

const priority = { none: 0, smoke: 1, full: 2 };

/** Choose full for native changes, smoke for known app content, none for docs. */
export function selectNativeChecks({ eventName, event, repository = '.' }) {
  if (eventName === 'workflow_dispatch') {
    return { mode: 'full', reason: 'Manual dispatch runs the exhaustive native regression.' };
  }
  if (eventName === 'schedule') {
    return { mode: 'full', reason: 'Nightly regression runs the exhaustive native suite.' };
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
    return { mode: 'full', reason: 'Unknown event; full native verification is required.' };
  }

  const validCommit = (value) =>
    typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) && !/^0+$/.test(value);
  if (!validCommit(before) || !validCommit(after)) {
    return {
      mode: 'full',
      reason: 'Missing comparison revision; full native verification is required.',
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
    const mode = paths.reduce(
      (result, path) =>
        priority[classifyFile(path)] > priority[result] ? classifyFile(path) : result,
      'none',
    );
    const reasons = {
      none: 'Only documentation, planning, isolated spikes, or quality configuration changed.',
      smoke:
        'Known app UI, assets, or game logic changed; one real native launch and resume per platform.',
      full: 'Native/toolchain/CI or unclassified changes require the exhaustive lifecycle suite.',
    };
    return { mode, reason: reasons[mode], changedFiles: paths.length };
  } catch {
    return {
      mode: 'full',
      reason: 'Comparison unavailable; full native verification is required.',
    };
  }
}

/** A skipped native job is valid only after successful quality and explicit selection. */
export function assertAppGate(needs) {
  if (needs?.web?.result !== 'success') {
    throw new Error(`App quality did not succeed: ${needs?.web?.result ?? 'missing'}`);
  }
  const mode = needs.web.outputs?.native_mode;
  if (!['none', 'smoke', 'full'].includes(mode)) {
    throw new Error('Native-check selection is missing or invalid.');
  }
  const expected = mode === 'none' ? 'skipped' : 'success';
  for (const platform of ['android', 'ios']) {
    if (needs?.[platform]?.result !== expected) {
      throw new Error(
        `${platform} must be ${expected}; observed ${needs?.[platform]?.result ?? 'missing'}`,
      );
    }
  }
  return mode === 'none'
    ? 'App quality passed; native jobs intentionally skipped for a verified non-runtime diff.'
    : `App quality and both native build/launch jobs passed (${mode} profile).`;
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
        mode: 'full',
        reason: 'Event context unavailable; full native verification is required.',
      };
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `mode=${decision.mode}\n`);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Native verification\n\nProfile: **${decision.mode}**. ${decision.reason}\n`,
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
