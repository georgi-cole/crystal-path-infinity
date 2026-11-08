import type { AccountSessionOwner } from '../account/session-owner';
export interface SavedPendingCursor {
  readonly createdAt: string;
  readonly runId: string;
}
export interface SavedPendingEntry {
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly status: 'dead' | 'verification_pending';
  readonly lastClearedRow: string;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly rewardPending: boolean;
  readonly createdAt: string;
}
export interface SavedPendingPage {
  readonly status: 'saved';
  readonly runs: readonly SavedPendingEntry[];
  readonly next: SavedPendingCursor | null;
}
export interface SavedPendingClient {
  accountScope(): object | null;
  subscribeAccountScope(observer: () => void): () => void;
  read(after: SavedPendingCursor | null, signal: AbortSignal): Promise<SavedPendingPage>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}
function date(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    !value.startsWith('0000-') &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
function cursor(value: unknown): value is SavedPendingCursor {
  return (
    object(value, ['createdAt', 'runId']) &&
    date(value.createdAt) &&
    typeof value.runId === 'string' &&
    UUID.test(value.runId)
  );
}
function instant(value: string) {
  return value.replace(
    /(?:\.(\d+))?Z$/,
    (_match: string, digits: string | undefined) => '.' + (digits ?? '').padEnd(6, '0') + 'Z',
  );
}
function before(a: SavedPendingCursor, b: SavedPendingCursor) {
  const timeA = instant(a.createdAt);
  const timeB = instant(b.createdAt);
  return timeA < timeB || (timeA === timeB && a.runId.toLowerCase() < b.runId.toLowerCase());
}
export function parseSavedPendingPage(
  value: unknown,
  after: SavedPendingCursor | null = null,
): SavedPendingPage | null {
  if (
    !object(value, ['status', 'runs', 'next']) ||
    value.status !== 'saved' ||
    !Array.isArray(value.runs) ||
    value.runs.length > 20 ||
    (value.next !== null && !cursor(value.next))
  )
    return null;
  const runs: SavedPendingEntry[] = [];
  for (const raw of value.runs) {
    if (
      !object(raw, [
        'runId',
        'rulesetVersion',
        'status',
        'lastClearedRow',
        'revivesGranted',
        'revivesApplied',
        'rewardPending',
        'createdAt',
      ]) ||
      typeof raw.runId !== 'string' ||
      !UUID.test(raw.runId) ||
      typeof raw.rulesetVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(raw.rulesetVersion) ||
      (raw.status !== 'dead' && raw.status !== 'verification_pending') ||
      typeof raw.lastClearedRow !== 'string' ||
      raw.lastClearedRow.length > 1000 ||
      !/^(0|[1-9][0-9]*)$/.test(raw.lastClearedRow) ||
      typeof raw.revivesGranted !== 'number' ||
      !Number.isInteger(raw.revivesGranted) ||
      raw.revivesGranted < 0 ||
      raw.revivesGranted > (raw.rulesetVersion === 'infinity-v11-live' ? 15 : 10) ||
      typeof raw.revivesApplied !== 'number' ||
      !Number.isInteger(raw.revivesApplied) ||
      raw.revivesApplied < 0 ||
      raw.revivesApplied > raw.revivesGranted ||
      raw.rewardPending !== (raw.status === 'verification_pending') ||
      !date(raw.createdAt)
    )
      return null;
    const row: SavedPendingEntry = {
      runId: raw.runId.toLowerCase(),
      rulesetVersion: raw.rulesetVersion,
      status: raw.status,
      lastClearedRow: raw.lastClearedRow,
      revivesGranted: raw.revivesGranted,
      revivesApplied: raw.revivesApplied,
      rewardPending: raw.rewardPending,
      createdAt: raw.createdAt,
    };
    if (
      (after && !before(row, after)) ||
      (runs.length > 0 && !before(row, runs.at(-1)!)) ||
      runs.some((r) => r.runId === row.runId)
    )
      return null;
    runs.push(row);
  }
  const last = runs.at(-1);
  if (
    value.next !== null &&
    (!last ||
      value.next.createdAt !== last.createdAt ||
      value.next.runId.toLowerCase() !== last.runId)
  )
    return null;
  return {
    status: 'saved',
    runs,
    next:
      value.next === null
        ? null
        : { createdAt: value.next.createdAt, runId: value.next.runId.toLowerCase() },
  };
}
/** Synchronous render fence for private saved-run associations. */
export function savedPendingForAccount(
  page: SavedPendingPage | null,
  loaded: object | null,
  current: object | null,
): SavedPendingPage | null {
  return current !== null && loaded === current ? page : null;
}
export function createSavedPendingClient(
  baseUrl: string | undefined,
  session: Pick<
    AccountSessionOwner,
    'withAccountRequest' | 'accountScope' | 'subscribeAccountScope'
  >,
  fetcher: typeof fetch = fetch,
): SavedPendingClient | null {
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
    /\/(auth|rest)\/v1/.test(base.pathname)
  )
    return null;
  const url = base.origin + base.pathname.replace(/\/$/, '') + '/ranked/saved';
  return {
    accountScope: () => session.accountScope(),
    subscribeAccountScope: (observer) => session.subscribeAccountScope(observer),
    async read(after, signal) {
      try {
        if (signal.aborted || (after !== null && !cursor(after))) throw new Error();
        return await session.withAccountRequest(async (lease) => {
          const response = await fetcher(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              authorization: 'Bearer ' + lease.accessToken,
            },
            body: JSON.stringify({ after }),
            signal: AbortSignal.any([signal, lease.signal, AbortSignal.timeout(8000)]),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
          });
          if (!response.ok) throw new Error();
          const reader = response.body?.getReader();
          if (!reader) throw new Error();
          let text = '';
          let bytes = 0;
          const decoder = new TextDecoder('utf-8', { fatal: true });
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 65536) {
                await reader.cancel();
                throw new Error();
              }
              text += decoder.decode(chunk.value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            reader.releaseLock();
          }
          const parsed = parseSavedPendingPage(JSON.parse(text) as unknown, after);
          if (!parsed || signal.aborted || lease.signal.aborted) throw new Error();
          return parsed;
        });
      } catch {
        throw new Error('Saved attempts unavailable');
      }
    },
  };
}
