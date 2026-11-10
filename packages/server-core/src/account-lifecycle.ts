import { createHash } from 'node:crypto';
import type { SqlConnection, SqlPool } from './database.ts';
import { ownAdAuthorizationExport, ownRewardExport } from './reward-export.ts';

export interface ReauthenticationEvidence {
  readonly subject: string;
  readonly purpose: 'export' | 'delete';
  /** Unique issuer-verified nonce; the raw signed proof is never persisted. */
  readonly proofId: string;
  readonly verifiedAt: number;
  readonly expiresAt: number;
}
export interface AccountLifecycleOptions {
  readonly database: SqlPool;
  readonly authenticate: (accessToken: string) => Promise<{ readonly subject: string } | null>;
  /** Verify an issuer-signed, purpose/subject-bound fresh reauthentication proof. */
  readonly verifyReauthentication: (input: {
    readonly subject: string;
    readonly accessToken: string;
    readonly proof: string;
    readonly purpose: 'export' | 'delete';
  }) => Promise<ReauthenticationEvidence | null>;
  /** Must revoke every account token family, durably and idempotently by operationId. */
  readonly revokeAllSessions: (input: {
    readonly subject: string;
    readonly operationId: string;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly allowOrigin: (origin: string | null) => boolean;
  /** Durable limiter, including the unauthenticated status-capability route. */
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
  readonly now?: () => number;
  readonly revocationTimeoutMs?: number;
  /** Enabled only by the new host with the separately migrated private purchase/account tables. */
  readonly includeCommerce?: boolean;
}
export interface AccountDeletionStatus {
  readonly requestId: string;
  readonly status: 'revocation_pending' | 'deleted' | 'not_found';
  readonly requestedAt?: string;
  readonly completedAt?: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const proofPattern = /^[A-Za-z0-9._~-]{24,2048}$/;
const safeErrors = new Set([
  'CPI_ACCOUNT_REAUTH_REQUIRED',
  'CPI_ACCOUNT_REAUTH_REPLAY',
  'CPI_ACCOUNT_UNAVAILABLE',
  'CPI_ACCOUNT_REQUEST_NOT_FOUND',
]);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function json(value: unknown): unknown {
  if (typeof value === 'string') return JSON.parse(value) as unknown;
  return value;
}
function reportExport(value: unknown): { reports: object[]; next: string | null } {
  const raw = json(value);
  if (
    !object(raw) ||
    !Array.isArray(raw.reports) ||
    raw.reports.length > 100 ||
    (raw.next !== null && (typeof raw.next !== 'string' || !uuid.test(raw.next)))
  )
    throw new Error('Invalid report export');
  const reports: object[] = [];
  for (const item of raw.reports) {
    if (
      !object(item) ||
      typeof item.id !== 'string' ||
      !uuid.test(item.id) ||
      typeof item.targetPublicId !== 'string' ||
      !uuid.test(item.targetPublicId) ||
      typeof item.reason !== 'string' ||
      ![
        'impersonation',
        'hate_or_harassment',
        'sexual_content',
        'personal_information',
        'spam',
      ].includes(item.reason) ||
      typeof item.pending !== 'boolean' ||
      typeof item.createdAt !== 'string' ||
      item.createdAt.length > 40 ||
      !Number.isFinite(Date.parse(item.createdAt))
    )
      throw new Error('Invalid report export');
    reports.push({
      id: item.id,
      targetPublicId: item.targetPublicId,
      reason: item.reason,
      pending: item.pending,
      createdAt: item.createdAt,
    });
  }
  return { reports, next: raw.next };
}
function deletionStatus(value: unknown): AccountDeletionStatus {
  const candidate = json(value);
  if (
    !object(candidate) ||
    typeof candidate.requestId !== 'string' ||
    !uuid.test(candidate.requestId) ||
    typeof candidate.status !== 'string' ||
    !['revocation_pending', 'deleted', 'not_found'].includes(candidate.status)
  )
    throw new Error('Invalid deletion status');
  const result: AccountDeletionStatus = {
    requestId: candidate.requestId,
    status: candidate.status as AccountDeletionStatus['status'],
    ...(typeof candidate.requestedAt === 'string' ? { requestedAt: candidate.requestedAt } : {}),
    ...(typeof candidate.completedAt === 'string' ? { completedAt: candidate.completedAt } : {}),
  };
  if (result.status === 'deleted' && !result.completedAt)
    throw new Error('Missing deletion completion');
  return result;
}

async function transaction<T>(
  database: SqlPool,
  operation: (connection: SqlConnection) => Promise<T>,
): Promise<T> {
  const connection = await database.connect();
  let began = false;
  let committing = false;
  let broken: Error | undefined;
  try {
    await connection.query('begin');
    began = true;
    const result = await operation(connection);
    committing = true;
    await connection.query('commit');
    began = false;
    return result;
  } catch (error) {
    if (!began || committing) broken = new Error('Account transaction outcome uncertain');
    if (began) {
      try {
        await connection.query('rollback');
      } catch {
        broken = new Error('Account transaction rollback failed');
      }
    }
    throw error;
  } finally {
    connection.release(broken);
  }
}

async function query(database: SqlPool, text: string, values: readonly unknown[]) {
  const connection = await database.connect();
  let broken: Error | undefined;
  try {
    return await connection.query(text, values);
  } catch (error) {
    broken = new Error('Account database request failed');
    throw error;
  } finally {
    connection.release(broken);
  }
}

/**
 * Durable worker entry point. The host must retry committed pending requests even
 * after a process crash or account-wide token revocation. A random receipt ID
 * alone never authorizes creation of a deletion request.
 */
export async function processAccountDeletion(
  options: Pick<AccountLifecycleOptions, 'database' | 'revokeAllSessions' | 'revocationTimeoutMs'>,
  requestId: string,
): Promise<AccountDeletionStatus> {
  if (!uuid.test(requestId)) throw new Error('Invalid deletion request');
  const rows = await query(
    options.database,
    `select cpi_private.get_account_deletion_status($1::uuid) as status,
      cpi_private.get_account_deletion_work($1::uuid) as work`,
    [requestId],
  );
  const current = deletionStatus(rows.rows[0]?.status);
  if (current.status !== 'revocation_pending') return current;
  const work = json(rows.rows[0]?.work);
  if (
    !object(work) ||
    work.requestId !== requestId ||
    typeof work.subject !== 'string' ||
    !uuid.test(work.subject)
  )
    throw new Error('Invalid pending deletion');
  const subject = work.subject;
  const timeoutMs = options.revocationTimeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw new Error('Invalid revocation timeout');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let acknowledgment: unknown;
  try {
    acknowledgment = await Promise.race([
      options.revokeAllSessions({ subject, operationId: requestId, signal: controller.signal }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    return current;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
  if (
    !object(acknowledgment) ||
    acknowledgment.status !== 'revoked' ||
    acknowledgment.subject !== subject ||
    acknowledgment.operationId !== requestId
  )
    return current;
  return transaction(options.database, async (connection) => {
    const result = await connection.query(
      'select cpi_private.complete_account_deletion($1::uuid,$2::uuid) as status',
      [subject, requestId],
    );
    return deletionStatus(result.rows[0]?.status);
  });
}

async function boundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('Invalid request');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) throw new Error('Invalid request');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * Shared native/web route implementation. The host mounts fixed /account/export,
 * /account/delete and /account/status routes; no default URL or account UI is enabled.
 */
export function createAccountLifecycleHandler(options: AccountLifecycleOptions) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const permitted = options.allowOrigin(origin);
    function reply(body: unknown, status = 200) {
      const response = new Response(JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
      if (origin && permitted) response.headers.set('access-control-allow-origin', origin);
      response.headers.set('vary', 'Origin');
      return response;
    }
    try {
      if (!permitted) return reply({ code: 'origin_denied' }, 403);
      const url = new URL(request.url);
      const endpoint = /\/account\/(export|delete|status)$/.exec(url.pathname)?.[1] as
        'export' | 'delete' | 'status' | undefined;
      if (!endpoint || url.search || url.hash) return reply({ code: 'not_found' }, 404);
      if (request.method === 'OPTIONS') {
        const response = reply({});
        response.headers.set('access-control-allow-methods', 'POST');
        response.headers.set('access-control-allow-headers', 'authorization, content-type');
        return response;
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      if (!(await options.rateLimit(request, null))) return reply({ code: 'rate_limited' }, 429);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
        return reply({ code: 'invalid_request' }, 400);
      let input: unknown;
      try {
        input = await boundedJson(request);
      } catch {
        return reply({ code: 'invalid_request' }, 400);
      }
      if (!object(input) || input.schemaVersion !== 1)
        return reply({ code: 'invalid_request' }, 400);
      if (endpoint === 'status') {
        if (
          Object.keys(input).length !== 2 ||
          typeof input.requestId !== 'string' ||
          !uuid.test(input.requestId)
        )
          return reply({ code: 'invalid_request' }, 400);
        const result = await query(
          options.database,
          'select cpi_private.get_account_deletion_status($1::uuid) as status',
          [input.requestId],
        );
        const status = deletionStatus(result.rows[0]?.status);
        return reply(status, status.status === 'not_found' ? 404 : 200);
      }
      const allowed =
        endpoint === 'export'
          ? ['schemaVersion', 'reauthProof', 'cursor']
          : ['schemaVersion', 'reauthProof'];
      if (
        Object.keys(input).some((key) => !allowed.includes(key)) ||
        typeof input.reauthProof !== 'string' ||
        !proofPattern.test(input.reauthProof)
      )
        return reply({ code: 'invalid_request' }, 400);
      const cursor = input.cursor ?? {
        consent: null,
        parental: null,
        run: null,
        result: null,
        report: null,
        reward: null,
        adAuthorization: null,
      };
      if (
        !object(cursor) ||
        Object.keys(cursor).length < 4 ||
        Object.keys(cursor).length > 11 ||
        Object.keys(cursor).some(
          (key) =>
            ![
              'consent',
              'parental',
              'run',
              'result',
              'report',
              'reward',
              'adAuthorization',
              'purchase',
              'spend',
              'session',
              'assistedResult',
            ].includes(key),
        ) ||
        (cursor.report !== undefined &&
          cursor.report !== null &&
          (typeof cursor.report !== 'string' || !uuid.test(cursor.report))) ||
        !['reward', 'adAuthorization', 'purchase', 'spend', 'session', 'assistedResult'].every(
          (key) =>
            cursor[key] === undefined ||
            cursor[key] === null ||
            (typeof cursor[key] === 'string' && uuid.test(cursor[key])),
        ) ||
        !['consent', 'parental', 'run', 'result'].every(
          (key) =>
            cursor[key] === null || (typeof cursor[key] === 'string' && uuid.test(cursor[key])),
        )
      )
        return reply({ code: 'invalid_request' }, 400);
      const authorization = request.headers.get('authorization') ?? '';
      if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(authorization))
        return reply({ code: 'account_required' }, 401);
      const accessToken = authorization.slice(7);
      const actor = await options.authenticate(accessToken);
      if (!actor || !uuid.test(actor.subject)) return reply({ code: 'account_required' }, 401);
      if (!(await options.rateLimit(request, actor.subject)))
        return reply({ code: 'rate_limited' }, 429);
      const evidence = await options.verifyReauthentication({
        subject: actor.subject,
        accessToken,
        proof: input.reauthProof,
        purpose: endpoint,
      });
      const now = (options.now ?? Date.now)();
      if (
        !evidence ||
        evidence.subject !== actor.subject ||
        evidence.purpose !== endpoint ||
        !uuid.test(evidence.proofId) ||
        !Number.isSafeInteger(evidence.verifiedAt) ||
        !Number.isSafeInteger(evidence.expiresAt) ||
        evidence.verifiedAt > now ||
        evidence.verifiedAt < now - 300_000 ||
        evidence.expiresAt <= now ||
        evidence.expiresAt > evidence.verifiedAt + 300_000
      )
        return reply({ code: 'reauthentication_required' }, 401);
      const hash = createHash('sha256').update(evidence.proofId).digest('hex');
      const prepared = await transaction(options.database, async (connection) => {
        await connection.query(
          'select cpi_private.consume_account_reauthentication($1::uuid,$2::text,$3::text,$4::timestamptz)',
          [actor.subject, hash, endpoint, new Date(evidence.expiresAt).toISOString()],
        );
        if (endpoint === 'export') {
          const result = await connection.query(
            `select cpi_private.export_account_page($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as account_export,
              (select jsonb_strip_nulls(jsonb_build_object(
                'providerDisplayName',to_jsonb(p)->>'provider_display_name',
                'pendingCountryCode',to_jsonb(p)->>'pending_country_code'
              )) from cpi_private.profiles_private p where user_id=$1::uuid) as account_details`,
            [actor.subject, cursor.consent, cursor.parental, cursor.run, cursor.result],
          );
          const data = json(result.rows[0]?.account_export);
          if (!object(data) || data.schemaVersion !== 1 || !object(data.next))
            throw new Error('Invalid account export');
          const details = json(result.rows[0]?.account_details);
          if (object(data.privateProfile) && object(details)) {
            data.privateProfile = { ...data.privateProfile, ...details };
          }
          // Mandatory after CPI-025: a missing/failed report export rolls the
          // whole page back instead of silently omitting user-owned data.
          const ownReports = await connection.query(
            'select cpi_private.export_own_name_reports($1::uuid,$2::uuid) as report_export',
            [actor.subject, cursor.report ?? null],
          );
          const reports = reportExport(ownReports.rows[0]?.report_export);
          const rewardRows = await connection.query(
            'select cpi_private.export_own_rewards($1::uuid,$2::uuid) as reward_export',
            [actor.subject, cursor.reward ?? null],
          );
          const rewards = ownRewardExport(rewardRows.rows[0]?.reward_export);
          const authorizationRows = await connection.query(
            'select cpi_private.export_own_ad_authorizations($1::uuid,$2::uuid) as ad_authorization_export',
            [actor.subject, cursor.adAuthorization ?? null],
          );
          const authorizations = ownAdAuthorizationExport(
            authorizationRows.rows[0]?.ad_authorization_export,
          );
          let commerce: Record<string, unknown> | null = null;
          if (options.includeCommerce) {
            const row = (
              await connection.query(
                'select cpi_private.export_own_commerce($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as commerce',
                [
                  actor.subject,
                  cursor.purchase ?? null,
                  cursor.spend ?? null,
                  cursor.session ?? null,
                  cursor.assistedResult ?? null,
                ],
              )
            ).rows[0];
            const parsed = json(row?.commerce);
            if (
              !object(parsed) ||
              !object(parsed.next) ||
              !['purchases', 'spends', 'sessions', 'assistedResults'].every(
                (key) => Array.isArray(parsed[key]) && (parsed[key] as unknown[]).length <= 100,
              ) ||
              !['purchase', 'spend', 'session', 'assistedResult'].every(
                (key) =>
                  parsed.next &&
                  object(parsed.next) &&
                  (parsed.next[key] === null ||
                    (typeof parsed.next[key] === 'string' && uuid.test(parsed.next[key]))),
              )
            )
              throw new Error('Invalid commerce export');
            commerce = parsed;
          }
          return {
            ...data,
            reports: reports.reports,
            rewards: rewards.rewards,
            adAuthorizations: authorizations.adAuthorizations,
            ...(commerce
              ? {
                  commerce: {
                    wallet: commerce.wallet,
                    purchases: commerce.purchases,
                    spends: commerce.spends,
                    sessions: commerce.sessions,
                    assistedResults: commerce.assistedResults,
                  },
                }
              : {}),
            next: {
              ...data.next,
              report: reports.next,
              reward: rewards.next,
              adAuthorization: authorizations.next,
              ...(commerce ? (commerce.next as object) : {}),
            },
          };
        }
        const result = await connection.query(
          'select cpi_private.prepare_account_deletion($1::uuid) as status',
          [actor.subject],
        );
        return deletionStatus(result.rows[0]?.status);
      });
      if (endpoint === 'export') return reply(prepared);
      const pending = deletionStatus(prepared);
      try {
        const completed = await processAccountDeletion(options, pending.requestId);
        return reply(completed, completed.status === 'deleted' ? 200 : 202);
      } catch {
        // Preparation committed; never lose the receipt or claim a false deletion.
        return reply(pending, 202);
      }
    } catch (error) {
      const code =
        error instanceof Error && safeErrors.has(error.message)
          ? error.message
          : 'service_unavailable';
      return reply({ code }, code === 'service_unavailable' ? 503 : 409);
    }
  };
}
