import type { AccountSessionOwner } from '../account/session-owner';

export const CONTINENTS = ['AF', 'AS', 'EU', 'NA', 'SA', 'OC', 'AN'] as const;
export type Continent = (typeof CONTINENTS)[number];
export interface LeaderboardQuery {
  rulesetVersion: string;
  scope: 'world' | 'continent' | 'country';
  region: string | null;
  mappingVersion: string | null;
}
export interface LeaderboardEntry {
  rank: string;
  publicId: string;
  username: string;
  countryCode: string | null;
  continentCode: Continent | null;
  mappingVersion: string;
  lastClearedRow: string;
  revivesToReachScore: number;
  achievedAt: string;
}
export interface LeaderboardSnapshot extends LeaderboardQuery {
  schemaVersion: 1;
  count: string;
  updatedAt: string;
  top100: readonly LeaderboardEntry[];
  own: LeaderboardEntry | null;
  neighbors: readonly LeaderboardEntry[];
}
export interface LeaderboardClient {
  read(query: LeaderboardQuery, signal: AbortSignal): Promise<LeaderboardSnapshot>;
}
export class LeaderboardUnavailable extends Error {
  constructor() {
    super('Verified rankings are unavailable');
    this.name = 'LeaderboardUnavailable';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const version = /^[A-Za-z0-9._-]{1,80}$/;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function decimal(value: unknown, positive = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 1000 &&
    (positive ? /^[1-9][0-9]*$/ : /^(0|[1-9][0-9]*)$/).test(value)
  );
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}
export function leaderboardKey(query: LeaderboardQuery): string {
  return JSON.stringify([query.rulesetVersion, query.scope, query.region, query.mappingVersion]);
}
export function validLeaderboardQuery(query: LeaderboardQuery): boolean {
  return (
    typeof query.rulesetVersion === 'string' &&
    version.test(query.rulesetVersion) &&
    (query.scope === 'world'
      ? query.region === null && query.mappingVersion === null
      : typeof query.mappingVersion === 'string' &&
        version.test(query.mappingVersion) &&
        typeof query.region === 'string' &&
        (query.scope === 'country'
          ? /^[A-Z]{2}$/.test(query.region)
          : query.scope === 'continent' && CONTINENTS.includes(query.region as Continent)))
  );
}
function entry(value: unknown): LeaderboardEntry | null {
  if (
    !record(value) ||
    !decimal(value.rank, true) ||
    typeof value.publicId !== 'string' ||
    !uuid.test(value.publicId) ||
    typeof value.username !== 'string' ||
    value.username.length < 3 ||
    value.username.length > 24 ||
    Array.from(value.username).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    (value.countryCode !== null &&
      (typeof value.countryCode !== 'string' || !/^[A-Z]{2}$/.test(value.countryCode))) ||
    (value.continentCode !== null && !CONTINENTS.includes(value.continentCode as Continent)) ||
    (value.countryCode === null) !== (value.continentCode === null) ||
    typeof value.mappingVersion !== 'string' ||
    !version.test(value.mappingVersion) ||
    !decimal(value.lastClearedRow, true) ||
    typeof value.revivesToReachScore !== 'number' ||
    !Number.isInteger(value.revivesToReachScore) ||
    value.revivesToReachScore < 0 ||
    value.revivesToReachScore > 10 ||
    !timestamp(value.achievedAt)
  )
    return null;
  return {
    rank: value.rank,
    publicId: value.publicId,
    username: value.username,
    countryCode: value.countryCode,
    continentCode: value.continentCode as Continent | null,
    mappingVersion: value.mappingVersion,
    lastClearedRow: value.lastClearedRow,
    revivesToReachScore: value.revivesToReachScore,
    achievedAt: value.achievedAt,
  };
}

/** Rebuild only the public fields; account/private extras never enter the view or cache. */
export function parseLeaderboard(
  value: unknown,
  query: LeaderboardQuery,
): LeaderboardSnapshot | null {
  if (
    !validLeaderboardQuery(query) ||
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.rulesetVersion !== query.rulesetVersion ||
    value.scope !== query.scope ||
    value.region !== query.region ||
    value.mappingVersion !== query.mappingVersion ||
    !decimal(value.count) ||
    !timestamp(value.updatedAt) ||
    !Array.isArray(value.top100) ||
    value.top100.length > 100 ||
    !Array.isArray(value.neighbors) ||
    value.neighbors.length > 5
  )
    return null;
  const top100: LeaderboardEntry[] = [];
  const neighbors: LeaderboardEntry[] = [];
  const count = BigInt(value.count);
  const scoped = (item: LeaderboardEntry) =>
    query.scope === 'world' ||
    (item.mappingVersion === query.mappingVersion &&
      (query.scope === 'country'
        ? item.countryCode === query.region
        : item.continentCode === query.region));
  for (const [index, raw] of value.top100.entries()) {
    const item = entry(raw);
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
  const own = value.own === null ? null : entry(value.own);
  if (value.own !== null && (!own || !scoped(own) || BigInt(own.rank) > count)) return null;
  if (own && top100.some((item) => item.publicId === own.publicId && item.rank !== own.rank))
    return null;
  if (own && BigInt(own.rank) <= 100n) {
    const matching = top100.find((item) => item.rank === own.rank);
    if (JSON.stringify(matching) !== JSON.stringify(own)) return null;
  }
  for (const raw of value.neighbors) {
    const item = entry(raw);
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
    count: value.count,
    updatedAt: value.updatedAt,
    top100,
    own,
    neighbors,
  };
}

/** Explicit approved HTTPS origin only. Account identity comes from the bearer, never a body ID. */
export function createLeaderboardClient(
  baseUrl: string | undefined,
  session: Pick<AccountSessionOwner, 'withAccountRequest'> | null = null,
  fetcher: typeof fetch = fetch,
): LeaderboardClient | null {
  if (!baseUrl) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname === '/' ||
    /\/(auth|rest)\/v1/.test(base.pathname)
  )
    return null;
  const url = base.origin + base.pathname.replace(/\/$/, '') + '/leaderboard/read';
  return {
    async read(query, signal) {
      try {
        if (!validLeaderboardQuery(query) || signal.aborted) throw new LeaderboardUnavailable();
        const request = async (accessToken?: string, accountSignal?: AbortSignal) => {
          const response = await fetcher(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}),
            },
            body: JSON.stringify({
              schemaVersion: 1,
              rulesetVersion: query.rulesetVersion,
              scope: query.scope,
              region: query.region,
              mappingVersion: query.mappingVersion,
            }),
            signal: AbortSignal.any([
              signal,
              ...(accountSignal ? [accountSignal] : []),
              AbortSignal.timeout(15_000),
            ]),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
          });
          if (!response.ok) throw new LeaderboardUnavailable();
          const text = await response.text();
          if (text.length > 262_144) throw new LeaderboardUnavailable();
          const parsed = parseLeaderboard(JSON.parse(text), query);
          if (!parsed || signal.aborted || accountSignal?.aborted)
            throw new LeaderboardUnavailable();
          return session ? parsed : { ...parsed, own: null, neighbors: [] };
        };
        return session
          ? await session.withAccountRequest((lease) => request(lease.accessToken, lease.signal))
          : await request();
      } catch {
        // No server response/error body, credential or account-existence detail escapes.
        throw new LeaderboardUnavailable();
      }
    },
  };
}

/** Bounded per-client public snapshots only; own/neighbor associations are never cached. */
export class LeaderboardCache {
  private readonly values = new Map<string, LeaderboardSnapshot>();
  private generation = 0;
  constructor(private readonly client: LeaderboardClient) {}
  peek(query: LeaderboardQuery): LeaderboardSnapshot | null {
    const cached = this.values.get(leaderboardKey(query));
    return cached ? structuredClone(cached) : null;
  }
  async read(query: LeaderboardQuery, signal: AbortSignal): Promise<LeaderboardSnapshot> {
    const generation = this.generation;
    const parsed = parseLeaderboard(await this.client.read(query, signal), query);
    if (!parsed || signal.aborted || generation !== this.generation)
      throw new LeaderboardUnavailable();
    const key = leaderboardKey(query);
    this.values.delete(key);
    this.values.set(key, structuredClone({ ...parsed, own: null, neighbors: [] }));
    if (this.values.size > 12) this.values.delete(this.values.keys().next().value!);
    return parsed;
  }
  clear(): void {
    this.generation++;
    this.values.clear();
  }
}
