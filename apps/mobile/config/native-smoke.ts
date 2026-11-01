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
  externalRuntimeErrors: {
    line: number;
    pid: number;
    processName: string;
    message: string;
  }[];
  nativeEvents: { line: number; event: string; raw: string }[];
  engineMessages: { line: number; raw: string }[];
  prebridgeGates: { line: number; stage: 'waiting' | 'paused' | 'released'; gateId: string }[];
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
  'native-state',
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
interface AndroidLogRecord {
  pid: number;
  level: string;
  tag: string;
  message: string;
}
interface AndroidProcessClaims {
  runtimeNames: Set<string>;
  observedNames: Set<string>;
  crashStarts: Set<string>;
  declarations: Set<string>;
  processStarts: Set<string>;
  runtimeAfterDeath: Set<string>;
  dead: boolean;
  invalid: boolean;
  appAssociated: boolean;
}
function validPid(value: string): number | undefined {
  const pid = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(pid) && pid <= 2_147_483_647
    ? pid
    : undefined;
}
function androidLogRecord(raw: string): AndroidLogRecord | undefined {
  // The driver captures epoch format; brief format covers retained older evidence.
  const epoch = raw.match(/^\s*\d+\.\d+\s+(\d+)\s+\d+\s+([VDIWEF])\s+([^\s:]+)\s*:\s?(.*)$/);
  const brief = epoch ? undefined : raw.match(/^([VDIWEF])\/([^\s(]+)\(\s*(\d+)\s*\)\s*:\s?(.*)$/);
  const value = epoch?.[1] ?? brief?.[3];
  const pid = value === undefined ? undefined : validPid(value);
  if (pid === undefined) return undefined;
  return epoch
    ? { pid, level: epoch[2], tag: epoch[3], message: epoch[4] }
    : { pid, level: brief![1], tag: brief![2], message: brief![4] };
}
function logLines(log: string): string[] {
  const lines = stripVTControlCharacters(log).split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}
function androidProcessClaims(
  lines: string[],
  build: BuildInfo,
): Map<number, AndroidProcessClaims> {
  const claims = new Map<number, AndroidProcessClaims>();
  const forPid = (pid: number) => {
    let value = claims.get(pid);
    if (!value) {
      value = {
        runtimeNames: new Set(),
        observedNames: new Set(),
        crashStarts: new Set(),
        declarations: new Set(),
        processStarts: new Set(),
        runtimeAfterDeath: new Set(),
        dead: false,
        invalid: false,
        appAssociated: false,
      };
      claims.set(pid, value);
    }
    return value;
  };
  const belongsToApp = (name: string) => name === build.appId || name.startsWith(`${build.appId}:`);
  for (const raw of lines) {
    const record = androidLogRecord(raw);
    if (!record) continue;
    const current = forPid(record.pid);
    if (record.tag === 'AndroidRuntime' && ['E', 'F'].includes(record.level)) {
      if (current.dead) current.runtimeAfterDeath.add(raw);
      if (record.message.startsWith('FATAL EXCEPTION:')) current.crashStarts.add(raw);
      if (/^Process\b/.test(record.message)) {
        const declaration = record.message.match(
          /^Process: ([A-Za-z0-9_.$:-]{1,200}), PID: ([1-9]\d*)\s*$/,
        );
        const declaredPid = declaration ? validPid(declaration[2]) : undefined;
        if (!declaration || declaredPid !== record.pid) {
          current.invalid = true;
          if (declaredPid !== undefined) forPid(declaredPid).invalid = true;
        } else {
          current.declarations.add(raw);
          current.runtimeNames.add(declaration[1]);
          current.observedNames.add(declaration[1]);
          if (belongsToApp(declaration[1])) current.appAssociated = true;
        }
      }
    }
    if (record.tag === 'ActivityManager') {
      const died = record.message.match(/\bProcess ([^\s()]{1,200}) \(pid ([1-9]\d*)\) has died\b/);
      const deadPid = died ? validPid(died[2]) : undefined;
      if (died && deadPid !== undefined) {
        const process = forPid(deadPid);
        process.observedNames.add(died[1]);
        process.dead = true;
        if (belongsToApp(died[1])) process.appAssociated = true;
      }
      const started = record.message.match(/\bStart proc ([1-9]\d*):([^/\s]{1,200})\//);
      const startedPid = started ? validPid(started[1]) : undefined;
      if (started && startedPid !== undefined) {
        const process = forPid(startedPid);
        process.processStarts.add(raw);
        process.observedNames.add(started[2]);
        const componentOwner = record.message.match(/\{([^/\s{}]+)\//)?.[1];
        if (belongsToApp(started[2]) || (componentOwner && belongsToApp(componentOwner))) {
          // Includes an app's sandboxed WebView process, whose name belongs to WebView.
          process.appAssociated = true;
        }
      }
    }
    const message = consoleMessage(raw)?.message;
    if (message?.startsWith('CPI_APP_READY ') || message?.startsWith(diagnosticPrefix)) {
      current.appAssociated = true;
    }
  }
  return claims;
}
export function analyzeNativeLog(
  log: string,
  build: BuildInfo,
  options: { attributionLog?: string } = {},
): NativeLogAnalysis {
  const lines = logLines(log);
  // A complete capture can disprove attribution in an earlier attempt (PID reuse).
  // A Process declaration alone never overrides conflicting names or app markers.
  const attributionLines =
    options.attributionLog === undefined ? lines : logLines(options.attributionLog);
  if (options.attributionLog !== undefined) {
    // Scoped lines already present in the complete capture must not be replayed
    // after a recorded death. Retain extra evidence conservatively at the end.
    const included = new Set(attributionLines);
    for (const raw of lines) {
      if (!included.has(raw)) {
        attributionLines.push(raw);
        included.add(raw);
      }
    }
  }
  const claims = androidProcessClaims(attributionLines, build);
  const result: NativeLogAnalysis = {
    lineCount: lines.length,
    readyMarkerLines: [],
    diagnostics: [],
    errors: [],
    externalRuntimeErrors: [],
    nativeEvents: [],
    engineMessages: [],
    prebridgeGates: [],
  };
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const entry = consoleMessage(raw);
    const gatePayload = raw.match(/CPI_NATIVE_GATE (\{.*\})$/)?.[1];
    if (gatePayload) {
      try {
        const gate: unknown = JSON.parse(gatePayload);
        if (
          !isRecord(gate) ||
          !['waiting', 'paused', 'released'].includes(String(gate.stage)) ||
          typeof gate.gateId !== 'string' ||
          !gate.gateId
        ) {
          throw new Error('Invalid prebridge gate');
        }
        result.prebridgeGates.push({
          line,
          stage: gate.stage as 'waiting' | 'paused' | 'released',
          gateId: gate.gateId,
        });
      } catch {
        result.errors.push({
          line,
          kind: 'native-gate-protocol',
          message: 'Malformed prebridge native gate',
        });
      }
    }
    const android = androidLogRecord(raw);
    const isAndroidRuntime = android
      ? android.tag === 'AndroidRuntime' && ['E', 'F'].includes(android.level)
      : /(?:\b[EF]\s+AndroidRuntime\s*:|^\s*[EF]\/AndroidRuntime\()/.test(raw);
    if (entry && ['E', 'F', 'error'].includes(entry.level)) {
      result.errors.push({ line, kind: 'javascript-console', message: entry.message });
    } else if (
      android &&
      ['E', 'F'].includes(android.level) &&
      (android.tag === 'Capacitor' || android.tag.startsWith('Capacitor/'))
    ) {
      result.errors.push({ line, kind: 'capacitor-error', message: raw });
    } else if (
      !isAndroidRuntime &&
      /\bUncaught (?:\(in promise\) )?(?:\w*Error|exception)|Unhandled (?:Promise|promise) [Rr]ejection|⚡️\s*JS Eval error|Terminating app due to uncaught exception|\bEXC_BAD_ACCESS\b|\bFatal error:/.test(
        raw,
      )
    ) {
      result.errors.push({ line, kind: 'runtime-exception', message: raw });
    }
    if (isAndroidRuntime) {
      const process = android && claims.get(android.pid);
      if (
        android &&
        process &&
        !process.invalid &&
        !process.appAssociated &&
        !process.runtimeAfterDeath.has(raw) &&
        process.runtimeNames.size === 1 &&
        // Shared renderer identities do not establish the owning application.
        ![...process.runtimeNames].some((name) =>
          /webview|renderer|sandboxed_process|sandboxedprocessservice|privileged_process|privilegedprocessservice/i.test(
            name,
          ),
        ) &&
        process.observedNames.size === 1 &&
        process.crashStarts.size === 1 &&
        process.declarations.size === 1 &&
        process.processStarts.size <= 1
      ) {
        result.externalRuntimeErrors.push({
          line,
          pid: android.pid,
          processName: [...process.runtimeNames][0],
          message: raw,
        });
      } else {
        result.errors.push({ line, kind: 'android-runtime', message: raw });
      }
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

/** Additional CPI-007 evidence; never substitute synthetic native events for this gate. */
export function nativeLifecycleProblems(analysis: NativeLogAnalysis, prebridge: boolean): string[] {
  const problems: string[] = [];
  for (const reason of ['startup', 'resume']) {
    if (
      !analysis.diagnostics.some(
        (event) =>
          event.event === 'bridge-ready' &&
          event.details?.reason === reason &&
          event.details.lifecycle,
      )
    ) {
      problems.push(`Missing ${reason} native page/bridge handshake`);
    }
  }
  const snapshots = analysis.diagnostics
    .filter((event) => event.details?.lifecycle)
    .map((event) => ({ event, value: event.details!.lifecycle! }));
  if (!snapshots.length)
    return [...problems, 'Missing current-page native foreground clock snapshots'];
  for (const { event, value } of snapshots) {
    if (
      value.pageId !== event.sessionId ||
      typeof value.bridgeId !== 'string' ||
      !value.bridgeId ||
      !Number.isSafeInteger(value.sequence) ||
      value.sequence < 1 ||
      typeof value.isActive !== 'boolean' ||
      !Number.isFinite(value.nativeTimeMs) ||
      value.nativeTimeMs < 0 ||
      !Number.isFinite(value.foregroundTimeMs) ||
      value.foregroundTimeMs < 0
    ) {
      problems.push('Invalid native page/bridge/clock snapshot');
    }
  }
  if (new Set(snapshots.map(({ value }) => value.bridgeId)).size !== 1)
    problems.push('Native bridge identity changed within one page');
  const ordered = [...snapshots].sort((a, b) => a.value.sequence - b.value.sequence);
  for (let i = 1; i < ordered.length; i++) {
    const prior = ordered[i - 1].value;
    const current = ordered[i].value;
    if (
      current.sequence === prior.sequence ||
      current.nativeTimeMs < prior.nativeTimeMs ||
      current.foregroundTimeMs < prior.foregroundTimeMs
    )
      problems.push('Native sequence or monotonic clock regressed');
  }
  const inactive = ordered.find(({ value }) => !value.isActive);
  const resumed = ordered.find(
    ({ value }) => inactive && value.sequence > inactive.value.sequence && value.isActive,
  );
  if (!inactive || !resumed) problems.push('Missing native inactive/active clock boundary');
  else {
    const elapsed = resumed.value.nativeTimeMs - inactive.value.nativeTimeMs;
    const foreground = resumed.value.foregroundTimeMs - inactive.value.foregroundTimeMs;
    if (elapsed <= 0 || foreground > 250 || foreground >= elapsed)
      problems.push('Native foreground clock included the background interval');
  }
  if (prebridge) {
    const gates = analysis.prebridgeGates;
    const waiting = gates.find((gate) => gate.stage === 'waiting');
    const paused = gates.find(
      (gate) =>
        gate.stage === 'paused' &&
        waiting &&
        gate.gateId === waiting.gateId &&
        gate.line > waiting.line,
    );
    const released = gates.find(
      (gate) =>
        gate.stage === 'released' &&
        paused &&
        gate.gateId === paused.gateId &&
        gate.line > paused.line,
    );
    const page = analysis.diagnostics.find((event) => event.event === 'page-start');
    if (!waiting || !paused || !released || !page || page.line <= released.line)
      problems.push('Missing ordered native interruption before first page/bridge');
    const firstHandshake = analysis.diagnostics.find(
      (event) => event.event === 'bridge-ready' && event.details?.reason === 'startup',
    );
    if (
      firstHandshake &&
      analysis.diagnostics.some(
        (event) => ['pause', 'resume'].includes(event.event) && event.line < firstHandshake.line,
      )
    )
      problems.push('Pre-page pause/resume was replayed into the new page');
  }
  return problems;
}
