import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createLeaderboardClient,
  LeaderboardCache,
  LeaderboardUnavailable,
  leaderboardKey,
  parseLeaderboard,
} from '../src/leaderboard/leaderboard-client';
import type {
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardSnapshot,
} from '../src/leaderboard/leaderboard-client';
import { LeaderboardTable, LeaderboardView } from '../src/leaderboard/leaderboard-view';
import type { AccountRequestLease } from '../src/account/session-owner';

const WORLD: LeaderboardQuery = {
  rulesetVersion: 'infinity-v1',
  scope: 'world',
  region: null,
  mappingVersion: null,
};
const BG: LeaderboardQuery = {
  ...WORLD,
  scope: 'country',
  region: 'BG',
  mappingVersion: 'cpi-regions-2026-11-v1',
};
function player(rank: number): LeaderboardEntry {
  return {
    rank: String(rank),
    publicId: '11111111-1111-4111-8111-' + String(rank).padStart(12, '0'),
    username: 'player_' + String(rank),
    countryCode: 'BG',
    continentCode: 'EU',
    mappingVersion: 'cpi-regions-2026-11-v1',
    lastClearedRow: (9007199254740994n - BigInt(rank)).toString(),
    revivesToReachScore: 0,
    achievedAt: '2026-11-01T12:00:00Z',
  };
}
function board(query = WORLD, count = 105): LeaderboardSnapshot {
  return {
    schemaVersion: 1,
    ...query,
    count: String(count),
    updatedAt: '2026-11-04T00:00:00Z',
    top100: Array.from({ length: Math.min(100, count) }, (_, index) => player(index + 1)),
    own: count >= 101 ? player(101) : null,
    neighbors: count >= 101 ? [99, 100, 101, 102, 103].map(player) : [],
  };
}
const signal = () => new AbortController().signal;

describe('CPI-024 lossless public leaderboard projection', () => {
  it('retains rank 101, neighbors and exact adjacent large scores', () => {
    const parsed = parseLeaderboard(board(), WORLD);
    expect(parsed?.own?.rank).toBe('101');
    expect(parsed?.neighbors.map((item) => item.rank)).toEqual(['99', '100', '101', '102', '103']);
    expect(parsed?.top100[0]?.lastClearedRow).toBe('9007199254740993');
    expect(parsed?.top100[1]?.lastClearedRow).toBe('9007199254740992');
    const huge = board(WORLD, 1);
    huge.top100 = [{ ...player(1), lastClearedRow: '9'.repeat(1000) }];
    expect(parseLeaderboard(huge, WORLD)?.top100[0]?.lastClearedRow).toBe('9'.repeat(1000));
  });

  it('rebuilds an allowlist without private fields, routes or credentials', () => {
    const source = board(WORLD, 1);
    const raw = {
      ...source,
      email: 'secret@example.invalid',
      privacyContext: 'child',
      checkpoint: { safeSide: 'left' },
      top100: [{ ...source.top100[0], analyticsAgeBand: 'under_13', refreshToken: 'SECRET' }],
    };
    const parsed = parseLeaderboard(raw, WORLD);
    expect(parsed?.top100).toHaveLength(1);
    expect(JSON.stringify(parsed)).not.toMatch(/secret|SECRET|privacy|checkpoint|safeSide|AgeBand/);
  });

  it('rejects imprecise, noncanonical, oversized or incorrectly scoped responses', () => {
    const source = board(WORLD, 1);
    for (const invalid of [
      { ...source, schemaVersion: 2 },
      { ...source, count: 1 },
      { ...source, count: '01' },
      { ...source, count: '2' },
      { ...source, rulesetVersion: 'another-ruleset' },
      { ...source, scope: 'country', region: 'BG' },
      { ...source, top100: [{ ...player(1), lastClearedRow: 9007199254740992 }] },
      { ...source, top100: [{ ...player(1), lastClearedRow: '01' }] },
      { ...source, top100: [{ ...player(1), lastClearedRow: '0' }] },
      { ...source, top100: [{ ...player(1), lastClearedRow: '9'.repeat(1001) }] },
      { ...source, top100: [{ ...player(1), revivesToReachScore: 11 }] },
      { ...source, top100: [{ ...player(1), countryCode: null }] },
      { ...source, own: player(101) },
      { ...source, neighbors: [player(1)] },
    ])
      expect(parseLeaderboard(invalid, WORLD)).toBeNull();
    expect(parseLeaderboard(board(WORLD), BG)).toBeNull();
    expect(parseLeaderboard(board({ ...BG, region: 'FR' }), BG)).toBeNull();
    expect(parseLeaderboard(board({ ...BG, mappingVersion: 'new-mapping' }), BG)).toBeNull();
  });

  it('represents empty scopes without an invented rank or neighbors', () => {
    expect(parseLeaderboard(board(WORLD, 0), WORLD)).toMatchObject({
      count: '0',
      top100: [],
      own: null,
      neighbors: [],
    });
  });

  it('renders accessible rank, region and precise grouped scores', () => {
    const html = renderToStaticMarkup(
      createElement(LeaderboardTable, {
        entries: [player(101)],
        caption: 'Nearby positions',
        ownPublicId: player(101).publicId,
      }),
    );
    expect(html).toContain('scope="row"');
    expect(html).toContain('cpi-leaderboard-own');
    expect(html).toContain('Bulgaria');
    expect(html).toContain('101');
    expect(html).toContain('9,007,199,254,740,893');
    expect(html).not.toContain('350');
  });

  it('defaults to unavailable with an explicit pending state and no fabricated position', () => {
    const html = renderToStaticMarkup(
      createElement(LeaderboardView, { client: null, online: true, pendingPersonalResult: true }),
    );
    expect(html).toContain('Verified rankings are not available yet');
    expect(html).toContain('awaiting verification');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('player_');
  });
});

describe('CPI-024 explicit trusted transport and bounded memory snapshots', () => {
  it('does not create a default, insecure or public Supabase endpoint', () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const base of [
      undefined,
      '',
      'http://api.example.invalid/v1',
      'https://api.example.invalid/',
      'https://user:password@api.example.invalid/v1',
      'https://api.example.invalid/v1?token=SECRET',
      'https://api.example.invalid/v1#SECRET',
      'https://api.example.invalid/auth/v1',
      'https://api.example.invalid/rest/v1',
    ])
      expect(createLeaderboardClient(base, null, fetcher)).toBeNull();
    expect(createLeaderboardClient('https://api.example.invalid/v1', null, fetcher)).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses one fixed POST route and the approved account request fence', async () => {
    const controller = new AbortController();
    const session = {
      withAccountRequest: <T>(operation: (lease: AccountRequestLease) => Promise<T>) =>
        operation({ accessToken: 'ACCESS-SECRET', signal: controller.signal }),
    };
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(board(BG)), { status: 200 })),
    );
    const client = createLeaderboardClient('https://api.example.invalid/v1/', session, fetcher);
    const result = await client!.read(BG, signal());
    expect(result.own?.rank).toBe('101');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.invalid/v1/leaderboard/read');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { authorization: 'Bearer ACCESS-SECRET' },
    });
    expect(JSON.parse(init!.body as string)).toEqual({ schemaVersion: 1, ...BG });
    expect(typeof url === 'string' ? url : '').not.toContain('SECRET');
    expect(init!.body).not.toContain('user');
  });

  it('does not accept a personal identity association on an anonymous request', async () => {
    const fetcher: typeof fetch = () => Promise.resolve(new Response(JSON.stringify(board())));
    const client = createLeaderboardClient('https://api.example.invalid/v1', null, fetcher);
    const result = await client!.read(WORLD, signal());
    expect(result.own).toBeNull();
    expect(result.neighbors).toEqual([]);
  });

  it('redacts raw errors and rejects responses after account cancellation', async () => {
    const fail: typeof fetch = () => Promise.reject(new Error('Bearer ACCESS-SECRET'));
    const client = createLeaderboardClient('https://api.example.invalid/v1', null, fail);
    await expect(client!.read(WORLD, signal())).rejects.toEqual(new LeaderboardUnavailable());
    const controller = new AbortController();
    const session = {
      withAccountRequest: <T>(operation: (lease: AccountRequestLease) => Promise<T>) =>
        operation({ accessToken: 'ACCESS-SECRET', signal: controller.signal }),
    };
    const fetcher: typeof fetch = () => {
      controller.abort();
      return Promise.resolve(new Response(JSON.stringify(board())));
    };
    await expect(
      createLeaderboardClient('https://api.example.invalid/v1', session, fetcher)!.read(
        WORLD,
        signal(),
      ),
    ).rejects.toEqual(new LeaderboardUnavailable());
  });

  it('isolates cache scopes, mappings and client instances and never caches own associations', async () => {
    const client = { read: (query: LeaderboardQuery) => Promise.resolve(board(query)) };
    const cache = new LeaderboardCache(client);
    await cache.read(WORLD, signal());
    expect(cache.peek(WORLD)?.own).toBeNull();
    expect(cache.peek(WORLD)?.neighbors).toEqual([]);
    expect(cache.peek(BG)).toBeNull();
    await cache.read(BG, signal());
    expect(cache.peek(BG)?.region).toBe('BG');
    expect(cache.peek({ ...BG, mappingVersion: 'another-version' })).toBeNull();
    expect(new LeaderboardCache(client).peek(WORLD)).toBeNull();
    expect(leaderboardKey({ ...WORLD, rulesetVersion: 'new-rules' })).not.toBe(
      leaderboardKey(WORLD),
    );
    const copy = cache.peek(WORLD)!;
    copy.top100 = [];
    expect(cache.peek(WORLD)?.top100).toHaveLength(100);
    cache.clear();
    expect(cache.peek(WORLD)).toBeNull();
  });

  it('bounds the cache and rejects late responses after clear or abort', async () => {
    const client = { read: (query: LeaderboardQuery) => Promise.resolve(board(query, 0)) };
    const cache = new LeaderboardCache(client);
    for (let index = 0; index < 13; index++)
      await cache.read({ ...WORLD, rulesetVersion: 'rules-' + String(index) }, signal());
    expect(cache.peek({ ...WORLD, rulesetVersion: 'rules-0' })).toBeNull();
    let resolve!: (value: LeaderboardSnapshot) => void;
    const delayed = new LeaderboardCache({
      read: () => new Promise<LeaderboardSnapshot>((complete) => (resolve = complete)),
    });
    const pending = delayed.read(WORLD, signal());
    delayed.clear();
    resolve(board());
    await expect(pending).rejects.toEqual(new LeaderboardUnavailable());
    expect(delayed.peek(WORLD)).toBeNull();
    const controller = new AbortController();
    controller.abort();
    await expect(cache.read(WORLD, controller.signal)).rejects.toEqual(
      new LeaderboardUnavailable(),
    );
  });
});
