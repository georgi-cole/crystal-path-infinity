import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createNativeIdentity,
  googleIosRedirect,
  NativeIdentityRejected,
} from '../src/native-identity';

const google = '1000000-iosfixture.apps.googleusercontent.com';
const bundle = 'com.georgicole.crystalpath.infinity';
const now = 1_800_000_000_000;
const nonce = 'n'.repeat(43);
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwks = { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' }] };

function jwt(aud: string, iss: string, override: Record<string, unknown> = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const input =
    encode({ alg: 'RS256', kid: 'test' }) +
    '.' +
    encode({
      aud,
      iss,
      sub: 'subject-from-provider',
      iat,
      exp: iat + 300,
      nonce,
      ...override,
    });
  return input + '.' + sign('sha256', Buffer.from(input), rsa.privateKey).toString('base64url');
}

function fixture(overrides: Record<string, unknown> = {}) {
  const googleToken = jwt(google, 'https://accounts.google.com', overrides);
  const appleToken = jwt(bundle, 'https://appleid.apple.com', overrides);
  const fetcher = vi.fn<typeof fetch>((url) => {
    const endpoint = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    return Promise.resolve(
      endpoint.endsWith('/auth/token')
        ? Response.json({ id_token: appleToken, refresh_token: 'apple-test-refresh' })
        : endpoint === 'https://oauth2.googleapis.com/token'
          ? Response.json({ id_token: googleToken })
          : endpoint.endsWith('/auth/revoke')
            ? new Response(null)
            : Response.json(jwks),
    );
  });
  const service = createNativeIdentity({
    apple: {
      clientId: bundle,
      teamId: 'C97T2A5255',
      keyId: 'ABCDEFGHIJ',
      privateKey: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
    googleClientId: google,
    fetcher,
    now: () => now,
  });
  return { service, fetcher };
}

describe('staging native provider proof', () => {
  it('exchanges an iPhone Google code with PKCE and verifies the expected identity', async () => {
    const { service, fetcher } = fixture();
    const verifier = 'x'.repeat(43);
    expect(
      await service.verify('google', { code: 'google-test-code', verifier }, nonce, false),
    ).toEqual({ subject: 'subject-from-provider' });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: google,
          redirect_uri: googleIosRedirect(google),
          code: 'google-test-code',
          code_verifier: verifier,
        }),
        redirect: 'error',
      }),
    );
  });

  it.each([{ nonce: 'other' }, { aud: bundle }, { exp: 1 }])(
    'rejects a valid signature with the wrong ceremony, audience, or expiry',
    async (claims) => {
      const { service } = fixture(claims);
      await expect(
        service.verify(
          'google',
          { code: 'google-test-code', verifier: 'x'.repeat(43) },
          nonce,
          false,
        ),
      ).rejects.toBeInstanceOf(NativeIdentityRejected);
    },
  );

  it('validates Apple’s code and keeps its refresh credential only for account deletion', async () => {
    const { service, fetcher } = fixture();
    const identityToken = jwt(bundle, 'https://appleid.apple.com');
    const verified = await service.verify(
      'apple',
      { identityToken, code: 'apple-test-code' },
      nonce,
      true,
    );
    expect(verified).toEqual({
      subject: 'subject-from-provider',
      appleRefreshToken: 'apple-test-refresh',
    });
    await service.revokeApple(verified.appleRefreshToken!, new AbortController().signal);
    const revoked = fetcher.mock.calls.at(-1);
    expect(revoked?.[0]).toBe('https://appleid.apple.com/auth/revoke');
    expect((revoked?.[1]?.body as URLSearchParams).get('token')).toBe('apple-test-refresh');
    await expect(
      service.verify(
        'apple',
        {
          identityToken: jwt(bundle, 'https://appleid.apple.com', {
            sub: 'different-provider-account',
          }),
          code: 'apple-test-code',
        },
        nonce,
        true,
      ),
    ).rejects.toBeInstanceOf(NativeIdentityRejected);
  });
});
