import type { SqlConnection, SqlPool } from './database.ts';
import { createMountedPath } from './server-route.ts';

export const MAINTENANCE_CODES = [
  'none',
  'service_not_ready',
  'scheduled_maintenance',
  'backend_unavailable',
  'reward_verification_delayed',
  'ruleset_review',
  'client_update_required',
] as const;
export type MaintenanceCode = (typeof MAINTENANCE_CODES)[number];
export interface OperationsPolicy {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly rankedStartsEnabled: boolean;
  readonly adStartsEnabled: boolean;
  readonly minimumClientBuild: number;
  readonly recoveryMinimumClientBuild: number;
  readonly startRuleset: string;
  readonly recoveryRulesets: readonly string[];
  readonly maintenanceCode: MaintenanceCode;
  readonly updatedAt: string;
}
export type OperationsProblem =
  | 'maintenance'
  | 'client_update_required'
  | 'ruleset_unavailable'
  | 'recovery_unavailable'
  | 'operation_context_required'
  | 'service_unavailable';
export class OperationsPolicyError extends Error {
  readonly code: OperationsProblem;
  constructor(code: OperationsProblem) {
    super(code);
    this.name = 'OperationsPolicyError';
    this.code = code;
  }
}
/** Fixed public status; callers expose the enumerated code only. */
export function operationsHttpStatus(error: OperationsPolicyError): number {
  return error.code === 'maintenance' ||
    error.code === 'operation_context_required' ||
    error.code === 'service_unavailable'
    ? 503
    : error.code === 'client_update_required'
      ? 426
      : 409;
}
const version = /^[A-Za-z0-9._-]{1,80}$/;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function build(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647
  );
}
export function parseOperationsPolicy(value: unknown): OperationsPolicy | null {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    typeof value.revision !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value.revision) ||
    typeof value.rankedStartsEnabled !== 'boolean' ||
    typeof value.adStartsEnabled !== 'boolean' ||
    !build(value.minimumClientBuild) ||
    !build(value.recoveryMinimumClientBuild) ||
    value.recoveryMinimumClientBuild > value.minimumClientBuild ||
    typeof value.startRuleset !== 'string' ||
    !version.test(value.startRuleset) ||
    !Array.isArray(value.recoveryRulesets) ||
    value.recoveryRulesets.length < 1 ||
    value.recoveryRulesets.length > 8 ||
    value.recoveryRulesets.some(
      (item: unknown) => typeof item !== 'string' || !version.test(item),
    ) ||
    new Set(value.recoveryRulesets).size !== value.recoveryRulesets.length ||
    !value.recoveryRulesets.includes(value.startRuleset) ||
    typeof value.maintenanceCode !== 'string' ||
    !(MAINTENANCE_CODES as readonly string[]).includes(value.maintenanceCode) ||
    typeof value.updatedAt !== 'string' ||
    value.updatedAt.length > 40 ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    return null;
  return {
    schemaVersion: 1,
    revision: value.revision,
    rankedStartsEnabled: value.rankedStartsEnabled,
    adStartsEnabled: value.adStartsEnabled,
    minimumClientBuild: value.minimumClientBuild,
    recoveryMinimumClientBuild: value.recoveryMinimumClientBuild,
    startRuleset: value.startRuleset,
    recoveryRulesets: value.recoveryRulesets.map((item: unknown) => String(item)),
    maintenanceCode: value.maintenanceCode as MaintenanceCode,
    updatedAt: value.updatedAt,
  };
}
const problems: Readonly<Record<string, OperationsProblem>> = {
  CPI_OPERATIONS_MAINTENANCE: 'maintenance',
  CPI_OPERATIONS_UPDATE_REQUIRED: 'client_update_required',
  CPI_OPERATIONS_RULESET_UNAVAILABLE: 'ruleset_unavailable',
  CPI_OPERATIONS_RECOVERY_UNAVAILABLE: 'recovery_unavailable',
  CPI_OPERATIONS_CONTEXT_REQUIRED: 'operation_context_required',
};
function problem(error: unknown): OperationsPolicyError {
  return new OperationsPolicyError(
    error instanceof Error
      ? (problems[error.message] ?? 'service_unavailable')
      : 'service_unavailable',
  );
}
export interface OperationStartContext {
  readonly operation: 'ranked' | 'ad';
  /** Bound by the trusted session/build verifier, never by the command body. */
  readonly clientBuild: number;
  readonly rulesetVersion: string;
}
/** Invoke AFTER the account owner lock and before a NEW start, in the same transaction. */
export function createOperationStartGate() {
  return async (connection: SqlConnection, input: OperationStartContext): Promise<void> => {
    if (
      !['ranked', 'ad'].includes(input.operation) ||
      !build(input.clientBuild) ||
      !version.test(input.rulesetVersion)
    )
      throw new OperationsPolicyError('operation_context_required');
    try {
      await connection.query(
        'select cpi_private.authorize_operation_start($1::text,$2::integer,$3::text)',
        [input.operation, input.clientBuild, input.rulesetVersion],
      );
    } catch (error) {
      throw problem(error);
    }
  };
}
/** Kills affect new starts; recovery has its own compatibility floor and retained rulesets. */
export function createOperationRecoveryGate() {
  return async (
    connection: SqlConnection,
    input: Omit<OperationStartContext, 'operation'>,
  ): Promise<void> => {
    if (!build(input.clientBuild) || !version.test(input.rulesetVersion))
      throw new OperationsPolicyError('operation_context_required');
    try {
      await connection.query('select cpi_private.check_operation_recovery($1::integer,$2::text)', [
        input.clientBuild,
        input.rulesetVersion,
      ]);
    } catch (error) {
      throw problem(error);
    }
  };
}
export async function readOperationsPolicy(database: SqlPool): Promise<OperationsPolicy> {
  let connection: SqlConnection | null = null;
  let broken: Error | undefined;
  try {
    connection = await database.connect();
    const result = await connection.query('select cpi_private.get_operations_policy() as policy');
    const policy = parseOperationsPolicy(result.rows[0]?.policy);
    if (!policy) throw new OperationsPolicyError('service_unavailable');
    return policy;
  } catch {
    broken = new Error('Operational policy unavailable');
    throw new OperationsPolicyError('service_unavailable');
  } finally {
    connection?.release(broken);
  }
}
export interface OperationsStatusOptions {
  readonly database: SqlPool;
  readonly basePath?: string;
  readonly allowOrigin: (origin: string | null) => boolean;
  readonly allowPublicRead: (request: Request) => boolean | Promise<boolean>;
  readonly rateLimit: (request: Request) => Promise<boolean>;
}
/** Explicitly mounted read-only status. No operator writes, default URL or automatic client traffic. */
export function createOperationsStatusHandler(options: OperationsStatusOptions) {
  const path = createMountedPath(options.basePath);
  return async (request: Request): Promise<Response> => {
    let origin: string | null = null;
    const reply = (value: unknown, status = 200) => {
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        vary: 'Origin',
      });
      if (origin) headers.set('access-control-allow-origin', origin);
      return new Response(status === 204 ? null : JSON.stringify(value), { status, headers });
    };
    try {
      const candidate = request.headers.get('origin');
      if (!options.allowOrigin(candidate)) return reply({ code: 'origin_denied' }, 403);
      origin = candidate;
      const url = new URL(request.url);
      if (
        url.protocol !== 'https:' ||
        url.search ||
        url.hash ||
        path(url.pathname) !== '/operations/status'
      )
        return reply({ code: 'not_found' }, 404);
      if (request.method === 'OPTIONS') {
        if (
          request.headers.get('access-control-request-method') !== 'POST' ||
          (request.headers.get('access-control-request-headers') ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .some((s) => s !== 'content-type')
        )
          return reply({ code: 'method_not_allowed' }, 405);
        const result = reply(null, 204);
        result.headers.set('access-control-allow-methods', 'POST, OPTIONS');
        result.headers.set('access-control-allow-headers', 'Content-Type');
        return result;
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      if (!(await options.rateLimit(request))) return reply({ code: 'rate_limited' }, 429);
      if (!(await options.allowPublicRead(request)))
        return reply({ code: 'service_unavailable' }, 503);
      if (
        request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
        request.headers.has('content-encoding') ||
        request.signal.aborted
      )
        return reply({ code: 'invalid_request' }, 400);
      const reader = request.body?.getReader();
      if (!reader) return reply({ code: 'invalid_request' }, 400);
      let text = '';
      let bytes = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 256) {
            await reader.cancel();
            return reply({ code: 'invalid_request' }, 400);
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        const body: unknown = JSON.parse(text);
        if (!object(body) || Object.keys(body).length !== 1 || body.schemaVersion !== 1)
          return reply({ code: 'invalid_request' }, 400);
      } catch {
        return reply({ code: 'invalid_request' }, 400);
      } finally {
        reader.releaseLock();
      }
      return reply(await readOperationsPolicy(options.database));
    } catch {
      return reply({ code: 'service_unavailable' }, 503);
    }
  };
}
