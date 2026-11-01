import { createPublicKey, verify } from 'node:crypto';

// Google documents signature and key_id as the last two parameters. Never
// decode/reorder/re-encode the signed prefix before verification.
export const GOOGLE_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
export class ProbeError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code); this.status = status; this.code = code;
  }
}
export function splitGoogleSsv(rawQuery: string) {
  if (rawQuery.length > 8192 || rawQuery.includes('#')) throw new ProbeError(400, 'invalid_ssv');
  const match = /^(.*)&signature=([^&]+)&key_id=(\d{1,20})$/.exec(rawQuery);
  if (!match?.[1] || !match[2] || !match[3]) throw new ProbeError(400, 'invalid_ssv');
  let signature: string;
  try { signature = decodeURIComponent(match[2]); } catch { throw new ProbeError(400, 'invalid_ssv'); }
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(signature)) throw new ProbeError(400, 'invalid_ssv');
  return { signed: match[1], signature: Buffer.from(signature, 'base64url'), keyId: match[3] };
}
export function verifyGoogleSsv(rawQuery: string, publicKeyPem: string): Record<string, string> {
  const { signed, signature } = splitGoogleSsv(rawQuery);
  let valid = false;
  try {
    const key = createPublicKey(publicKeyPem);
    valid = key.asymmetricKeyType === 'ec' && verify('sha256', Buffer.from(signed, 'utf8'),
      { key, dsaEncoding: 'der' }, signature);
  } catch { /* No key/signature material in the error. */ }
  if (!valid) throw new ProbeError(403, 'invalid_ssv_signature');
  const result: Record<string, string> = Object.create(null);
  for (const [name, value] of new URLSearchParams(signed)) {
    if (Object.hasOwn(result, name) || name === 'signature' || name === 'key_id') {
      throw new ProbeError(400, 'duplicate_ssv_parameter');
    }
    result[name] = value;
  }
  return result;
}

export function createGoogleKeyCache() {
  let keys = new Map<string, string>();
  let refreshedAt = 0;
  let lastAttempt = 0;
  let inFlight: Promise<void> | undefined;
  const ttl = 20 * 60 * 60 * 1000; // Below Google's 24-hour maximum.
  async function refresh() {
    lastAttempt = Date.now();
    const response = await fetch(GOOGLE_KEYS_URL, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok || !response.body) throw new ProbeError(503, 'ssv_keys_unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 65536) throw new ProbeError(503, 'ssv_keys_unavailable');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { keys?: unknown };
    if (!Array.isArray(payload.keys) || !payload.keys.length || payload.keys.length > 32) {
      throw new ProbeError(503, 'ssv_keys_unavailable');
    }
    const next = new Map<string, string>();
    for (const entry of payload.keys) {
      if (!entry || typeof entry !== 'object') throw new ProbeError(503, 'ssv_keys_unavailable');
      const { keyId, pem } = entry as { keyId?: unknown; pem?: unknown };
      if (!/^\d{1,20}$/.test(String(keyId)) || typeof pem !== 'string' || pem.length > 4096 ||
          createPublicKey(pem).asymmetricKeyType !== 'ec') throw new ProbeError(503, 'ssv_keys_unavailable');
      next.set(String(keyId), pem);
    }
    keys = next; refreshedAt = Date.now();
  }
  return async (keyId: string): Promise<string> => {
    const fresh = Date.now() - refreshedAt < ttl;
    if (!fresh || !keys.has(keyId)) {
      if (!inFlight && Date.now() - lastAttempt >= 60_000) {
        inFlight = refresh().finally(() => { inFlight = undefined; });
      }
      if (inFlight) {
        try { await inFlight; } catch { throw new ProbeError(503, 'ssv_keys_unavailable'); }
      }
    }
    if (Date.now() - refreshedAt >= ttl) throw new ProbeError(503, 'ssv_keys_unavailable');
    const key = keys.get(keyId);
    if (!key) throw new ProbeError(403, 'unknown_ssv_key');
    return key;
  };
}
