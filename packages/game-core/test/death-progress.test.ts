import { describe, expect, it } from 'vitest';
import { createRun, getCurrentRow, getRunResult, transitionRun } from '../src/index.ts';
import type {
  DeathCause,
  RandomCursor,
  RandomSource,
  RunCommand,
  RunState,
  TransitionResult,
} from '../src/index.ts';

// Independent draw inputs place a mystery on each tested boundary. After the
// first route draw, all route draws are zero: safe left and three-row gaps.
const boundaries = [
  { row: 349, firstRouteDraw: 0 },
  { row: 350, firstRouteDraw: 0.25 },
  { row: 351, firstRouteDraw: 0.5 },
] as const;

const rng: RandomSource = {
  algorithm: 'cpi006-boundary-inputs-v1',
  next(cursor) {
    const [domain, sample] = cursor.state.split(':');
    return {
      value: domain === 'reward' || cursor.draws === '0' ? Number(sample) : 0,
      cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() },
    };
  },
};

function cursor(domain: 'route' | 'reward', sample: number): RandomCursor {
  return { algorithm: rng.algorithm, state: `${domain}:${sample}`, draws: '0' };
}

function act(state: RunState, command: RunCommand, activeTimeMs = state.activeTimeMs) {
  return transitionRun(state, command, {
    activeTimeMs,
    achievedAt: state.lastObservedAt + 1,
    rng,
  });
}

function boundary(
  { row, firstRouteDraw }: (typeof boundaries)[number],
  rewardDraw = 0.72,
): RunState {
  let state = createRun(
    {
      runId: `boundary-${row}`,
      observedAt: 1_000,
      routeRng: cursor('route', firstRouteDraw),
      mysteryRng: cursor('reward', rewardDraw),
    },
    rng,
  );
  for (let cleared = 0; cleared < row - 1; cleared += 1) {
    const advanced = act(state, {
      type: 'choose',
      row: state.currentRow,
      life: state.revivesApplied,
      side: 'left',
    });
    if (!advanced.accepted) throw new Error(`Boundary setup failed: ${advanced.reason}`);
    state = advanced.state;
  }
  expect(state.currentRow).toBe(String(row));
  expect(getCurrentRow(state)).toMatchObject({ safeSide: 'left', hasMystery: true });
  return state;
}

function mystery(state: RunState): TransitionResult {
  return act(state, {
    type: 'mystery',
    row: state.currentRow,
    life: state.revivesApplied,
  });
}

function fatal(state: RunState, cause: DeathCause): TransitionResult {
  const nearDeath = { ...state, sp: 1 };
  if (cause === 'wrong_tile') {
    return act(nearDeath, {
      type: 'choose',
      row: nearDeath.currentRow,
      life: nearDeath.revivesApplied,
      side: 'right',
    });
  }
  const opened = mystery(nearDeath);
  return cause === 'mystery'
    ? opened
    : act(opened.state, { type: 'tick' }, opened.state.activeTimeMs + 500);
}

function restore(state: RunState): RunState {
  if (!state.death) throw new Error('Restore fixture requires a death');
  const identity = {
    deathId: state.death.id,
    ordinal: state.revivesApplied + 1,
    grantId: `grant-${state.death.id}`,
  };
  const granted = act(state, { type: 'grant-revive', ...identity });
  expect(granted.accepted).toBe(true);
  const applied = act(granted.state, { type: 'apply-revive', ...identity });
  expect(applied.accepted).toBe(true);
  return applied.state;
}

function expectFinalCallbacksIgnored(final: RunState): void {
  const commands: RunCommand[] = [
    { type: 'end' },
    { type: 'end', forfeitGrantedReward: true },
    { type: 'tick' },
    { type: 'choose', row: final.currentRow, life: final.revivesApplied, side: 'left' },
    { type: 'hint', row: final.currentRow, life: final.revivesApplied },
    { type: 'mystery', row: final.currentRow, life: final.revivesApplied },
    { type: 'grant-revive', deathId: `${final.runId}:death:1`, ordinal: 1, grantId: 'late' },
    { type: 'apply-revive', deathId: `${final.runId}:death:1`, ordinal: 1, grantId: 'late' },
  ];
  // A restored final checkpoint is just as final as the in-memory result.
  for (const checkpoint of [final, JSON.parse(JSON.stringify(final)) as RunState]) {
    for (const command of commands) {
      const replayed = act(checkpoint, command);
      expect(replayed).toMatchObject({ accepted: false, reason: 'finished', events: [] });
      expect(replayed.state).toBe(checkpoint);
      expect(getRunResult(replayed.state)).toEqual(getRunResult(final));
    }
  }
}

const survivedPaths = [
  { path: 'correct', side: 'left', sp: 300, expectedSp: 300, rewardDraw: null },
  { path: 'shielded wrong', side: 'right', sp: 300, expectedSp: 300, rewardDraw: 0.35 },
  { path: 'damaging wrong', side: 'right', sp: 21, expectedSp: 1, rewardDraw: null },
  { path: 'lucky wrong', side: 'right', sp: 395, expectedSp: 400, rewardDraw: 0.53 },
  { path: 'inversion wrong', side: 'right', sp: 395, expectedSp: 400, rewardDraw: 0.98 },
] as const;

const fatalPaths = [
  { cause: 'wrong_tile', rewardDraw: 0.78 },
  { cause: 'mystery', rewardDraw: 0.72 },
  { cause: 'drain', rewardDraw: 0.9 },
] as const;

describe('CPI-006 surviving the former finish boundary', () => {
  it.each(boundaries.flatMap((row) => survivedPaths.map((path) => ({ ...row, ...path }))))(
    '$path at row $row clears exactly one row and keeps playing',
    (scenario) => {
      let state: RunState = { ...boundary(scenario, scenario.rewardDraw ?? 0.72), sp: scenario.sp };
      if (scenario.rewardDraw !== null) state = mystery(state).state;
      const command: RunCommand = {
        type: 'choose',
        row: state.currentRow,
        life: state.revivesApplied,
        side: scenario.side,
      };
      const cleared = act(state, command);
      expect(cleared.accepted).toBe(true);
      expect(cleared.state).toMatchObject({
        status: 'playing',
        sp: scenario.expectedSp,
        lastClearedRow: String(scenario.row),
        currentRow: String(scenario.row + 1),
        result: null,
        deaths: 0,
      });
      expect(cleared.events.map(({ type }) => type)).toEqual(['choice-resolved', 'row-cleared']);
      const repeated = act(cleared.state, command);
      expect(repeated).toMatchObject({ accepted: false, reason: 'wrong-row', events: [] });
      expect(repeated.state).toBe(cleared.state);
    },
  );
});

describe('CPI-006 fatal boundary actions and restoration', () => {
  it.each(boundaries.flatMap((row) => fatalPaths.map((path) => ({ ...row, ...path }))))(
    '$cause at row $row retains the last survived score and restores the same row',
    (scenario) => {
      let state = boundary(scenario, scenario.rewardDraw);
      state = act(state, { type: 'hint', row: state.currentRow, life: 0 }).state;
      if (scenario.cause === 'wrong_tile') state = mystery(state).state;
      const score = { lastClearedRow: state.lastClearedRow, achievedAt: state.achievedAt };
      const died = fatal(state, scenario.cause);
      expect(died.accepted).toBe(true);
      expect(died.state).toMatchObject({
        ...score,
        status: 'dead',
        sp: 0,
        currentRow: String(scenario.row),
        deaths: 1,
        death: { fatalRow: String(scenario.row), cause: scenario.cause },
        result: null,
      });
      expect(died.events.filter(({ type }) => type === 'death')).toHaveLength(1);
      expect(died.events.some(({ type }) => type === 'row-cleared' || type === 'run-ended')).toBe(
        false,
      );
      for (const command of [
        { type: 'choose', row: died.state.currentRow, life: 0, side: 'left' },
        { type: 'hint', row: died.state.currentRow, life: 0 },
        { type: 'mystery', row: died.state.currentRow, life: 0 },
        { type: 'tick' },
      ] satisfies RunCommand[]) {
        const blocked = act(died.state, command);
        expect(blocked).toMatchObject({ accepted: false, events: [] });
        expect(blocked.state).toBe(died.state);
      }

      const revived = restore(JSON.parse(JSON.stringify(died.state)) as RunState);
      expect(revived).toMatchObject({
        ...score,
        status: 'playing',
        sp: 200,
        currentRow: String(scenario.row),
        hints: died.state.hints,
        effects: [],
        revivesApplied: 1,
        revivesToReachScore: 0,
        result: null,
      });
      expect(revived.current).toEqual(died.state.current);
      expect(revived.rows).toEqual(died.state.rows);
      expect(revived.stream).toEqual(died.state.stream);
      expect(revived.mysteryRng).toEqual(died.state.mysteryRng);
      expect(mystery(revived)).toMatchObject({ accepted: false, reason: 'mystery-consumed' });
      const cleared = act(revived, {
        type: 'choose',
        row: revived.currentRow,
        life: 1,
        side: 'left',
      });
      expect(cleared.state).toMatchObject({
        status: 'playing',
        lastClearedRow: String(scenario.row),
        currentRow: String(scenario.row + 1),
        revivesToReachScore: 1,
      });
      expect(cleared.events.map(({ type }) => type)).toEqual(['choice-resolved', 'row-cleared']);
    },
  );

  it('resolves fatal drain before an unconsumed healing mystery on row 350', () => {
    const state: RunState = {
      ...boundary(boundaries[1], 0.18),
      sp: 2,
      effects: [{ kind: 'drain_5s', startedAt: 0, expiresAt: 5_000, nextTickAt: 500 }],
    };
    const attempted = act(state, { type: 'mystery', row: '350', life: 0 }, 500);
    expect(attempted).toMatchObject({ accepted: false, reason: 'died-before-command' });
    expect(attempted.state).toMatchObject({
      status: 'dead',
      sp: 0,
      lastClearedRow: '349',
      currentRow: '350',
      current: { mysteryOutcome: null, revealedSafeSide: null },
      death: { cause: 'drain', activeTimeMs: 500, fatalRow: '350' },
      result: null,
    });
    expect(attempted.state.achievedAt).toBe(state.achievedAt);
    expect(attempted.state.mysteryRng).toEqual(state.mysteryRng);
    expect(attempted.events.map(({ type }) => type)).toEqual(['effects-ticked', 'death']);
    // The rejected input still returns the death state; discard neither state nor events.
    expect(attempted.state).not.toBe(state);
  });
});

describe('CPI-006 final results remain final', () => {
  it('explicitly ends a survived row-350 run once, including after checkpoint restoration', () => {
    const active = boundary(boundaries[2]);
    const ended = act(active, { type: 'end' });
    expect(ended.accepted).toBe(true);
    expect(ended.events.map(({ type }) => type)).toEqual(['run-ended']);
    expect(getRunResult(ended.state)).toMatchObject({
      endReason: 'user-ended',
      lastClearedRow: '350',
      fatalRow: null,
      deathCause: null,
      achievedAt: active.achievedAt,
    });
    expectFinalCallbacksIgnored(ended.state);
  });

  it.each(fatalPaths)(
    'the eleventh $cause death at row 350 emits one final result and rejects late callbacks',
    ({ cause, rewardDraw }) => {
      let state = boundary(boundaries[1], rewardDraw);
      for (let count = 0; count < 10; count += 1) state = restore(fatal(state, 'wrong_tile').state);
      const score = { lastClearedRow: state.lastClearedRow, achievedAt: state.achievedAt };
      const final = fatal(state, cause);
      expect(final.state).toMatchObject({ status: 'finished', sp: 0, deaths: 11 });
      expect(final.events.filter(({ type }) => type === 'death')).toHaveLength(1);
      expect(final.events.filter(({ type }) => type === 'run-ended')).toHaveLength(1);
      expect(final.events.at(-1)?.type).toBe('run-ended');
      expect(getRunResult(final.state)).toMatchObject({
        ...score,
        lastClearedRow: '349',
        fatalRow: '350',
        deathCause: cause,
        endReason: 'revive-limit',
        revivesGranted: 10,
        revivesApplied: 10,
        revivesToReachScore: 0,
      });
      expectFinalCallbacksIgnored(final.state);
    },
  );
});
