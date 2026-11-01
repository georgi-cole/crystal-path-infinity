import { stripVTControlCharacters } from 'node:util';
import { assertBuiltEnvironment } from './environments.ts';
import type { BuildInfo } from './environments.ts';
import { diagnosticPrefix } from './startup-diagnostic-contract.ts';
import type { DiagnosticEvent, StartupDiagnostic } from './startup-diagnostic-contract.ts';

export interface ParsedDiagnostic extends StartupDiagnostic {
  line: number;
}
export interface NativeLogAnalysis {
  lineCount: number;
  readyMarkerLines: number[];
  diagnostics: ParsedDiagnostic[];
  errors: { line: number; kind: string; message: string }[];
  nativeEvents: { line: number; event: string; raw: string }[];
  engineMessages: { line: number; raw: string }[];
}
export interface LifecycleBoundary {
  sessionId: string;
  sequenceBeforeBackground: number;
  lineBeforeBackground: number;
}
const diagnosticEvents = new Set<DiagnosticEvent>([
  'page-start',
  'dom-ready',
  'page-load',
  'react-ready',
  'bridge-check-start',
  'bridge-ready',
  'bridge-error',
  'pause',
  'resume',
  'visibility',
  'js-error',
  'unhandled-rejection',
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readDiagnostic(value: unknown, build: BuildInfo): StartupDiagnostic {
  if (!isRecord(value)) throw new Error('Diagnostic must be an object');
  assertBuiltEnvironment(value.buildInfo, build.environment, build.version);
  if (
    value.schemaVersion !== 1 ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !diagnosticEvents.has(value.event as DiagnosticEvent) ||
    typeof value.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(value.timestamp)) ||
    typeof value.performanceMs !== 'number' ||
    !Number.isFinite(value.performanceMs) ||
    !['visible', 'hidden'].includes(String(value.visibilityState)) ||
    !['loading', 'interactive', 'complete'].includes(String(value.readyState)) ||
    typeof value.hasTriggerEvent !== 'boolean'
  )
    throw new Error('Invalid native diagnostic fields');
  if (value.details !== undefined && !isRecord(value.details)) {
    throw new Error('Invalid native diagnostic details');
  }
  return value as unknown as StartupDiagnostic;
}
function consoleMessage(line: string): { level: string; message: string } | undefined {
  const android =
    line.match(/(?:^|\s)([VDIWEF])\s+Capacitor\/Console\s*:\s*(.*)$/) ??
    line.match(/^([VDIWEF])\/Capacitor\/Console\(\s*\d+\):\s*(.*)$/);
  if (android) {
    const message = android[2];
    const marker = message.indexOf(' - Msg: ');
    return { level: android[1], message: marker < 0 ? message : message.slice(marker + 8) };
  }
  const ios = line.match(/⚡️\s*\[(log|info|warn|error|debug)\]\s*-\s*(.*)$/);
  if (ios) return { level: ios[1], message: ios[2] };
  return undefined;
}
export function analyzeNativeLog(log: string, build: BuildInfo): NativeLogAnalysis {
  const lines = stripVTControlCharacters(log).split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const result: NativeLogAnalysis = {
    lineCount: lines.length,
    readyMarkerLines: [],
    diagnostics: [],
    errors: [],
    nativeEvents: [],
    engineMessages: [],
  };
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const entry = consoleMessage(raw);
    if (entry && ['E', 'F', 'error'].includes(entry.level)) {
      result.errors.push({ line, kind: 'javascript-console', message: entry.message });
    } else if (
      /\bUncaught (?:\(in promise\) )?(?:\w*Error|exception)|Unhandled (?:Promise|promise) [Rr]ejection|⚡️\s*JS Eval error|Terminating app due to uncaught exception|\bEXC_BAD_ACCESS\b|\bFatal error:/.test(
        raw,
      )
    ) {
      result.errors.push({ line, kind: 'runtime-exception', message: raw });
    }
    if (/(?:\b[EF]\s+AndroidRuntime\s*:|^[EF]\/AndroidRuntime\()/.test(raw)) {
      result.errors.push({ line, kind: 'android-runtime', message: raw });
    }
    if (/(?:\b[EF]\s+chromium\s*:|^[EF]\/chromium\()/.test(raw)) {
      result.engineMessages.push({ line, raw });
    }
    if (entry?.message.startsWith('CPI_APP_READY ')) {
      try {
        const value: unknown = JSON.parse(entry.message.slice('CPI_APP_READY '.length));
        assertBuiltEnvironment(value, build.environment, build.version);
        result.readyMarkerLines.push(line);
      } catch {
        result.errors.push({
          line,
          kind: 'ready-marker',
          message: 'Malformed or mismatched build marker',
        });
      }
    }
    if (entry?.message.startsWith(diagnosticPrefix)) {
      try {
        const value: unknown = JSON.parse(entry.message.slice(diagnosticPrefix.length));
        const diagnostic = readDiagnostic(value, build);
        result.diagnostics.push({ ...diagnostic, line });
        if (
          ['bridge-error', 'js-error', 'unhandled-rejection'].includes(diagnostic.event) &&
          !result.errors.some((error) => error.line === line)
        ) {
          result.errors.push({
            line,
            kind: diagnostic.event,
            message: diagnostic.details?.message ?? diagnostic.event,
          });
        }
      } catch {
        result.errors.push({
          line,
          kind: 'diagnostic-protocol',
          message: 'Malformed or mismatched native diagnostic',
        });
      }
    }
    const nativeEvent =
      raw.match(
        /\bCapacitor(?:\(\s*\d+\))?\s*:\s*(App paused|App resumed|App started|Loading app at .*)$/,
      ) ?? raw.match(/⚡️\s*(WebView loaded|Loading app at .*)$/);
    if (nativeEvent) result.nativeEvents.push({ line, event: nativeEvent[1], raw });
  }
  return result;
}
export function startupSession(analysis: NativeLogAnalysis): string | undefined {
  return analysis.diagnostics.find(
    (event) =>
      event.event === 'bridge-ready' &&
      event.details?.reason === 'startup' &&
      event.hasTriggerEvent,
  )?.sessionId;
}
export function lifecycleBoundary(analysis: NativeLogAnalysis): LifecycleBoundary {
  const sessionId = startupSession(analysis);
  if (!sessionId) throw new Error('A real startup native bridge round-trip is required');
  const sequenceBeforeBackground = Math.max(
    ...analysis.diagnostics
      .filter((event) => event.sessionId === sessionId)
      .map((event) => event.sequence),
  );
  return { sessionId, sequenceBeforeBackground, lineBeforeBackground: analysis.lineCount };
}
export function nativeLaunchProblems(
  analysis: NativeLogAnalysis,
  platform: 'android' | 'ios',
  boundary?: LifecycleBoundary,
): string[] {
  const problems = analysis.errors.map(
    (error) => `${error.kind} at log line ${error.line}: ${error.message}`,
  );
  if (!analysis.readyMarkerLines.length) problems.push('Missing matching post-commit React marker');
  const sessionId = startupSession(analysis);
  if (!sessionId) problems.push('Missing successful startup native bridge round-trip');
  if (new Set(analysis.diagnostics.map((event) => event.sessionId)).size > 1) {
    problems.push('Multiple page sessions observed within one cold-start attempt');
  }
  const events = analysis.diagnostics.filter((event) => event.sessionId === sessionId);
  for (const event of ['page-start', 'dom-ready', 'page-load', 'react-ready']) {
    if (!events.some((item) => item.event === event)) problems.push(`Missing ${event} diagnostic`);
  }
  if (events.some((event, index) => index > 0 && event.sequence <= events[index - 1].sequence)) {
    problems.push('Diagnostic sequence did not increase within the page session');
  }
  if (!boundary) {
    problems.push('No real background/resume action was recorded');
  } else {
    if (sessionId !== boundary.sessionId)
      problems.push('Page session changed before lifecycle verification');
    const subsequent = events.filter((event) => event.sequence > boundary.sequenceBeforeBackground);
    const pause = subsequent.find((event) => event.event === 'pause');
    const resume = subsequent.find(
      (event) => event.event === 'resume' && pause && event.sequence > pause.sequence,
    );
    const resumedBridge = subsequent.find(
      (event) =>
        event.event === 'bridge-ready' &&
        event.details?.reason === 'resume' &&
        event.hasTriggerEvent &&
        resume &&
        event.sequence > resume.sequence,
    );
    if (!pause) problems.push('No document pause event after the background action');
    if (!resume) problems.push('No document resume event after the observed pause');
    if (!resumedBridge) problems.push('No successful native bridge round-trip after resume');
    if (platform === 'android') {
      const nativePause = analysis.nativeEvents.find(
        (event) => event.line > boundary.lineBeforeBackground && event.event === 'App paused',
      );
      const nativeResume = analysis.nativeEvents.find(
        (event) => nativePause && event.line > nativePause.line && event.event === 'App resumed',
      );
      if (!nativePause || !nativeResume)
        problems.push('Missing ordered Android native pause/resume observations');
    }
  }
  return problems;
}
