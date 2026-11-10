import { RefreshCredentialRejected, type SessionTransport } from './session-owner';

type Fetcher = typeof fetch;

/**
 * Session tokens are sent only in JSON POST bodies to a trusted account API,
 * never in links, query strings, browser storage, logs, or raw Supabase Auth.
 */
export function createSessionTransport(
  configuredBase: string | undefined,
  fetcher: Fetcher = fetch,
): SessionTransport | null {
  if (!configuredBase) return null;
  let base: URL;
  try {
    base = new URL(configuredBase);
  } catch {
    return null;
  }
  if (
    base.protocol !== 'https:' ||
    !base.hostname ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname === '/' ||
    base.pathname.includes('..') ||
    base.pathname.includes('/auth/v1') ||
    base.pathname.includes('/rest/v1')
  ) {
    return null;
  }
  const path = base.pathname.replace(/\/$/, '');

  async function post(
    endpoint: 'exchange' | 'refresh' | 'revoke',
    payload: object,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = endpoint === 'refresh' ? setTimeout(() => controller.abort(), 10_000) : null;
    try {
      let response: Response;
      try {
        response = await fetcher(base.origin + path + '/session/' + endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ schemaVersion: 1, ...payload }),
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch {
        throw new Error('Account session service unavailable.');
      }
      if (endpoint === 'refresh' && response.status === 401) {
        const failure = (await response.json().catch(() => null)) as { code?: unknown } | null;
        if (failure?.code === 'invalid_code') throw new RefreshCredentialRejected();
      }
      if (response.ok) {
        try {
          return (await response.json()) as unknown;
        } catch {
          // Malformed responses share the same redacted error as a failed request.
        }
      }
      throw new Error('Account session service unavailable.');
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  }

  return {
    exchange: (ticket) => post('exchange', { verifiedTicket: ticket }),
    refresh: (refreshToken) => post('refresh', { refreshToken }),
    revoke: (refreshToken) => post('revoke', { refreshToken }),
  };
}
