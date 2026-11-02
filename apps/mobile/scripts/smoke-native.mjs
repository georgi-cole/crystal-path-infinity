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
import { androidBroadcastsIdle, androidUserBootPosted } from '../config/android-boot-readiness.ts';
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
  args.length === 2 && args[0] === '--platform' && ['android', 'ios'].includes(args[1]),
  'Usage: node scripts/smoke-native.mjs --platform android|ios',
);
const platform = args[1];
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
  const prebridge = platform === 'android' ? attempt <= 2 : attempt === 1;
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
      '-gpu',
      'swiftshader',
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
    // The observed startup race was intermittent. Three cold process starts
    // reuse this one emulator and preserve every attempt rather than retrying green.
    for (attempt = 1; attempt <= 3; attempt += 1) {
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
          String(attempt <= 2),
        ),
      );
      save(`android-attempt-${attempt}-launch.txt`, launch);
      if (attempt === 1) save('android-launch.txt', launch);
      if (attempt <= 2) {
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
      const initialPid = text(adb, adbArgs('shell', 'pidof', buildInfo.appId));
      boundary = lifecycleBoundary(readAnalysis());
      recordLifecycleAction('home', { boundary });
      text(adb, adbArgs('shell', 'input', 'keyevent', 'KEYCODE_HOME'));
      await waitFor('Android native pause after Home', 30_000, () => {
        assertRunning(child, 'Android emulator');
        assertRunning(logcat, 'Android lifecycle log capture');
        return readAnalysis().nativeEvents.some(
          (event) => event.line > boundary.lineBeforeBackground && event.event === 'App paused',
        );
      });
      recordLifecycleAction('native-pause-observed');
      save(
        `android-attempt-${attempt}-background-activity.txt`,
        text(adb, adbArgs('shell', 'dumpsys', 'activity', 'activities')),
      );
      recordLifecycleAction('resume-existing-activity');
      save(
        `android-attempt-${attempt}-resume.txt`,
        text(adb, adbArgs('shell', 'am', 'start', '-W', '-n', `${buildInfo.appId}/.MainActivity`)),
      );
      await waitFor('Android bridge round-trip after real Home/resume', 30_000, () => {
        assertRunning(logcat, 'Android lifecycle log capture');
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
        coldStartAttempts: 3,
        lifecycleAction:
          'Home and lock before the first JS page; three recreated processes/WebViews; Home/resume after readiness on every attempt',
      };
    }
    attempt = 3;
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
    for (attempt = 1; attempt <= 2; attempt += 1) {
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
          ...(attempt === 1 ? ['--cpi-prebridge-gate'] : []),
        ],
        'ios-app.log',
        true,
        attempt > 1,
      );
      if (attempt === 1) {
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
    attempt = 2;
    return {
      kind: 'iOS Simulator',
      name: device.name,
      simulatorName,
      freshDevice: true,
      udid,
      runtime,
      screenshot: 'ios-launch.png',
      coldStartAttempts: 2,
      lifecycleAction:
        'Settings interruption before first page; two recreated processes/WebViews; Settings/resume after readiness on both attempts',
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
    `${JSON.stringify({ platform, error: error.message }, null, 2)}\n`,
  );
  console.error(`Native launch smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  save(`${platform}-smoke-commands.json`, `${JSON.stringify(transcript, null, 2)}\n`);
}
