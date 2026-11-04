import type { SqlConnection, SqlPool } from './database.ts';

export const NAME_REPORT_REASONS = [
  'impersonation',
  'hate_or_harassment',
  'sexual_content',
  'personal_information',
  'spam',
] as const;
export const MODERATION_DECISIONS = [
  'dismiss',
  'hide_player',
  'restore_player',
  'disqualify_run',
  'restore_run',
] as const;
export interface VerifiedReporter {
  readonly subject: string;
  readonly reportAllowed: boolean;
}
export interface VerifiedModerator {
  /** Opaque staff identity established by the trusted verifier, never the body. */
  readonly actorReference: string;
  readonly canReadQueue: boolean;
  readonly canReview: boolean;
}
export interface ModerationApiOptions {
  readonly database: SqlPool;
  readonly authenticateReporter: (accessToken: string) => Promise<VerifiedReporter | null>;
  readonly authenticateModerator: (accessToken: string) => Promise<VerifiedModerator | null>;
  readonly allowOrigin: (origin: string | null) => boolean;
  readonly rateLimit: (request: Request, actor: string | null) => Promise<boolean>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF = /^[A-Za-z0-9:_-]{1,80}$/;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    object(value) &&
    value.schemaVersion === 1 &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function date(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}
function cursor(value: unknown): value is { afterAt: string; afterId: string } {
  return object(value) && date(value.afterAt) && uuid(value.afterId);
}
function queueProjection(raw: unknown): object | null {
  if (
    !object(raw) ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.cases) ||
    raw.cases.length > 100 ||
    (raw.next !== null && !cursor(raw.next))
  )
    return null;
  const cases: {
    caseId: string;
    targetPublicId: string;
    username: string;
    updatedAt: string;
    reasons: Record<string, string>;
  }[] = [];
  for (const value of raw.cases) {
    if (
      !object(value) ||
      !uuid(value.caseId) ||
      !uuid(value.targetPublicId) ||
      typeof value.username !== 'string' ||
      value.username.length < 3 ||
      value.username.length > 24 ||
      Array.from(value.username).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      !date(value.updatedAt) ||
      !object(value.reasons) ||
      Object.keys(value.reasons).length > 5 ||
      cases.some(
        (item) => item.caseId === value.caseId || item.targetPublicId === value.targetPublicId,
      )
    )
      return null;
    const reasons: Record<string, string> = {};
    for (const [reason, amount] of Object.entries(value.reasons)) {
      if (
        !(NAME_REPORT_REASONS as readonly string[]).includes(reason) ||
        typeof amount !== 'string' ||
        !/^[1-9][0-9]{0,19}$/.test(amount)
      )
        return null;
      reasons[reason] = amount;
    }
    cases.push({
      caseId: value.caseId,
      targetPublicId: value.targetPublicId,
      username: value.username,
      updatedAt: value.updatedAt,
      reasons,
    });
  }
  return {
    schemaVersion: 1,
    cases,
    next: raw.next === null ? null : { afterAt: raw.next.afterAt, afterId: raw.next.afterId },
  };
}
async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > 4096)) throw new Error();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new Error();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}
function reply(body: unknown, status: number, origin: string | null): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  if (origin !== null) headers.set('access-control-allow-origin', origin);
  if (status === 204) {
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'Authorization, Content-Type');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
const PUBLIC_ERRORS: Readonly<Record<string, { code: string; status: number }>> = {
  CPI_REPORT_INVALID: { code: 'invalid_request', status: 400 },
  CPI_REPORT_RATE_LIMITED: { code: 'rate_limited', status: 429 },
  CPI_REPORT_UNAVAILABLE: { code: 'account_unavailable', status: 409 },
  CPI_MODERATION_INVALID: { code: 'invalid_request', status: 400 },
  CPI_MODERATION_NOT_FOUND: { code: 'case_not_found', status: 404 },
  CPI_MODERATION_CONFLICT: { code: 'moderation_conflict', status: 409 },
  CPI_MODERATION_UNAVAILABLE: { code: 'account_unavailable', status: 409 },
};

/** No mobile role flag can grant staff access; the host must provide separate trusted verification. */
export function createModerationHandler(options: ModerationApiOptions) {
  return async (request: Request): Promise<Response> => {
    let origin: string | null = null;
    let connection: SqlConnection | null = null;
    let broken: Error | undefined;
    try {
      const candidateOrigin = request.headers.get('origin');
      if (!options.allowOrigin(candidateOrigin)) return reply({ code: 'origin_denied' }, 403, null);
      origin = candidateOrigin;
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.search || url.hash)
        return reply({ code: 'invalid_request' }, 400, origin);
      const route = /^\/moderation\/(report|queue|review)$/.exec(url.pathname)?.[1];
      if (!route) return reply({ code: 'not_found' }, 404, origin);
      if (request.method === 'OPTIONS') {
        const headers = (request.headers.get('access-control-request-headers') ?? '')
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        if (
          request.headers.get('access-control-request-method') !== 'POST' ||
          headers.some((value) => value !== 'authorization' && value !== 'content-type')
        )
          return reply({ code: 'method_not_allowed' }, 405, origin);
        return reply(null, 204, origin);
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405, origin);
      if (!(await options.rateLimit(request, null)))
        return reply({ code: 'rate_limited' }, 429, origin);
      const authorization = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(authorization))
        return reply({ code: 'account_required' }, 401, origin);
      let reporter: VerifiedReporter | null = null;
      let moderator: VerifiedModerator | null = null;
      if (route === 'report') {
        reporter = await options.authenticateReporter(authorization.slice(7));
        if (!reporter || reporter.reportAllowed !== true || !uuid(reporter.subject))
          return reply({ code: 'account_required' }, 401, origin);
      } else {
        moderator = await options.authenticateModerator(authorization.slice(7));
        if (
          !moderator ||
          typeof moderator.actorReference !== 'string' ||
          !STAFF.test(moderator.actorReference) ||
          (route === 'queue' ? moderator.canReadQueue !== true : moderator.canReview !== true)
        )
          return reply({ code: 'moderator_required' }, 403, origin);
      }
      const actor = reporter?.subject ?? 'moderator:' + moderator!.actorReference;
      if (!(await options.rateLimit(request, actor)))
        return reply({ code: 'rate_limited' }, 429, origin);
      if (
        request.signal.aborted ||
        request.headers.has('content-encoding') ||
        request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
      )
        return reply({ code: 'invalid_request' }, 400, origin);
      let input: unknown;
      try {
        input = await readBody(request);
      } catch {
        return reply({ code: 'invalid_request' }, 400, origin);
      }
      let sql: string;
      let values: readonly unknown[];
      if (route === 'report') {
        if (
          !exact(input, ['schemaVersion', 'targetPublicId', 'reason']) ||
          !uuid(input.targetPublicId) ||
          typeof input.reason !== 'string' ||
          !(NAME_REPORT_REASONS as readonly string[]).includes(input.reason)
        )
          return reply({ code: 'invalid_request' }, 400, origin);
        sql = 'select cpi_private.submit_name_report($1::uuid,$2::uuid,$3::text) as result';
        values = [reporter!.subject, input.targetPublicId, input.reason];
      } else if (route === 'queue') {
        if (
          !exact(input, ['schemaVersion', 'afterAt', 'afterId']) ||
          (input.afterAt === null) !== (input.afterId === null) ||
          (input.afterAt !== null && (!date(input.afterAt) || !uuid(input.afterId)))
        )
          return reply({ code: 'invalid_request' }, 400, origin);
        sql = 'select cpi_private.read_moderation_queue($1::timestamptz,$2::uuid) as result';
        values = [input.afterAt, input.afterId];
      } else {
        if (
          !exact(input, ['schemaVersion', 'caseId', 'decisionId', 'decision', 'runId']) ||
          !uuid(input.caseId) ||
          !uuid(input.decisionId) ||
          typeof input.decision !== 'string' ||
          !(MODERATION_DECISIONS as readonly string[]).includes(input.decision) ||
          (input.runId !== null && !uuid(input.runId)) ||
          (input.decision === 'disqualify_run' || input.decision === 'restore_run') !==
            (input.runId !== null)
        )
          return reply({ code: 'invalid_request' }, 400, origin);
        sql =
          'select cpi_private.review_moderation_case($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text) as result';
        values = [
          input.caseId,
          input.decisionId,
          input.decision,
          input.runId,
          moderator!.actorReference,
        ];
      }
      connection = await options.database.connect();
      let data: unknown;
      try {
        const result = await connection.query(sql, values);
        data = result.rows.length === 1 ? result.rows[0].result : null;
      } catch (error) {
        const known = error instanceof Error ? PUBLIC_ERRORS[error.message] : undefined;
        if (known) return reply({ code: known.code }, known.status, origin);
        broken = new Error('Moderation database query failed');
        throw broken;
      }
      if (route === 'report')
        return object(data) && data.status === 'accepted'
          ? reply({ status: 'accepted' }, 200, origin)
          : reply({ code: 'service_unavailable' }, 503, origin);
      if (route === 'queue') {
        const queue = queueProjection(data);
        return queue
          ? reply(queue, 200, origin)
          : reply({ code: 'service_unavailable' }, 503, origin);
      }
      if (
        !object(input) ||
        !object(data) ||
        data.status !== 'reviewed' ||
        data.caseId !== input.caseId ||
        data.decisionId !== input.decisionId
      )
        return reply({ code: 'service_unavailable' }, 503, origin);
      return reply(
        { status: 'reviewed', caseId: input.caseId, decisionId: input.decisionId },
        200,
        origin,
      );
    } catch {
      return reply({ code: 'service_unavailable' }, 503, origin);
    } finally {
      connection?.release(broken);
    }
  };
}
