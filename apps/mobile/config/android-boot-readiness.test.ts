import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { androidBroadcastsIdle, androidUserBootPosted } from './android-boot-readiness';

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
