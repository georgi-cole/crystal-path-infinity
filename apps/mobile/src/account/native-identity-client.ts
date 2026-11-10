import { Capacitor, registerPlugin } from '@capacitor/core';
import { STAGING_ACCOUNT_GATEWAY } from '../../config/environments';
import { AccountGatewayError } from './otp-flow';
import type { AccountSessionOwner } from './session-owner';

export type IdentityProvider = 'apple' | 'google';
export type ProviderSignIn =
  | { status: 'verified'; ticket: string; offerProfile: boolean }
  | { status: 'verify_existing'; linkToken: string }
  | { status: 'cancelled' | 'link_required' | 'signup_unavailable' | 'already_linked' };
export type ProviderLink = 'linked' | 'cancelled' | 'already_linked';
export interface NativeIdentityClient {
  signIn(provider: IdentityProvider, signal: AbortSignal): Promise<ProviderSignIn>;
  requestLinkCode(linkToken: string, signal: AbortSignal): Promise<{ resendAt: number }>;
  verifyLinkCode(linkToken: string, code: string, signal: AbortSignal): Promise<ProviderSignIn>;
  link(provider: IdentityProvider, signal: AbortSignal): Promise<ProviderLink>;
}

interface CpiIdentityPlugin {
  authorize(options: {
    provider: IdentityProvider;
    nonce: string;
    requestName: boolean;
  }): Promise<unknown>;
}
const bridge = registerPlugin<CpiIdentityPlugin>('CpiIdentity');
export { STAGING_ACCOUNT_GATEWAY };
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Only the internal iPhone build points this client at its approved account gateway. */
export function createNativeIdentityClient(
  base: string,
  session: AccountSessionOwner,
  clientBuild: number,
): NativeIdentityClient | null {
  if (
    base !== STAGING_ACCOUNT_GATEWAY ||
    Capacitor.getPlatform() !== 'ios' ||
    !Capacitor.isPluginAvailable('CpiIdentity') ||
    !Number.isInteger(clientBuild) ||
    clientBuild < 1 ||
    clientBuild > 2147483647
  )
    return null;

  async function request(
    path: 'begin' | 'complete' | 'link/request' | 'link/verify',
    fields: object,
    signal: AbortSignal,
    accessToken?: string,
  ): Promise<unknown> {
    const response = await fetch(base + '/identity/' + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}),
      },
      body: JSON.stringify(fields),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (response.status === 403 && path === 'begin' && !accessToken)
      return { status: 'signup_unavailable' };
    if (!response.ok)
      throw new AccountGatewayError(
        response.status === 429
          ? 'rate_limited'
          : response.status === 410
            ? 'expired'
            : response.status === 401 && path === 'link/verify'
              ? 'invalid_code'
              : 'unavailable',
      );
    return (await response.json()) as unknown;
  }

  async function ceremony(
    provider: IdentityProvider,
    linking: boolean,
    signal: AbortSignal,
  ): Promise<unknown> {
    const scope = linking ? session.accountScope() : null;
    if (linking && !scope) throw new Error('Account required');
    async function post(path: 'begin' | 'complete', fields: object) {
      if (signal.aborted) throw new Error('Sign-in cancelled');
      const schemaVersion = path === 'begin' ? (linking ? 1 : 2) : linking ? 2 : 3;
      const input = { schemaVersion, provider, ...fields };
      if (!scope) return request(path, input, signal);
      if (session.accountScope() !== scope) throw new Error('Account changed');
      return session.withAccountRequest(({ accessToken, signal: accountSignal }) =>
        request(path, input, AbortSignal.any([signal, accountSignal]), accessToken),
      );
    }

    const opened = await post('begin', linking ? { eligibilityPermit: null } : { clientBuild });
    if (record(opened) && opened.status === 'signup_unavailable') return opened;
    if (
      !record(opened) ||
      opened.status !== 'ready' ||
      typeof opened.nonce !== 'string' ||
      !opaqueToken.test(opened.nonce)
    )
      throw new Error('Invalid sign-in challenge');
    if (signal.aborted) throw new Error('Sign-in cancelled');
    const reply = await bridge.authorize({ provider, nonce: opened.nonce, requestName: !linking });
    if (signal.aborted) throw new Error('Sign-in cancelled');
    if (record(reply) && reply.status === 'cancelled') return reply;
    if (!record(reply) || reply.status !== 'authorized' || !record(reply.credential))
      throw new Error('Invalid sign-in response');
    return post('complete', { nonce: opened.nonce, credential: reply.credential });
  }
  function signInResult(reply: unknown): ProviderSignIn {
    if (record(reply)) {
      if (
        reply.status === 'link_required' ||
        reply.status === 'cancelled' ||
        reply.status === 'already_linked' ||
        reply.status === 'signup_unavailable'
      )
        return { status: reply.status };
      if (
        reply.status === 'verified' &&
        typeof reply.verifiedTicket === 'string' &&
        opaqueToken.test(reply.verifiedTicket)
      )
        return {
          status: 'verified',
          ticket: reply.verifiedTicket,
          offerProfile: reply.offerProfile === true,
        };
      if (
        reply.status === 'verify_existing' &&
        typeof reply.linkToken === 'string' &&
        opaqueToken.test(reply.linkToken)
      )
        return { status: 'verify_existing', linkToken: reply.linkToken };
    }
    throw new Error('Sign-in unavailable');
  }

  return {
    async signIn(provider, signal) {
      return signInResult(await ceremony(provider, false, signal));
    },
    async requestLinkCode(linkToken, signal) {
      if (!opaqueToken.test(linkToken)) throw new Error('Invalid verification request');
      const reply = await request('link/request', { schemaVersion: 1, linkToken }, signal);
      if (
        !record(reply) ||
        reply.status !== 'accepted' ||
        typeof reply.resendAt !== 'number' ||
        !Number.isSafeInteger(reply.resendAt)
      )
        throw new Error('Verification unavailable');
      return { resendAt: reply.resendAt };
    },
    async verifyLinkCode(linkToken, code, signal) {
      if (!opaqueToken.test(linkToken) || !/^\d{6}$/.test(code))
        throw new Error('Invalid verification request');
      return signInResult(
        await request('link/verify', { schemaVersion: 1, linkToken, code }, signal),
      );
    },
    async link(provider, signal) {
      const reply = await ceremony(provider, true, signal);
      if (
        record(reply) &&
        (reply.status === 'linked' ||
          reply.status === 'cancelled' ||
          reply.status === 'already_linked')
      )
        return reply.status;
      throw new Error('Link unavailable');
    },
  };
}
