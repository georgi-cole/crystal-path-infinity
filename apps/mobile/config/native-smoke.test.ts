import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getBuildInfo } from './environments';
import {
  analyzeNativeLog,
  lifecycleBoundary,
  nativeLaunchProblems,
  nativeLifecycleProblems,
} from './native-smoke';
import { diagnosticPrefix } from './startup-diagnostic-contract';
import type { DiagnosticEvent, StartupDiagnostic } from './startup-diagnostic-contract';

const build = getBuildInfo('development', '0.1.0');
const android = (message: string, level = 'I') =>
  `1793555763.737000 2070 2070 ${level} Capacitor/Console: File: https://localhost/ - Line 1 - Msg: ${message}`;
const ios = (message: string, level = 'info') =>
  `2026-11-01T17:56:03.737Z ⚡️  [${level}] - ${message}`;

function clockEvidence() {
  const native = (stage: string) =>
    `1793555763.000000 2070 2070 I Capacitor: CPI_NATIVE_GATE ${JSON.stringify({ stage, gateId: 'native-gate' })}`;
  const snapshot = (
    sequence: number,
    isActive: boolean,
    nativeTimeMs: number,
    foregroundTimeMs: number,
  ) => ({
    pageId: 'page-one',
    bridgeId: 'bridge-one',
    sequence,
    isActive,
    nativeTimeMs,
    foregroundTimeMs,
  });
  return [
    native('waiting'),
    native('paused'),
    native('released'),
    android(diagnostic(1, 'page-start')),
    android(
      diagnostic(2, 'bridge-ready', { reason: 'startup', lifecycle: snapshot(1, true, 100, 10) }),
    ),
    android(diagnostic(3, 'native-state', { lifecycle: snapshot(2, false, 200, 110) })),
    android(diagnostic(4, 'pause')),
    android(diagnostic(5, 'native-state', { lifecycle: snapshot(3, true, 60_200, 110) })),
    android(diagnostic(6, 'resume')),
    android(
      diagnostic(7, 'bridge-ready', {
        reason: 'resume',
        lifecycle: snapshot(4, true, 60_210, 120),
      }),
    ),
  ].join('\n');
}

describe('native foreground and prebridge evidence', () => {
  it('accepts real boundary evidence with a frozen native foreground accumulator', () => {
    expect(nativeLifecycleProblems(analyzeNativeLog(clockEvidence(), build), true)).toEqual([]);
  });
  it('accepts a new pre-page gate after the previous native Activity is destroyed', () => {
    const stamp = (stage: string, gateId: string) =>
      `1793555763.000000 2070 2070 I Capacitor: CPI_NATIVE_GATE ${JSON.stringify({ stage, gateId })}`;
    const oldSequence = [
      stamp('waiting', 'native-gate'),
      stamp('paused', 'native-gate'),
      stamp('released', 'native-gate'),
    ].join('\n');
    const nextSequence = [
      stamp('waiting', 'old-gate'),
      stamp('paused', 'old-gate'),
      '1793555763.000000 2070 2070 D Capacitor: App destroyed',
      stamp('waiting', 'live-gate'),
      stamp('paused', 'live-gate'),
      stamp('released', 'live-gate'),
    ].join('\n');
    const log = clockEvidence().replace(oldSequence, nextSequence);
    expect(nativeLifecycleProblems(analyzeNativeLog(log, build), true)).toEqual([]);
    expect(
      nativeLifecycleProblems(
        analyzeNativeLog(log.replace('App destroyed', 'App stopped'), build),
        true,
      ),
    ).toContain('Previous prebridge Activity was not destroyed before bridge replacement');
    expect(
      nativeLifecycleProblems(
        analyzeNativeLog(log.replace(stamp('paused', 'old-gate'), ''), build),
        true,
      ),
    ).toContain('Previous prebridge Activity was not destroyed before bridge replacement');
    const staleRelease = log.replace(
      stamp('released', 'live-gate'),
      stamp('released', 'old-gate') + '\n' + stamp('released', 'live-gate'),
    );
    expect(nativeLifecycleProblems(analyzeNativeLog(staleRelease, build), true)).toContain(
      'A destroyed prebridge gate released into a replacement page',
    );
  });
  it('rejects missing or reordered prebridge boundaries', () => {
    const log = clockEvidence().replace('"stage":"paused"', '"stage":"released"');
    expect(nativeLifecycleProblems(analyzeNativeLog(log, build), true)).toContain(
      'Missing ordered native interruption before first page/bridge',
    );
  });
  it('rejects pre-page pause/resume replay into a new page', () => {
    const log = clockEvidence().replace(
      android(diagnostic(1, 'page-start')),
      android(diagnostic(1, 'page-start')) + '\n' + android(diagnostic(1, 'resume')),
    );
    expect(nativeLifecycleProblems(analyzeNativeLog(log, build), true)).toContain(
      'Pre-page pause/resume was replayed into the new page',
    );
  });
  it('rejects wrong page identity and a replaced native bridge', () => {
    const log = clockEvidence()
      .replace('"pageId":"page-one"', '"pageId":"old-page"')
      .replace('"bridgeId":"bridge-one"', '"bridgeId":"old-bridge"');
    const problems = nativeLifecycleProblems(analyzeNativeLog(log, build), true);
    expect(problems).toContain('Invalid native page/bridge/clock snapshot');
    expect(problems).toContain('Native bridge identity changed within one page');
  });
  it('rejects offscreen accrual and regressed native values', () => {
    const log = clockEvidence().replace(
      '"nativeTimeMs":60200,"foregroundTimeMs":110',
      '"nativeTimeMs":60200,"foregroundTimeMs":60110',
    );
    const problems = nativeLifecycleProblems(analyzeNativeLog(log, build), true);
    expect(problems).toContain('Native foreground clock included the background interval');
    expect(problems).toContain('Native sequence or monotonic clock regressed');
  });
});
function diagnostic(
  sequence: number,
  event: DiagnosticEvent,
  details?: StartupDiagnostic['details'],
) {
  return (
    diagnosticPrefix +
    JSON.stringify({
      schemaVersion: 1,
      buildInfo: build,
      sessionId: 'page-one',
      sequence,
      event,
      timestamp: '2026-11-01T17:56:03.737Z',
      performanceMs: sequence,
      visibilityState: 'visible',
      readyState: 'complete',
      hasTriggerEvent: true,
      details,
    })
  );
}
function healthy(platform: 'android' | 'ios' = 'android') {
  const message = platform === 'android' ? android : ios;
  const before =
    [
      message(diagnostic(1, 'page-start')),
      message(diagnostic(2, 'dom-ready')),
      message(diagnostic(3, 'page-load')),
      message('CPI_APP_READY ' + JSON.stringify(build)),
      message(diagnostic(4, 'react-ready')),
      message(diagnostic(5, 'bridge-check-start', { reason: 'startup' })),
      message(
        diagnostic(6, 'bridge-ready', {
          reason: 'startup',
          durationMs: 8,
          lifecycle: {
            pageId: 'page-one',
            bridgeId: 'bridge-one',
            sequence: 1,
            isActive: true,
            nativeTimeMs: 100,
            foregroundTimeMs: 100,
          },
        }),
      ),
    ].join('\n') + '\n';
  const boundary = lifecycleBoundary(analyzeNativeLog(before, build));
  const after =
    [
      '1793555764.000000 2070 2070 D Capacitor: App paused',
      message(
        diagnostic(7, 'native-state', {
          lifecycle: {
            pageId: 'page-one',
            bridgeId: 'bridge-one',
            sequence: 2,
            isActive: false,
            nativeTimeMs: 200,
            foregroundTimeMs: 100,
          },
        }),
      ),
      '1793555766.000000 2070 2070 D Capacitor: App resumed',
      message(
        diagnostic(8, 'native-state', {
          lifecycle: {
            pageId: 'page-one',
            bridgeId: 'bridge-one',
            sequence: 3,
            isActive: true,
            nativeTimeMs: 60_200,
            foregroundTimeMs: 100,
          },
        }),
      ),
      message(diagnostic(9, 'bridge-check-start', { reason: 'resume' })),
      message(
        diagnostic(10, 'bridge-ready', {
          reason: 'resume',
          durationMs: 9,
          lifecycle: {
            pageId: 'page-one',
            bridgeId: 'bridge-one',
            sequence: 4,
            isActive: true,
            nativeTimeMs: 60_210,
            foregroundTimeMs: 110,
          },
        }),
      ),
    ].join('\n') + '\n';
  return { before, after, log: before + after, boundary };
}

describe('native launch evidence gates', () => {
  it.each(['android', 'ios'] as const)(
    'accepts complete %s startup and a scoped lifecycle sequence',
    (platform) => {
      const fixture = healthy(platform);
      expect(
        nativeLaunchProblems(analyzeNativeLog(fixture.log, build), platform, fixture.boundary),
      ).toEqual([]);
    },
  );
  it('rejects the exact CPI-003 triggerEvent exception even with later readiness', () => {
    const fixture = healthy();
    const observed =
      "E/Capacitor/Console( 2070): File: https://localhost/ - Line 1 - Msg: Uncaught TypeError: Cannot read properties of undefined (reading 'triggerEvent')\n";
    const analysis = analyzeNativeLog(observed + fixture.log, build);
    expect(analysis.readyMarkerLines).toHaveLength(1);
    expect(
      nativeLaunchProblems(analysis, 'android', fixture.boundary).some((problem) =>
        problem.includes("reading 'triggerEvent'"),
      ),
    ).toBe(true);
  });
  it('rejects exceptions after both ready and resume', () => {
    const fixture = healthy();
    const analysis = analyzeNativeLog(
      fixture.log + android('Uncaught TypeError: late callback failed', 'E'),
      build,
    );
    expect(
      nativeLaunchProblems(analysis, 'android', fixture.boundary).some((problem) =>
        problem.includes('late callback failed'),
      ),
    ).toBe(true);
  });
  it('does not accept a ready-looking substring inside an error', () => {
    const analysis = analyzeNativeLog(
      android('Failure mentions CPI_APP_READY ' + JSON.stringify(build), 'E'),
      build,
    );
    expect(analysis.readyMarkerLines).toEqual([]);
    expect(analysis.errors).toHaveLength(1);
  });
  it('rejects malformed and wrong-environment markers', () => {
    for (const payload of ['{', JSON.stringify(getBuildInfo('staging', '0.1.0'))]) {
      const analysis = analyzeNativeLog(android('CPI_APP_READY ' + payload), build);
      expect(analysis.readyMarkerLines).toEqual([]);
      expect(analysis.errors[0]?.kind).toBe('ready-marker');
    }
  });
  it('requires a native round-trip instead of only React render', () => {
    const analysis = analyzeNativeLog(android('CPI_APP_READY ' + JSON.stringify(build)), build);
    expect(() => lifecycleBoundary(analysis)).toThrow('round-trip');
  });
  it('does not reuse lifecycle observations before the controlled action', () => {
    const fixture = healthy();
    const analysis = analyzeNativeLog(fixture.log, build);
    expect(nativeLaunchProblems(analysis, 'android', lifecycleBoundary(analysis))).toContain(
      'No native inactive boundary after the background action',
    );
  });
  it('rejects a replacement page session as resuming the same page', () => {
    const fixture = healthy();
    const log = fixture.before + fixture.after.replaceAll('page-one', 'page-two');
    expect(
      nativeLaunchProblems(analyzeNativeLog(log, build), 'android', fixture.boundary),
    ).toContain('No native active boundary after resume');
  });
  it.each(['android', 'ios'] as const)(
    'rejects a %s page reload after a successful resume',
    (platform) => {
      const fixture = healthy(platform);
      const message = platform === 'android' ? android : ios;
      const reloadedPage = message(diagnostic(1, 'page-start').replace('page-one', 'page-two'));
      expect(
        nativeLaunchProblems(
          analyzeNativeLog(fixture.log + reloadedPage + '\n', build),
          platform,
          fixture.boundary,
        ),
      ).toContain('Multiple page sessions observed within one cold-start attempt');
    },
  );
  it('requires native Android pause/resume observations too', () => {
    const fixture = healthy();
    const log = fixture.log
      .split('\n')
      .filter((line) => !line.includes('D Capacitor:'))
      .join('\n');
    expect(
      nativeLaunchProblems(analyzeNativeLog(log, build), 'android', fixture.boundary),
    ).toContain('Missing ordered Android native pause/resume observations');
  });
  it('recognizes iOS console errors and JS evaluation failures', () => {
    const analysis = analyzeNativeLog(
      ios('Unhandled rejection', 'error') + '\n⚡️  JS Eval error JavaScript exception',
      build,
    );
    expect(analysis.errors).toHaveLength(2);
  });
  it('retains engine diagnostics separately and fails native crashes', () => {
    const analysis = analyzeNativeLog(
      'E/chromium( 2070): Failed to write a new fake index.\n1793555763.737000 2070 2070 E AndroidRuntime: FATAL EXCEPTION: main',
      build,
    );
    expect(analysis.engineMessages).toHaveLength(1);
    expect(analysis.errors[0]?.kind).toBe('android-runtime');
  });
  it('rejects malformed diagnostic records', () => {
    const analysis = analyzeNativeLog(
      android(diagnosticPrefix + '{"event":"bridge-ready"}'),
      build,
    );
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.errors[0]?.kind).toBe('diagnostic-protocol');
  });
});

const runtime = (pid: number, message: string, timestamp = '1793557721.997') =>
  `         ${timestamp}  ${pid}  3210 E AndroidRuntime: ${message}`;
const crash = (pid: number, processName: string) => [
  runtime(pid, 'FATAL EXCEPTION: main'),
  runtime(pid, `Process: ${processName}, PID: ${pid}`),
  runtime(pid, 'java.lang.IllegalStateException: Uncaught failure in a background worker'),
];
const started = (pid: number, processName: string, componentOwner = processName) =>
  `1793557720.000 646 687 I ActivityManager: Start proc ${pid}:${processName}/u0a123 for service {${componentOwner}/.Service}`;

describe('Android runtime process attribution', () => {
  it('retains a confirmed foreign crash separately without a package allowlist', () => {
    const lines = crash(1365, 'com.example.external:worker');
    const analysis = analyzeNativeLog(lines.join('\n'), build);
    expect(analysis.errors).toEqual([]);
    expect(analysis.externalRuntimeErrors).toHaveLength(3);
    expect(analysis.externalRuntimeErrors.map((error) => error.message)).toEqual(lines);
    expect(
      analysis.externalRuntimeErrors.every(
        (error) => error.pid === 1365 && error.processName === 'com.example.external:worker',
      ),
    ).toBe(true);
  });

  it.each([build.appId, `${build.appId}:worker`])('fails a crash of %s', (name) => {
    const analysis = analyzeNativeLog(crash(2070, name).join('\n'), build);
    expect(analysis.errors).toHaveLength(3);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('does not mistake a longer package prefix for an app child process', () => {
    const analysis = analyzeNativeLog(crash(1365, `${build.appId}.unrelated`).join('\n'), build);
    expect(analysis.errors).toEqual([]);
    expect(analysis.externalRuntimeErrors).toHaveLength(3);
  });

  it.each([
    ['missing declaration', runtime(1365, 'FATAL EXCEPTION: main')],
    ['missing crash header', runtime(1365, 'Process: com.example.external, PID: 1365')],
    [
      'malformed declaration',
      [
        runtime(1365, 'FATAL EXCEPTION: main'),
        runtime(1365, 'Process: com.example.external PID=1365'),
      ].join('\n'),
    ],
    [
      'mismatched declaration PID',
      [
        runtime(1365, 'FATAL EXCEPTION: main'),
        runtime(1365, 'Process: com.example.external, PID: 2070'),
      ].join('\n'),
    ],
    ['malformed log PID', '1793557721.997 unknown 3210 E AndroidRuntime: FATAL EXCEPTION: main'],
  ])('fails closed for %s', (_label, log) => {
    const analysis = analyzeNativeLog(log, build);
    expect(analysis.errors.length).toBeGreaterThan(0);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('keeps interleaved process crashes and an undeclared PID separate', () => {
    const foreign = crash(1365, 'com.example.external');
    const app = crash(2070, build.appId);
    const log = [
      foreign[0],
      app[0],
      foreign[1],
      app[1],
      foreign[2],
      app[2],
      runtime(9000, 'FATAL EXCEPTION: unknown'),
    ].join('\n');
    const analysis = analyzeNativeLog(log, build);
    expect(analysis.externalRuntimeErrors.map((error) => error.pid)).toEqual([1365, 1365, 1365]);
    expect(analysis.errors).toHaveLength(4);
  });

  it('rejects conflicting process names for one PID', () => {
    const log = [
      ...crash(1365, 'com.example.external'),
      runtime(1365, 'Process: com.example.other, PID: 1365'),
    ].join('\n');
    const analysis = analyzeNativeLog(log, build);
    expect(analysis.errors).toHaveLength(4);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('does not borrow an old foreign declaration for a later crash of the same PID', () => {
    const log = [
      ...crash(1365, 'com.example.external'),
      runtime(1365, 'FATAL EXCEPTION: later', '1793557799.001'),
    ].join('\n');
    const analysis = analyzeNativeLog(log, build);
    expect(analysis.errors).toHaveLength(4);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('treats PID reuse as ambiguous even when the reported process name is unchanged', () => {
    const processStart = started(1365, 'com.example.external');
    const log = [
      processStart,
      ...crash(1365, 'com.example.external'),
      processStart.replace('1793557720.000', '1793557799.001'),
    ].join('\n');
    const analysis = analyzeNativeLog(log, build);
    expect(analysis.errors).toHaveLength(3);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it.each([
    'com.google.android.webview:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0',
    'com.android.chrome:sandboxed_process0',
    'com.example.host:renderer',
  ])('keeps renderer ownership unknown for %s without owner evidence', (name) => {
    const analysis = analyzeNativeLog(crash(2395, name).join('\n'), build);
    expect(analysis.errors).toHaveLength(3);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('does not borrow a dead process identity for a later same-PID runtime exception', () => {
    const before = crash(1365, 'com.example.external');
    const death =
      '1793557723.681 646 754 I ActivityManager: Process com.example.external (pid 1365) has died: fg BTOP';
    const later = runtime(
      1365,
      'java.lang.IllegalStateException: unknown actor after death',
      '1793557730.000',
    );
    const full = [...before, death, later].join('\n');
    const analysis = analyzeNativeLog(full, build);
    expect(analysis.errors.map((error) => error.message)).toEqual([later]);
    expect(analysis.externalRuntimeErrors.map((error) => error.message)).toEqual(before);
    const scoped = analyzeNativeLog(later, build, { attributionLog: full });
    expect(scoped.errors).toHaveLength(1);
    expect(scoped.externalRuntimeErrors).toEqual([]);
  });

  it('preserves a confirmed earlier crash after ordinary death without replaying scoped lines', () => {
    const before = crash(1365, 'com.example.external').join('\n');
    const full =
      before +
      '\n1793557723.681 646 754 I ActivityManager: Process com.example.external (pid 1365) has died: fg BTOP\n';
    for (const log of [full, before]) {
      const analysis = analyzeNativeLog(log, build, { attributionLog: full });
      expect(analysis.errors).toEqual([]);
      expect(analysis.externalRuntimeErrors).toHaveLength(3);
    }
  });

  it.each([
    ['app process start', started(1365, build.appId)],
    ['app-owned renderer', started(1365, 'com.android.webview:sandboxed_process0', build.appId)],
    [
      'matching app ready marker',
      android('CPI_APP_READY ' + JSON.stringify(build)).replaceAll('2070', '1365'),
    ],
    ['app diagnostic', android(diagnostic(1, 'page-start')).replaceAll('2070', '1365')],
  ])('never excludes an app-associated PID identified by %s', (_label, evidence) => {
    const analysis = analyzeNativeLog(
      [...crash(1365, 'com.example.external'), evidence].join('\n'),
      build,
    );
    expect(analysis.errors).toHaveLength(3);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('uses complete capture evidence for partial attempts and later PID conflicts', () => {
    const lines = crash(1365, 'com.example.external');
    const scope = lines[2];
    const full = lines.join('\n');
    expect(analyzeNativeLog(scope, build).errors).toHaveLength(1);
    const confirmed = analyzeNativeLog(scope, build, { attributionLog: full });
    expect(confirmed.errors).toEqual([]);
    expect(confirmed.externalRuntimeErrors).toHaveLength(1);
    const reused = analyzeNativeLog(scope, build, {
      attributionLog: full + '\n' + started(1365, build.appId),
    });
    expect(reused.errors).toHaveLength(1);
    expect(reused.externalRuntimeErrors).toEqual([]);
  });

  it('does not let an incomplete context override app claims in the scoped log', () => {
    const analysis = analyzeNativeLog(crash(1365, build.appId).join('\n'), build, {
      attributionLog: crash(1365, 'com.example.external').join('\n'),
    });
    expect(analysis.errors).toHaveLength(3);
    expect(analysis.externalRuntimeErrors).toEqual([]);
  });

  it('keeps JavaScript and Capacitor errors blocking even on a confirmed foreign PID', () => {
    const log = [
      ...crash(1365, 'com.example.external'),
      android(
        "Uncaught TypeError: Cannot read properties of undefined (reading 'triggerEvent')",
        'E',
      ).replaceAll('2070', '1365'),
      '1793557722.000 1365 1365 E Capacitor/Plugin: native callback failed',
    ].join('\n');
    const analysis = analyzeNativeLog(log, build);
    expect(analysis.errors.map((error) => error.kind)).toEqual([
      'javascript-console',
      'capacitor-error',
    ]);
    expect(analysis.externalRuntimeErrors).toHaveLength(3);
  });

  it('supports PID attribution for retained brief-format Android logs', () => {
    const lines = crash(1365, 'com.example.external').map((line) =>
      line.replace(/^.* E AndroidRuntime:/, 'E/AndroidRuntime( 1365):'),
    );
    const analysis = analyzeNativeLog(lines.join('\n'), build);
    expect(analysis.errors).toEqual([]);
    expect(analysis.externalRuntimeErrors).toHaveLength(3);
  });
});

describe('iOS cold-start launch-service preflight', () => {
  it('checks simulator system-app readiness without skipping any native lifecycle gates', () => {
    const source = readFileSync(new URL('../scripts/smoke-native.mjs', import.meta.url), 'utf8');
    const iosHarness = source.slice(source.indexOf('async function ios()'));
    const systemProbe = iosHarness.indexOf("['simctl', 'launch', udid, 'com.apple.Preferences']");
    const systemTerminate = iosHarness.indexOf(
      "['simctl', 'terminate', udid, 'com.apple.Preferences']",
    );
    const firstGameAttempt = iosHarness.indexOf(
      'for (attempt = 1; attempt <= iosColdStarts; attempt += 1)',
    );
    const actualLaunch = iosHarness.indexOf("'--console-pty'");
    const provisioning = iosHarness.indexOf('await prepareIosSimulator(');
    const install = iosHarness.indexOf("'install',");

    expect(provisioning).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(systemTerminate);
    expect(firstGameAttempt).toBeGreaterThan(install);
    expect(systemProbe).toBeGreaterThan(0);
    expect(systemTerminate).toBeGreaterThan(systemProbe);
    expect(firstGameAttempt).toBeGreaterThan(systemTerminate);
    expect(actualLaunch).toBeGreaterThan(firstGameAttempt);
    expect(iosHarness).toContain("'iOS native prebridge navigation gate'");
    expect(iosHarness).toContain("'iOS React, page-load, and native bridge readiness'");
    expect(iosHarness).toContain("'iOS bridge round-trip after native app resume'");
    expect(iosHarness).toContain('openSettingsUntilNativePause');
    expect(iosHarness).toContain('assertHealthyLaunch()');
  });
});
