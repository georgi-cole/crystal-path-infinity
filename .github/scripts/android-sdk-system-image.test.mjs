import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const installer = fileURLToPath(new URL('./android-sdk-system-image.sh', import.meta.url));
const sdkMock = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  '[[ "$#" -eq 2 && "$1" == "--install" && "$2" == "system-images;android-36;default;x86_64" ]] || exit 94',
  'attempt_file="$ANDROID_HOME/mock-attempts"',
  'attempt=0',
  'if [[ -e "$attempt_file" ]]; then attempt="$(cat "$attempt_file")"; fi',
  'attempt=$((attempt + 1))',
  'printf "%s" "$attempt" > "$attempt_file"',
  'image_dir="$ANDROID_HOME/system-images/android-36/default/x86_64"',
  'case "$CPI_MOCK_SDK_MODE" in',
  '  corrupt-once|corrupt-always)',
  '    if [[ "$attempt" -eq 1 || "$CPI_MOCK_SDK_MODE" == "corrupt-always" ]]; then',
  '      mkdir -p "$image_dir"',
  '      printf partial > "$image_dir/partial-archive.zip"',
  '      echo "Warning: Error on ZipFile unknown archive."',
  '      exit 1',
  '    fi',
  '    [[ ! -e "$image_dir/partial-archive.zip" ]] || exit 97',
  '    ;;',
  '  fatal) echo "Error: Package not found."; exit 1 ;;',
  '  incomplete) echo "Installer returned success without image."; exit 0 ;;',
  '  success) ;;',
  '  *) exit 93 ;;',
  'esac',
  'mkdir -p "$image_dir"',
  'printf "Pkg.Revision=2\\n" > "$image_dir/source.properties"',
  'printf "system-image-bytes" > "$image_dir/system.img"',
  'echo "Installation complete"',
].join('\n') + '\n';

function fixture(t, mode) {
  const root = mkdtempSync(join(tmpdir(), 'cpi-sdk-image-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sdk = join(root, 'sdk');
  const executable = join(sdk, 'cmdline-tools/latest/bin/sdkmanager');
  mkdirSync(dirname(executable), { recursive: true });
  writeFileSync(executable, sdkMock);
  chmodSync(executable, 0o755);
  const result = spawnSync('bash', [installer], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1_000_000,
    env: {
      ...process.env,
      ANDROID_HOME: sdk,
      CPI_MOCK_SDK_MODE: mode,
      CPI_ANDROID_SDK_RETRY_DELAY_SECONDS: '0',
    },
  });
  assert.equal(result.error, undefined);
  return {
    root,
    result,
    attempts: () => Number(readFileSync(join(sdk, 'mock-attempts'), 'utf8')),
    combined: () =>
      readFileSync(join(root, 'apps/mobile/artifacts/android-system-image-install.log'), 'utf8'),
  };
}

test('healthy SDK system-image installation makes only one attempt', (t) => {
  const f = fixture(t, 'success');
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal(f.attempts(), 1);
  assert.match(f.combined(), /Installation complete/);
});

test('a corrupt archive is retried after removing only the incomplete image', (t) => {
  const f = fixture(t, 'corrupt-once');
  assert.equal(f.result.status, 0, f.result.stderr);
  assert.equal(f.attempts(), 2);
  assert.match(f.combined(), /ZipFile unknown archive/);
  assert.match(f.combined(), /Installation complete/);
});

test('three corrupt downloads fail with individual diagnostic logs', (t) => {
  const f = fixture(t, 'corrupt-always');
  assert.equal(f.result.status, 1);
  assert.equal(f.attempts(), 3);
  assert.match(f.result.stderr, /three bounded download attempts/);
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.match(
      readFileSync(
        join(f.root, 'apps/mobile/artifacts/android-system-image-install-attempt-' + attempt + '.log'),
        'utf8',
      ),
      /ZipFile unknown archive/,
    );
  }
});

test('non-ZIP SDK errors fail without retry or being mislabeled healthy', (t) => {
  const f = fixture(t, 'fatal');
  assert.equal(f.result.status, 1);
  assert.equal(f.attempts(), 1);
  assert.match(f.result.stderr, /refusing to retry/);
});

test('SDK exit zero with no system.img is not accepted', (t) => {
  const f = fixture(t, 'incomplete');
  assert.equal(f.result.status, 1);
  assert.equal(f.attempts(), 1);
  assert.match(f.result.stderr, /system image is incomplete/);
});
