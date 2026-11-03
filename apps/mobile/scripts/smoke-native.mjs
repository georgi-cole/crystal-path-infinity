#!/usr/bin/env node
// Launch-only evidence with official Android SDK / Xcode tools. No app service,
// ad SDK, production identity, signing credentials, or third-party runner action.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  androidAppAnrObserved,
  androidBroadcastsIdle,
  androidCpuInfoWithinBudget,
  androidToyboxTopCpu,
  androidHomeLaunchObserved,
  androidPressureWithinBudget,
  androidRenderPressure,
  androidUserBootPosted,
} from '../config/android-boot-readiness.ts';
import {
  analyzeNativeLog,
  lifecycleBoundary,
  nativeLaunchProblems,
  nativeLifecycleProblems,
  startupSession,
} from '../config/native-smoke.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = join(appRoot, 'artifacts');
const args = process.argv.slice(2);
assert.ok(
  (args.length === 2 || (args.length === 4 && args[2] === '--profile')) &&
    args[0] === '--platform' &&
    ['android', 'ios'].includes(args[1]) &&
    (args.length === 2 || ['smoke', 'full'].includes(args[3])),
  'Usage: node scripts/smoke-native.mjs --platform android|ios [--profile smoke|full]',
);
const platform = args[1];
const profile = args.length === 4 ? args[3] : 'full';
const androidColdStarts = profile === 'full' ? 3 : 1;
const iosColdStarts = profile === 'full' ? 2 : 1;
mkdirSync(evidenceRoot, { recursive: true });
// A failed repeat must never leave a previous invocation's success evidence.
for (const suffix of [
  'launch-result.json',
  'launch-failure.json',
  'launch.png',
  'launch-failed.png',
  'app.log',
  'startup-diagnostics.json',
  'native-lifecycle.log',
  'lifecycle-actions.json',
]) {
  rmSync(join(evidenceRoot, `${platform}-${suffix}`), { force: true });
}
for (const name of readdirSync(evidenceRoot)) {
  if (name.startsWith(`${platform}-attempt-`)) rmSync(join(evidenceRoot, name), { force: true });
}
const buildInfo = JSON.parse(readFileSync(join(appRoot, 'dist/build-info.json'), 'utf8'));
assert.equal(buildInfo.environment, 'development', 'Launch smoke accepts only the development app');
assert.equal(buildInfo.appId, 'com.georgicole.crystalpath.infinity.dev');
const transcript = [];
const lifecycleActions = [];
const diagnosticReports = [];
let logOffset = 0;
let attempt = 1;

function run(
  command,
  commandArgs,
  { timeout = 60_000, allowFailure = false, binary = false } = {},
) {
  const entry = { command, args: commandArgs, startedAt: new Date().toISOString() };
  transcript.push(entry);
  const result = spawnSync(command, commandArgs, {
    cwd: appRoot,
    encoding: binary ? undefined : 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024,
  });
  Object.assign(entry, {
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
  });
  if (!allowFailure) {
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      `${command} ${commandArgs.join(' ')} failed: ${String(result.stderr).slice(-4000)}`,
    );
  }
  return result;
}
function text(command, commandArgs, options) {
  return String(run(command, commandArgs, options).stdout ?? '').trim();
}
function save(name, contents) {
  writeFileSync(join(evidenceRoot, name), contents);
}
function detachedLog(command, commandArgs, file, timestampLines = false, append = false) {
  const entry = { command, args: commandArgs, startedAt: new Date().toISOString() };
  transcript.push(entry);
  const fd = openSync(join(evidenceRoot, file), append ? 'a' : 'w');
  const child = spawn(command, commandArgs, {
    cwd: appRoot,
    stdio: timestampLines ? ['ignore', 'pipe', 'pipe'] : ['ignore', fd, fd],
    env: { ...process.env, SIMCTL_CHILD_NSUnbufferedIO: 'YES' },
  });
  if (timestampLines) {
    for (const stream of [child.stdout, child.stderr]) {
      let pending = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        const lines = (pending + chunk).split('\n');
        pending = lines.pop();
        for (const line of lines) writeSync(fd, `${new Date().toISOString()} ${line}\n`);
      });
      stream.on('end', () => {
        if (pending) writeSync(fd, `${new Date().toISOString()} ${pending}\n`);
      });
    }
  } else closeSync(fd);
  child.smokeClosed = false;
  child.on('close', () => {
    child.smokeClosed = true;
    if (timestampLines) closeSync(fd);
  });
  child.on('error', (error) => {
    child.smokeError = error;
  });
  child.on('exit', (exitCode, signal) =>
    Object.assign(entry, { finishedAt: new Date().toISOString(), exitCode, signal }),
  );
  return child;
}
function assertRunning(child, description) {
  if (child.smokeError) throw child.smokeError;
  assert.equal(child.exitCode, null, `${description} exited before launch proof was collected`);
  assert.equal(
    child.signalCode,
    null,
    `${description} was terminated before launch proof was collected`,
  );
}
async function waitFor(description, milliseconds, probe) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${description} (${milliseconds / 1000}s)`);
}
async function runLogged(command, commandArgs, file, timeout) {
  const child = detachedLog(command, commandArgs, file);
  try {
    await waitFor(`${command} completion; diagnostics in ${file}`, timeout, () => {
      if (child.smokeError) throw child.smokeError;
      assert.equal(child.signalCode, null, `${command} was terminated; see ${file}`);
      return child.exitCode !== null;
    });
    assert.equal(child.exitCode, 0, `${command} failed; see ${file}`);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
function appLog() {
  const path = join(evidenceRoot, `${platform}-app.log`);
  assert.ok(
    !existsSync(path) || statSync(path).size < 16 * 1024 * 1024,
    'Native app log exceeded its budget',
  );
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
function readAnalysis() {
  const fullLog = appLog();
  return analyzeNativeLog(fullLog.slice(logOffset), buildInfo, { attributionLog: fullLog });
}
function hasStartupEvidence() {
  const analysis = readAnalysis();
  if (analysis.diagnostics.some((event) => event.event === 'bridge-error')) {
    throw new Error('Native bridge readiness check failed; see startup diagnostics');
  }
  return (
    analysis.readyMarkerLines.length > 0 &&
    startupSession(analysis) &&
    analysis.diagnostics.some((event) => event.event === 'page-load')
  );
}
function hasResumeEvidence(boundary) {
  return readAnalysis().diagnostics.some(
    (event) =>
      event.sessionId === boundary.sessionId &&
      event.sequence > boundary.sequenceBeforeBackground &&
      event.event === 'bridge-ready' &&
      event.details?.reason === 'resume' &&
      event.hasTriggerEvent,
  );
}
function recordLifecycleAction(action, details = {}) {
  lifecycleActions.push({ timestamp: new Date().toISOString(), attempt, action, ...details });
  save(`${platform}-lifecycle-actions.json`, `${JSON.stringify(lifecycleActions, null, 2)}\n`);
}
function saveAttempt(boundary, observationComplete = false) {
  const analysis = readAnalysis();
  const prebridge = profile === 'full' && (platform === 'android' ? attempt <= 2 : attempt === 1);
  const report = {
    attempt,
    observedAt: new Date().toISOString(),
    observationComplete,
    prebridge,
    boundary,
    ...analysis,
    problems: [
      ...nativeLaunchProblems(analysis, platform, boundary),
      ...nativeLifecycleProblems(analysis, prebridge),
    ],
  };
  const existing = diagnosticReports.findIndex((item) => item.attempt === attempt);
  if (existing >= 0) diagnosticReports[existing] = report;
  else diagnosticReports.push(report);
  save(`${platform}-attempt-${attempt}-app.log`, appLog().slice(logOffset));
  save(`${platform}-attempt-${attempt}-diagnostics.json`, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
function saveDiagnostics() {
  const fullLog = appLog();
  const full = analyzeNativeLog(fullLog, buildInfo);
  // Later process evidence can invalidate an earlier foreign-PID classification.
  // Re-evaluate each preserved attempt against the final complete capture.
  for (const attemptReport of diagnosticReports) {
    const captured = readFileSync(
      join(evidenceRoot, `${platform}-attempt-${attemptReport.attempt}-app.log`),
      'utf8',
    );
    const analysis = analyzeNativeLog(captured, buildInfo, { attributionLog: fullLog });
    Object.assign(attemptReport, analysis, {
      problems: [
        ...nativeLaunchProblems(analysis, platform, attemptReport.boundary),
        ...nativeLifecycleProblems(analysis, attemptReport.prebridge),
      ],
    });
    save(
      `${platform}-attempt-${attemptReport.attempt}-diagnostics.json`,
      `${JSON.stringify(attemptReport, null, 2)}\n`,
    );
  }
  const report = {
    schemaVersion: 1,
    platform,
    profile,
    buildInfo,
    observedAt: new Date().toISOString(),
    lifecycleActions,
    attempts: diagnosticReports,
    allObservedErrors: full.errors,
    externalRuntimeErrors: full.externalRuntimeErrors,
    engineMessages: full.engineMessages,
  };
  save(`${platform}-startup-diagnostics.json`, `${JSON.stringify(report, null, 2)}\n`);
  save(
    `${platform}-native-lifecycle.log`,
    full.nativeEvents.map((event) => event.raw).join('\n') + '\n',
  );
  return report;
}
function assertHealthyLaunch() {
  const report = saveDiagnostics();
  const externalProcesses = new Set(
    report.externalRuntimeErrors.map((error) => `${error.pid}:${error.processName}`),
  );
  console.log(
    `Native diagnostics: ${report.allObservedErrors.length} blocking errors; ` +
      `${report.externalRuntimeErrors.length} runtime log entries from ` +
      `${externalProcesses.size} confirmed external processes retained in evidence.`,
  );
  const problems = diagnosticReports.flatMap((item) =>
    item.problems.map((problem) => `Attempt ${item.attempt}: ${problem}`),
  );
  const requiredAttempts = platform === 'android' ? androidColdStarts : iosColdStarts;
  if (
    diagnosticReports.length !== requiredAttempts ||
    diagnosticReports.some((item) => !item.observationComplete)
  ) {
    problems.push(
      `Required ${requiredAttempts} fully observed cold launches (${profile}); got ${diagnosticReports.filter((item) => item.observationComplete).length}`,
    );
  }
  const owners = diagnosticReports.map(
    (item) =>
      item.diagnostics.find(
        (event) => event.event === 'bridge-ready' && event.details?.reason === 'startup',
      )?.details?.lifecycle,
  );
  if (
    owners.some((owner) => !owner) ||
    new Set(owners.map((owner) => owner?.bridgeId)).size !== diagnosticReports.length ||
    new Set(owners.map((owner) => owner?.pageId)).size !== diagnosticReports.length
  ) {
    problems.push(
      'Cold process/WebView recreation did not create distinct native bridge and page identities',
    );
  }
  if (report.allObservedErrors.length)
    problems.push(
      `${report.allObservedErrors.length} JavaScript/native runtime error log entries observed across the full capture`,
    );
  assert.deepEqual(
    problems,
    [],
    `Native startup/lifecycle gate failed:\n${problems.slice(0, 8).join('\n')}`,
  );
  return report;
}
async function stopLog(child) {
  if (!child || child.smokeClosed) return;
  await new Promise((resolveStopped) => {
    const timer = setTimeout(resolveStopped, 2000);
    child.once('close', () => {
      clearTimeout(timer);
      resolveStopped();
    });
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
  });
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
function assertPng(path) {
  const image = readFileSync(path);
  assert.ok(image.length > 1000, 'Screenshot is empty or incomplete');
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Screenshot is not PNG');
}

async function android() {
  assert.ok(process.env.ANDROID_HOME, 'ANDROID_HOME must point to the installed SDK');
  const sdk = process.env.ANDROID_HOME;
  const emulator = join(sdk, 'emulator/emulator');
  const adb = join(sdk, 'platform-tools/adb');
  const serial = 'emulator-5554';
  const avd = 'cpi003-development';
  const adbArgs = (...values) => ['-s', serial, ...values];
  save('android-emulator-version.txt', text(emulator, ['-version']));
  text(emulator, ['-accel-check']);
  const child = detachedLog(
    emulator,
    [
      '-avd',
      avd,
      '-port',
      '5554',
      '-no-window',
      '-no-audio',
      '-no-boot-anim',
      '-no-snapshot',
      '-wipe-data',
      // The API 36 headless runner reproduced focus ANRs with gfxstream's
      // direct SwiftShader GLES path both with and without Vulkan enabled.
      // Use the supported ANGLE-on-SwiftShader GLES backend; preserve native
      // WebView rendering, real HOME transitions and ANR failure semantics.
      '-feature',
      '-Vulkan',
      '-gpu',
      'swangle',
      '-accel',
      'on',
      '-camera-back',
      'none',
      '-camera-front',
      'none',
    ],
    'android-emulator.log',
  );
  let logcat;
  let boundary;
  let device;

  /** A real target-app ANR must always fail, regardless of emulator pressure. */
  function assertNoTargetAnr() {
    assert.ok(
      !androidAppAnrObserved(appLog().slice(logOffset), buildInfo.appId),
      'Android target-app ANR during focus transition; see ActivityManager logs',
    );
  }

  let psiAllowed = true;
  function capturePressure() {
    if (psiAllowed) {
      const cpu = run(adb, adbArgs('shell', 'cat', '/proc/pressure/cpu'), {
        timeout: 10_000,
        allowFailure: true,
      });
      const io = run(adb, adbArgs('shell', 'cat', '/proc/pressure/io'), {
        timeout: 10_000,
        allowFailure: true,
      });
      if (cpu.status === 0 && io.status === 0) {
        const metrics = androidRenderPressure(String(cpu.stdout), String(io.stdout));
        assert.ok(metrics, 'Kernel pressure data is unreadable or malformed');
        return {
          source: 'kernel-psi',
          metrics,
          withinBudget: androidPressureWithinBudget(metrics),
        };
      }
      psiAllowed = false;
      save(
        'android-pressure-source.txt',
        'Android system restricted unprivileged /proc/pressure access; using live Toybox top.\n',
      );
    }
    // Toybox measures fresh CPU activity for each invocation. The archived
    // dumpsys cpuinfo fallback repeated 85% CPU unchanged for 118 samples.
    const cpuInfo = text(adb, adbArgs('shell', 'top', '-b', '-n', '1', '-m', '1'), {
      timeout: 15_000,
    });
    const metrics = androidToyboxTopCpu(cpuInfo);
    assert.ok(metrics, 'Android Toybox top did not provide valid live CPU/IO telemetry');
    return {
      source: 'toybox-top',
      metrics,
      withinBudget: androidCpuInfoWithinBudget(metrics),
    };
  }

  /**
   * The fresh SwiftShader GPU can be saturated *after* Android boot, broadcast
   * idle and even a fast native bridge handshake. Require 3 low-load samples
   * (kernel PSI or Android dumpsys cpuinfo) plus quiet WebView resources.
   * This test-only gate does not alter production startup or relax native proof.
   */
  async function waitForAndroidGraphicsSettling(stage, quietAssets = false) {
    const samples = [];
    const started = Date.now();
    let lastAssetCount = -1;
    let lastAssetAt = started;
    let consecutiveGood = 0;
    let completed = false;
    try {
      await waitFor('Android ' + stage + ' graphics/IO pressure readiness', 120_000, () => {
        assertRunning(child, 'Android emulator');
        assertRunning(logcat, 'Android lifecycle log capture');
        assertNoTargetAnr();
        const now = Date.now();
        const currentLog = appLog().slice(logOffset);
        const resourceCount = (currentLog.match(/D Capacitor: Handling local request:/g) ?? [])
          .length;
        if (resourceCount !== lastAssetCount) {
          lastAssetCount = resourceCount;
          lastAssetAt = now;
          consecutiveGood = 0;
        }
        const pressure = capturePressure();
        const resourceQuiet = !quietAssets || now - lastAssetAt >= 4000;
        consecutiveGood = pressure.withinBudget && resourceQuiet ? consecutiveGood + 1 : 0;
        samples.push({
          at: new Date(now).toISOString(),
          stage,
          pressure,
          resourceCount,
          quietForMs: now - lastAssetAt,
          consecutiveGood,
        });
        if (samples.length > 180) samples.shift();
        return consecutiveGood >= 3 && now - started >= (quietAssets ? 6000 : 2500);
      });
      completed = true;
    } finally {
      save(
        'android-attempt-' + attempt + '-' + stage + '-graphics-readiness.json',
        JSON.stringify({ attempt, stage, completed, samples }, null, 2) + '\n',
      );
    }
  }

  try {
    await waitFor('Android boot', 360_000, () => {
      assertRunning(child, 'Android emulator');
      return (
        text(adb, adbArgs('shell', 'getprop', 'sys.boot_completed'), {
          timeout: 10_000,
          allowFailure: true,
        }) === '1'
      );
    });
    text(adb, adbArgs('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'));
    text(adb, adbArgs('shell', 'wm', 'dismiss-keyguard'));
    for (const setting of [
      'window_animation_scale',
      'transition_animation_scale',
      'animator_duration_scale',
    ]) {
      text(adb, adbArgs('shell', 'settings', 'put', 'global', setting, '0'));
    }
    text(
      adb,
      adbArgs('install', '-r', join(appRoot, 'android/app/build/outputs/apk/debug/app-debug.apk')),
      { timeout: 120_000 },
    );
    save('android-webview.txt', text(adb, adbArgs('shell', 'dumpsys', 'webviewupdate')));
    // sys.boot_completed=1 can precede the user-0 BOOT_COMPLETED broadcast.
    // The failed CPI-011 emulator was still processing first-boot services
    // after React rendered; its activity then received a focus-loss ANR.
    // Require actual user broadcast posting and drained queues before launch,
    // without weakening the app-level Home/pause/resume checks below.
    const bootLogArgs = adbArgs('logcat', '-d', '-v', 'epoch', '-s', 'ActivityManager:I');
    let postedBootLine = '';
    await waitFor('Android user-0 BOOT_COMPLETED', 180_000, () => {
      assertRunning(child, 'Android emulator');
      const bootLog = text(adb, bootLogArgs, { timeout: 15_000 });
      postedBootLine = bootLog.split('\n').find(androidUserBootPosted) ?? '';
      return Boolean(postedBootLine);
    });
    save('android-user-boot-completed.log', postedBootLine + '\n');
    recordLifecycleAction('android-user-boot-completed');
    const broadcastDrainArgs = adbArgs('shell', 'am', 'wait-for-broadcast-idle');
    const broadcastDrain = text(adb, broadcastDrainArgs, { timeout: 180_000 });
    save('android-broadcast-idle.log', broadcastDrain + '\n');
    assert.ok(
      androidBroadcastsIdle(broadcastDrain),
      'Android user boot broadcasts have not drained: ' + broadcastDrain.slice(-1000),
    );
    recordLifecycleAction('android-boot-broadcasts-idle');
    text(adb, adbArgs('logcat', '-c'));
    // Continuous capture starts before launch and includes native OS/activity
    // events. Exceptions before React or after its first frame remain visible.
    logcat = detachedLog(
      adb,
      adbArgs(
        'logcat',
        '-v',
        'epoch',
        '-s',
        'Capacitor:D',
        'Capacitor/Console:D',
        'Capacitor/Plugin:D',
        'ActivityTaskManager:I',
        'ActivityManager:I',
        'AndroidRuntime:E',
        'chromium:E',
      ),
      'android-app.log',
    );
    // Ordinary PRs prove one complete real lifecycle. Native and nightly runs
    // preserve all three cold starts, including prebridge Home/lock evidence.
    // This is never a retry-after-failure: every required attempt must pass.
    for (attempt = 1; attempt <= androidColdStarts; attempt += 1) {
      boundary = undefined;
      if (attempt > 1) {
        recordLifecycleAction('force-stop-between-cold-starts');
        text(adb, adbArgs('shell', 'am', 'force-stop', buildInfo.appId));
        await waitFor(
          'Android process termination',
          30_000,
          () => !text(adb, adbArgs('shell', 'pidof', buildInfo.appId), { allowFailure: true }),
        );
      }
      logOffset = appLog().length;
      recordLifecycleAction('cold-launch');
      const launch = text(
        adb,
        adbArgs(
          'shell',
          'am',
          'start',
          '-W',
          '-n',
          `${buildInfo.appId}/.MainActivity`,
          '--ez',
          'cpi_prebridge_gate',
          String(profile === 'full' && attempt <= 2),
        ),
      );
      save(`android-attempt-${attempt}-launch.txt`, launch);
      if (attempt === 1) save('android-launch.txt', launch);
      if (profile === 'full' && attempt <= 2) {
        await waitFor('Android native prebridge navigation gate', 30_000, () =>
          readAnalysis().prebridgeGates.some((gate) => gate.stage === 'waiting'),
        );
        assert.equal(
          readAnalysis().diagnostics.length,
          0,
          'Page unexpectedly ran before the native prebridge interruption',
        );
        recordLifecycleAction(attempt === 1 ? 'prebridge-home' : 'prebridge-lock');
        text(
          adb,
          adbArgs('shell', 'input', 'keyevent', attempt === 1 ? 'KEYCODE_HOME' : 'KEYCODE_SLEEP'),
        );
        await waitFor('Android real pause before the page exists', 30_000, () =>
          readAnalysis().prebridgeGates.some((gate) => gate.stage === 'paused'),
        );
        assert.equal(
          readAnalysis().diagnostics.length,
          0,
          'Prebridge native pause unexpectedly initialized a page',
        );
        recordLifecycleAction('prebridge-native-pause-observed');
        if (attempt === 2) {
          save('android-prebridge-lock-power.txt', text(adb, adbArgs('shell', 'dumpsys', 'power')));
          text(adb, adbArgs('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'));
          text(adb, adbArgs('shell', 'wm', 'dismiss-keyguard'));
        }
        text(adb, adbArgs('shell', 'am', 'start', '-W', '-n', `${buildInfo.appId}/.MainActivity`));
      }
      await waitFor('Android React, page-load, and native bridge readiness', 90_000, () => {
        assertRunning(child, 'Android emulator');
        assertRunning(logcat, 'Android lifecycle log capture');
        return hasStartupEvidence();
      });
      // The initial bridge-ready marker precedes the first GPU/WebView paint.
      await waitForAndroidGraphicsSettling('foreground', true);
      recordLifecycleAction('foreground-render-stable');
      const initialPid = text(adb, adbArgs('shell', 'pidof', buildInfo.appId));
      boundary = lifecycleBoundary(readAnalysis());
      recordLifecycleAction('home', { boundary });
      text(adb, adbArgs('shell', 'input', 'keyevent', 'KEYCODE_HOME'));
      // A freshly restarted emulator SystemUI can accept the injected key
      // without opening HOME. This is *not* an app pause failure: do not start
      // the pause clock until the OS actually dispatches the navigation.
      const nativePaused = () =>
        readAnalysis().nativeEvents.some(
          (event) => event.line > boundary.lineBeforeBackground && event.event === 'App paused',
        );
      try {
        await waitFor('Android Home key dispatch', 5_000, () => {
          assertRunning(child, 'Android emulator');
          assertRunning(logcat, 'Android lifecycle log capture');
          assertNoTargetAnr();
          return (
            nativePaused() ||
            androidHomeLaunchObserved(appLog().slice(logOffset), boundary.lineBeforeBackground)
          );
        });
      } catch (reason) {
        if (
          !(reason instanceof Error) ||
          !reason.message.startsWith('Timed out waiting for Android Home key dispatch')
        )
          throw reason;
        // Only when no real launcher transition OR pause was observed:
        // ask Android ActivityManager to launch HOME, rather than faking
        // document events, the native clock, or the activity's pause callback.
        recordLifecycleAction('home-key-not-dispatched-launcher-intent');
        save(
          `android-attempt-${attempt}-home-launcher-intent.txt`,
          text(
            adb,
            adbArgs(
              'shell',
              'am',
              'start',
              '-W',
              '-a',
              'android.intent.action.MAIN',
              '-c',
              'android.intent.category.HOME',
            ),
          ),
        );
      }
      await waitFor('Android native pause after Home', 30_000, () => {
        assertRunning(child, 'Android emulator');
        assertRunning(logcat, 'Android lifecycle log capture');
        assertNoTargetAnr();
        return nativePaused();
      });
      recordLifecycleAction('native-pause-observed');
      save(
        `android-attempt-${attempt}-background-activity.txt`,
        text(adb, adbArgs('shell', 'dumpsys', 'activity', 'activities')),
      );
      // Do not immediately switch focus back while the OS compositor is busy.
      await waitForAndroidGraphicsSettling('background');
      recordLifecycleAction('background-render-stable');
      recordLifecycleAction('resume-existing-activity');
      save(
        `android-attempt-${attempt}-resume.txt`,
        text(adb, adbArgs('shell', 'am', 'start', '-W', '-n', `${buildInfo.appId}/.MainActivity`)),
      );
      await waitFor('Android bridge round-trip after real Home/resume', 30_000, () => {
        assertRunning(logcat, 'Android lifecycle log capture');
        assertNoTargetAnr();
        return hasResumeEvidence(boundary);
      });
      const pid = text(adb, adbArgs('shell', 'pidof', buildInfo.appId));
      assert.match(pid, /^\d+(?:\s+\d+)*$/, 'App process is not running');
      assert.equal(pid, initialPid, 'Home/resume unexpectedly replaced the app process');
      save(
        'android-activity.txt',
        text(adb, adbArgs('shell', 'dumpsys', 'activity', 'activities')),
      );
      const screenshot = join(evidenceRoot, `android-attempt-${attempt}-launch.png`);
      save(
        `android-attempt-${attempt}-launch.png`,
        run(adb, adbArgs('exec-out', 'screencap', '-p'), { binary: true }).stdout,
      );
      assertPng(screenshot);
      save('android-launch.png', readFileSync(screenshot));
      assertRunning(logcat, 'Android lifecycle log capture');
      recordLifecycleAction('attempt-observation-complete');
      saveAttempt(boundary, true);
      device = {
        kind: 'Android emulator',
        serial,
        avd,
        api: text(adb, adbArgs('shell', 'getprop', 'ro.build.version.sdk')),
        androidVersion: text(adb, adbArgs('shell', 'getprop', 'ro.build.version.release')),
        pid,
        screenshot: 'android-launch.png',
        coldStartAttempts: androidColdStarts,
        lifecycleAction:
          profile === 'full'
            ? 'Home and lock before first JS page; three recreated processes/WebViews; real Home/resume on every attempt'
            : 'One real cold start, native bridge and Home/resume with process identity preserved',
      };
    }
    attempt = androidColdStarts;
    const dump = run(adb, adbArgs('shell', 'uiautomator', 'dump', '/sdcard/cpi003-window.xml'), {
      timeout: 30_000,
      allowFailure: true,
    });
    if (dump.status === 0)
      save('android-window.xml', text(adb, adbArgs('shell', 'cat', '/sdcard/cpi003-window.xml')));
    assertRunning(logcat, 'Android lifecycle log capture');
    recordLifecycleAction('observation-complete');
    await stopLog(logcat);
    saveAttempt(boundary, true);
    return device;
  } catch (error) {
    // Attach system focus/load evidence on failure without replacing the error.
    for (const [name, commandArgs] of [
      ['android-failure-cpu-pressure.txt', adbArgs('shell', 'cat', '/proc/pressure/cpu')],
      ['android-failure-io-pressure.txt', adbArgs('shell', 'cat', '/proc/pressure/io')],
      ['android-failure-window.txt', adbArgs('shell', 'dumpsys', 'window', 'windows')],
      ['android-failure-activities.txt', adbArgs('shell', 'dumpsys', 'activity', 'activities')],
      ['android-failure-gfxinfo.txt', adbArgs('shell', 'dumpsys', 'gfxinfo', buildInfo.appId)],
    ]) {
      const result = run(adb, commandArgs, { timeout: 15_000, allowFailure: true });
      save(name, String(result.stdout ?? '') + '\n' + String(result.stderr ?? ''));
    }
    // The OS trace may be root-only even when /data/anr can be listed.
    // Collect the readable DropBox copy first, then try adb root on this
    // disposable AOSP emulator. A production/root-denied image falls back
    // to the official adb bugreport without bypassing the ANR failure.
    const dropbox = run(adb, adbArgs('shell', 'dumpsys', 'dropbox', '--print', 'data_app_anr'), {
      timeout: 25_000,
      allowFailure: true,
    });
    save(
      'android-failure-dropbox-anr.txt',
      String(dropbox.stdout ?? '') + '\n' + String(dropbox.stderr ?? ''),
    );
    const rootResult = run(adb, adbArgs('root'), { timeout: 20_000, allowFailure: true });
    save(
      'android-failure-adb-root.txt',
      String(rootResult.stdout ?? '') + '\n' + String(rootResult.stderr ?? ''),
    );
    if (rootResult.status === 0) {
      try {
        await waitFor(
          'failure-only Android root debug connection',
          25_000,
          () =>
            text(adb, adbArgs('shell', 'id', '-u'), { timeout: 10_000, allowFailure: true }) ===
            '0',
        );
      } catch (rootError) {
        save('android-failure-root-debug-error.txt', String(rootError));
      }
    }
    const anrList = run(adb, adbArgs('shell', 'ls', '-1', '/data/anr'), {
      timeout: 15_000,
      allowFailure: true,
    });
    save(
      'android-failure-anr-index.txt',
      String(anrList.stdout ?? '') + '\n' + String(anrList.stderr ?? ''),
    );
    let traceCaptured = false;
    if (anrList.status === 0) {
      const traces = String(anrList.stdout ?? '')
        .split(/\r?\n/)
        .filter((name) => /^anr_[a-zA-Z0-9_.-]+$/.test(name))
        .slice(-2);
      for (const [index, name] of traces.entries()) {
        const trace = run(adb, adbArgs('shell', 'cat', '/data/anr/' + name), {
          timeout: 20_000,
          allowFailure: true,
        });
        const body = String(trace.stdout ?? '') + '\n' + String(trace.stderr ?? '');
        save('android-failure-anr-trace-' + (index + 1) + '.txt', body);
        if (trace.status === 0 && body.includes('Cmd line: ' + buildInfo.appId))
          traceCaptured = true;
      }
    }
    if (!traceCaptured) {
      const report = run(
        adb,
        adbArgs('bugreport', join(evidenceRoot, 'android-failure-bugreport.zip')),
        { timeout: 120_000, allowFailure: true },
      );
      save(
        'android-failure-bugreport-status.txt',
        JSON.stringify({
          status: report.status,
          error: String(report.error ?? ''),
          stdout: String(report.stdout ?? '').slice(-2000),
          stderr: String(report.stderr ?? '').slice(-2000),
        }),
      );
    }
    const lastAnr = run(adb, adbArgs('shell', 'dumpsys', 'activity', 'lastanr'), {
      timeout: 15_000,
      allowFailure: true,
    });
    save(
      'android-failure-last-anr.txt',
      String(lastAnr.stdout ?? '') + '\n' + String(lastAnr.stderr ?? ''),
    );
    const screenshot = run(adb, adbArgs('exec-out', 'screencap', '-p'), {
      timeout: 10_000,
      binary: true,
      allowFailure: true,
    });
    if (screenshot.status === 0 && screenshot.stdout?.length)
      save('android-launch-failed.png', screenshot.stdout);
    throw error;
  } finally {
    await stopLog(logcat);
    if (!diagnosticReports.some((item) => item.attempt === attempt)) saveAttempt(boundary);
    saveDiagnostics();
    save(
      'android-runtime-errors.log',
      text(adb, adbArgs('logcat', '-d', '-v', 'epoch', '-s', 'AndroidRuntime:E'), {
        timeout: 10_000,
        allowFailure: true,
      }),
    );
    run(adb, adbArgs('emu', 'kill'), { timeout: 10_000, allowFailure: true });
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

async function ios() {
  // Fresh iOS 26.5 migration exceeded 360s and native first launch took 89s in CI.
  // Bound that provisioning work separately from the unchanged app/lifecycle checks.
  const provisioningBudgetsMs = { coldBoot: 900_000, firstNativeProcess: 180_000 };
  const available = JSON.parse(text('xcrun', ['simctl', 'list', '--json', 'devices', 'available']));
  save('ios-simulators.json', JSON.stringify(available, null, 2));
  save('ios-runtimes.json', text('xcrun', ['simctl', 'list', '--json', 'runtimes']));
  const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';
  const devices = available.devices[runtime] ?? [];
  const device =
    devices.find((item) => item.name === 'iPhone 17' && item.isAvailable) ??
    devices.find((item) => item.name.startsWith('iPhone') && item.isAvailable);
  assert.ok(device, 'The Xcode 26.6 smoke requires an installed iPhone / iOS 26.5 simulator');
  assert.ok(device.deviceTypeIdentifier, 'Simulator device type is missing');
  // Own a fresh device so the check neither depends on nor changes a precreated
  // runner/personal simulator's saved state. Only this UDID is cleaned up.
  const simulatorName = `CPI003-${Date.now()}`;
  const udid = text('xcrun', [
    'simctl',
    'create',
    simulatorName,
    device.deviceTypeIdentifier,
    runtime,
  ]);
  assert.match(udid, /^[0-9A-F-]{36}$/i, 'simctl did not return a simulator UUID');
  let child;
  let boundary;
  let observationComplete = false;
  save('ios-simctl-launch-help.txt', text('xcrun', ['simctl', 'help', 'launch']));
  save(
    'ios-smoke-device.json',
    JSON.stringify(
      {
        name: simulatorName,
        deviceType: device.deviceTypeIdentifier,
        udid,
        runtime,
        provisioningBudgetsMs,
      },
      null,
      2,
    ),
  );
  try {
    console.log(
      `Booting fresh ${device.name} / iOS 26.5 simulator (budget ${provisioningBudgetsMs.coldBoot / 1000}s); progress is recorded in ios-boot.log`,
    );
    await runLogged(
      'xcrun',
      ['simctl', 'bootstatus', udid, '-b'],
      'ios-boot.log',
      provisioningBudgetsMs.coldBoot,
    );
    text(
      'xcrun',
      [
        'simctl',
        'install',
        udid,
        join(appRoot, 'build/ios/Build/Products/Debug-iphonesimulator/App.app'),
      ],
      { timeout: 120_000 },
    );
    // A fresh simulator can report bootstatus=Finished while SpringBoard /
    // FrontBoard is still unable to start the first app. In the failed CPI-017
    // run, bootstatus spent 5 min migrating system data, install succeeded,
    // and the CPI process produced zero native logs for the full 180s gate.
    // Verify the *OS launch service* using Settings before attempting CPI.
    // This is not a retry of the game or a substitute for its native proof.
    console.log('Checking iOS system-app launch readiness before the first CPI cold start.');
    const controlLaunch = text(
      'xcrun',
      ['simctl', 'launch', udid, 'com.apple.Preferences'],
      { timeout: 120_000 },
    );
    save('ios-launchservice-control.txt', controlLaunch + '\n');
    assert.match(
      controlLaunch,
      /com\.apple\.Preferences:\s*[1-9]\d*/,
      'iOS launch service did not return a Settings process identifier',
    );
    recordLifecycleAction('ios-system-app-launch-confirmed');
    // Terminating the probe returns the simulator to its normal Home screen,
    // so the next launch is still CPI's genuine first native process.
    await delay(2000);
    text('xcrun', ['simctl', 'terminate', udid, 'com.apple.Preferences'], {
      timeout: 30_000,
    });
    recordLifecycleAction('ios-system-app-terminated');
    for (attempt = 1; attempt <= iosColdStarts; attempt += 1) {
      boundary = undefined;
      observationComplete = false;
      logOffset = appLog().length;
      recordLifecycleAction('cold-launch');
      child = detachedLog(
        'xcrun',
        [
          'simctl',
          'launch',
          '--console-pty',
          '--terminate-running-process',
          udid,
          buildInfo.appId,
          ...(profile === 'full' && attempt === 1 ? ['--cpi-prebridge-gate'] : []),
        ],
        'ios-app.log',
        true,
        attempt > 1,
      );
      if (profile === 'full' && attempt === 1) {
        await waitFor(
          'iOS native prebridge navigation gate',
          provisioningBudgetsMs.firstNativeProcess,
          () => {
            assertRunning(child, 'simctl attached launch');
            return readAnalysis().prebridgeGates.some((gate) => gate.stage === 'waiting');
          },
        );
        assert.equal(
          readAnalysis().diagnostics.length,
          0,
          'iOS page ran before the native interruption',
        );
        recordLifecycleAction('prebridge-background-via-settings');
        text('xcrun', ['simctl', 'launch', udid, 'com.apple.Preferences']);
        await waitFor('iOS real background before page creation', 30_000, () =>
          readAnalysis().prebridgeGates.some((gate) => gate.stage === 'paused'),
        );
        assert.equal(
          readAnalysis().diagnostics.length,
          0,
          'iOS prebridge background unexpectedly initialized a page',
        );
        recordLifecycleAction('prebridge-native-pause-observed');
        text('xcrun', ['simctl', 'launch', udid, buildInfo.appId]);
      }
      await waitFor('iOS React, page-load, and native bridge readiness', 120_000, () => {
        assertRunning(child, 'simctl attached launch');
        return hasStartupEvidence();
      });
      boundary = lifecycleBoundary(readAnalysis());
      // simctl exposes app launching, not a portable Home-button command. Opening
      // Settings and returning exercises actual iOS background/resume without edits.
      recordLifecycleAction('background-via-settings', { boundary });
      save(
        'ios-background-launch.txt',
        text('xcrun', ['simctl', 'launch', udid, 'com.apple.Preferences']),
      );
      await waitFor('iOS document pause after opening Settings', 30_000, () => {
        assertRunning(child, 'simctl attached launch');
        return readAnalysis().diagnostics.some(
          (event) =>
            event.sessionId === boundary.sessionId &&
            event.sequence > boundary.sequenceBeforeBackground &&
            event.event === 'pause',
        );
      });
      recordLifecycleAction('document-pause-observed');
      recordLifecycleAction('resume-existing-app');
      save('ios-resume.txt', text('xcrun', ['simctl', 'launch', udid, buildInfo.appId]));
      await waitFor('iOS bridge round-trip after app background/resume', 30_000, () => {
        assertRunning(child, 'simctl attached launch');
        return hasResumeEvidence(boundary);
      });
      assertRunning(child, 'simctl attached launch');
      const screenshot = join(evidenceRoot, 'ios-launch.png');
      text('xcrun', ['simctl', 'io', udid, 'screenshot', screenshot]);
      assertPng(screenshot);
      recordLifecycleAction('observation-complete');
      observationComplete = true;
      saveAttempt(boundary, true);
      recordLifecycleAction('terminate-for-process-webview-recreation');
      text('xcrun', ['simctl', 'terminate', udid, buildInfo.appId]);
      await stopLog(child);
      saveAttempt(boundary, true);
    }
    attempt = iosColdStarts;
    return {
      kind: 'iOS Simulator',
      name: device.name,
      simulatorName,
      freshDevice: true,
      udid,
      runtime,
      screenshot: 'ios-launch.png',
      coldStartAttempts: iosColdStarts,
      lifecycleAction:
        profile === 'full'
          ? 'Settings interruption before first JS page; two recreated WebViews; Settings/resume on both attempts'
          : 'One real cold start, native bridge and Settings/background/resume',
    };
  } catch (error) {
    run(
      'xcrun',
      ['simctl', 'io', udid, 'screenshot', join(evidenceRoot, 'ios-launch-failed.png')],
      { timeout: 10_000, allowFailure: true },
    );
    throw error;
  } finally {
    run('xcrun', ['simctl', 'terminate', udid, buildInfo.appId], {
      timeout: 10_000,
      allowFailure: true,
    });
    await stopLog(child);
    saveAttempt(boundary, observationComplete);
    saveDiagnostics();
    run('xcrun', ['simctl', 'shutdown', udid], { timeout: 30_000, allowFailure: true });
    run('xcrun', ['simctl', 'delete', udid], { timeout: 30_000, allowFailure: true });
  }
}

try {
  const device = platform === 'android' ? await android() : await ios();
  const diagnostics = assertHealthyLaunch();
  const report = {
    schemaVersion: 1,
    platform,
    profile,
    buildInfo,
    device,
    committedScreenMarkerObserved: true,
    screenshotCaptured: true,
    physicalDevice: false,
    startupNativeRoundTripObserved: true,
    resumedNativeRoundTripObserved: true,
    documentPauseResumeObserved: true,
    unexpectedJavaScriptOrRuntimeErrors: 0,
    confirmedExternalRuntimeErrorEntries: diagnostics.externalRuntimeErrors.length,
    scope:
      'Development launch, native bridge, and OS background/resume; no gameplay, ads, backend or store validation.',
  };
  save(`${platform}-launch-result.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  save(
    `${platform}-launch-failure.json`,
    `${JSON.stringify({ platform, profile, error: error.message }, null, 2)}\n`,
  );
  console.error(`Native launch smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  save(`${platform}-smoke-commands.json`, `${JSON.stringify(transcript, null, 2)}\n`);
}
