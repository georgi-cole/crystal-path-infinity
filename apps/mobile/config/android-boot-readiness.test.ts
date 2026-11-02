import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  androidAppAnrObserved,
  androidBroadcastsIdle,
  androidCpuInfoWithinBudget,
  androidToyboxTopCpu,
  androidHomeLaunchObserved,
  androidPressureWithinBudget,
  androidRenderPressure,
  androidUserBootPosted,
} from './android-boot-readiness';

const posted = '1793608779.956 636 675 I ActivityManager: Posting BOOT_COMPLETED user #0';
const prebootLog = [
  '1793608750.074 636 1338 I ActivityTaskManager: START u0 {cmp=com.georgicole.crystalpath.infinity.dev/.MainActivity}',
  '1793608758.837 636 676 I ActivityTaskManager: START u0 {act=android.intent.action.MAIN cat=[android.intent.category.HOME]}',
  '1793608765.116 636 2720 E ActivityManager: ANR in com.georgicole.crystalpath.infinity.dev',
].join('\n');

describe('CPI-011 strict Android first-boot readiness', () => {
  it('rejects sys.boot_completed, an earlier HOME, an ANR and wrong boot events', () => {
    const locked = posted.replace('BOOT_COMPLETED', 'LOCKED_BOOT_COMPLETED');
    const wrongUser = posted.replace('user #0', 'user #10');
    const wrongLevel = posted.replace('I ActivityManager', 'W ActivityManager');
    expect(androidUserBootPosted(prebootLog)).toBe(false);
    expect(androidUserBootPosted('sys.boot_completed=1')).toBe(false);
    expect(androidUserBootPosted(locked)).toBe(false);
    expect(androidUserBootPosted(wrongUser)).toBe(false);
    expect(androidUserBootPosted(wrongLevel)).toBe(false);
  });

  it('recognizes the actual user-0 event posted after the failed PR launch', () => {
    expect(androidUserBootPosted(prebootLog + '\n' + posted)).toBe(true);
    expect(androidUserBootPosted(posted + '\n' + prebootLog)).toBe(true);
  });

  it('requires the idle acknowledgment, not a command error or substring', () => {
    const successful = 'BroadcastQueue: checking...\nAll broadcast queues are idle!\n';
    expect(androidBroadcastsIdle(successful)).toBe(true);
    expect(androidBroadcastsIdle('Error: Unknown command: wait-for-broadcast-idle')).toBe(false);
    expect(androidBroadcastsIdle('Not yet: All broadcast queues are idle!')).toBe(false);
    expect(androidBroadcastsIdle('')).toBe(false);
  });

  it('checks boot before launch and retains strict native lifecycle assertions', () => {
    const script = readFileSync(new URL('../scripts/smoke-native.mjs', import.meta.url), 'utf8');
    const bootMarker = script.indexOf("await waitFor('Android user-0 BOOT_COMPLETED");
    const idleMarker = script.indexOf("'shell', 'am', 'wait-for-broadcast-idle'");
    const clearMarker = script.indexOf("adbArgs('logcat', '-c')");
    const firstLaunch = script.indexOf("recordLifecycleAction('cold-launch')");
    expect(bootMarker).toBeGreaterThan(0);
    expect(idleMarker).toBeGreaterThan(bootMarker);
    expect(clearMarker).toBeGreaterThan(idleMarker);
    expect(firstLaunch).toBeGreaterThan(clearMarker);
    expect(script).toContain("waitFor('Android native pause after Home', 30_000");
    expect(script).toContain("waitFor('Android bridge round-trip after real Home/resume', 30_000");
    expect(script).toContain('saveAttempt(boundary, true)');
  });
  it('recognizes actual Android HOME navigation only after the command boundary', () => {
    const home =
      '1793618489.737 635 658 I ActivityTaskManager: START u0 {act=android.intent.action.MAIN cat=[android.intent.category.HOME] flg=0x10000100 cmp=com.android.launcher3/.QuickstepLauncher}';
    const notHome =
      '1793618491.484 635 658 I ActivityTaskManager: START u0 {cmp=com.georgicole.crystalpath.infinity.dev/.MainActivity}';
    const log = [notHome, home, notHome].join('\n');
    expect(androidHomeLaunchObserved(log, 0)).toBe(true);
    expect(androidHomeLaunchObserved(log, 1)).toBe(true);
    expect(androidHomeLaunchObserved(log, 2)).toBe(false);
    expect(androidHomeLaunchObserved(notHome, 0)).toBe(false);
  });

  it('requires real Android pause after a lost Home key and never fakes events', () => {
    const script = readFileSync(new URL('../scripts/smoke-native.mjs', import.meta.url), 'utf8');
    expect(script).toContain("waitFor('Android Home key dispatch', 5_000");
    expect(script).toContain("recordLifecycleAction('home-key-not-dispatched-launcher-intent')");
    expect(script).toContain("'android.intent.category.HOME'");
    expect(script).toContain("waitFor('Android native pause after Home', 30_000");
    expect(script).toContain("waitFor('Android bridge round-trip after real Home/resume', 30_000");
  });

  it('parses Android kernel PSI accurately, rejecting invalid or absent observations', () => {
    const cpu =
      'some avg10=70.92 avg60=39.10 avg300=10.54 total=33920200\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0';
    const io =
      'some avg10=12.71 avg60=9.48 avg300=2.75 total=9076181\nfull avg10=0.32 avg60=1.43 avg300=0.53 total=1996763';
    expect(androidRenderPressure(cpu, io)).toEqual({
      cpuSomeAvg10: 70.92,
      ioSomeAvg10: 12.71,
    });
    expect(androidPressureWithinBudget(androidRenderPressure(cpu, io))).toBe(false);
    expect(
      androidPressureWithinBudget(
        androidRenderPressure(
          'some avg10=18.00 avg60=11.00 total=12',
          'some avg10=1.50 avg60=3.00 total=8',
        ),
      ),
    ).toBe(true);
    expect(androidRenderPressure('no PSI', io)).toBe(null);
    expect(androidRenderPressure(cpu, 'some avg10=unknown')).toBe(null);
    expect(androidPressureWithinBudget(null)).toBe(false);
    expect(androidRenderPressure('full avg10=0', io)).toBe(null);
  });

  it('samples fresh, normalized Android Toybox top load without root', () => {
    const high =
      'Tasks: 201 total, 3 running\n' +
      '400%cpu 340%user 0%nice 30%sys 20%idle 10%iow 0%irq 0%sirq 0%host';
    const quiet =
      'Tasks: 198 total, 1 running\n' +
      '400%cpu 22%user 0%nice 9%sys 368%idle 1%iow 0%irq 0%sirq 0%host';
    expect(androidToyboxTopCpu(high)).toEqual({
      totalCpuPercent: 92.5,
      ioWaitPercent: 2.5,
    });
    expect(androidCpuInfoWithinBudget(androidToyboxTopCpu(high))).toBe(false);
    expect(androidToyboxTopCpu(quiet)).toEqual({
      totalCpuPercent: 7.75,
      ioWaitPercent: 0.25,
    });
    expect(androidCpuInfoWithinBudget(androidToyboxTopCpu(quiet))).toBe(true);
    expect(androidToyboxTopCpu('85% TOTAL: 5.7% iowait')).toBe(null);
    expect(androidToyboxTopCpu('cat: /proc/pressure/cpu: Permission denied')).toBe(null);
    expect(androidToyboxTopCpu('400%cpu 399%idle')).toBe(null);
    expect(androidToyboxTopCpu('400%cpu 400%idle 20%iow')).toBe(null);
    expect(androidCpuInfoWithinBudget(null)).toBe(false);
    const script = readFileSync(new URL('../scripts/smoke-native.mjs', import.meta.url), 'utf8');
    expect(script).toContain("'top', '-b', '-n', '1', '-m', '1'");
    expect(script).not.toContain("adbArgs('shell', 'dumpsys', 'cpuinfo')");
  });

  it('flags an actual app ANR, not unrelated system messages or another app', () => {
    const appId = 'com.georgicole.crystalpath.infinity.dev';
    const report =
      '1793639689.646 621 2636 E ActivityManager: ANR in ' +
      appId +
      ' (' +
      appId +
      '/.MainActivity)';
    expect(androidAppAnrObserved(report, appId)).toBe(true);
    expect(androidAppAnrObserved('ANR in com.android.launcher3', appId)).toBe(false);
    expect(androidAppAnrObserved('W ActivityManager: ANR in ' + appId, appId)).toBe(false);
    expect(androidAppAnrObserved('', appId)).toBe(false);
  });

  it('gates ordinary HOME on stable graphics and retains strict native evidence', () => {
    const script = readFileSync(new URL('../scripts/smoke-native.mjs', import.meta.url), 'utf8');
    const ready = script.indexOf('waitForAndroidGraphicsSettling');
    const home = script.indexOf("recordLifecycleAction('home'");
    expect(ready).toBeGreaterThan(0);
    expect(home).toBeGreaterThan(ready);
    expect(script).toContain('androidAppAnrObserved(');
    expect(script).toContain('androidPressureWithinBudget(');
    expect(script).toContain("waitFor('Android native pause after Home', 30_000");
    expect(script).toContain("waitFor('Android bridge round-trip after real Home/resume', 30_000");
    expect(script).toContain('assert.equal(pid, initialPid');
  });

  it('pins a reduced graphics-work AOSP API 36 emulator with real lifecycle checks', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/mobile-app.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain("'hw.cpu.ncore': '4'");
    expect(workflow).toContain("'hw.ramSize': '3072M'");
    expect(workflow).toContain("'hw.lcd.width': '720'");
    expect(workflow).toContain("'hw.lcd.height': '1600'");
    expect(workflow).toContain('system-images;android-36;default;x86_64');
  });

  it('pins the lifecycle emulator to AOSP API 36, without Google setup workload', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/mobile-app.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('system-images;android-36;default;x86_64');
    expect(workflow).not.toContain('system-images;android-36;google_apis;x86_64');
    expect(workflow).toContain('system-images/android-36/default/x86_64/source.properties');
    expect(workflow).toContain('cpi003-development');
  });
});
