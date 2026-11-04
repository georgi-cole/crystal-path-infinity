import type { SqlConnection, SqlPool } from './database.ts';
import { createMountedPath } from './server-route.ts';

export interface LeaderboardReadQuery {
  readonly rulesetVersion: string;
  readonly scope: 'world' | 'continent' | 'country';
  readonly region: string | null;
  readonly mappingVersion: string | null;
}
export interface VerifiedLeaderboardAccount {
  readonly subject: string;
  /** Fresh trusted session/privacy authorization, including revocation checks. */
  readonly leaderboardAllowed: boolean;
}
export interface LeaderboardApiOptions {
  /** Explicit fixed service mount, e.g. '/cpi'; default is the root namespace. */
  readonly basePath?: string;
  readonly database: SqlPool;
  readonly allowedRulesets: readonly string[];
  readonly allowedMappingVersions: readonly string[];
  readonly allowOrigin: (origin: string | null) => boolean;
  /** Explicit public-read policy; no age, location or account inference occurs here. */
  readonly allowPublicRead: (
    query: LeaderboardReadQuery,
    request: Request,
  ) => boolean | Promise<boolean>;
  readonly authenticate?: (accessToken: string) => Promise<VerifiedLeaderboardAccount | null>;
  /** The host supplies shared durable pre-authentication and per-account limits. */
  readonly rateLimit: (request: Request, subject: string | null) => Promise<boolean>;
}
interface PublicEntry {
  rank: string;
  publicId: string;
  username: string;
  countryCode: string | null;
  continentCode: string | null;
  mappingVersion: string;
  lastClearedRow: string;
  revivesToReachScore: number;
  achievedAt: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9._-]{1,80}$/;
const CONTINENTS = new Set(['AF', 'AS', 'EU', 'NA', 'SA', 'OC', 'AN']);
const MAX_BODY_BYTES = 4096;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function decimal(value: unknown, positive = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 1000 &&
    (positive ? /^[1-9][0-9]*$/ : /^(0|[1-9][0-9]*)$/).test(value)
  );
}
function date(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}
function parseQuery(value: unknown, options: LeaderboardApiOptions): LeaderboardReadQuery | null {
  const keys = ['schemaVersion', 'rulesetVersion', 'scope', 'region', 'mappingVersion'];
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    typeof value.rulesetVersion !== 'string' ||
    !VERSION.test(value.rulesetVersion) ||
    !options.allowedRulesets.includes(value.rulesetVersion) ||
    !['world', 'continent', 'country'].includes(value.scope as string)
  )
    return null;
  if (value.scope === 'world') {
    if (value.region !== null || value.mappingVersion !== null) return null;
  } else if (
    typeof value.mappingVersion !== 'string' ||
    !VERSION.test(value.mappingVersion) ||
    !options.allowedMappingVersions.includes(value.mappingVersion) ||
    typeof value.region !== 'string' ||
    (value.scope === 'country' ? !/^[A-Z]{2}$/.test(value.region) : !CONTINENTS.has(value.region))
  )
    return null;
  return {
    rulesetVersion: value.rulesetVersion,
    scope: value.scope as LeaderboardReadQuery['scope'],
    region: value.region,
    mappingVersion: value.mappingVersion,
  };
}
function entry(raw: unknown): PublicEntry | null {
  if (
    !object(raw) ||
    !decimal(raw.rank, true) ||
    typeof raw.publicId !== 'string' ||
    !UUID.test(raw.publicId) ||
    typeof raw.username !== 'string' ||
    raw.username.length < 3 ||
    raw.username.length > 24 ||
    Array.from(raw.username).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    (raw.countryCode !== null &&
      (typeof raw.countryCode !== 'string' || !/^[A-Z]{2}$/.test(raw.countryCode))) ||
    (raw.continentCode !== null &&
      (typeof raw.continentCode !== 'string' || !CONTINENTS.has(raw.continentCode))) ||
    (raw.countryCode === null) !== (raw.continentCode === null) ||
    typeof raw.mappingVersion !== 'string' ||
    !VERSION.test(raw.mappingVersion) ||
    !decimal(raw.lastClearedRow, true) ||
    typeof raw.revivesToReachScore !== 'number' ||
    !Number.isInteger(raw.revivesToReachScore) ||
    raw.revivesToReachScore < 0 ||
    raw.revivesToReachScore > 10 ||
    !date(raw.achievedAt)
  )
    return null;
  return {
    rank: raw.rank,
    publicId: raw.publicId,
    username: raw.username,
    countryCode: raw.countryCode,
    continentCode: raw.continentCode,
    mappingVersion: raw.mappingVersion,
    lastClearedRow: raw.lastClearedRow,
    revivesToReachScore: raw.revivesToReachScore,
    achievedAt: raw.achievedAt,
  };
}

/** Defense in depth: a private database row can never be forwarded wholesale. */
function projection(
  raw: unknown,
  query: LeaderboardReadQuery,
  personalized: boolean,
): object | null {
  if (
    !object(raw) ||
    raw.schemaVersion !== 1 ||
    raw.rulesetVersion !== query.rulesetVersion ||
    raw.scope !== query.scope ||
    raw.region !== query.region ||
    raw.mappingVersion !== query.mappingVersion ||
    !decimal(raw.count) ||
    !date(raw.updatedAt) ||
    !Array.isArray(raw.top100) ||
    raw.top100.length > 100 ||
    !Array.isArray(raw.neighbors) ||
    raw.neighbors.length > 5
  )
    return null;
  const scoped = (item: PublicEntry) =>
    query.scope === 'world' ||
    (item.mappingVersion === query.mappingVersion &&
      (query.scope === 'country'
        ? item.countryCode === query.region
        : item.continentCode === query.region));
  const top100: PublicEntry[] = [];
  const count = BigInt(raw.count);
  for (const [index, value] of raw.top100.entries()) {
    const item = entry(value);
    if (
      !item ||
      !scoped(item) ||
      item.rank !== String(index + 1) ||
      top100.some((previous) => previous.publicId === item.publicId)
    )
      return null;
    top100.push(item);
  }
  if (BigInt(top100.length) !== (count < 100n ? count : 100n)) return null;
  const own = raw.own === null ? null : entry(raw.own);
  if (raw.own !== null && (!own || !scoped(own) || BigInt(own.rank) > count)) return null;
  if (own && top100.some((item) => item.publicId === own.publicId && item.rank !== own.rank))
    return null;
  if (
    own &&
    BigInt(own.rank) <= 100n &&
    JSON.stringify(top100.find((item) => item.rank === own.rank)) !== JSON.stringify(own)
  )
    return null;
  const neighbors: PublicEntry[] = [];
  for (const value of raw.neighbors) {
    const item = entry(value);
    if (
      !item ||
      !own ||
      !scoped(item) ||
      BigInt(item.rank) > count ||
      BigInt(item.rank) < BigInt(own.rank) - 2n ||
      BigInt(item.rank) > BigInt(own.rank) + 2n ||
      neighbors.some((previous) => previous.publicId === item.publicId) ||
      (neighbors.length > 0 && BigInt(item.rank) !== BigInt(neighbors.at(-1)!.rank) + 1n)
    )
      return null;
    if (
      BigInt(item.rank) <= 100n &&
      JSON.stringify(top100.find((candidate) => candidate.rank === item.rank)) !==
        JSON.stringify(item)
    )
      return null;
    neighbors.push(item);
  }
  if (own && !neighbors.some((item) => JSON.stringify(item) === JSON.stringify(own))) return null;
  return {
    schemaVersion: 1,
    rulesetVersion: query.rulesetVersion,
    scope: query.scope,
    region: query.region,
    mappingVersion: query.mappingVersion,
    count: raw.count,
    updatedAt: raw.updatedAt,
    top100,
    own: personalized ? own : null,
    neighbors: personalized ? neighbors : [],
  };
}
async function body(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > MAX_BODY_BYTES))
    throw new Error();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}
function reply(value: unknown, status: number, origin: string | null): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  if (origin !== null) headers.set('access-control-allow-origin', origin);
  if (status === 204) {
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'Authorization, Content-Type');
  }
  return new Response(status === 204 ? null : JSON.stringify(value), { status, headers });
}

/** Framework-independent private SQL adapter. No server or public policy starts automatically. */
export function createLeaderboardHandler(options: LeaderboardApiOptions) {
  const mountedPath = createMountedPath(options.basePath);
  return async (request: Request): Promise<Response> => {
    let origin: string | null = null;
    let connection: SqlConnection | null = null;
    let broken: Error | undefined;
    try {
      const candidateOrigin = request.headers.get('origin');
      if (!options.allowOrigin(candidateOrigin)) return reply({ code: 'origin_denied' }, 403, null);
      origin = candidateOrigin;
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.search || url.hash)
        return reply({ code: 'invalid_request' }, 400, origin);
      if (mountedPath(url.pathname) !== '/leaderboard/read')
        return reply({ code: 'not_found' }, 404, origin);
      if (request.method === 'OPTIONS') {
        const headers = (request.headers.get('access-control-request-headers') ?? '')
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
        if (
          request.headers.get('access-control-request-method') !== 'POST' ||
          headers.some((item) => item !== 'authorization' && item !== 'content-type')
        )
          return reply({ code: 'method_not_allowed' }, 405, origin);
        return reply(null, 204, origin);
      }
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405, origin);
      if (!(await options.rateLimit(request, null)))
        return reply({ code: 'rate_limited' }, 429, origin);
      let subject: string | null = null;
      if (request.headers.has('authorization')) {
        const authorization = request.headers.get('authorization') ?? '';
        if (!/^Bearer [\x21-\x7e]{16,8192}$/.test(authorization) || !options.authenticate)
          return reply({ code: 'account_required' }, 401, origin);
        const account = await options.authenticate(authorization.slice(7));
        if (account?.leaderboardAllowed !== true || !UUID.test(account.subject))
          return reply({ code: 'account_required' }, 401, origin);
        subject = account.subject;
        if (!(await options.rateLimit(request, subject)))
          return reply({ code: 'rate_limited' }, 429, origin);
      }
      if (
        request.signal.aborted ||
        request.headers.has('content-encoding') ||
        request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
      )
        return reply({ code: 'invalid_request' }, 400, origin);
      let query: LeaderboardReadQuery | null;
      try {
        query = parseQuery(await body(request), options);
      } catch {
        return reply({ code: 'invalid_request' }, 400, origin);
      }
      if (!query) return reply({ code: 'invalid_request' }, 400, origin);
      if (subject === null && !(await options.allowPublicRead(query, request)))
        return reply({ code: 'rankings_unavailable' }, 403, origin);
      connection = await options.database.connect();
      let result: Awaited<ReturnType<SqlConnection['query']>>;
      try {
        // One stable SQL statement; there is no open transaction to leak on failure.
        result = await connection.query(
          'select cpi_private.read_leaderboard($1::text,$2::text,$3::text,$4::text,$5::uuid) as board',
          [query.rulesetVersion, query.scope, query.region, query.mappingVersion, subject],
        );
      } catch {
        broken = new Error('Leaderboard database query failed');
        throw broken;
      }
      const projected =
        result.rows.length === 1 ? projection(result.rows[0].board, query, subject !== null) : null;
      if (!projected) return reply({ code: 'service_unavailable' }, 503, origin);
      return reply(projected, 200, origin);
    } catch {
      return reply({ code: 'service_unavailable' }, 503, origin);
    } finally {
      connection?.release(broken);
    }
  };
}
