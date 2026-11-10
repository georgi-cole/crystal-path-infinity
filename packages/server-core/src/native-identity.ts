import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';
import { exactObject, isObject, providerJson } from './private-services.ts';

export type NativeIdentityProvider = 'apple' | 'google';
export function isNativeIdentityProvider(value: unknown): value is NativeIdentityProvider {
  return value === 'apple' || value === 'google';
}
export interface VerifiedNativeIdentity {
  readonly subject: string;
  readonly signupEmail?: string;
  readonly displayName?: string;
  readonly appleRefresh?: () => Promise<string>;
}
export interface NativeIdentity {
  verify(
    provider: NativeIdentityProvider,
    credential: unknown,
    nonce: string,
  ): Promise<VerifiedNativeIdentity>;
  revokeApple(refreshToken: string, signal: AbortSignal): Promise<void>;
}

export class NativeIdentityRejected extends Error {
  constructor() {
    super('Identity proof rejected');
  }
}

const appleIssuer = 'https://appleid.apple.com';
const googleIssuer = 'https://accounts.google.com';
const claimsSegment = /^[A-Za-z0-9_-]+$/;
const authorizationCode = /^[!-~]{8,2048}$/;
const pkceVerifier = /^[A-Za-z0-9._~-]{43,128}$/;

function providerDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 160 || /[@\p{C}]/u.test(value)) return undefined;
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  return name.length <= 48 && !name.includes('@') && /[\p{L}\p{N}]/u.test(name) ? name : undefined;
}

export function googleIosRedirect(clientId: string) {
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId))
    throw new Error('Expected a Google iOS client ID');
  return clientId.split('.').reverse().join('.') + ':/oauth2redirect';
}

function requiredString(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new NativeIdentityRejected();
  return value;
}

function decode(segment: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (isObject(value)) return value;
  } catch {
    // Every malformed token follows the same public error path.
  }
  throw new NativeIdentityRejected();
}

export function createNativeIdentity(options: {
  apple: { clientId: string; teamId: string; keyId: string; privateKey: string };
  googleClientId: string;
  fetcher?: typeof fetch;
  now?: () => number;
}): NativeIdentity {
  const { apple, googleClientId, fetcher = fetch, now = Date.now } = options;
  const redirect = googleIosRedirect(googleClientId);
  if (!/^[A-Z0-9]{10}$/.test(apple.teamId) || !/^[A-Z0-9]{10}$/.test(apple.keyId))
    throw new Error('Invalid Apple sign-in configuration');
  const appleKey = createPrivateKey(apple.privateKey);
  if (
    appleKey.asymmetricKeyType !== 'ec' ||
    !['prime256v1', 'p256', 'P-256'].includes(appleKey.asymmetricKeyDetails?.namedCurve ?? '')
  )
    throw new Error('Expected an Apple sign-in signing key');

  const settings = {
    apple: { issuer: appleIssuer, audience: apple.clientId, jwks: appleIssuer + '/auth/keys' },
    google: {
      issuer: googleIssuer,
      audience: googleClientId,
      jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    },
  };

  async function verifyToken(
    provider: NativeIdentityProvider,
    input: unknown,
    expectedNonce: string | null,
  ): Promise<VerifiedNativeIdentity> {
    if (typeof input !== 'string' || input.length > 8192) throw new NativeIdentityRejected();
    const parts = input.split('.');
    if (parts.length !== 3 || !parts.every((part) => claimsSegment.test(part)))
      throw new NativeIdentityRejected();
    const [header, claims, signature] = parts as [string, string, string];
    const descriptor = decode(header);
    if (descriptor.alg !== 'RS256' || descriptor.crit !== undefined)
      throw new NativeIdentityRejected();
    const kid = requiredString(descriptor.kid, /^[A-Za-z0-9_-]{1,128}$/);
    const value = decode(claims);
    const { issuer, audience, jwks } = settings[provider];
    const time = Math.floor(now() / 1000);
    if (
      (value.iss !== issuer && !(provider === 'google' && value.iss === 'accounts.google.com')) ||
      value.aud !== audience ||
      (value.azp !== undefined && value.azp !== audience) ||
      typeof value.exp !== 'number' ||
      !Number.isSafeInteger(value.exp) ||
      value.exp <= time ||
      typeof value.iat !== 'number' ||
      !Number.isSafeInteger(value.iat) ||
      value.iat < time - 600 ||
      value.iat > time + 60 ||
      (expectedNonce !== null && value.nonce !== expectedNonce)
    )
      throw new NativeIdentityRejected();
    const subject = requiredString(value.sub, /^[A-Za-z0-9._-]{1,255}$/);
    const body = await providerJson(jwks, {}, fetcher);
    if (!isObject(body) || !Array.isArray(body.keys) || body.keys.length > 32)
      throw new Error('Provider keys unavailable');
    const key = (body.keys as unknown[]).find(
      (item) =>
        isObject(item) &&
        item.kid === kid &&
        item.kty === 'RSA' &&
        (item.alg === undefined || item.alg === 'RS256') &&
        (item.use === undefined || item.use === 'sig'),
    );
    if (!isObject(key) || typeof key.n !== 'string' || typeof key.e !== 'string')
      throw new NativeIdentityRejected();
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: key.n, e: key.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        Uint8Array.from(Buffer.from(signature, 'base64url')),
        new TextEncoder().encode(header + '.' + claims),
      ))
    )
      throw new NativeIdentityRejected();
    const address = typeof value.email === 'string' ? value.email : null;
    const confirmed =
      value.email_verified === true || (provider === 'apple' && value.email_verified === 'true');
    const providerOwnsEmail =
      provider === 'apple' ||
      address?.toLowerCase().endsWith('@gmail.com') ||
      (typeof value.hd === 'string' && value.hd.length > 0);
    // A verified third-party Google address may have changed owners since it was verified.
    const displayName = provider === 'google' ? providerDisplayName(value.name) : undefined;
    return {
      subject,
      ...(address && confirmed && providerOwnsEmail ? { signupEmail: address } : {}),
      ...(displayName ? { displayName } : {}),
    };
  }

  function appleSecret() {
    const iat = Math.floor(now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input =
      encode({ alg: 'ES256', kid: apple.keyId }) +
      '.' +
      encode({
        iss: apple.teamId,
        iat,
        exp: iat + 300,
        aud: appleIssuer,
        sub: apple.clientId,
      });
    return (
      input +
      '.' +
      sign('sha256', Buffer.from(input), {
        key: appleKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
    );
  }

  function exchange(url: string, form: Record<string, string>) {
    return providerJson(
      url,
      {
        method: 'POST',
        body: new URLSearchParams(form),
        headers: { accept: 'application/json' },
      },
      fetcher,
    );
  }

  return {
    async verify(provider, credential, nonce) {
      if (provider === 'google') {
        if (!exactObject(credential, ['code', 'verifier'])) throw new NativeIdentityRejected();
        const result = await exchange('https://oauth2.googleapis.com/token', {
          grant_type: 'authorization_code',
          client_id: googleClientId,
          redirect_uri: redirect,
          code: requiredString(credential.code, authorizationCode),
          code_verifier: requiredString(credential.verifier, pkceVerifier),
        });
        if (!isObject(result)) throw new NativeIdentityRejected();
        return verifyToken('google', result.id_token, nonce);
      }
      if (
        !exactObject(credential, ['identityToken', 'code']) &&
        !exactObject(credential, ['identityToken', 'code', 'displayName'])
      )
        throw new NativeIdentityRejected();
      const proof = await verifyToken('apple', credential.identityToken, nonce);
      const code = requiredString(credential.code, authorizationCode);
      const displayName = providerDisplayName(credential.displayName);
      return {
        ...proof,
        ...(displayName ? { displayName } : {}),
        async appleRefresh() {
          const result = await exchange(appleIssuer + '/auth/token', {
            grant_type: 'authorization_code',
            client_id: apple.clientId,
            client_secret: appleSecret(),
            code,
          });
          if (
            !isObject(result) ||
            (await verifyToken('apple', result.id_token, null)).subject !== proof.subject
          )
            throw new NativeIdentityRejected();
          return requiredString(result.refresh_token, /^[!-~]{8,4096}$/);
        },
      };
    },
    async revokeApple(refreshToken, signal) {
      const response = await fetcher(appleIssuer + '/auth/revoke', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: apple.clientId,
          client_secret: appleSecret(),
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('Apple revocation unavailable');
    },
  };
}
