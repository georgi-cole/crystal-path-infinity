import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { SqlConnection, SqlPool } from './database.ts';

/** Dedicated server secrets, independent of Supabase JWTs and provider signing keys. */
export function privateCryptography(pepper: string, encryptionKey: string) {
  if (
    !/^[0-9a-f]{64}$/.test(pepper) ||
    !/^[0-9a-f]{64}$/.test(encryptionKey) ||
    pepper === encryptionKey
  )
    throw new Error('Invalid private service keys');
  const key = Buffer.from(encryptionKey, 'hex');
  return {
    token: () => randomBytes(32).toString('base64url'),
    digest: (domain: string, value: string) =>
      createHmac('sha256', Buffer.from(pepper, 'hex'))
        .update(domain + '\0' + value)
        .digest('hex'),
    seal(value: unknown, purpose: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(purpose));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
    },
    open(value: string, purpose: string): unknown {
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.length < 29 || bytes.length > 100_000) throw new Error('Invalid private envelope');
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAAD(Buffer.from(purpose));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'),
      ) as unknown;
    },
  };
}
export type PrivateCryptography = ReturnType<typeof privateCryptography>;

export async function sqlTransaction<T>(
  pool: SqlPool,
  work: (connection: SqlConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  let broken: Error | undefined;
  try {
    await connection.query('begin');
    const value = await work(connection);
    await connection.query('commit');
    return value;
  } catch (error) {
    broken = new Error('Private database operation failed');
    await connection.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    connection.release(broken);
  }
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    isObject(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
export async function privateJson(request: Request, maximum = 8192): Promise<unknown> {
  if (
    request.headers.has('content-encoding') ||
    request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
  )
    throw new Error('Invalid request');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid request');
  let size = 0,
    text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) throw new Error('Invalid request');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Fixed provider endpoint, bounded response, no redirects and no provider error text in the public API. */
export async function providerJson(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Provider unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Provider unavailable');
  let size = 0,
    text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) throw new Error('Provider response too large');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
