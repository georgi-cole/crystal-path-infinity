import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const artifactRoot = join(repositoryRoot, 'apps/mobile/artifacts');

/**
 * Evidence-based triage only. "app-anr" is a real failure, even if the virtual
 * machine was overloaded. An unknown cause never becomes "infrastructure".
 */
export function classifyNativeFailure({ platform, failure = '', appLog = '', buildLog = '' }) {
  const evidence = [failure, appLog, buildLog].join('\n');
  const appId = 'com.georgicole.crystalpath.infinity.dev';
  const appAnr = evidence.split(/\r?\n/).some((line) => {
    const match = line.match(/E ActivityManager: ANR in ([^\s(]+)/);
    return match?.[1] === appId;
  });
  if (platform === 'android' && appAnr) {
    return {
      category: 'app-anr',
      explanation: 'Android reported a genuine ANR against the target application. Inspect captured ANR/WindowManager traces; do not retry blindly.',
    };
  }
  if (/FATAL EXCEPTION|CPI_NATIVE_DIAGNOSTIC .*"event":"(?:bridge-error|js-error|unhandled-rejection)"|Uncaught (?:TypeError|Error|exception)/i.test(evidence)) {
    return {
      category: 'app-runtime',
      explanation: 'Application JavaScript/native runtime error was observed. Review the startup diagnostics and app log.',
    };
  }
  if (/Timed out waiting for .*?(?:native pause|bridge round-trip|React|page.load|background|prebridge|Home key|graphics|IO pressure)|Native startup\/lifecycle gate failed/i.test(failure)) {
    return {
      category: 'lifecycle-or-readiness',
      explanation: 'Native lifecycle/readiness proof did not complete. This could be app behavior or emulator timing; inspect the logs before classifying it as infrastructure.',
    };
  }
  if (/BUILD FAILED|Execution failed for task|error: (?:CompileSwift|SwiftCompile)|xcodebuild: error:/i.test(buildLog)) {
    return {
      category: 'native-build',
      explanation: 'The native build reported a compilation or dependency failure. Check the attached build output.',
    };
  }
  if (/device offline|emulator: ERROR|PANIC:.*AVD|no emulator|could not start|sys.boot_completed|Failed to install.*system.image|Permission denied.*\/dev\/kvm/i.test(failure)) {
    return {
      category: 'emulator-provisioning',
      explanation: 'Emulator or runner provisioning failed before validated lifecycle completion. Check SDK, KVM, device and boot logs.',
    };
  }
  return {
    category: 'unclassified',
    explanation: 'No conclusive failure signature was found. A reviewer must inspect the step log and uploaded artifacts.',
  };
}

function readEvidence(file, limit = 4 * 1024 * 1024) {
  const fullPath = join(artifactRoot, file);
  if (!existsSync(fullPath)) return '';
  const body = readFileSync(fullPath, 'utf8');
  return body.slice(-limit);
}

export function buildNativeFailureReport(platform) {
  if (!['android', 'ios'].includes(platform)) {
    throw new Error('Supported native platforms: android, ios');
  }
  const candidateFiles = [
    `${platform}-launch-failure.json`,
    `${platform}-app.log`,
    `${platform}-startup-diagnostics.json`,
    `${platform}-native-lifecycle.log`,
    platform === 'android' ? 'android-build.log' : 'ios-build.log',
    platform === 'android' ? 'android-failure-last-anr.txt' : 'ios-boot.log',
  ];
  const failure = readEvidence(`${platform}-launch-failure.json`);
  const appLog = [
    readEvidence(`${platform}-app.log`),
    readEvidence(`${platform}-startup-diagnostics.json`),
    readEvidence(platform === 'android' ? 'android-failure-last-anr.txt' : 'ios-boot.log'),
  ].join('\n');
  const buildLog = readEvidence(platform === 'android' ? 'android-build.log' : 'ios-build.log');
  const classified = classifyNativeFailure({ platform, failure, appLog, buildLog });
  return {
    schemaVersion: 1,
    platform,
    ...classified,
    evidenceFiles: candidateFiles.filter((name) => existsSync(join(artifactRoot, name))),
    appCheckResult: 'failure',
    note: 'Classification is advisory. The GitHub Actions job must remain failed.',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--platform') {
    throw new Error('Usage: node .github/scripts/native-failure-diagnostics.mjs --platform android|ios');
  }
  mkdirSync(artifactRoot, { recursive: true });
  const report = buildNativeFailureReport(args[1]);
  writeFileSync(
    join(artifactRoot, `${report.platform}-ci-failure-classification.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  const summary =
    `### ${report.platform.toUpperCase()} CI failure triage\n\n` +
    `Classification: **${report.category}**. ${report.explanation}\n\n` +
    `Evidence files: ${report.evidenceFiles.length ? report.evidenceFiles.join(', ') : 'none captured yet'}.\n\n` +
    'This diagnostic does **not** suppress or excuse the failed native required check.\n';
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
