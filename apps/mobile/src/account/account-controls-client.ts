import type { AccountSessionOwner } from './session-owner';
import type { AccountControlsClient } from './account-controls-model';
import { ReauthPrompt } from './reauth-prompt';
import { CAMPAIGN_SERVICES_BUILD } from '../app-profile';
type Purpose = 'export' | 'delete';
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const collections = {
  consent: ['consents', 'id'],
  parental: ['parentalAuthorizations', 'id'],
  run: ['runs', 'runId'],
  result: ['results', 'runId'],
  report: ['reports', 'id'],
  reward: ['rewards', 'id'],
  adAuthorization: ['adAuthorizations', 'id'],
  purchase: ['purchases', 'id'],
  spend: ['spends', 'id'],
  session: ['sessions', 'id'],
  assistedResult: ['assistedResults', 'id'],
  ...(CAMPAIGN_SERVICES_BUILD ? { allocation: ['allocations', 'id'] as const } : {}),
} as const;
/** Own API only, fresh OTP per ceremony, a unique proof per page, and bounded complete export. */
export function createAccountControlsClient(
  baseUrl: string,
  session: AccountSessionOwner,
  fetcher: typeof fetch = fetch,
): AccountControlsClient {
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname === '/'
  )
    throw new Error('Invalid account endpoint');
  const endpoint = base.href.replace(/\/$/, '');
  const reauth = new ReauthPrompt();
  session.subscribeAccountScope(() => reauth.cancel());
  let deletion: { requestId: string; scope: object } | null = null;
  async function post(
    path: string,
    payload: object,
    scope: object | null,
    authenticated = true,
  ): Promise<Record<string, unknown>> {
    if (!scope || session.accountScope() !== scope) throw new Error('Account changed');
    async function send(accessToken?: string, signal?: AbortSignal) {
      const timeout = AbortSignal.timeout(15_000);
      const response = await fetcher(endpoint + '/' + path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}),
        },
        body: JSON.stringify({ schemaVersion: 1, ...payload }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error('Account request unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Account request unavailable');
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let size = 0,
        text = '';
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 524288) throw new Error('Account response too large');
          text += decoder.decode(chunk.value, { stream: true });
        }
        const value: unknown = JSON.parse(text + decoder.decode());
        if (!record(value)) throw new Error('Invalid account response');
        return value;
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    const result = authenticated
      ? await session.withAccountRequest((lease) => send(lease.accessToken, lease.signal))
      : await send();
    if (session.accountScope() !== scope) throw new Error('Account changed');
    return result;
  }
  async function verify(purpose: Purpose, scope: object) {
    await post('reauth/request', { purpose }, scope);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = await reauth.request(purpose, attempt > 0);
      try {
        const value = await post('reauth/verify', { purpose, code }, scope);
        if (typeof value.ceremony !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.ceremony))
          throw new Error('Invalid verification');
        return value.ceremony;
      } catch {
        if (session.accountScope() !== scope) throw new Error('Account changed');
      }
    }
    throw new Error('Verification expired');
  }
  async function proof(ceremony: string, purpose: Purpose, scope: object) {
    const value = await post('reauth/proof', { ceremony, purpose }, scope);
    if (typeof value.proof !== 'string' || value.proof.length > 2048)
      throw new Error('Invalid verification');
    return value.proof;
  }
  return {
    reauth,
    finishDeletion: async () => {
      await session.signOut();
    },
    async exportData() {
      const scope = session.accountScope();
      if (!scope) throw new Error('Account required');
      const ceremony = await verify('export', scope),
        cursor: Record<string, string | null> = {},
        done = new Set<string>(),
        seen = new Map<string, Set<string>>(),
        lists: Record<string, unknown[]> = {};
      for (const [key, [list]] of Object.entries(collections)) {
        cursor[key] = null;
        lists[list] = [];
        seen.set(key, new Set());
      }
      let result: Record<string, unknown> | null = null,
        commerce: Record<string, unknown> | null = null;
      for (let page = 0; page < 101; page++) {
        const value = await post(
          'account/export',
          { reauthProof: await proof(ceremony, 'export', scope), cursor },
          scope,
        );
        if (value.schemaVersion !== 1 || !record(value.next)) throw new Error('Invalid export');
        if (!result) {
          result = {
            schemaVersion: 1,
            exportedAt: value.exportedAt,
            profile: value.profile,
            privateProfile: value.privateProfile,
          };
          commerce = record(value.commerce) ? { wallet: value.commerce.wallet } : null;
        }
        for (const [key, [list, idKey]] of Object.entries(collections)) {
          if (done.has(key)) continue;
          const items = ['purchase', 'spend', 'session', 'assistedResult', 'allocation'].includes(
            key,
          )
            ? record(value.commerce)
              ? value.commerce[list]
              : []
            : value[list];
          if (!Array.isArray(items) || items.length > 100) throw new Error('Invalid export page');
          for (const item of items) {
            if (!record(item) || typeof item[idKey] !== 'string')
              throw new Error('Invalid export item');
            const ids = seen.get(key)!;
            if (!ids.has(item[idKey])) {
              ids.add(item[idKey]);
              lists[list].push(item);
            }
            if (ids.size > 10_000) throw new Error('Export too large');
          }
          const next = value.next[key] ?? null;
          if (next === null) done.add(key);
          else if (
            typeof next !== 'string' ||
            !/^[a-f0-9-]{36}$/.test(next) ||
            cursor[key] === next
          )
            throw new Error('Invalid export cursor');
          cursor[key] = next;
        }
        if (done.size === Object.keys(collections).length) {
          return {
            ...result,
            ...Object.fromEntries(
              Object.entries(lists).filter(
                ([key]) => !['purchases', 'spends', 'sessions', 'assistedResults'].includes(key),
              ),
            ),
            ...(commerce
              ? {
                  commerce: {
                    ...commerce,
                    purchases: lists.purchases,
                    spends: lists.spends,
                    sessions: lists.sessions,
                    assistedResults: lists.assistedResults,
                    ...(CAMPAIGN_SERVICES_BUILD ? { allocations: lists.allocations } : {}),
                  },
                }
              : {}),
            next: Object.fromEntries(Object.keys(collections).map((key) => [key, null])),
          };
        }
      }
      throw new Error('Export has more pages');
    },
    async deleteAccount() {
      const scope = session.accountScope();
      if (!scope) throw new Error('Account required');
      if (deletion?.scope !== scope) deletion = null;
      const value = deletion
        ? await post('account/status', { requestId: deletion.requestId }, scope, false)
        : await post(
            'account/delete',
            { reauthProof: await proof(await verify('delete', scope), 'delete', scope) },
            scope,
          );
      if (
        typeof value.requestId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(value.requestId) ||
        (value.status !== 'deleted' && value.status !== 'revocation_pending')
      )
        throw new Error('Deletion unavailable');
      if (value.status === 'revocation_pending') {
        deletion = { requestId: value.requestId, scope };
        return 'revocation_pending';
      }
      deletion = null;
      // The owner shows the completion response before the next user-requested sign-out/restore.
      return 'deleted';
    },
  };
}
