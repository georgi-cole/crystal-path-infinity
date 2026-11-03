import type { SessionTransport } from './session-owner';

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

  async function post(endpoint: 'exchange' | 'refresh' | 'revoke', payload: object): Promise<unknown> {
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
      });
    } catch {
      throw new Error('Account session service unavailable.');
    }
    if (!response.ok) {
      // Do not forward response text, account existence, tokens, or raw provider errors.
      throw new Error('Account session service unavailable.');
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new Error('Account session service unavailable.');
    }
  }

  return {
    exchange: (ticket) => post('exchange', { verifiedTicket: ticket }),
    refresh: (refreshToken) => post('refresh', { refreshToken }),
    revoke: (refreshToken) => post('revoke', { refreshToken }),
  };
}
