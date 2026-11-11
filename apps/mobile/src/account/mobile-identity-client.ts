import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  IdentityProvider,
  NativeIdentityClient,
  ProviderSignIn,
} from './native-identity-client';
import type { AccountSessionOwner } from './session-owner';
import { AccountGatewayError } from './otp-flow';

const production = 'https://crystalpath-api.kolequant.xyz/cpi';
const staging = 'https://crystal-path-staging-api.kolequant.workers.dev/cpi';
const opaque = /^[A-Za-z0-9_-]{43}$/;
const bridge = registerPlugin<{
  openProduction(options: {
    url: string;
    state: string;
  }): Promise<{ status: 'returned' | 'cancelled' }>;
}>('CpiIdentity');
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function result(value: unknown): ProviderSignIn {
  if (record(value)) {
    if (
      value.status === 'verified' &&
      typeof value.verifiedTicket === 'string' &&
      opaque.test(value.verifiedTicket)
    )
      return {
        status: 'verified',
        ticket: value.verifiedTicket,
        offerProfile: value.offerProfile === true,
      };
    if (
      value.status === 'verify_existing' &&
      typeof value.linkToken === 'string' &&
      opaque.test(value.linkToken)
    )
      return { status: 'verify_existing', linkToken: value.linkToken };
    if (
      value.status === 'cancelled' ||
      value.status === 'link_required' ||
      value.status === 'signup_unavailable' ||
      value.status === 'already_linked'
    )
      return { status: value.status };
  }
  throw new AccountGatewayError('unavailable');
}
/** Real production accounts only. The system browser never receives a game session. */
export function createMobileIdentityClient(
  base: string,
  session: AccountSessionOwner,
  options: { allowStaging?: boolean } = {},
): NativeIdentityClient | null {
  if (
    (base !== production && !(base === staging && options.allowStaging === true)) ||
    !['ios', 'android'].includes(Capacitor.getPlatform()) ||
    !Capacitor.isPluginAvailable('CpiIdentity')
  )
    return null;
  async function request(
    path: string,
    input: object,
    signal: AbortSignal,
    accessToken?: string,
  ): Promise<unknown> {
    const response = await fetch(base + '/identity/' + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!response.ok)
      throw new AccountGatewayError(
        response.status === 429
          ? 'rate_limited'
          : response.status === 410
            ? 'expired'
            : response.status === 401
              ? 'invalid_code'
              : 'unavailable',
      );
    return response.json() as Promise<unknown>;
  }
  async function ceremony(
    provider: IdentityProvider,
    signal: AbortSignal,
    permit?: string,
    linking = false,
  ) {
    const scope = linking ? session.accountScope() : null;
    if ((linking && !scope) || (!linking && (!permit || !opaque.test(permit))))
      throw new AccountGatewayError('unavailable');
    async function post(path: string, input: object) {
      if (signal.aborted) throw new AccountGatewayError('unavailable');
      if (!scope) return request(path, input, signal);
      if (session.accountScope() !== scope) throw new AccountGatewayError('unavailable');
      return session.withAccountRequest(({ accessToken, signal: accountSignal }) =>
        request(path, input, AbortSignal.any([signal, accountSignal]), accessToken),
      );
    }
    const eligibilityPermit = linking ? null : permit;
    const begin = await post('mobile/begin', { provider, eligibilityPermit });
    if (
      !record(begin) ||
      begin.status !== 'ready' ||
      typeof begin.flowToken !== 'string' ||
      !opaque.test(begin.flowToken) ||
      typeof begin.state !== 'string' ||
      !opaque.test(begin.state) ||
      typeof begin.url !== 'string'
    )
      throw new AccountGatewayError('unavailable');
    const url = new URL(begin.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      !(
        (url.hostname === 'accounts.google.com' && url.pathname === '/o/oauth2/v2/auth') ||
        (url.hostname === 'appleid.apple.com' && url.pathname === '/auth/authorize')
      ) ||
      begin.url.length > 8192 ||
      url.searchParams.getAll('state').length !== 1 ||
      url.searchParams.getAll('redirect_uri').length !== 1 ||
      url.searchParams.get('state') !== begin.state ||
      url.searchParams.get('redirect_uri') !== base + '/identity/mobile/callback'
    )
      throw new AccountGatewayError('unavailable');
    const returned = await bridge.openProduction({ url: begin.url, state: begin.state });
    if (returned.status === 'cancelled') return { status: 'cancelled' };
    if (returned.status !== 'returned') throw new AccountGatewayError('unavailable');
    return post('mobile/complete', { flowToken: begin.flowToken, eligibilityPermit });
  }
  return {
    requiresEligibility: true,
    async signIn(provider, signal, permit) {
      return result(await ceremony(provider, signal, permit));
    },
    async link(provider, signal) {
      const value = await ceremony(provider, signal, undefined, true);
      if (
        record(value) &&
        (value.status === 'linked' ||
          value.status === 'already_linked' ||
          value.status === 'cancelled')
      )
        return value.status;
      throw new AccountGatewayError('unavailable');
    },
    async requestLinkCode(linkToken, signal) {
      if (!opaque.test(linkToken)) throw new AccountGatewayError('unavailable');
      const reply = await request('link/request', { schemaVersion: 1, linkToken }, signal);
      if (
        !record(reply) ||
        reply.status !== 'accepted' ||
        typeof reply.resendAt !== 'number' ||
        !Number.isSafeInteger(reply.resendAt)
      )
        throw new AccountGatewayError('unavailable');
      return { resendAt: reply.resendAt };
    },
    async verifyLinkCode(linkToken, code, signal) {
      if (!opaque.test(linkToken) || !/^\d{6}$/.test(code))
        throw new AccountGatewayError('invalid_code');
      return result(await request('link/verify', { schemaVersion: 1, linkToken, code }, signal));
    },
  };
}
