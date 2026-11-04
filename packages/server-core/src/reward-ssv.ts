import { createHash, createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export const GOOGLE_REWARD_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RewardError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'RewardError';
    this.code = code;
  }
}
function fail(code = 'invalid-ssv'): never {
  throw new RewardError(code);
}

export interface VerifiedGoogleReward {
  readonly customData: string;
  readonly adUnit: string;
  readonly adNetwork: string;
  readonly amount: string;
  readonly item: string;
  readonly earnedAt: number;
  readonly transactionId: string;
  readonly signedQuerySha256: string;
}
export interface GoogleRewardKeys {
  get(keyId: string): Promise<KeyObject>;
}

/** Fixed Google HTTPS key origin, bounded refreshes and no stale keys after 20 hours. */
export function createGoogleRewardKeys(
  options: { fetcher?: typeof fetch; now?: () => number } = {},
): GoogleRewardKeys {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const ttl = 20 * 60 * 60_000;
  let keys = new Map<string, KeyObject>();
  let refreshedAt: number | null = null;
  let attemptedAt: number | null = null;
  let unknownAttemptedAt: number | null = null;
  let flight: Promise<void> | null = null;
  async function refresh() {
    attemptedAt = now();
    try {
      const response = await fetcher(GOOGLE_REWARD_KEYS_URL, {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok || !response.body) fail('ssv-keys-unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '';
      let count = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          count += part.value.byteLength;
          if (count > 65536) {
            await reader.cancel();
            fail('ssv-keys-unavailable');
          }
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      const raw: unknown = JSON.parse(text);
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('keys' in raw) ||
        !Array.isArray(raw.keys) ||
        raw.keys.length < 1 ||
        raw.keys.length > 32
      )
        fail('ssv-keys-unavailable');
      const next = new Map<string, KeyObject>();
      for (const candidate of raw.keys) {
        if (!candidate || typeof candidate !== 'object') fail('ssv-keys-unavailable');
        const entry = candidate as { keyId?: unknown; pem?: unknown };
        const id =
          typeof entry.keyId === 'number' && Number.isSafeInteger(entry.keyId)
            ? String(entry.keyId)
            : entry.keyId;
        if (
          typeof id !== 'string' ||
          !/^\d{1,20}$/.test(id) ||
          next.has(id) ||
          typeof entry.pem !== 'string' ||
          entry.pem.length > 4096
        )
          fail('ssv-keys-unavailable');
        const key = createPublicKey(entry.pem);
        if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
          fail('ssv-keys-unavailable');
        next.set(id, key);
      }
      keys = next;
      refreshedAt = now();
    } catch {
      fail('ssv-keys-unavailable');
    }
  }
  return {
    async get(keyId) {
      if (!/^\d{1,20}$/.test(keyId)) fail();
      const time = now();
      const fresh = refreshedAt !== null && time >= refreshedAt && time - refreshedAt < ttl;
      if (!fresh || !keys.has(keyId)) {
        const refreshUnknown =
          fresh &&
          !keys.has(keyId) &&
          (unknownAttemptedAt === null || time - unknownAttemptedAt >= 5000);
        const refreshExpired = !fresh && (attemptedAt === null || time - attemptedAt >= 60_000);
        if (!flight && (refreshUnknown || refreshExpired)) {
          if (refreshUnknown) unknownAttemptedAt = time;
          flight = refresh().finally(() => {
            flight = null;
          });
        }
        if (flight) await flight;
      }
      if (refreshedAt === null || now() < refreshedAt || now() - refreshedAt >= ttl)
        fail('ssv-keys-unavailable');
      const key = keys.get(keyId);
      if (!key) fail('unknown-ssv-key');
      return key;
    },
  };
}

/** Preserve the exact raw signed UTF-8 prefix; never reserialize query parameters. */
export async function verifyGoogleReward(
  rawQuery: string,
  keys: GoogleRewardKeys,
): Promise<VerifiedGoogleReward> {
  if (
    typeof rawQuery !== 'string' ||
    rawQuery.length > 8192 ||
    rawQuery.length < 1 ||
    /[^\x21-\x7e]/.test(rawQuery) ||
    rawQuery.includes('#') ||
    rawQuery.startsWith('?')
  )
    fail();
  const match = /^(.*)&signature=([^&]+)&key_id=(\d{1,20})$/.exec(rawQuery);
  if (!match?.[1]) fail();
  const signed = match[1];
  let encoded: string;
  try {
    encoded = decodeURIComponent(match[2]);
  } catch {
    fail();
  }
  if (!/^[A-Za-z0-9_-]{8,160}={0,2}$/.test(encoded)) fail();
  const signature = Buffer.from(encoded, 'base64url');
  if (
    signature.length < 8 ||
    signature.length > 80 ||
    signature.toString('base64url') !== encoded.replace(/=+$/, '')
  )
    fail();
  const key = await keys.get(match[3]);
  let valid = false;
  try {
    valid =
      key.asymmetricKeyType === 'ec' &&
      key.asymmetricKeyDetails?.namedCurve === 'prime256v1' &&
      verify('sha256', Buffer.from(signed, 'utf8'), { key, dsaEncoding: 'der' }, signature);
  } catch {
    fail('invalid-ssv-signature');
  }
  if (!valid) fail('invalid-ssv-signature');
  const entries = new Map<string, string>();
  for (const component of signed.split('&')) {
    if (!/^[a-z_]+=/.test(component)) fail();
    const separator = component.indexOf('=');
    const name = component.slice(0, separator);
    if (entries.has(name)) fail();
    let value: string;
    try {
      value = decodeURIComponent(component.slice(separator + 1).replace(/\+/g, ' '));
    } catch {
      fail();
    }
    entries.set(name, value);
  }
  const names = [
    'ad_network',
    'ad_unit',
    'custom_data',
    'reward_amount',
    'reward_item',
    'timestamp',
    'transaction_id',
  ];
  if (JSON.stringify([...entries.keys()]) !== JSON.stringify(names)) fail();
  const adNetwork = entries.get('ad_network')!;
  const adUnit = entries.get('ad_unit')!;
  const customData = entries.get('custom_data')!;
  const amount = entries.get('reward_amount')!;
  const item = entries.get('reward_item')!;
  const timestamp = entries.get('timestamp')!;
  const transactionId = entries.get('transaction_id')!;
  if (
    !/^\d{1,20}$/.test(adNetwork) ||
    !/^[A-Za-z0-9_/-]{1,128}$/.test(adUnit) ||
    !UUID.test(customData) ||
    !/^[1-9][0-9]{0,8}$/.test(amount) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(item) ||
    !/^[1-9][0-9]{0,15}$/.test(timestamp) ||
    !/^[A-Fa-f0-9]{1,180}$/.test(transactionId)
  )
    fail();
  const earnedAt = Number(timestamp);
  if (!Number.isSafeInteger(earnedAt)) fail();
  return {
    customData: customData.toLowerCase(),
    adUnit,
    adNetwork,
    amount,
    item,
    earnedAt,
    transactionId: transactionId.toLowerCase(),
    signedQuerySha256: createHash('sha256').update(signed).digest('hex'),
  };
}
