import { describe, expect, it, vi } from 'vitest';
import { createRun, createRunSession, getRunResult, transitionRun } from '../src/index.ts';
import type {
  RandomCursor,
  RandomSource,
  RunSession,
  RunState,
  SessionTime,
} from '../src/index.ts';

const rng: RandomSource = {
  algorithm: 'session-test-inputs-v1',
  next(cursor) {
    return {
      value: Number(cursor.state),
      cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
    };
  },
};

function cursor(sample: number): RandomCursor {
  return { algorithm: rng.algorithm, state: String(sample), draws: '0' };
}

function time(activeTimeMs = 0): SessionTime {
  return { activeTimeMs, achievedAt: 1_000 + activeTimeMs };
}

const oldTime: SessionTime = { activeTimeMs: -1, achievedAt: -1 };

function fresh(rewardDraw = 0.18): RunState {
  return createRun(
    {
      runId: 'session-run',
      observedAt: 1_000,
      routeRng: cursor(0),
      mysteryRng: cursor(rewardDraw),
    },
    rng,
  );
}

function atMystery(): RunState {
  let state = fresh();
  for (let index = 0; index < 3; index += 1) {
    state = transitionRun(
      state,
      { type: 'choose', side: 'left', row: state.currentRow, life: 0 },
      { ...time(), rng },
    ).state;
  }
  return state;
}

function restore(session: RunSession): void {
  const state = session.getState();
  if (!state.death) throw new Error('Restore fixture requires a death');
  const identity = {
    deathId: state.death.id,
    ordinal: state.revivesApplied + 1,
    grantId: `grant-${state.death.id}`,
  };
  expect(
    session.bind({ type: 'grant-revive', ...identity })(time(state.activeTimeMs)).accepted,
  ).toBe(true);
  expect(
    session.bind({ type: 'apply-revive', ...identity })(time(state.activeTimeMs)).accepted,
  ).toBe(true);
}

function dead(): RunState {
  return transitionRun(
    { ...fresh(), sp: 1 },
    { type: 'choose', side: 'right', row: '1', life: 0 },
    { ...time(), rng },
  ).state;
}

describe('session command ownership', () => {
  it('commits one double-tap delivery and rejects another old-row binding before its clock', () => {
    const session = createRunSession(fresh(), rng);
    const first = session.bind({ type: 'choose', side: 'left' });
    const separateOldChoice = session.bind({ type: 'choose', side: 'left' });
    const separateOldEnd = session.bind({ type: 'end' });
    const cleared = first(time());
    expect(cleared.accepted).toBe(true);
    expect(cleared.events.filter(({ type }) => type === 'row-cleared')).toHaveLength(1);
    expect(session.getState()).toBe(cleared.state);
    expect(session.getState().lastClearedRow).toBe('1');

    expect(first(oldTime)).toMatchObject({
      accepted: false,
      reason: 'command-consumed',
      events: [],
    });
    for (const callback of [separateOldChoice, separateOldEnd]) {
      expect(callback(oldTime)).toMatchObject({
        accepted: false,
        reason: 'stale-command',
        events: [],
      });
    }
    expect(session.getState()).toBe(cleared.state);
  });

  it('keeps a separate choice binding valid after same-row hint and mystery actions', () => {
    const session = createRunSession(atMystery(), rng);
    const choose = session.bind({ type: 'choose', side: 'right' });
    expect(session.bind({ type: 'hint' })(time()).accepted).toBe(true);
    expect(session.bind({ type: 'mystery' })(time()).accepted).toBe(true);
    expect(session.getState()).toMatchObject({ sp: 320, hints: 1, currentRow: '4' });

    const cleared = choose(time());
    expect(cleared.accepted).toBe(true);
    expect(cleared.state).toMatchObject({
      sp: 310,
      hints: 1,
      lastClearedRow: '4',
      currentRow: '5',
    });
    expect(session.getState()).toBe(cleared.state);
  });

  it('reuses a tick binding across ordinary progress while reading the latest checkpoint', () => {
    const initial: RunState = {
      ...fresh(),
      effects: [{ kind: 'regen_5s', startedAt: 0, expiresAt: 5_000, nextTickAt: 500 }],
    };
    const session = createRunSession(initial, rng);
    const tick = session.bind({ type: 'tick' });
    session.bind({ type: 'choose', side: 'left' })(time());
    const firstTick = tick(time(500));
    expect(firstTick.accepted).toBe(true);
    expect(firstTick.state).toMatchObject({ sp: 302, lastClearedRow: '1' });
    session.bind({ type: 'choose', side: 'left' })(time(500));
    const secondTick = tick(time(1_000));
    expect(secondTick.accepted).toBe(true);
    expect(secondTick.state).toMatchObject({ sp: 304, lastClearedRow: '2' });
    expect(secondTick.events.map(({ type }) => type)).toEqual(['effects-ticked']);
  });

  it('invalidates old end, tick and choice callbacks across death and same-row revive', () => {
    const session = createRunSession({ ...fresh(), sp: 1 }, rng);
    const callbacks = [
      session.bind({ type: 'end' }),
      session.bind({ type: 'tick' }),
      session.bind({ type: 'choose', side: 'left' }),
    ];
    const died = session.bind({ type: 'choose', side: 'right' })(time());
    expect(died.state).toMatchObject({ status: 'dead', currentRow: '1', revivesApplied: 0 });
    for (const callback of callbacks) {
      expect(callback(oldTime)).toMatchObject({ reason: 'stale-command', events: [] });
    }
    restore(session);
    const revived = session.getState();
    expect(revived).toMatchObject({
      status: 'playing',
      sp: 200,
      currentRow: '1',
      revivesApplied: 1,
    });
    for (const callback of callbacks) {
      const ignored = callback(oldTime);
      expect(ignored).toMatchObject({ accepted: false, reason: 'stale-command', events: [] });
      expect(ignored.state).toBe(revived);
    }
    expect(session.getState()).toBe(revived);
  });

  it('keeps two owners independent even when their run IDs and starting snapshots match', () => {
    const initial = fresh();
    const original = createRunSession(initial, rng);
    const callback = original.bind({ type: 'choose', side: 'left' });
    const replacement = createRunSession(initial, rng);
    callback(time());
    expect(original.getState().lastClearedRow).toBe('1');
    expect(replacement.getState()).toBe(initial);
    replacement.bind({ type: 'choose', side: 'right' })(time());
    expect(replacement.getState()).toMatchObject({ lastClearedRow: '1', sp: 290 });
    expect(original.getState().sp).toBe(300);
  });

  it('copies a bound command so later mutation cannot change the delivered action', () => {
    const session = createRunSession(fresh(), rng);
    const command: { type: 'choose'; side: 'left' | 'right' } = { type: 'choose', side: 'left' };
    const callback = session.bind(command);
    command.side = 'right';
    const result = callback(time());
    expect(result.accepted).toBe(true);
    expect(result.state).toMatchObject({ sp: 300, lastClearedRow: '1' });
    expect(result.events[0]).toMatchObject({ type: 'choice-resolved', side: 'left', wrong: false });
  });
});

describe('session disposal and rejected transitions', () => {
  it.each(['playing', 'dead', 'pending'] as const)(
    'disposes a %s view without ending its checkpoint and gives recovery a new owner',
    (stage) => {
      const initial = stage === 'playing' ? fresh() : dead();
      const session = createRunSession(initial, rng);
      const pending = {
        deathId: initial.death?.id ?? 'unused',
        ordinal: 1,
        intentId: 'pending-intent',
      };
      if (stage === 'pending') {
        expect(session.bind({ type: 'mark-reward-pending', ...pending })(time()).accepted).toBe(
          true,
        );
      }
      const callbacks = [
        session.bind({ type: 'end' }),
        session.bind({ type: 'tick' }),
        session.bind({ type: 'choose', side: 'left' }),
      ];
      const checkpoint = session.getState();
      expect(session.dispose()).toBe(checkpoint);
      expect(session.dispose()).toBe(checkpoint);
      expect(getRunResult(checkpoint)).toBeNull();
      expect(checkpoint.status).toBe(stage === 'playing' ? 'playing' : 'dead');
      expect(checkpoint.pendingReward !== null).toBe(stage === 'pending');

      const recovered = createRunSession(JSON.parse(JSON.stringify(checkpoint)) as RunState, rng);
      expect(recovered.getState().runId).toBe(checkpoint.runId);
      for (const callback of callbacks) {
        const ignored = callback(oldTime);
        expect(ignored).toMatchObject({ accepted: false, reason: 'session-disposed', events: [] });
        expect(ignored.state).toBe(checkpoint);
      }
      if (stage === 'pending') {
        expect(recovered.bind({ type: 'clear-reward-pending', ...pending })(time()).accepted).toBe(
          true,
        );
      }
      if (stage !== 'playing') restore(recovered);
      expect(recovered.bind({ type: 'choose', side: 'left' })(time()).accepted).toBe(true);
      expect(recovered.getState().lastClearedRow).toBe('1');
      expect(session.getState()).toBe(checkpoint);
      expect(callbacks[0](oldTime).reason).toBe('session-disposed');
      expect(recovered.getState().lastClearedRow).toBe('1');
    },
  );

  it('commits fatal due drain even when the requested choice is rejected and consumes its binding', () => {
    const initial: RunState = {
      ...fresh(),
      sp: 2,
      effects: [{ kind: 'drain_5s', startedAt: 0, expiresAt: 5_000, nextTickAt: 500 }],
    };
    const session = createRunSession(initial, rng);
    const choose = session.bind({ type: 'choose', side: 'left' });
    const fatal = choose(time(500));
    expect(fatal).toMatchObject({ accepted: false, reason: 'died-before-command' });
    expect(fatal.events.map(({ type }) => type)).toEqual(['effects-ticked', 'death']);
    expect(session.getState()).toBe(fatal.state);
    expect(session.getState()).toMatchObject({
      status: 'dead',
      sp: 0,
      lastClearedRow: '0',
      deaths: 1,
    });
    expect(choose(oldTime)).toMatchObject({ reason: 'command-consumed', events: [] });
    expect(session.bind({ type: 'choose', side: 'left' })(time(500))).toMatchObject({
      accepted: false,
      reason: 'not-playing',
      events: [],
    });
    expect(session.getState()).toBe(fatal.state);
  });

  it('keeps a binding and checkpoint intact when clock validation or the RNG throws', () => {
    const next = vi.fn((cursor: RandomCursor) => rng.next(cursor));
    const source: RandomSource = {
      algorithm: rng.algorithm,
      next,
    };
    const initial = fresh();
    const session = createRunSession(initial, source);
    const choose = session.bind({ type: 'choose', side: 'left' });
    expect(() => choose(oldTime)).toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(session.getState()).toBe(initial);
    next.mockImplementationOnce(() => {
      throw new Error('Injected RNG failure');
    });
    expect(() => choose(time())).toThrow('Injected RNG failure');
    expect(session.getState()).toBe(initial);
    const retried = choose(time());
    expect(retried.accepted).toBe(true);
    expect(session.getState()).toBe(retried.state);
    expect(retried.state.lastClearedRow).toBe('1');
    expect(choose(oldTime).reason).toBe('command-consumed');
  });
});

describe('session end intent and finalization', () => {
  it('emits one final result and prioritizes finished, then disposal, over old clocks and bindings', () => {
    const session = createRunSession(fresh(), rng);
    const end = session.bind({ type: 'end' });
    const tick = session.bind({ type: 'tick' });
    const choose = session.bind({ type: 'choose', side: 'left' });
    const ended = end(time());
    expect(ended.events.map(({ type }) => type)).toEqual(['run-ended']);
    expect(ended.state.status).toBe('finished');
    for (const callback of [end, tick, choose]) {
      const ignored = callback(oldTime);
      expect(ignored).toMatchObject({ accepted: false, reason: 'finished', events: [] });
      expect(ignored.state).toBe(ended.state);
    }
    expect(session.dispose()).toBe(ended.state);
    expect(end(oldTime)).toMatchObject({ reason: 'session-disposed', events: [] });
    expect(session.getState()).toBe(ended.state);
  });

  it('does not let an old forfeiture intent cancel a grant that arrived after binding', () => {
    const initial = dead();
    if (!initial.death) throw new Error('Expected dead fixture');
    const session = createRunSession(initial, rng);
    const oldForfeit = session.bind({ type: 'end', forfeitGrantedReward: true });
    expect(
      session.bind({
        type: 'grant-revive',
        deathId: initial.death.id,
        ordinal: 1,
        grantId: 'new-grant',
      })(time()).accepted,
    ).toBe(true);
    const granted = session.getState();
    expect(oldForfeit(oldTime)).toMatchObject({ reason: 'stale-command', events: [] });
    expect(session.getState()).toBe(granted);
    expect(granted.reviveReceipts[0]?.status).toBe('granted');
    expect(getRunResult(granted)).toBeNull();
    const confirmed = session.bind({ type: 'end', forfeitGrantedReward: true })(time());
    expect(confirmed.accepted).toBe(true);
    expect(confirmed.state.reviveReceipts[0]?.status).toBe('forfeited');
    expect(confirmed.events.map(({ type }) => type)).toEqual(['run-ended']);
  });

  it('invalidates an old end intent after pending verification starts and clears back to the same status', () => {
    const initial = dead();
    if (!initial.death) throw new Error('Expected dead fixture');
    const session = createRunSession(initial, rng);
    const oldEnd = session.bind({ type: 'end' });
    const pending = { deathId: initial.death.id, ordinal: 1, intentId: 'intent-cycle' };
    expect(session.bind({ type: 'mark-reward-pending', ...pending })(time()).accepted).toBe(true);
    expect(session.bind({ type: 'clear-reward-pending', ...pending })(time()).accepted).toBe(true);
    const cleared = session.getState();
    expect(cleared).toMatchObject({
      status: 'dead',
      currentRow: '1',
      revivesApplied: 0,
      pendingReward: null,
    });
    expect(oldEnd(oldTime)).toMatchObject({ accepted: false, reason: 'stale-command', events: [] });
    expect(session.getState()).toBe(cleared);
    expect(getRunResult(cleared)).toBeNull();
    expect(session.bind({ type: 'end' })(time()).accepted).toBe(true);
  });
});
