import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertBuiltEnvironment,
  requireEnvironment,
} from '../../apps/mobile/config/environments.ts';
import {
  assertUnsignedPublicVariables,
  assertUnsignedRelease,
  resolveUnsignedRelease,
} from '../../apps/mobile/config/release-build.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = join(repository, 'apps/mobile');
const output = join(app, 'artifacts/unsigned-beta');
const required = [
  'App required checks',
  'Planning manifest and bootstrap',
  'Development iOS build and simulator launch',
];
function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
function git(...args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  }).trim();
}

export function assertSourcePreparation(release, context) {
  assert.equal(
    context.repository,
    'georgi-cole/crystal-path-infinity',
    'Unsigned preparation requires the standalone repository',
  );
  assert.equal(context.event, 'workflow_dispatch', 'Unsigned preparation is manual only');
  assert.equal(context.ref, 'refs/heads/main', 'Unsigned preparation requires main');
  assert.equal(context.head, release.sourceSha, 'Source SHA does not match the checkout');
  assert.equal(context.dirty, '', 'Tracked source must be clean before receipt creation');
  assert.equal(context.runId, release.workflowRunId, 'Workflow run identity mismatch');
  assert.equal(
    context.runNumber,
    String(release.buildNumber),
    'Build number must be the unique workflow run number',
  );
  assert.equal(
    context.runAttempt,
    '1',
    'Dispatch a new candidate instead of reusing its build number',
  );
}

/** Check the latest exact-SHA required results; an older success cannot mask failure. */
export function assertSourceChecks(value, sourceSha) {
  const pages = Array.isArray(value) ? value : [value];
  const checks = pages.flatMap((page) => (Array.isArray(page?.check_runs) ? page.check_runs : []));
  return required.map((name) => {
    const matches = checks.filter(
      (item) =>
        item.name === name && item.head_sha === sourceSha && item.app?.slug === 'github-actions',
    );
    matches.sort((a, b) => b.id - a.id);
    const latest = matches[0];
    assert.ok(
      latest && latest.status === 'completed' && latest.conclusion === 'success',
      'Exact source commit lacks a successful latest ' + name,
    );
    assert.ok(Number.isSafeInteger(latest.id) && latest.id > 0, 'Invalid source check identity');
    return { name, checkRunId: latest.id, sourceSha, conclusion: 'success' };
  });
}
function release() {
  const environment = requireEnvironment(process.env.CPI_APP_ENV);
  const selected = resolveUnsignedRelease(
    environment,
    json(join(app, 'package.json')).version,
    process.env,
  );
  assert.ok(selected, 'Explicit unsigned release metadata is required');
  assertUnsignedPublicVariables(process.env);
  return selected;
}
function publicAssets(root) {
  const textExtensions = /\.(?:js|css|html|json|txt)$/i;
  function visit(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      assert.ok(!entry.isSymbolicLink(), 'Public artifacts cannot contain symbolic links');
      const path = join(directory, entry.name);
      return entry.isDirectory() ? visit(path) : [path];
    });
  }
  for (const path of visit(root)) {
    if (!textExtensions.test(path)) continue;
    assert.ok(
      statSync(path).isFile() && statSync(path).size < 8 * 1024 * 1024,
      'Unexpected public artifact size',
    );
    const content = readFileSync(path, 'utf8');
    assert.ok(
      !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{12,}/.test(
        content,
      ),
      'Secret material is forbidden in public artifacts',
    );
  }
}
function record(platform, selected) {
  assert.ok(platform === 'android' || platform === 'ios', 'Specify only android or ios');
  assertUnsignedRelease(json(join(output, 'candidate.json')), selected);
  assertUnsignedRelease(json(join(app, 'dist/release-info.json')), selected);
  assertBuiltEnvironment(
    json(join(app, 'dist/build-info.json')),
    selected.app.environment,
    selected.app.version,
  );
  publicAssets(join(app, 'dist'));
  const verdict = json(join(app, `artifacts/unsigned-${platform}-verification.json`));
  assert.equal(verdict.platform, platform);
  assert.equal(verdict.unsigned, true);
  assert.equal(verdict.buildNumber, selected.buildNumber);
  assert.equal(verdict.appId, selected.app.appId);
  assert.equal(verdict.sourceSha, selected.sourceSha);
  const expectedVerification =
    platform === 'android'
      ? {
          'app-release-unsigned.aab': {
            publicMetadataVerified: true,
            nativeMetadataVerified: false,
            signatureChecks: ['jar-signatures-absent'],
          },
          'app-release-unsigned.apk': {
            publicMetadataVerified: true,
            nativeMetadataVerified: true,
            signatureChecks: ['jar-signatures-absent', 'apk-signing-block-absent'],
          },
        }
      : {
          'unsigned-ios-device-archive.tar.gz': {
            publicMetadataVerified: true,
            nativeMetadataVerified: true,
            signatureChecks: [
              'bundle-signature-directories-absent',
              'provisioning-profiles-absent',
              'mach-o-code-signatures-absent',
            ],
          },
        };
  assert.deepEqual(verdict.artifactVerification, expectedVerification);
  if (platform === 'ios')
    assert.ok(Number.isSafeInteger(verdict.machOFilesInspected) && verdict.machOFilesInspected > 0);
  const artifacts =
    platform === 'android'
      ? [
          ['android/app/build/outputs/bundle/release/app-release.aab', 'app-release-unsigned.aab'],
          [
            'android/app/build/outputs/apk/release/app-release-unsigned.apk',
            'app-release-unsigned.apk',
          ],
        ]
      : [['artifacts/unsigned-ios-device-archive.tar.gz', 'unsigned-ios-device-archive.tar.gz']];
  const files = [];
  for (const [from, name] of artifacts) {
    const source = join(app, from);
    assert.ok(
      existsSync(source) && statSync(source).isFile(),
      'Missing expected unsigned artifact',
    );
    assert.ok(
      statSync(source).size > 0 && statSync(source).size < 512 * 1024 * 1024,
      'Unexpected artifact size',
    );
    const destination = join(output, name);
    copyFileSync(source, destination);
    files.push({
      name,
      bytes: statSync(destination).size,
      sha256: createHash('sha256').update(readFileSync(destination)).digest('hex'),
      verification: expectedVerification[name],
    });
  }
  write(join(output, `receipt-${platform}.json`), {
    schemaVersion: 1,
    kind: 'unsigned-beta-preparation',
    release: selected,
    platform,
    artifacts: files,
    signing: 'unsigned',
    storeUploadPerformed: false,
    deviceInstallationVerified: false,
    privacyReviewApproved: false,
    crashSymbols: { included: verdict.crashSymbolsIncluded === true, uploaded: false },
  });
  console.log(
    'Unsigned ' +
      platform +
      ' candidate receipt and artifact hashes verified. No signing, installation or store upload occurred.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const selected = release();
    assertSourcePreparation(selected, {
      repository: process.env.GITHUB_REPOSITORY,
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      head: git('rev-parse', 'HEAD'),
      dirty: git('status', '--porcelain', '--untracked-files=no'),
      runId: process.env.GITHUB_RUN_ID,
      runNumber: process.env.GITHUB_RUN_NUMBER,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    });
    const [command, platform, ...extra] = process.argv.slice(2);
    assert.equal(extra.length, 0, 'Unexpected unsigned preparation arguments');
    if (command === 'prepare' && platform === undefined) {
      write(join(output, 'candidate.json'), selected);
      console.log('Unsigned source metadata verified; live services remain disabled.');
    } else if (command === 'checks' && platform === undefined) {
      const checks = assertSourceChecks(
        json(join(app, 'artifacts/release-source-checks.json')),
        selected.sourceSha,
      );
      write(join(output, 'source-checks.json'), {
        schemaVersion: 1,
        sourceSha: selected.sourceSha,
        workflowRunId: selected.workflowRunId,
        checks,
      });
      console.log('Required checks succeeded on the exact source commit.');
    } else if (command === 'record') record(platform, selected);
    else throw new Error('Usage: unsigned-beta.mjs prepare|checks|record android|ios');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unsigned preparation failed');
    process.exitCode = 1;
  }
}
