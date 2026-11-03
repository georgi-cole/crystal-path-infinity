import { AccountGatewayError } from './otp-flow';
import type { OtpGateway } from './otp-flow';

type Fetcher = typeof fetch;

/**
 * All email-bearing requests go to our future trusted account endpoint,
 * NEVER directly to Supabase's publicly callable /auth/v1/otp.
 * The server must enforce consent/guardian checks and verify the permit again.
 */
export function createOtpGateway(
  configuredBase: string | undefined,
  fetcher: Fetcher = fetch,
): OtpGateway | null {
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
    base.pathname.endsWith('/auth/v1')
  ) {
    return null;
  }
  const path = base.pathname.replace(/\/$/, '');
  async function post(endpoint: 'eligibility' | 'otp/request' | 'otp/verify', payload: object) {
    let response: Response;
    try {
      response = await fetcher(base.origin + path + '/' + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new AccountGatewayError('unavailable');
    }
    if (!response.ok) {
      if (response.status === 429) throw new AccountGatewayError('rate_limited');
      if (response.status === 410) throw new AccountGatewayError('expired');
      if (response.status === 400 || response.status === 401) {
        throw new AccountGatewayError('invalid_code');
      }
      throw new AccountGatewayError('unavailable');
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AccountGatewayError('unavailable');
    }
  }
  return {
    eligibility: () => post('eligibility', { schemaVersion: 1 }),
    requestCode: (email, permit) =>
      post('otp/request', { schemaVersion: 1, email, eligibilityPermit: permit }),
    verifyCode: (email, code, permit) =>
      post('otp/verify', { schemaVersion: 1, email, code, eligibilityPermit: permit }),
  };
}
