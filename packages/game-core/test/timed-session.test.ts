import { describe, expect, it, vi } from 'vitest';
import {
  createRun,
  createRunSession,
  createTimedRunSession,
  getRunResult,
  transitionRun,
} from '../src/index.ts';
import type { RandomCursor, RandomSource, RunState, TimedRunSession } from '../src/index.ts';

const rng: RandomSource = {
  algorithm: 'timed-session-test-v1',
  next(cursor) {
    return {
      value: Number(cursor.state),
      cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
    };
  },
};

function cursor(value = 0): RandomCursor {
  return { algorithm: rng.algorithm, state: String(value), draws: '0' };
}

function fresh(): RunState {
  return createRun(
    { runId: 'clock-run', observedAt: 1_000, routeRng: cursor(), mysteryRng: cursor(0.18) },
    rng,
  );
}

function withEffect(kind: 'regen_5s' | 'drain_5s' | 'shield_5s' = 'regen_5s'): RunState {
  return {
    ...fresh(),
    effects: [
      { kind, startedAt: 0, expiresAt: 5_000, nextTickAt: kind === 'shield_5s' ? null : 500 },
    ],
  };
}

function setup(state = withEffect(), origin = 0) {
  let now = origin;
  const read = vi.fn(() => now);
  const session = createTimedRunSession(state, rng, { monotonicNow: read });
  return {
    session,
    read,
    at: (value: number) => {
      now = value;
    },
  };
}

function revive(session: TimedRunSession): void {
  const state = session.getState();
  if (!state.death) throw new Error('Fixture needs a death');
  const identity = {
    deathId: state.death.id,
    ordinal: state.revivesApplied + 1,
    grantId: `grant:${state.death.id}`,
  };
  expect(session.bind({ type: 'grant-revive', ...identity })().accepted).toBe(true);
  expect(session.bind({ type: 'apply-revive', ...identity })().accepted).toBe(true);
}

describe('one active gameplay clock', () => {
  it('starts in recovery and excludes all time before current lifecycle readiness', () => {
    const { session, read, at } = setup();
    const oldChoice = session.bind({ type: 'choose', side: 'left' });
    expect(session.isRunning()).toBe(false);
    expect(session.getPauseReasons()).toEqual(['recovery']);
    at(60_000);
    expect(oldChoice()).toMatchObject({ reason: 'clock-paused', events: [] });
    expect(session.tick()).toMatchObject({ reason: 'clock-paused', events: [] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(session.releaseRecovery().events).toEqual([]);
    expect(session.isRunning()).toBe(true);
    expect(oldChoice().reason).toBe('stale-pause');
    expect(session.tick().state).toMatchObject({ activeTimeMs: 0, sp: 300, lastClearedRow: '0' });
    at(60_500);
    expect(session.tick().state).toMatchObject({ activeTimeMs: 500, sp: 302 });
  });

  it.each([
    [0, 300, 0, 1],
    [499, 300, 0, 1],
    [500, 302, 1, 1],
    [5_000, 318, 9, 0],
  ])('settles %i active ms at the exact pulse/expiry boundary', (time, sp, pulses, effects) => {
    const { session, at } = setup();
    session.releaseRecovery();
    at(time);
    const result = session.tick();
    expect(result.state).toMatchObject({ activeTimeMs: time, sp, lastClearedRow: '0' });
    expect(result.state.effects).toHaveLength(effects);
    expect(result.events.filter(({ type }) => type === 'effects-ticked')).toHaveLength(pulses);
    expect(session.tick().events).toEqual([]);
  });

  it('freezes at 499 ms, preserves remaining duration, and never duplicates a resumed pulse', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    at(499);
    const pause = session.hold('user');
    expect(pause.result.state.activeTimeMs).toBe(499);
    at(60_499);
    expect(session.tick().reason).toBe('clock-paused');
    expect(pause.release().events).toEqual([]);
    expect(pause.release().events).toEqual([]);
    expect(session.tick().state).toMatchObject({ sp: 300, activeTimeMs: 499 });
    at(60_500);
    expect(session.tick().events.filter(({ type }) => type === 'effects-ticked')).toHaveLength(1);
    expect(session.tick().state).toMatchObject({ sp: 302, activeTimeMs: 500 });
    expect(session.tick().events).toEqual([]);
  });

  it('keeps 1500 active milliseconds of a paused shield and expires it before an action at 5000', () => {
    const { session, at } = setup(withEffect('shield_5s'));
    session.releaseRecovery();
    at(3_500);
    const pause = session.hold('background');
    expect(pause.result.state.effects[0].expiresAt! - pause.result.state.activeTimeMs).toBe(1_500);
    at(63_500);
    pause.release();
    at(64_999);
    expect(session.tick().state.effects).toHaveLength(1);
    at(65_000);
    const result = session.bind({ type: 'choose', side: 'right' })();
    expect(result.state).toMatchObject({
      sp: 290,
      activeTimeMs: 5_000,
      lastClearedRow: '1',
      effects: [],
    });
    expect(result.events.map(({ type }) => type)).toEqual([
      'effects-expired',
      'choice-resolved',
      'row-cleared',
    ]);
  });

  it('settles due effects at the pause boundary before freezing', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    at(500);
    const pause = session.hold('user');
    expect(pause.result.state).toMatchObject({ sp: 302, activeTimeMs: 500 });
    expect(pause.result.events.map(({ type }) => type)).toEqual(['effects-ticked']);
    at(100_000);
    pause.release();
    expect(session.tick().events).toEqual([]);
    expect(session.getState().sp).toBe(302);
  });

  it('requires every independent pause owner, including duplicate reasons, to release', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    at(250);
    const user = session.hold('user');
    const ad = session.hold('ad');
    const secondAd = session.hold('ad');
    const background = session.hold('background');
    const verification = session.hold('verification');
    at(20_000);
    ad.release();
    background.release();
    user.release();
    verification.release();
    expect(session.isRunning()).toBe(false);
    expect(session.getPauseReasons()).toEqual(['ad']);
    expect(session.tick().state.activeTimeMs).toBe(250);
    at(30_000);
    secondAd.release();
    expect(session.isRunning()).toBe(true);
    at(30_250);
    expect(session.tick().state).toMatchObject({ activeTimeMs: 500, sp: 302 });
  });

  it('counts ordinary animation or waiting without producing progress or idle death', () => {
    const { session, at } = setup(withEffect('drain_5s'));
    session.releaseRecovery();
    at(5_000);
    expect(session.tick().state).toMatchObject({
      activeTimeMs: 5_000,
      sp: 282,
      lastClearedRow: '0',
      status: 'playing',
    });
    at(86_400_000);
    expect(session.tick().state).toMatchObject({
      activeTimeMs: 86_400_000,
      sp: 282,
      lastClearedRow: '0',
      status: 'playing',
    });
  });

  it('retains fractional milliseconds through frequent frames and a pause', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    for (const time of [0.25, 0.5, 0.75]) {
      at(time);
      expect(session.tick().state.activeTimeMs).toBe(0);
    }
    const pause = session.hold('user');
    at(100.75);
    pause.release();
    at(101);
    expect(session.tick().state.activeTimeMs).toBe(1);
    at(600);
    expect(session.tick().state).toMatchObject({ activeTimeMs: 500, sp: 302 });
  });

  it('does not use device wall-clock changes to alter gameplay time', () => {
    const wall = vi.spyOn(Date, 'now');
    try {
      const { session, at } = setup();
      session.releaseRecovery();
      wall.mockReturnValue(1);
      at(499);
      expect(session.tick().state).toMatchObject({
        activeTimeMs: 499,
        sp: 300,
        lastObservedAt: 1_499,
      });
      wall.mockReturnValue(8_000_000_000_000);
      at(500);
      expect(session.tick().state).toMatchObject({
        activeTimeMs: 500,
        sp: 302,
        lastObservedAt: 1_500,
      });
      expect(wall).not.toHaveBeenCalled();
    } finally {
      wall.mockRestore();
    }
  });

  it('supports a separately owned observation clock while foreground time remains frozen', () => {
    let foreground = 0;
    let observed = 10_000;
    const session = createTimedRunSession(withEffect(), rng, {
      monotonicNow: () => foreground,
      observedAt: observed,
      observationNow: () => observed,
    });
    session.releaseRecovery();
    foreground = 499;
    observed += 499;
    const pause = session.hold('background');
    observed += 86_400_000;
    pause.release();
    const result = session.tick();
    expect(result.state).toMatchObject({ activeTimeMs: 499, sp: 300, lastObservedAt: observed });
    foreground = 500;
    observed += 1;
    expect(session.tick().state.sp).toBe(302);
  });

  it('recovers a checkpoint at a different monotonic origin without offline catch-up', () => {
    const old = setup();
    old.session.releaseRecovery();
    old.at(3_500);
    old.session.tick();
    const checkpoint = JSON.parse(JSON.stringify(old.session.dispose())) as RunState;
    const recovered = setup(checkpoint, 700_000);
    recovered.at(900_000);
    recovered.session.releaseRecovery();
    expect(recovered.session.tick().state).toMatchObject({ activeTimeMs: 3_500, sp: 314 });
    recovered.at(901_500);
    expect(recovered.session.tick().state).toMatchObject({
      activeTimeMs: 5_000,
      sp: 318,
      effects: [],
    });
  });
});

describe('death, input and ownership boundaries', () => {
  it('commits the fatal pulse rather than a late sample and discards the unplayed tail on revive', () => {
    const { session, at } = setup({ ...withEffect('drain_5s'), sp: 2 });
    session.releaseRecovery();
    at(900);
    const died = session.tick();
    expect(died.state).toMatchObject({ status: 'dead', activeTimeMs: 500, sp: 0 });
    expect(died.events.filter(({ type }) => type === 'death')).toHaveLength(1);
    at(60_900);
    expect(session.tick().reason).toBe('not-playing');
    const ad = session.hold('ad');
    revive(session);
    expect(session.getState()).toMatchObject({
      status: 'playing',
      activeTimeMs: 500,
      sp: 200,
      effects: [],
    });
    expect(session.isRunning()).toBe(false);
    ad.release();
    at(61_400);
    expect(session.tick().state.activeTimeMs).toBe(1_000);
  });

  it('still commits a fatal due drain when the requested action is rejected', () => {
    const { session, at } = setup({ ...withEffect('drain_5s'), sp: 2 });
    session.releaseRecovery();
    const hint = session.bind({ type: 'hint' });
    at(900);
    expect(hint()).toMatchObject({
      reason: 'died-before-command',
      state: { status: 'dead', activeTimeMs: 500, hints: 2 },
    });
    expect(hint()).toMatchObject({ reason: 'command-consumed', events: [] });
    revive(session);
    at(1_400);
    expect(session.tick().state.activeTimeMs).toBe(1_000);
  });

  it('rejects consumed and old-row actions before reading an invalid clock', () => {
    const { session, read, at } = setup();
    session.releaseRecovery();
    const choice = session.bind({ type: 'choose', side: 'left' });
    const other = session.bind({ type: 'choose', side: 'left' });
    choice();
    read.mockClear();
    at(Number.NaN);
    expect(choice().reason).toBe('command-consumed');
    expect(other().reason).toBe('stale-command');
    expect(read).not.toHaveBeenCalled();
  });

  it('invalidates callbacks across pause/resume and blocks newly bound paused gameplay without sampling', () => {
    const { session, read, at } = setup();
    session.releaseRecovery();
    const old = session.bind({ type: 'choose', side: 'left' });
    const oldTick = session.bind({ type: 'tick' });
    const pause = session.hold('background');
    const whilePaused = session.bind({ type: 'choose', side: 'left' });
    read.mockClear();
    at(Number.NaN);
    expect(old().reason).toBe('stale-pause');
    expect(oldTick().reason).toBe('stale-pause');
    expect(whilePaused().reason).toBe('clock-paused');
    expect(read).not.toHaveBeenCalled();
    at(100);
    pause.release();
    expect(whilePaused().reason).toBe('stale-pause');
    expect(session.bind({ type: 'choose', side: 'left' })().state.lastClearedRow).toBe('1');
  });

  it('preserves elapsed time when a rejected reward command does not settle playing state', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    at(900);
    expect(
      session.bind({ type: 'grant-revive', deathId: 'absent', ordinal: 1, grantId: 'grant' })()
        .reason,
    ).toBe('not-dead');
    expect(session.getState().activeTimeMs).toBe(0);
    expect(session.tick().state).toMatchObject({ activeTimeMs: 900, sp: 302 });
  });

  it('allows a fresh explicit End while paused without advancing the run', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    const old = session.bind({ type: 'end' });
    at(499);
    session.hold('user');
    at(100_000);
    expect(old().reason).toBe('stale-pause');
    const ended = session.bind({ type: 'end' })();
    expect(ended.state).toMatchObject({ activeTimeMs: 499, sp: 300, status: 'finished' });
    expect(ended.events.filter(({ type }) => type === 'run-ended')).toHaveLength(1);
    expect(session.tick().reason).toBe('finished');
  });

  it('disposes without sampling, finalizing, or changing a replacement owner', () => {
    const { session, at, read } = setup();
    session.releaseRecovery();
    at(499);
    const boundary = session.hold('recovery');
    const old = session.bind({ type: 'choose', side: 'left' });
    const checkpoint = session.getState();
    const replacement = setup(checkpoint, 8_000);
    read.mockClear();
    at(Number.NaN);
    expect(session.dispose()).toBe(checkpoint);
    expect(session.dispose()).toBe(checkpoint);
    expect(getRunResult(checkpoint)).toBeNull();
    expect(old().reason).toBe('session-disposed');
    expect(boundary.release().reason).toBe('session-disposed');
    expect(session.hold('ad').result.reason).toBe('session-disposed');
    expect(read).not.toHaveBeenCalled();
    expect(replacement.session.getState()).toBe(checkpoint);
    replacement.session.releaseRecovery();
    replacement.at(8_001);
    expect(replacement.session.tick().state.sp).toBe(302);
  });
});

describe('clock failures and transactional retries', () => {
  it('rejects rollback and non-finite samples without changing state or consuming input', () => {
    const { session, at } = setup();
    session.releaseRecovery();
    at(50);
    session.tick();
    const checkpoint = session.getState();
    const choice = session.bind({ type: 'choose', side: 'left' });
    for (const invalid of [49, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      at(invalid);
      expect(choice).toThrow(RangeError);
      expect(session.getState()).toBe(checkpoint);
    }
    at(60);
    expect(choice().state).toMatchObject({ activeTimeMs: 60, lastClearedRow: '1' });
  });

  it('rejects invalid observation sources and preserves their lease for a corrected release', () => {
    let observed = 2_000;
    const session = createTimedRunSession(fresh(), rng, {
      monotonicNow: () => 0,
      observedAt: observed,
      observationNow: () => observed,
    });
    for (const invalid of [1_999, 2_000.1, Number.NaN]) {
      observed = invalid;
      expect(session.releaseRecovery).toThrow(RangeError);
      expect(session.getPauseReasons()).toEqual(['recovery']);
    }
    observed = 2_000;
    expect(session.releaseRecovery().accepted).toBe(true);
    expect(session.isRunning()).toBe(true);
  });

  it('fails exact-integer overflow without advancing a checkpoint', () => {
    const initial = { ...fresh(), activeTimeMs: Number.MAX_SAFE_INTEGER };
    const { session, at } = setup(initial);
    session.releaseRecovery();
    at(1);
    expect(session.tick).toThrow(RangeError);
    expect(session.getState()).toBe(initial);
    expect(() =>
      createTimedRunSession(fresh(), rng, { monotonicNow: () => 0, observedAt: 999 }),
    ).toThrow(RangeError);
  });

  it('leaves time and a bound mystery retryable when injected RNG throws', () => {
    let state = withEffect();
    for (let i = 0; i < 3; i += 1) {
      state = transitionRun(
        state,
        { type: 'choose', side: 'left', row: state.currentRow, life: 0 },
        { activeTimeMs: 0, achievedAt: 1_000, rng },
      ).state;
    }
    let fail = false;
    let now = 0;
    const failingRng: RandomSource = {
      ...rng,
      next(value) {
        if (fail) throw new Error('Injected RNG failure');
        return rng.next(value);
      },
    };
    const session = createTimedRunSession(state, failingRng, { monotonicNow: () => now });
    session.releaseRecovery();
    const mystery = session.bind({ type: 'mystery' });
    now = 500;
    fail = true;
    expect(mystery).toThrow('Injected RNG failure');
    expect(session.getState()).toBe(state);
    fail = false;
    const result = mystery();
    expect(result.state).toMatchObject({
      activeTimeMs: 500,
      sp: 322,
      current: { mysteryOutcome: 'heal_20' },
    });
    expect(result.events.filter(({ type }) => type === 'effects-ticked')).toHaveLength(1);
  });

  it('keeps session lazy-time guards ahead of all source reads', () => {
    const session = createRunSession(fresh(), rng);
    const source = vi.fn(() => ({ activeTimeMs: 0, achievedAt: 1_000 }));
    const choice = session.bind({ type: 'choose', side: 'left' });
    const stale = session.bind({ type: 'choose', side: 'left' });
    choice(source);
    expect(source).toHaveBeenCalledTimes(1);
    choice(source);
    stale(source);
    session.dispose();
    session.bind({ type: 'tick' })(source);
    expect(source).toHaveBeenCalledTimes(1);
  });
});
