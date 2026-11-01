#!/usr/bin/env node
// Launch-only evidence with official Android SDK / Xcode tools. No app service,
// ad SDK, production identity, signing credentials, or third-party runner action.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = join(appRoot, 'artifacts');
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === '--platform' && ['android', 'ios'].includes(args[1]), 'Usage: node scripts/smoke-native.mjs --platform android|ios');
const platform = args[1];
mkdirSync(evidenceRoot, { recursive: true });
// A failed repeat must never leave a previous invocation's success evidence.
for (const suffix of ['launch-result.json', 'launch-failure.json', 'launch.png', 'launch-failed.png']) {
  rmSync(join(evidenceRoot, `${platform}-${suffix}`), { force: true });
}
const buildInfo = JSON.parse(readFileSync(join(appRoot, 'dist/build-info.json'), 'utf8'));
assert.equal(buildInfo.environment, 'development', 'Launch smoke accepts only the development app');
assert.equal(buildInfo.appId, 'com.georgicole.crystalpath.infinity.dev');
const transcript = [];

function run(command, commandArgs, { timeout = 60_000, allowFailure = false, binary = false } = {}) {
  transcript.push({ command, args: commandArgs });
  const result = spawnSync(command, commandArgs, { cwd: appRoot, encoding: binary ? undefined : 'utf8',
    timeout, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 });
  if (!allowFailure) {
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${command} ${commandArgs.join(' ')} failed: ${String(result.stderr).slice(-4000)}`);
  }
  return result;
}
function text(command, commandArgs, options) { return String(run(command, commandArgs, options).stdout ?? '').trim(); }
function save(name, contents) { writeFileSync(join(evidenceRoot, name), contents); }
function detachedLog(command, commandArgs, file) {
  transcript.push({ command, args: commandArgs });
  const fd = openSync(join(evidenceRoot, file), 'w');
  const child = spawn(command, commandArgs, { cwd: appRoot, stdio: ['ignore', fd, fd],
    env: { ...process.env, SIMCTL_CHILD_NSUnbufferedIO: 'YES' } });
  closeSync(fd);
  child.on('error', error => { child.smokeError = error; });
  return child;
}
function assertRunning(child, description) {
  if (child.smokeError) throw child.smokeError;
  assert.equal(child.exitCode, null, `${description} exited before launch proof was collected`);
  assert.equal(child.signalCode, null, `${description} was terminated before launch proof was collected`);
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
function hasReadyMarker(log) {
  for (const line of log.split('\n')) {
    const marker = line.indexOf('CPI_APP_READY ');
    if (marker < 0) continue;
    try {
      const value = JSON.parse(line.slice(marker + 'CPI_APP_READY '.length).trim());
      assert.deepEqual(value, buildInfo);
      return true;
    } catch { /* A partial/unrelated line cannot count as a ready screen. */ }
  }
  return false;
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
  const child = detachedLog(emulator, ['-avd', avd, '-port', '5554', '-no-window', '-no-audio',
    '-no-boot-anim', '-no-snapshot', '-wipe-data', '-gpu', 'swiftshader', '-accel', 'on', '-camera-back', 'none', '-camera-front', 'none'], 'android-emulator.log');
  try {
    await waitFor('Android boot', 360_000, () => {
      assertRunning(child, 'Android emulator');
      return text(adb, adbArgs('shell', 'getprop', 'sys.boot_completed'), { timeout: 10_000, allowFailure: true }) === '1';
    });
    text(adb, adbArgs('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'));
    text(adb, adbArgs('shell', 'wm', 'dismiss-keyguard'));
    for (const setting of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
      text(adb, adbArgs('shell', 'settings', 'put', 'global', setting, '0'));
    }
    text(adb, adbArgs('install', '-r', join(appRoot, 'android/app/build/outputs/apk/debug/app-debug.apk')), { timeout: 120_000 });
    text(adb, adbArgs('logcat', '-c'));
    save('android-launch.txt', text(adb, adbArgs('shell', 'am', 'start', '-W', '-n', `${buildInfo.appId}/.MainActivity`)));
    await waitFor('Android React ready marker', 90_000, () => {
      assertRunning(child, 'Android emulator');
      const logs = text(adb, adbArgs('logcat', '-d', '-v', 'brief', '-s', 'Capacitor/Console:D', 'Capacitor:E', 'AndroidRuntime:E', 'chromium:E'));
      save('android-app.log', logs);
      return hasReadyMarker(logs);
    });
    await delay(1000); // Capture a presented frame after the committed-screen marker.
    const pid = text(adb, adbArgs('shell', 'pidof', buildInfo.appId));
    assert.match(pid, /^\d+(?:\s+\d+)*$/, 'App process is not running');
    save('android-activity.txt', text(adb, adbArgs('shell', 'dumpsys', 'activity', 'activities')));
    const dump = run(adb, adbArgs('shell', 'uiautomator', 'dump', '/sdcard/cpi003-window.xml'), { timeout: 30_000, allowFailure: true });
    if (dump.status === 0) save('android-window.xml', text(adb, adbArgs('shell', 'cat', '/sdcard/cpi003-window.xml')));
    const screenshot = join(evidenceRoot, 'android-launch.png');
    save('android-launch.png', run(adb, adbArgs('exec-out', 'screencap', '-p'), { binary: true }).stdout);
    assertPng(screenshot);
    return { kind: 'Android emulator', serial, avd, api: text(adb, adbArgs('shell', 'getprop', 'ro.build.version.sdk')),
      androidVersion: text(adb, adbArgs('shell', 'getprop', 'ro.build.version.release')), pid, screenshot: 'android-launch.png' };
  } catch (error) {
    const screenshot = run(adb, adbArgs('exec-out', 'screencap', '-p'), { timeout: 10_000, binary: true, allowFailure: true });
    if (screenshot.status === 0 && screenshot.stdout?.length) save('android-launch-failed.png', screenshot.stdout);
    throw error;
  } finally {
    save('android-runtime-errors.log', text(adb, adbArgs('logcat', '-d', '-v', 'brief', '-s', 'AndroidRuntime:E'), { timeout: 10_000, allowFailure: true }));
    run(adb, adbArgs('emu', 'kill'), { timeout: 10_000, allowFailure: true });
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

async function ios() {
  const available = JSON.parse(text('xcrun', ['simctl', 'list', '--json', 'devices', 'available']));
  save('ios-simulators.json', JSON.stringify(available, null, 2));
  save('ios-runtimes.json', text('xcrun', ['simctl', 'list', '--json', 'runtimes']));
  const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';
  const devices = available.devices[runtime] ?? [];
  const device = devices.find(item => item.name === 'iPhone 17' && item.isAvailable)
    ?? devices.find(item => item.name.startsWith('iPhone') && item.isAvailable);
  assert.ok(device, 'The Xcode 26.6 smoke requires an installed iPhone / iOS 26.5 simulator');
  assert.ok(device.deviceTypeIdentifier, 'Simulator device type is missing');
  // Own a fresh device so the check neither depends on nor changes a precreated
  // runner/personal simulator's saved state. Only this UDID is cleaned up.
  const simulatorName = `CPI003-${Date.now()}`;
  const udid = text('xcrun', ['simctl', 'create', simulatorName, device.deviceTypeIdentifier, runtime]);
  assert.match(udid, /^[0-9A-F-]{36}$/i, 'simctl did not return a simulator UUID');
  let child;
  save('ios-simctl-launch-help.txt', text('xcrun', ['simctl', 'help', 'launch']));
  save('ios-smoke-device.json', JSON.stringify({ name: simulatorName, deviceType: device.deviceTypeIdentifier, udid, runtime }, null, 2));
  try {
    console.log(`Booting fresh ${device.name} / iOS 26.5 simulator; progress is recorded in ios-boot.log`);
    await runLogged('xcrun', ['simctl', 'bootstatus', udid, '-b'], 'ios-boot.log', 360_000);
    text('xcrun', ['simctl', 'install', udid, join(appRoot, 'build/ios/Build/Products/Debug-iphonesimulator/App.app')], { timeout: 120_000 });
    child = detachedLog('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', udid, buildInfo.appId], 'ios-app.log');
    await waitFor('iOS React ready marker', 120_000, () => {
      assertRunning(child, 'simctl attached launch');
      const path = join(evidenceRoot, 'ios-app.log');
      assert.ok(!existsSync(path) || statSync(path).size < 10 * 1024 * 1024, 'Simulator launch log exceeded its budget');
      return existsSync(path) && hasReadyMarker(readFileSync(path, 'utf8').replace(/\u001b\[[0-9;]*m/g, ''));
    });
    await delay(1000);
    assertRunning(child, 'simctl attached launch');
    const screenshot = join(evidenceRoot, 'ios-launch.png');
    text('xcrun', ['simctl', 'io', udid, 'screenshot', screenshot]);
    assertPng(screenshot);
    return { kind: 'iOS Simulator', name: device.name, simulatorName, freshDevice: true, udid, runtime, screenshot: 'ios-launch.png' };
  } catch (error) {
    run('xcrun', ['simctl', 'io', udid, 'screenshot', join(evidenceRoot, 'ios-launch-failed.png')], { timeout: 10_000, allowFailure: true });
    throw error;
  } finally {
    run('xcrun', ['simctl', 'terminate', udid, buildInfo.appId], { timeout: 10_000, allowFailure: true });
    if (child?.exitCode === null) child.kill('SIGKILL');
    run('xcrun', ['simctl', 'shutdown', udid], { timeout: 30_000, allowFailure: true });
    run('xcrun', ['simctl', 'delete', udid], { timeout: 30_000, allowFailure: true });
  }
}

try {
  const device = platform === 'android' ? await android() : await ios();
  const report = { schemaVersion: 1, platform, buildInfo, device, committedScreenMarkerObserved: true,
    screenshotCaptured: true, physicalDevice: false, scope: 'Minimal app launch only; no gameplay, ads, backend or store validation.' };
  save(`${platform}-launch-result.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  save(`${platform}-launch-failure.json`, `${JSON.stringify({ platform, error: error.message }, null, 2)}\n`);
  console.error(`Native launch smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  save(`${platform}-smoke-commands.json`, `${JSON.stringify(transcript, null, 2)}\n`);
}
