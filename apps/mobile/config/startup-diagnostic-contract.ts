import type { BuildInfo } from './environments';

export const diagnosticPrefix = 'CPI_NATIVE_DIAGNOSTIC ';
export type DiagnosticEvent =
  | 'page-start'
  | 'dom-ready'
  | 'page-load'
  | 'react-ready'
  | 'bridge-check-start'
  | 'bridge-ready'
  | 'bridge-error'
  | 'pause'
  | 'resume'
  | 'visibility'
  | 'js-error'
  | 'unhandled-rejection';

export interface StartupDiagnostic {
  schemaVersion: 1;
  buildInfo: BuildInfo;
  sessionId: string;
  sequence: number;
  event: DiagnosticEvent;
  timestamp: string;
  performanceMs: number;
  visibilityState: DocumentVisibilityState;
  readyState: DocumentReadyState;
  hasTriggerEvent: boolean;
  details?: {
    reason?: 'startup' | 'resume';
    durationMs?: number;
    message?: string;
  };
}
