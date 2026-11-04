import type { AccountSessionOwner } from '../account/session-owner';

export const NAME_REPORT_REASONS = [
  'impersonation',
  'hate_or_harassment',
  'sexual_content',
  'personal_information',
  'spam',
] as const;
export type NameReportReason = (typeof NAME_REPORT_REASONS)[number];
export type NameReportProblem = 'unavailable' | 'rate_limited' | 'account_required' | 'invalid';
export type NameReportResult = { ok: true } | { ok: false; problem: NameReportProblem };
export interface NameReportClient {
  accountScope(): object | null;
  subscribeAccountScope(observer: () => void): () => void;
  submit(
    targetPublicId: string,
    reason: NameReportReason,
    signal: AbortSignal,
  ): Promise<NameReportResult>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** No guest, default endpoint, persistence or client-supplied reporter identity. */
export function createNameReportClient(
  baseUrl: string | undefined,
  session: Pick<
    AccountSessionOwner,
    'withAccountRequest' | 'accountScope' | 'subscribeAccountScope'
  >,
  fetcher: typeof fetch = fetch,
): NameReportClient | null {
  if (!baseUrl) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname === '/' ||
    /\/(auth|rest)\/v1/.test(base.pathname)
  )
    return null;
  const url = base.origin + base.pathname.replace(/\/$/, '') + '/moderation/report';
  return {
    accountScope: () => session.accountScope(),
    subscribeAccountScope: (observer) => session.subscribeAccountScope(observer),
    async submit(targetPublicId, reason, signal) {
      if (
        typeof targetPublicId !== 'string' ||
        !UUID.test(targetPublicId) ||
        !NAME_REPORT_REASONS.includes(reason)
      )
        return { ok: false, problem: 'invalid' };
      try {
        if (signal.aborted) return { ok: false, problem: 'unavailable' };
        const scope = session.accountScope();
        if (scope === null) return { ok: false, problem: 'account_required' };
        return await session.withAccountRequest(async (lease) => {
          const response = await fetcher(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              authorization: 'Bearer ' + lease.accessToken,
            },
            body: JSON.stringify({ schemaVersion: 1, targetPublicId, reason }),
            signal: AbortSignal.any([signal, lease.signal, AbortSignal.timeout(15_000)]),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
          });
          const text = await response.text();
          if (
            text.length > 4096 ||
            signal.aborted ||
            lease.signal.aborted ||
            session.accountScope() !== scope
          )
            return { ok: false, problem: 'unavailable' };
          const body: unknown = JSON.parse(text);
          if (response.ok && object(body) && body.status === 'accepted') return { ok: true };
          const problem: NameReportProblem =
            response.status === 429
              ? 'rate_limited'
              : response.status === 401
                ? 'account_required'
                : response.status === 400
                  ? 'invalid'
                  : 'unavailable';
          return { ok: false, problem };
        });
      } catch {
        return { ok: false, problem: 'unavailable' };
      }
    },
  };
}
