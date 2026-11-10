import { describe, expect, it, vi } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  getCurrentRow,
  getDeathClock,
  PRACTICE_RNG,
  READING_RULESET_VERSION,
  READING_STORE_RULESET_VERSION,
} from '@crystal-path-infinity/game-core';
import type { GameplayLifecycle } from '../src/gameplay-lifecycle';
import { canResumePractice } from '../src/menu-navigation';
import { createPracticeRuntime } from '../src/practice-runtime';
import { readPracticeCheckpoint, writePracticeCheckpoint } from '../src/practice-save';
import type { PracticeStorage } from '../src/practice-save';
import {
  earnedGuestContinuation,
  guestAdOffer,
  watchGuestContinuation,
} from '../src/rewards/guest-continuation';
import type { GuestRewardedAd } from '../src/rewards/native-admob';

function initial(rulesetVersion = READING_RULESET_VERSION) {
  return createRun(
    {
      runId: 'practice-guest-reward',
      rulesetVersion,
      routeRng: createPracticeCursor(100),
      mysteryRng: createPracticeCursor(200),
      observedAt: 1_000,
    },
    PRACTICE_RNG,
  );
}

function fixture(state = initial(), saved = new Map<string, string>()) {
  let time = 0;
  const storage: PracticeStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => void saved.set(key, value),
    removeItem: (key) => void saved.delete(key),
  };
  const snapshot = () => ({
    pageId: 'guest-test',
    bridgeId: 'test-bridge',
    sequence: 0,
    active: true,
    monotonicMs: time,
    observedAt: state.lastObservedAt + time,
  });
  const sample = vi.fn(() => Promise.resolve(snapshot()));
  const lifecycle: GameplayLifecycle = {
    ready: Promise.resolve(snapshot()),
    sample,
    getSnapshot: snapshot,
    subscribe: () => () => {},
    dispose: () => {},
  };
  const runtime = createPracticeRuntime({
    state,
    rng: PRACTICE_RNG,
    lifecycle,
    schedule: () => () => {},
    onTransition: ({ state }) => writePracticeCheckpoint(storage, state),
    onError: (error) => {
      throw error;
    },
  });
  return {
    runtime,
    sample,
    saved,
    checkpoint: () => readPracticeCheckpoint(storage),
    async die() {
      const before = runtime.getState();
      const clock = getDeathClock(before);
      if (!clock) throw new Error('Expected an active guest run.');
      time += clock.expiresAt - before.activeTimeMs;
      return (await runtime.bind({ type: 'tick' })()).state;
    },
  };
}

function ad(watch: GuestRewardedAd['watch']): GuestRewardedAd {
  return { watch: vi.fn(watch), showPrivacyOptions: vi.fn(() => Promise.resolve()) };
}

describe('native ad continuations for a local guest run', () => {
  it('restores the same saved row ten times and has no eleventh ad', async () => {
    const f = fixture();
    const provider = ad((_signal, earned) => {
      earned();
      earned();
      return Promise.resolve('closed');
    });
    const { runtime } = f;
    const { signal } = new AbortController();
    await runtime.ready;
    const state = runtime.getState();
    await runtime.bind({
      type: 'choose',
      side: getCurrentRow(state).safeSide,
    })();
    for (let ordinal = 1; ordinal <= 10; ordinal++) {
      const dead = await f.die();
      const restoreSp = ordinal <= 5 ? 200 : 150;
      expect(dead.status).toBe('dead');
      expect(guestAdOffer(dead)).toEqual({ ordinal, restoreSp, grantsRemaining: 11 - ordinal });
      await expect(watchGuestContinuation(runtime, provider, signal)).resolves.toBe('resumed');
      const after = runtime.getState();
      expect(after).toMatchObject({
        status: 'playing',
        runId: state.runId,
        currentRow: '2',
        lastClearedRow: '1',
        hints: dead.hints,
        stream: dead.stream,
        sp: restoreSp,
        revivesGranted: ordinal,
        revivesApplied: ordinal,
      });
      expect(f.checkpoint()).toMatchObject({
        status: 'ready',
        state: {
          status: 'playing',
          runId: state.runId,
          currentRow: '2',
          lastClearedRow: '1',
          sp: restoreSp,
          revivesApplied: ordinal,
        },
      });
    }
    const finished = await f.die();
    expect(finished.status).toBe('finished');
    expect(guestAdOffer(finished)).toBeNull();
    await expect(watchGuestContinuation(runtime, provider, signal)).resolves.toBe('unavailable');
    expect(provider.watch).toHaveBeenCalledTimes(10);
  });

  it('does not spend a place on a dismissal, missing ad, or stale callback', async () => {
    const f = fixture();
    await f.runtime.ready;
    const dead = await f.die();
    const { signal } = new AbortController();
    await expect(
      watchGuestContinuation(
        f.runtime,
        ad(() => Promise.resolve('closed')),
        signal,
      ),
    ).resolves.toBe('dismissed');
    await expect(
      watchGuestContinuation(
        f.runtime,
        ad(() => Promise.resolve('no_fill')),
        signal,
      ),
    ).resolves.toBe('unavailable');
    expect(f.runtime.getState()).toEqual(dead);
    const request = new AbortController();
    const late = ad((_signal, earned) => {
      request.abort();
      earned();
      return Promise.resolve('error');
    });
    await expect(watchGuestContinuation(f.runtime, late, request.signal)).resolves.toBe(
      'unavailable',
    );
    expect(guestAdOffer(f.runtime.getState())?.grantsRemaining).toBe(10);
  });

  it('saves the earned grant under the ad and applies it after reopening the app', async () => {
    const f = fixture();
    await f.runtime.ready;
    const dead = await f.die();
    const request = new AbortController();
    const provider = ad(async (_signal, earned) => {
      f.sample.mockRejectedValue(new Error('Game view covered by an ad.'));
      earned();
      await vi.waitFor(() => expect(earnedGuestContinuation(f.runtime.getState())).toBeDefined());
      expect(f.runtime.getState().status).toBe('dead');
      request.abort();
      return 'error';
    });
    await expect(watchGuestContinuation(f.runtime, provider, request.signal)).resolves.toBe(
      'earned',
    );
    const checkpoint = f.checkpoint();
    expect(canResumePractice(checkpoint)).toBe(true);
    if (checkpoint.status !== 'ready') throw new Error('Expected a guest checkpoint.');
    f.runtime.dispose();
    const reopened = fixture(checkpoint.state, f.saved);
    await reopened.runtime.ready;
    const grant = earnedGuestContinuation(reopened.runtime.getState());
    if (!grant) throw new Error('Expected the saved ad reward.');
    expect(guestAdOffer(reopened.runtime.getState())).toBeNull();
    const command = {
      type: 'apply-revive' as const,
      deathId: grant.deathId,
      ordinal: grant.ordinal,
      grantId: grant.grantId,
    };
    const applied = await reopened.runtime.bind(command)();
    expect(applied.accepted).toBe(true);
    expect(applied.state).toMatchObject({
      status: 'playing',
      currentRow: dead.currentRow,
      runId: dead.runId,
      sp: 200,
      revivesGranted: 1,
      revivesApplied: 1,
    });
    expect((await reopened.runtime.bind(command)()).accepted).toBe(false);
  });

  it('keeps server runs and the simulated store economy out of the guest path', async () => {
    const f = fixture();
    const simulated = fixture(initial(READING_STORE_RULESET_VERSION));
    await Promise.all([f.runtime.ready, simulated.runtime.ready]);
    expect(guestAdOffer({ ...(await f.die()), runId: 'ranked-test' })).toBeNull();
    expect(guestAdOffer(await simulated.die())).toBeNull();
  });
});
