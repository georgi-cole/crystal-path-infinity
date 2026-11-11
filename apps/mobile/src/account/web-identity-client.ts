import type {
  NativeIdentityClient,
  IdentityProvider,
  ProviderSignIn,
} from './native-identity-client';
import type { AccountSessionOwner } from './session-owner';
import { AccountGatewayError } from './otp-flow';

const base = 'https://crystalpath-api.kolequant.xyz/cpi';
const callback = base + '/identity/web-callback';
const opaque = /^[A-Za-z0-9_-]{43}$/;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function random() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function signInResult(reply: unknown): ProviderSignIn {
  if (record(reply)) {
    if (
      reply.status === 'verified' &&
      typeof reply.verifiedTicket === 'string' &&
      opaque.test(reply.verifiedTicket)
    )
      return {
        status: 'verified',
        ticket: reply.verifiedTicket,
        offerProfile: reply.offerProfile === true,
      };
    if (
      reply.status === 'verify_existing' &&
      typeof reply.linkToken === 'string' &&
      opaque.test(reply.linkToken)
    )
      return { status: 'verify_existing', linkToken: reply.linkToken };
    if (
      reply.status === 'cancelled' ||
      reply.status === 'link_required' ||
      reply.status === 'already_linked' ||
      reply.status === 'signup_unavailable'
    )
      return { status: reply.status };
  }
  throw new AccountGatewayError('unavailable');
}

export function createWebIdentityClient(
  configuredBase: string,
  session: AccountSessionOwner,
): NativeIdentityClient | null {
  if (
    configuredBase !== base ||
    typeof window === 'undefined' ||
    window.location.origin !== 'https://georgi-cole.github.io'
  )
    return null;
  async function request(
    path: string,
    input: object | null,
    signal: AbortSignal,
    accessToken?: string,
  ) {
    const response = await fetch(base + '/identity/' + path, {
      method: input === null ? 'GET' : 'POST',
      headers: {
        ...(input ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
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
    return (await response.json()) as unknown;
  }
  async function ceremony(
    provider: IdentityProvider,
    signal: AbortSignal,
    permit?: string,
    linking = false,
  ) {
    // Open synchronously in the button handler, before the first network request.
    const popup = window.open(
      'about:blank',
      'cpi-sign-in-' + random(),
      'popup,width=500,height=680',
    );
    if (!popup) throw new AccountGatewayError('unavailable');
    const scope = linking ? session.accountScope() : null;
    async function post(path: 'begin' | 'complete', fields: object) {
      const input = {
        schemaVersion: 4,
        provider,
        eligibilityPermit: linking ? null : permit,
        ...fields,
      };
      if (!scope) return request(path, input, signal);
      if (session.accountScope() !== scope) throw new AccountGatewayError('unavailable');
      return session.withAccountRequest(({ accessToken, signal: accountSignal }) =>
        request(path, input, AbortSignal.any([signal, accountSignal]), accessToken),
      );
    }
    try {
      if ((!linking && (!permit || !opaque.test(permit))) || (linking && !scope))
        throw new AccountGatewayError('unavailable');
      const config = await request('config', null, signal);
      const opened = await post('begin', {});
      if (
        !record(config) ||
        !record(opened) ||
        opened.status !== 'ready' ||
        typeof opened.nonce !== 'string' ||
        !opaque.test(opened.nonce) ||
        typeof config.googleClientId !== 'string' ||
        !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(config.googleClientId) ||
        config.appleClientId !== 'com.georgicole.crystalpath.infinity.web'
      )
        throw new AccountGatewayError('unavailable');
      const state = random(),
        verifier = random();
      const challenge = btoa(
        String.fromCharCode(
          ...new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
          ),
        ),
      )
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      const url = new URL(
        provider === 'google'
          ? 'https://accounts.google.com/o/oauth2/v2/auth'
          : 'https://appleid.apple.com/auth/authorize',
      );
      const values: Record<string, string> = {
        client_id: provider === 'google' ? config.googleClientId : config.appleClientId,
        redirect_uri: callback,
        state,
        nonce: opened.nonce,
        response_type: provider === 'google' ? 'code' : 'code id_token',
        scope: provider === 'google' ? 'openid email profile' : 'name email',
      };
      if (provider === 'google')
        Object.assign(values, {
          code_challenge: challenge,
          code_challenge_method: 'S256',
          prompt: 'select_account',
        });
      else values.response_mode = 'form_post';
      for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
      const credential = await new Promise<Record<string, string> | null>((resolve, reject) => {
        const finish = (value: Record<string, string> | null, error?: Error) => {
          clearInterval(interval);
          window.removeEventListener('message', received);
          signal.removeEventListener('abort', aborted);
          if (error) reject(error);
          else resolve(value);
        };
        const aborted = () => finish(null, new AccountGatewayError('unavailable'));
        const received = (event: MessageEvent) => {
          if (
            event.origin !== new URL(base).origin ||
            event.source !== popup ||
            !record(event.data) ||
            event.data.type !== 'cpi-web-identity' ||
            event.data.state !== state
          )
            return;
          if (event.data.error === 'access_denied') return finish(null);
          if (typeof event.data.code !== 'string')
            return finish(null, new AccountGatewayError('unavailable'));
          if (provider === 'google') finish({ code: event.data.code, verifier });
          else if (typeof event.data.id_token === 'string')
            finish({ identityToken: event.data.id_token, code: event.data.code });
          else finish(null, new AccountGatewayError('unavailable'));
        };
        window.addEventListener('message', received);
        signal.addEventListener('abort', aborted, { once: true });
        const deadline = Date.now() + 5 * 60_000;
        const interval = setInterval(() => {
          if (popup.closed || Date.now() > deadline) finish(null);
        }, 500);
        if (signal.aborted) return aborted();
        popup.location.href = url.href;
      });
      return credential
        ? await post('complete', { nonce: opened.nonce, credential })
        : { status: 'cancelled' };
    } finally {
      popup.close();
    }
  }
  return {
    requiresEligibility: true,
    async signIn(provider, signal, permit) {
      return signInResult(await ceremony(provider, signal, permit));
    },
    async requestLinkCode(linkToken, signal) {
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
      return signInResult(
        await request('link/verify', { schemaVersion: 1, linkToken, code }, signal),
      );
    },
    async link(provider, signal) {
      const reply = await ceremony(provider, signal, undefined, true);
      if (
        record(reply) &&
        (reply.status === 'linked' ||
          reply.status === 'already_linked' ||
          reply.status === 'cancelled')
      )
        return reply.status;
      throw new AccountGatewayError('unavailable');
    },
  };
}
