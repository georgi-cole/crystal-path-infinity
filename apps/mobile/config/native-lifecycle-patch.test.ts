import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchAndroidLifecycle } from './native-lifecycle-patch';

const require = createRequire(import.meta.url);
const source = readFileSync(
  join(
    dirname(require.resolve('@capacitor/android/package.json')),
    'capacitor/src/main/java/com/getcapacitor/cordova/MockCordovaWebViewImpl.java',
  ),
  'utf8',
);

describe('pinned Android lifecycle patch', () => {
  it('patches exactly the installed source and retains native plugin lifecycle behavior', () => {
    const result = patchAndroidLifecycle(source);
    expect(result).toContain('pluginManager.onPause(keepRunning)');
    expect(result).toContain('pluginManager.onResume(keepRunning)');
    expect(result).toContain('if (owner == null)');
    expect(result).toContain(
      'if (!owner.equals(com.getcapacitor.CpiLifecycleGate.getPage(webView))) return;',
    );
    expect(result).toContain('window.__CPI_NATIVE_PAGE_ID__ ===');
    expect(result).not.toContain('catch (');
  });
  it('requires an explicit re-audit for an upstream change or a double patch', () => {
    expect(() => patchAndroidLifecycle(source + '\n')).toThrow('lifecycle source changed');
    expect(() => patchAndroidLifecycle(patchAndroidLifecycle(source))).toThrow(
      'lifecycle source changed',
    );
  });
});
