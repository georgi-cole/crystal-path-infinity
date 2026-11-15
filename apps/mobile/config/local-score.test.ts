import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  getCurrentRow,
  PRACTICE_RNG,
} from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import type { AccountSessionOwner, SessionPhase } from '../src/account/session-owner';
import { createLocalScoreClient, parseInfinityScore } from '../src/leaderboard/local-score-client';
import type { LocalScoreClient } from '../src/leaderboard/local-score-client';
import { createPracticeRuntime } from '../src/practice-runtime';
import type { GameplayLifecycle } from '../src/gameplay-lifecycle';

const A = '11000000-0000-4000-8000-000000000001';
const B = '11000000-0000-4000-8000-000000000002';
const ID = '12000000-0000-4000-8000-000000000001';
const clients: LocalScoreClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
});
function fixture(saved = new Map<string, string>(), fetcher = vi.fn<typeof fetch>()) {
  let scope: object = {},
    phase: SessionPhase = 'active';
  const observers = new Set<() => void>();
  const session: Pick<
    AccountSessionOwner,
    'accountScope' | 'snapshot' | 'subscribeAccountScope' | 'withAccountRequest'
  > = {
    accountScope: () => scope,
    snapshot: () => ({ phase, canUseAccount: phase === 'active', expiresAt: null }),
    subscribeAccountScope: (fn) => {
      observers.add(fn);
      return () => {
        observers.delete(fn);
      };
    },
    withAccountRequest: async (fn) =>
      fn({ accessToken: 'test-token-long-enough', signal: new AbortController().signal }),
  };
  const storage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => void saved.set(k, v),
    removeItem: (k: string) => void saved.delete(k),
  };
  const client = createLocalScoreClient({
    baseUrl: 'https://scores.example.invalid/cpi',
    storage,
    session,
    fetcher,
    newId: () => ID,
  })!;
  clients.push(client);
  client.setOnline(false);
  client.bindOwner(A);
  return {
    client,
    saved,
    fetcher,
    storage,
    switchAccount() {
      scope = {};
      phase = 'connecting';
      for (const fn of observers) fn();
      phase = 'active';
      client.bindOwner(B);
    },
  };
}
function fresh(runId = 'practice-local-score'): RunState {
  return createRun(
    {
      runId,
      routeRng: createPracticeCursor(100),
      mysteryRng: createPracticeCursor(200),
      observedAt: 1000,
    },
    PRACTICE_RNG,
  );
}
function finished(rows = '100', runId = 'practice-local-score'): RunState {
  const state = fresh(runId);
  return {
    ...state,
    status: 'finished',
    result: {
      runId,
      rulesetVersion: state.rulesetVersion,
      lastClearedRow: rows,
      fatalRow: null,
      deathCause: null,
      endReason: 'user-ended',
      revivesGranted: 0,
      revivesApplied: 0,
      revivesToReachScore: 0,
      achievedAt: 2000,
      endedAt: 3000,
      activeTimeMs: 5000,
      sp: 200,
      hints: 0,
    },
  };
}
const ack = () => new Response(JSON.stringify({ status: 'saved', runId: ID }));
describe('local gameplay and end-of-run score queue', () => {
  it('plays real rows with no HTTP, then saves one summary after ending the run', async () => {
    const f = fixture();
    let time = 0;
    const snapshot = () => ({
      pageId: 'test',
      bridgeId: 'test',
      sequence: 0,
      active: true,
      monotonicMs: time,
      observedAt: 1000 + time,
    });
    const lifecycle: GameplayLifecycle = {
      ready: Promise.resolve(snapshot()),
      getSnapshot: snapshot,
      sample: () => Promise.resolve(snapshot()),
      subscribe: () => () => {},
      dispose: () => {},
    };
    const state = fresh();
    const runtime = createPracticeRuntime({
      state,
      rng: PRACTICE_RNG,
      lifecycle,
      schedule: () => () => {},
      onTransition: ({ state }) =>
        f.client.record(state, A, state.status === 'playing' && state.lastClearedRow === '0'),
      onError: (error) => {
        throw error;
      },
    });
    await runtime.ready;
    for (let i = 0; i < 4; i++) {
      time += 200;
      const row = getCurrentRow(runtime.getState());
      const result = await runtime.bind({ type: 'choose', side: row.safeSide })();
      expect(result.accepted).toBe(true);
    }
    expect(runtime.getState().lastClearedRow).toBe('4');
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.client.snapshot().pending).toBeNull();
    await runtime.bind({ type: 'end' })();
    expect(f.client.snapshot().pending).toMatchObject({ rows: '4', runId: ID });
    expect(f.fetcher).not.toHaveBeenCalled();
    runtime.dispose();
    f.fetcher.mockResolvedValue(ack());
    f.client.setOnline(true);
    await f.client.flush();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const [, request] = f.fetcher.mock.calls[0];
    if (typeof request?.body !== 'string') throw new Error('Expected a JSON summary');
    const body: unknown = JSON.parse(request.body);
    expect(Object.keys(body as Record<string, unknown>)).toEqual([
      'schemaVersion',
      'runId',
      'rows',
      'revives',
      'activeTimeMs',
    ]);
    expect(f.client.snapshot().phase).toBe('synced');
  });
  it('keeps an interrupted upload across reload and sends the same run ID once acknowledged', async () => {
    const f = fixture();
    f.client.record(fresh(), A, true);
    f.client.record(finished(), A, false);
    f.fetcher.mockRejectedValue(new Error('offline'));
    f.client.setOnline(true);
    await f.client.flush();
    expect(f.client.snapshot().phase).toBe('queued');
    f.client.dispose();
    const next = fixture(f.saved);
    next.fetcher.mockResolvedValue(ack());
    next.client.setOnline(true);
    await next.client.flush();
    expect(next.client.snapshot().pending).toBeNull();
    const sent = next.fetcher.mock.calls[0]?.[1]?.body;
    if (typeof sent !== 'string') throw new Error('Expected a JSON summary');
    const body: unknown = JSON.parse(sent);
    expect(body).toMatchObject({ runId: ID });
    await next.client.flush();
    expect(next.fetcher).toHaveBeenCalledTimes(1);
  });
  it('never clears A’s pending result when a late response arrives after switching to B', async () => {
    const f = fixture();
    f.client.record(fresh(), A, true);
    f.client.record(finished(), A, false);
    let resolve!: (r: Response) => void;
    f.fetcher.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    f.client.setOnline(true);
    const flight = f.client.flush();
    f.switchAccount();
    resolve(ack());
    await flight;
    expect(f.client.currentOwner()).toBe(B);
    expect(f.client.snapshot().pending).toBeNull();
    expect([...f.saved.keys()].some((k) => k.endsWith('pending.' + A))).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it('excludes missions, unbound historical runs and inferior results', () => {
    const f = fixture();
    f.client.record(fresh('practice-campaign-mission-1'), A, true);
    f.client.record(finished('100', 'practice-campaign-mission-1'), A, false);
    f.client.record(finished('100', 'practice-old-checkpoint'), A, false);
    expect(f.client.snapshot().pending).toBeNull();
    f.client.record(fresh(), A, true);
    f.client.record(finished(), A, false);
    f.client.record(finished('50'), A, false);
    expect(f.client.snapshot().pending?.rows).toBe('100');
  });
  it('rejects claimed identity, unsafe numbers, invalid rows and more than 15 revives', () => {
    const valid = { schemaVersion: 1, runId: ID, rows: '100', revives: 15, activeTimeMs: 1000 };
    expect(parseInfinityScore(valid)).toEqual(valid);
    for (const value of [
      { ...valid, userId: A },
      { ...valid, rows: '0' },
      { ...valid, rows: '0100' },
      { ...valid, rows: 100 },
      { ...valid, rows: '1002' },
      { ...valid, activeTimeMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, revives: 16 },
    ])
      expect(parseInfinityScore(value)).toBeNull();
  });
});
