import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createGoogleRewardKeys,
  GOOGLE_REWARD_KEYS_URL,
  verifyGoogleReward,
} from '../src/reward-ssv.ts';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const nonce = '00000000-0000-4000-8000-000000000123';
const fields = {
  ad_network: '5450213213286189855',
  ad_unit: '9999999999',
  custom_data: nonce,
  reward_amount: '1',
  reward_item: 'continue',
  timestamp: '1800000000000',
  transaction_id: 'abc123',
};
function signed(overrides: Record<string, string> = {}, keyId = '123') {
  const prefix = new URLSearchParams({ ...fields, ...overrides }).toString();
  return (
    prefix +
    '&signature=' +
    sign('sha256', Buffer.from(prefix), { key: privateKey, dsaEncoding: 'der' }).toString(
      'base64url',
    ) +
    '&key_id=' +
    keyId
  );
}
const keys = { get: () => Promise.resolve(publicKey) };

describe('Google SSV exact raw signature verification', () => {
  it('verifies local ECDSA fixtures without treating them as a real provider event', async () => {
    const value = await verifyGoogleReward(signed(), keys);
    expect(value).toMatchObject({
      customData: nonce,
      adUnit: '9999999999',
      amount: '1',
      item: 'continue',
      earnedAt: 1800000000000,
      transactionId: 'abc123',
    });
    expect(value.signedQuerySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(value)).not.toContain('signature');
    expect(JSON.stringify(value)).not.toContain('user_id');
  });
  it('rejects altered bytes, duplicate fields, unexpected user IDs and invalid signatures', async () => {
    for (const raw of [
      signed().replace('reward_amount=1', 'reward_amount=2'),
      signed({ user_id: 'secret-user' }),
      signed({ custom_data: 'not-opaque' }),
      signed() + '&key_id=456',
      signed().replace('signature=', 'signature=broken'),
      '?' + signed(),
      signed().replace('&reward_amount=', '&custom_data=duplicate&reward_amount='),
    ]) {
      await expect(verifyGoogleReward(raw, keys)).rejects.toThrow();
    }
    const wrong = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    await expect(
      verifyGoogleReward(signed(), { get: () => Promise.resolve(wrong.publicKey) }),
    ).rejects.toMatchObject({ code: 'invalid-ssv-signature' });
  });
  it('does not decode/reorder the signed prefix before verification', async () => {
    const original = signed();
    await expect(
      verifyGoogleReward(original.replace('custom_data=0000', 'custom_data=%30000'), keys),
    ).rejects.toMatchObject({ code: 'invalid-ssv-signature' });
    await expect(
      verifyGoogleReward(
        original.replace(
          'ad_network=5450213213286189855&ad_unit=9999999999',
          'ad_unit=9999999999&ad_network=5450213213286189855',
        ),
        keys,
      ),
    ).rejects.toMatchObject({ code: 'invalid-ssv-signature' });
  });
});

describe('Google fixed-origin key rotation cache', () => {
  const pem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  it('fetches only fixed HTTPS Google keys, de-duplicates refresh and rotates after the cache bound', async () => {
    let now = 0;
    let calls = 0;
    const cache = createGoogleRewardKeys({
      now: () => now,
      fetcher: (url, init) => {
        expect(url).toBe(GOOGLE_REWARD_KEYS_URL);
        expect(init).toMatchObject({
          redirect: 'error',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        calls += 1;
        return Promise.resolve(new Response(JSON.stringify({ keys: [{ keyId: 123, pem }] })));
      },
    });
    await Promise.all([cache.get('123'), cache.get('123')]);
    expect(calls).toBe(1);
    now += 19 * 60 * 60_000;
    await cache.get('123');
    expect(calls).toBe(1);
    now += 2 * 60 * 60_000;
    await cache.get('123');
    expect(calls).toBe(2);
  });
  it('fails closed after expiry/outage and rate-limits unknown-key refresh attempts', async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const cache = createGoogleRewardKeys({
      now: () => now,
      fetcher: () => {
        calls += 1;
        return fail
          ? Promise.reject(new Error('provider-secret-url'))
          : Promise.resolve(new Response(JSON.stringify({ keys: [{ keyId: '123', pem }] })));
      },
    });
    await cache.get('123');
    await expect(cache.get('999')).rejects.toMatchObject({ code: 'unknown-ssv-key' });
    expect(calls).toBe(2);
    await expect(cache.get('998')).rejects.toThrow();
    expect(calls).toBe(2);
    now = 61_000;
    await expect(cache.get('999')).rejects.toThrow();
    expect(calls).toBe(3);
    now += 21 * 60 * 60_000;
    fail = true;
    await expect(cache.get('123')).rejects.toMatchObject({ code: 'ssv-keys-unavailable' });
  });
  it('refreshes a just-rotated unknown key immediately after an otherwise fresh normal fetch', async () => {
    let calls = 0;
    const cache = createGoogleRewardKeys({
      now: () => 1000,
      fetcher: () => {
        calls += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              keys:
                calls === 1
                  ? [{ keyId: '123', pem }]
                  : [
                      { keyId: '123', pem },
                      { keyId: '456', pem },
                    ],
            }),
          ),
        );
      },
    });
    await cache.get('123');
    await cache.get('456');
    expect(calls).toBe(2);
  });
  it('rejects an unexpected curve, duplicate key IDs and oversized key documents', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();
    for (const document of [
      { keys: [{ keyId: 123, pem: other }] },
      {
        keys: [
          { keyId: 123, pem },
          { keyId: 123, pem },
        ],
      },
      'x'.repeat(65537),
    ]) {
      const cache = createGoogleRewardKeys({
        fetcher: () =>
          Promise.resolve(
            new Response(typeof document === 'string' ? document : JSON.stringify(document)),
          ),
      });
      await expect(cache.get('123')).rejects.toMatchObject({ code: 'ssv-keys-unavailable' });
    }
  });
});
