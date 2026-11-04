/** Fixed public failures only; server text and arbitrary error codes never reach UI. */
export type OperationFailure =
  | 'maintenance'
  | 'client_update_required'
  | 'ruleset_unavailable'
  | 'recovery_unavailable'
  | 'operation_context_required'
  | 'service_unavailable';

const STATUS: Readonly<Record<OperationFailure, number>> = {
  maintenance: 503,
  client_update_required: 426,
  ruleset_unavailable: 409,
  recovery_unavailable: 409,
  operation_context_required: 503,
  service_unavailable: 503,
};
export function parseOperationFailure(value: unknown, status: number): OperationFailure | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== 1 || typeof raw.code !== 'string') return null;
  if (!Object.hasOwn(STATUS, raw.code)) return null;
  const code = raw.code as OperationFailure;
  return STATUS[code] === status ? code : null;
}
export function canRecheckOperation(problem: OperationFailure | null | undefined): boolean {
  return problem !== 'client_update_required' && problem !== 'operation_context_required';
}
export const operationMessageKeys = {
  maintenance: 'operations.maintenance',
  client_update_required: 'operations.update',
  ruleset_unavailable: 'operations.ruleset',
  recovery_unavailable: 'operations.recovery',
  operation_context_required: 'operations.unavailable',
  service_unavailable: 'operations.serviceUnavailable',
} as const;
