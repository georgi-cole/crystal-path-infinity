import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AccountSessionOwner } from './session-owner';

export type IdentityProvider = 'apple' | 'google';
export type ProviderSignIn =
  | { status: 'verified'; ticket: string }
  | { status: 'signup_available'; signupToken: string }
  | { status: 'cancelled' | 'link_required' | 'signup_unavailable' };
export type ProviderLink = 'linked' | 'cancelled' | 'already_linked';
export interface NativeIdentityClient {
  signIn(provider: IdentityProvider, permit: string, signal: AbortSignal): Promise<ProviderSignIn>;
  signUp(signupToken: string, signal: AbortSignal): Promise<ProviderSignIn>;
  link(provider: IdentityProvider, signal: AbortSignal): Promise<ProviderLink>;
}

interface CpiIdentityPlugin {
  authorize(options: { provider: IdentityProvider; nonce: string }): Promise<unknown>;
}
const bridge = registerPlugin<CpiIdentityPlugin>('CpiIdentity');
export const STAGING_ACCOUNT_GATEWAY = 'https://crystal-path-staging-api.kolequant.workers.dev/cpi';
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Only the internal iPhone build points this client at its approved account gateway. */
export function createNativeIdentityClient(
  base: string,
  session: AccountSessionOwner,
): NativeIdentityClient | null {
  if (
    base !== STAGING_ACCOUNT_GATEWAY ||
    Capacitor.getPlatform() !== 'ios' ||
    !Capacitor.isPluginAvailable('CpiIdentity')
  )
    return null;

  async function request(
    path: 'begin' | 'complete' | 'signup',
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
      signal,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Sign-in request unavailable');
    return (await response.json()) as unknown;
  }

  async function ceremony(
    provider: IdentityProvider,
    permit: string | null,
    signal: AbortSignal,
  ): Promise<unknown> {
    const scope = permit === null ? session.accountScope() : null;
    if (permit === null && !scope) throw new Error('Account required');
    async function post(path: 'begin' | 'complete', fields: object) {
      if (signal.aborted) throw new Error('Sign-in cancelled');
      const input = { schemaVersion: path === 'complete' ? 2 : 1, provider, ...fields };
      if (!scope) return request(path, input, signal);
      if (session.accountScope() !== scope) throw new Error('Account changed');
      return session.withAccountRequest(({ accessToken, signal: accountSignal }) =>
        request(path, input, AbortSignal.any([signal, accountSignal]), accessToken),
      );
    }

    const opened = await post('begin', { eligibilityPermit: permit });
    if (
      !record(opened) ||
      opened.status !== 'ready' ||
      typeof opened.nonce !== 'string' ||
      !opaqueToken.test(opened.nonce)
    )
      throw new Error('Invalid sign-in challenge');
    if (signal.aborted) throw new Error('Sign-in cancelled');
    const reply = await bridge.authorize({ provider, nonce: opened.nonce });
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
        reply.status === 'signup_unavailable'
      )
        return { status: reply.status };
      if (
        reply.status === 'verified' &&
        typeof reply.verifiedTicket === 'string' &&
        opaqueToken.test(reply.verifiedTicket)
      )
        return { status: 'verified', ticket: reply.verifiedTicket };
      if (
        reply.status === 'signup_available' &&
        typeof reply.signupToken === 'string' &&
        opaqueToken.test(reply.signupToken)
      )
        return { status: 'signup_available', signupToken: reply.signupToken };
    }
    throw new Error('Sign-in unavailable');
  }

  return {
    async signIn(provider, permit, signal) {
      return signInResult(await ceremony(provider, permit, signal));
    },
    async signUp(signupToken, signal) {
      if (!opaqueToken.test(signupToken)) throw new Error('Invalid signup request');
      return signInResult(await request('signup', { schemaVersion: 1, signupToken }, signal));
    },
    async link(provider, signal) {
      const reply = await ceremony(provider, null, signal);
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
