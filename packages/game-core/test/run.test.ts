import { describe, expect, it } from 'vitest';
import { createRun, getRunResult, transitionRun } from '../src/index.ts';
import type {
  ActiveEffect,
  RandomCursor,
  RandomSource,
  RunCommand,
  RunState,
  TileSide,
} from '../src/index.ts';

// Independent deterministic inputs: route draws are always zero; reward draws
// select a known interior of the source's weighted table. No host RNG or timer.
const rng: RandomSource = {
  algorithm: 'test-constant-v1',
  next(cursor) {
    return {
      value: Number(cursor.state),
      cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
    };
  },
};

function cursor(value: number): RandomCursor {
  return { algorithm: rng.algorithm, state: String(value), draws: '0' };
}

function fresh(rewardDraw = 0.1, ahead = 8, history = 4): RunState {
  return createRun(
    {
      runId: 'invariant-run',
      routeRng: cursor(0),
      mysteryRng: cursor(rewardDraw),
      observedAt: 100_000,
      buffer: { ahead, history },
    },
    rng,
  );
}

function act(state: RunState, command: RunCommand, time = state.activeTimeMs) {
  return transitionRun(state, command, {
    activeTimeMs: time,
    achievedAt: Math.max(state.lastObservedAt, 100_000 + time),
    rng,
  });
}

function choose(state: RunState, side: TileSide = 'left', time = state.activeTimeMs) {
  return act(
    state,
    { type: 'choose', row: state.currentRow, life: state.revivesApplied, side },
    time,
  );
}

function reach(state: RunState, lastCleared: number): RunState {
  let current = state;
  while (BigInt(current.lastClearedRow) < BigInt(lastCleared)) {
    const result = choose(current);
    expect(result.accepted).toBe(true);
    current = result.state;
  }
  return current;
}

function atMystery(draw: number): RunState {
  return reach(fresh(draw), 3);
}

function mystery(state: RunState, time = state.activeTimeMs) {
  return act(state, { type: 'mystery', row: state.currentRow, life: state.revivesApplied }, time);
}

function death(state: RunState): NonNullable<RunState['death']> {
  if (state.death === null) throw new Error('Test expected a death snapshot');
  return state.death;
}

function grant(state: RunState) {
  return act(state, {
    type: 'grant-revive',
    deathId: death(state).id,
    ordinal: state.revivesGranted + 1,
    grantId: `grant-${state.revivesGranted + 1}`,
  });
}

function apply(state: RunState) {
  const receipt = state.reviveReceipts.at(-1);
  if (!receipt) throw new Error('Test expected a grant');
  return act(state, {
    type: 'apply-revive',
    deathId: receipt.deathId,
    ordinal: receipt.ordinal,
    grantId: receipt.grantId,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('single-player run transitions', () => {
  it('starts a versioned, serializable attempt with the accepted resources', () => {
    const state = fresh();
    expect(state).toMatchObject({
      schemaVersion: 1,
      status: 'playing',
      sp: 300,
      hints: 2,
      lastClearedRow: '0',
      currentRow: '1',
      revivesGranted: 0,
      revivesApplied: 0,
      revivesToReachScore: 0,
      effects: [],
      pendingReward: null,
      result: null,
    });
    expect(state.rulesetVersion.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(getRunResult(state)).toBeNull();
  });

  it('does not mutate a frozen input graph or its saved generator cursors', () => {
    const before = deepFreeze(fresh());
    const serialized = JSON.stringify(before);
    const result = choose(before);
    expect(result.accepted).toBe(true);
    expect(result.state.lastClearedRow).toBe('1');
    expect(JSON.stringify(before)).toBe(serialized);
    expect(result.state).not.toBe(before);
  });

  it('charges a hint once and rejects a stale row without consuming the next row', () => {
    const start = fresh();
    const command: RunCommand = { type: 'hint', row: '1', life: 0 };
    const hinted = act(start, command);
    expect(hinted.state.hints).toBe(1);
    expect(hinted.state.current.revealedSafeSide).toBe('left');
    expect(act(hinted.state, command)).toMatchObject({
      accepted: false,
      reason: 'already-revealed',
    });
    const advanced = choose(hinted.state).state;
    expect(act(advanced, command)).toMatchObject({ accepted: false, reason: 'wrong-row' });
    const doubleTap = act(advanced, { type: 'choose', row: '1', life: 0, side: 'left' });
    expect(doubleTap.accepted).toBe(false);
    expect(doubleTap.state.lastClearedRow).toBe('1');
    expect(doubleTap.state.hints).toBe(1);
  });

  it('consumes mystery once without advancing and preserves the rolled outcome', () => {
    const start = atMystery(0.2);
    const result = mystery({ ...start, sp: 395 });
    expect(result.accepted).toBe(true);
    expect(result.state).toMatchObject({ sp: 400, lastClearedRow: '3', currentRow: '4' });
    expect(result.state.current.mysteryOutcome).toBe('heal_20');
    const duplicate = mystery(result.state);
    expect(duplicate).toMatchObject({ accepted: false, reason: 'mystery-consumed' });
    expect(duplicate.state.mysteryRng).toEqual(result.state.mysteryRng);
    expect(duplicate.events).toEqual([]);
  });

  it('leaves the fatal row unresolved and preserves hints, mystery and revealed information on revive', () => {
    let state = atMystery(0.77);
    state = mystery(state).state; // lose_hint: 2 -> 1; mystery is consumed.
    state = act(state, { type: 'hint', row: '4', life: 0 }).state;
    const fatal = choose({ ...state, sp: 10 }, 'right');
    expect(fatal.state).toMatchObject({
      status: 'dead',
      sp: 0,
      lastClearedRow: '3',
      currentRow: '4',
      hints: 0,
    });
    expect(fatal.state.death).toMatchObject({ fatalRow: '4', cause: 'wrong_tile' });
    expect(fatal.events.filter((event) => event.type === 'death')).toHaveLength(1);
    expect(fatal.events.some((event) => event.type === 'row-cleared')).toBe(false);
    expect(getRunResult(fatal.state)).toBeNull();
    const granted = grant(fatal.state);
    expect(granted.state).toMatchObject({
      status: 'dead',
      revivesGranted: 1,
      revivesApplied: 0,
      sp: 0,
    });
    const revived = apply(granted.state);
    expect(revived.state).toMatchObject({
      status: 'playing',
      sp: 200,
      hints: 0,
      lastClearedRow: '3',
      currentRow: '4',
      effects: [],
      revivesGranted: 1,
      revivesApplied: 1,
      revivesToReachScore: 0,
    });
    expect(revived.state.current).toEqual(fatal.state.current);
    expect(revived.state.rows).toEqual(fatal.state.rows);
    expect(revived.state.stream).toEqual(fatal.state.stream);
    expect(revived.state.mysteryRng).toEqual(fatal.state.mysteryRng);
    expect(choose(revived.state).state).toMatchObject({
      lastClearedRow: '4',
      currentRow: '5',
      revivesToReachScore: 1,
    });
  });

  it('retains the first death and rejects further play while dead', () => {
    const fatal = choose({ ...fresh(), sp: 10 }, 'right').state;
    for (const command of [
      { type: 'choose', row: '1', life: 0, side: 'right' },
      { type: 'hint', row: '1', life: 0 },
      { type: 'mystery', row: '1', life: 0 },
      { type: 'tick' },
    ] satisfies RunCommand[]) {
      const result = act(fatal, command);
      expect(result.state.deaths).toBe(1);
      expect(result.state.death).toEqual(fatal.death);
      expect(result.events.some((event) => event.type === 'death')).toBe(false);
    }
  });

  it('binds revival to the current death, ordinal and grant; late callbacks cannot reset SP', () => {
    const fatal = choose({ ...fresh(), sp: 10 }, 'right').state;
    const wrongDeath = act(fatal, {
      type: 'grant-revive',
      deathId: 'different-death',
      ordinal: 1,
      grantId: 'wrong',
    });
    expect(wrongDeath.accepted).toBe(false);
    const missing = act(fatal, {
      type: 'apply-revive',
      deathId: death(fatal).id,
      ordinal: 1,
      grantId: 'missing',
    });
    expect(missing.accepted).toBe(false);
    expect(
      act(fatal, {
        type: 'grant-revive',
        deathId: death(fatal).id,
        ordinal: 2,
        grantId: 'wrong-ordinal',
      }).accepted,
    ).toBe(false);
    const granted = grant(fatal).state;
    const revived = apply(granted).state;
    const played = choose(revived, 'right').state;
    expect(played.sp).toBe(190);
    for (const type of ['grant-revive', 'apply-revive'] as const) {
      const replay = act(played, {
        type,
        deathId: death(fatal).id,
        ordinal: 1,
        grantId: 'grant-1',
      });
      expect(replay.accepted).toBe(false);
      expect(replay.state.sp).toBe(190);
      expect(replay.state.revivesApplied).toBe(1);
      expect(replay.state.revivesGranted).toBe(1);
    }
  });

  it('rejects a pre-death input callback after revive repeats the same row', () => {
    const oldInput: RunCommand = { type: 'choose', row: '1', life: 0, side: 'right' };
    const fatal = act({ ...fresh(), sp: 10 }, oldInput).state;
    const revived = apply(grant(fatal).state).state;
    const stale = act(revived, oldInput);
    expect(stale).toMatchObject({ accepted: false, reason: 'wrong-life' });
    expect(stale.state).toMatchObject({ sp: 200, lastClearedRow: '0', currentRow: '1' });
    expect(stale.events).toEqual([]);
  });

  it('implements all ten accepted revive amounts and finalizes only on the following death', () => {
    let state = fresh();
    const expected = [200, 200, 200, 200, 200, 150, 150, 150, 150, 150];
    for (const [index, sp] of expected.entries()) {
      state = choose({ ...state, sp: 10 }, 'right').state;
      expect(state.status).toBe('dead');
      state = grant(state).state;
      state = apply(state).state;
      expect(state).toMatchObject({
        status: 'playing',
        sp,
        revivesGranted: index + 1,
        revivesApplied: index + 1,
        lastClearedRow: '0',
        revivesToReachScore: 0,
      });
    }
    const finalDeath = choose({ ...state, sp: 10 }, 'right');
    expect(finalDeath.state.status).toBe('finished');
    expect(getRunResult(finalDeath.state)).toMatchObject({
      endReason: 'revive-limit',
      fatalRow: '1',
      lastClearedRow: '0',
      revivesGranted: 10,
      revivesApplied: 10,
      revivesToReachScore: 0,
    });
    expect(finalDeath.events.filter((event) => event.type === 'death')).toHaveLength(1);
    expect(finalDeath.events.filter((event) => event.type === 'run-ended')).toHaveLength(1);
    expect(
      act(finalDeath.state, {
        type: 'grant-revive',
        deathId: death(finalDeath.state).id,
        ordinal: 11,
        grantId: 'grant-11',
      }).accepted,
    ).toBe(false);
    expect(finalDeath.state.reviveReceipts).toHaveLength(10);
  });

  it('keeps pending verification recoverable and requires explicit forfeiture of an unused grant', () => {
    const fatal = choose({ ...fresh(), sp: 10 }, 'right').state;
    const pending = { deathId: death(fatal).id, ordinal: 1, intentId: 'intent-1' };
    const waiting = act(fatal, { type: 'mark-reward-pending', ...pending }).state;
    expect(act(waiting, { type: 'end' })).toMatchObject({
      accepted: false,
      reason: 'reward-pending',
    });
    expect(getRunResult(waiting)).toBeNull();
    expect(
      act(waiting, {
        type: 'grant-revive',
        deathId: pending.deathId,
        ordinal: 1,
        grantId: 'grant-1',
        intentId: 'other',
      }).accepted,
    ).toBe(false);
    const noReward = act(waiting, { type: 'clear-reward-pending', ...pending }).state;
    expect(noReward).toMatchObject({ revivesGranted: 0, revivesApplied: 0, pendingReward: null });
    const granted = grant(noReward).state;
    expect(act(granted, { type: 'end' })).toMatchObject({
      accepted: false,
      reason: 'forfeiture-required',
    });
    const ended = act(granted, { type: 'end', forfeitGrantedReward: true }).state;
    expect(getRunResult(ended)).toMatchObject({
      endReason: 'death-declined',
      revivesGranted: 1,
      revivesApplied: 0,
    });
    expect(ended.reviveReceipts[0]?.status).toBe('forfeited');
    expect(apply(ended).accepted).toBe(false);
  });

  it('freezes score metadata when a later revive adds no cleared row', () => {
    const score = choose(fresh(), 'left', 100).state;
    const fatal = choose({ ...score, sp: 10 }, 'right', 200).state;
    const revived = apply(grant(fatal).state).state;
    const ended = act(revived, { type: 'end' }).state;
    expect(getRunResult(ended)).toMatchObject({
      lastClearedRow: '1',
      revivesGranted: 1,
      revivesApplied: 1,
      revivesToReachScore: 0,
      achievedAt: score.achievedAt,
      endReason: 'user-ended',
    });
    const repeated = act(ended, { type: 'end' });
    expect(repeated.accepted).toBe(false);
    expect(repeated.events).toEqual([]);
    expect(getRunResult(repeated.state)).toEqual(getRunResult(ended));
  });

  it.each(['left', 'right'] as const)('continues past row350 on a survived %s choice', (side) => {
    const state = reach(fresh(), 349);
    const result = choose(state, side);
    expect(result.state).toMatchObject({
      status: 'playing',
      lastClearedRow: '350',
      currentRow: '351',
      result: null,
    });
    expect(result.events.some((event) => event.type === 'run-ended')).toBe(false);
    expect(choose(result.state).state.lastClearedRow).toBe('351');
  });

  it('repeats a fatal row350 after authorized revive without adding a false cleared row', () => {
    const fatal = choose({ ...reach(fresh(), 349), sp: 20 }, 'right').state;
    expect(fatal).toMatchObject({ status: 'dead', lastClearedRow: '349', currentRow: '350' });
    expect(death(fatal).fatalRow).toBe('350');
    const restored = apply(grant(fatal).state).state;
    expect(restored.current.revealedSafeSide).toBe('left');
    expect(choose(restored).state).toMatchObject({ lastClearedRow: '350', currentRow: '351' });
  });
});

describe('explicit active-time semantics', () => {
  it('resumes a mid-row checkpoint with consumed mystery, hint knowledge, pending ticks and reward verification intact', () => {
    let continuous = mystery({ ...atMystery(0.9), sp: 2 }, 100).state;
    continuous = act(continuous, { type: 'hint', row: '4', life: 0 }, 200).state;
    let restored = JSON.parse(JSON.stringify(continuous)) as RunState;
    expect(restored.current).toMatchObject({
      mysteryOutcome: 'drain_5s',
      revealedSafeSide: 'left',
    });
    expect(restored.hints).toBe(1);
    for (const time of [599, 600]) {
      const a = act(continuous, { type: 'tick' }, time);
      const b = act(restored, { type: 'tick' }, time);
      expect(b).toEqual(a);
      continuous = a.state;
      restored = JSON.parse(JSON.stringify(b.state)) as RunState;
    }
    expect(restored.status).toBe('dead');
    const identity = { deathId: death(restored).id, ordinal: 1, intentId: 'saved-intent' };
    const commands: RunCommand[] = [
      { type: 'mark-reward-pending', ...identity },
      { type: 'end' },
      { type: 'grant-revive', ...identity, grantId: 'saved-grant' },
      { type: 'apply-revive', deathId: identity.deathId, ordinal: 1, grantId: 'saved-grant' },
      { type: 'mystery', row: '4', life: 1 },
      { type: 'choose', row: '4', life: 1, side: 'left' },
    ];
    for (const command of commands) {
      const a = act(continuous, command);
      const b = act(restored, command);
      expect(b).toEqual(a);
      continuous = a.state;
      restored = JSON.parse(JSON.stringify(b.state)) as RunState;
    }
    expect(restored).toMatchObject({
      status: 'playing',
      sp: 200,
      hints: 1,
      lastClearedRow: '4',
      revivesApplied: 1,
    });
    expect(restored.mysteryRng.draws).toBe('1');
  });

  it.each([
    { draw: 0.45, delta: 18, name: 'regen' },
    { draw: 0.9, delta: -18, name: 'drain' },
  ])('schedules nine $name ticks at +500 through +4500ms, never at expiry', ({ draw, delta }) => {
    const started = mystery(atMystery(draw), 100).state;
    const early = act(started, { type: 'tick' }, 599).state;
    expect(early.sp).toBe(300);
    const first = act(early, { type: 'tick' }, 600).state;
    expect(first.sp).toBe(300 + delta / 9);
    const expired = act(started, { type: 'tick' }, 5_100).state;
    expect(expired.sp).toBe(300 + delta);
    expect(expired.effects).toEqual([]);
    const muchLater = act(started, { type: 'tick' }, 1_000_000_000).state;
    expect(muchLater.sp).toBe(300 + delta);
    expect(muchLater.effects).toEqual([]);
  });

  it('produces the same result from incremental ticks and a delayed catch-up', () => {
    const started = mystery(atMystery(0.9), 100).state;
    let incremental = started;
    for (let time = 150; time <= 5_100; time += 50)
      incremental = act(incremental, { type: 'tick' }, time).state;
    const catchUp = act(started, { type: 'tick' }, 5_100).state;
    expect(catchUp).toEqual(incremental);
  });

  it('settles lethal drain before input; no hint, mystery or progress is consumed afterwards', () => {
    const draining = { ...mystery(atMystery(0.9)).state, sp: 2 };
    const result = act(draining, { type: 'hint', row: '4', life: 0 }, 500);
    expect(result).toMatchObject({ accepted: false, reason: 'died-before-command' });
    expect(result.state).toMatchObject({
      status: 'dead',
      sp: 0,
      hints: 2,
      lastClearedRow: '3',
      currentRow: '4',
    });
    expect(result.state.death).toMatchObject({ fatalRow: '4', cause: 'drain', activeTimeMs: 500 });
    expect(result.events.filter((event) => event.type === 'death')).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'hint-used')).toBe(false);
    expect(result.state.current.revealedSafeSide).toBeNull();
  });

  it('sums simultaneous regen/drain before clamping and does not invent a transient death', () => {
    const effects: ActiveEffect[] = ['regen_5s', 'drain_5s'].map((kind) => ({
      kind: kind as 'regen_5s' | 'drain_5s',
      startedAt: 0,
      expiresAt: 5_000,
      nextTickAt: 500,
    }));
    for (const sp of [1, 399, 400]) {
      const result = act({ ...fresh(), sp, effects }, { type: 'tick' }, 500);
      expect(result.state).toMatchObject({ status: 'playing', sp, deaths: 0 });
    }
  });

  it('expires a shield before an input exactly at its expiry', () => {
    const shielded = mystery(atMystery(0.35)).state;
    const before = choose(shielded, 'right', 4_999);
    expect(before.state.sp).toBe(300);
    const boundary = choose(shielded, 'right', 5_000);
    expect(boundary.state.sp).toBe(290);
    expect(boundary.state.effects).toEqual([]);
  });

  it('does not spend active time during a host-confirmed pause and clears effects on revive', () => {
    const shielded = mystery(atMystery(0.35)).state;
    const pausedClock = transitionRun(
      shielded,
      { type: 'tick' },
      { activeTimeMs: 0, achievedAt: 1_000_000, rng },
    ).state;
    expect(pausedClock.effects).toEqual(shielded.effects);
    expect(pausedClock.sp).toBe(shielded.sp);
    const doomed = { ...mystery(atMystery(0.9)).state, sp: 2 };
    const fatal = act(doomed, { type: 'tick' }, 500).state;
    expect(apply(grant(fatal).state).state.effects).toEqual([]);
  });

  it('does not kill an idle player and does not use host time or host randomness', () => {
    const state = fresh();
    const result = act(state, { type: 'tick' }, 1_000_000_000_000);
    expect(result.state).toMatchObject({
      status: 'playing',
      sp: 300,
      hints: 2,
      lastClearedRow: '0',
    });
    expect(result.state.stream).toEqual(state.stream);
    expect(result.state.mysteryRng).toEqual(state.mysteryRng);
  });

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid active clock %s',
    (time) => {
      expect(() => act(fresh(), { type: 'tick' }, time)).toThrow();
    },
  );

  it('rejects backward active or observation clocks', () => {
    const progressed = choose(fresh(), 'left', 100).state;
    expect(() => act(progressed, { type: 'tick' }, 99)).toThrow();
    expect(() =>
      transitionRun(progressed, { type: 'tick' }, { activeTimeMs: 100, achievedAt: 99_999, rng }),
    ).toThrow();
  });

  it('rejects an expired effect in a restored checkpoint instead of replaying an old expiry', () => {
    const corrupted: RunState = {
      ...fresh(),
      activeTimeMs: 6_000,
      effects: [{ kind: 'shield_5s', startedAt: 0, expiresAt: 5_000, nextTickAt: null }],
    };
    expect(() => act(corrupted, { type: 'tick' })).toThrow();
  });

  it('rejects hint-counter overflow instead of rounding or imposing an undocumented cap', () => {
    const state = { ...atMystery(0.3), hints: Number.MAX_SAFE_INTEGER };
    const before = JSON.stringify(state);
    expect(() => mystery(state)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('does not accept an unknown ruleset on create or resume', () => {
    expect(() =>
      createRun(
        {
          runId: 'unsupported',
          observedAt: 0,
          routeRng: cursor(0),
          mysteryRng: cursor(0.1),
          rulesetVersion: 'unknown-v999',
        },
        rng,
      ),
    ).toThrow();
    expect(() => act({ ...fresh(), rulesetVersion: 'unknown-v999' }, { type: 'tick' })).toThrow();
  });
});
