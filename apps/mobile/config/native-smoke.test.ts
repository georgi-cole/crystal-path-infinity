import { describe, expect, it } from 'vitest';
import { getBuildInfo } from './environments';
import { analyzeNativeLog, lifecycleBoundary, nativeLaunchProblems } from './native-smoke';
import { diagnosticPrefix } from './startup-diagnostic-contract';
import type { DiagnosticEvent, StartupDiagnostic } from './startup-diagnostic-contract';

const build = getBuildInfo('development', '0.1.0');
const android = (message: string, level = 'I') =>
  `1793555763.737000 2070 2070 ${level} Capacitor/Console: File: https://localhost/ - Line 1 - Msg: ${message}`;
const ios = (message: string, level = 'info') =>
  `2026-11-01T17:56:03.737Z ⚡️  [${level}] - ${message}`;
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
      message(diagnostic(6, 'bridge-ready', { reason: 'startup', durationMs: 8 })),
    ].join('\n') + '\n';
  const boundary = lifecycleBoundary(analyzeNativeLog(before, build));
  const after =
    [
      '1793555764.000000 2070 2070 D Capacitor: App paused',
      message(diagnostic(7, 'pause')),
      '1793555766.000000 2070 2070 D Capacitor: App resumed',
      message(diagnostic(8, 'resume')),
      message(diagnostic(9, 'bridge-check-start', { reason: 'resume' })),
      message(diagnostic(10, 'bridge-ready', { reason: 'resume', durationMs: 9 })),
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
      'No document pause event after the background action',
    );
  });
  it('rejects a replacement page session as resuming the same page', () => {
    const fixture = healthy();
    const log = fixture.before + fixture.after.replaceAll('page-one', 'page-two');
    expect(
      nativeLaunchProblems(analyzeNativeLog(log, build), 'android', fixture.boundary),
    ).toContain('No document resume event after the observed pause');
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
