import { describe, expect, it } from 'vitest';
import {
  BUSINESS_STORE_RULESET_VERSION,
  BUSINESS_RULESET_VERSION,
  createRun,
  createPracticeCursor,
  getCurrentRow,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import { shouldFinishPracticeOnExit } from '../src/practice-exit';
import { canResumePractice } from '../src/menu-navigation';
import { createTestStore } from '../src/test-store';

const context = { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 0 };
function dead(version = BUSINESS_STORE_RULESET_VERSION) {
  const state = {
    ...createRun(
      {
        runId: 'practice-exit-regression',
        rulesetVersion: version,
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
        observedAt: 0,
      },
      PRACTICE_RNG,
    ),
    sp: 1,
  };
  return transitionRun(
    state,
    {
      type: 'choose',
      row: '1',
      life: 0,
      side: getCurrentRow(state).safeSide === 'left' ? 'right' : 'left',
    },
    context,
  ).state;
}
describe('explicit result-screen exit', () => {
  it.each([BUSINESS_RULESET_VERSION, BUSINESS_STORE_RULESET_VERSION])(
    'ends %s on menu exit and never offers the result screen as Resume',
    (version) => {
      const state = dead(version);
      expect(shouldFinishPracticeOnExit(state, 'home')).toBe(true);
      const finished = transitionRun(state, { type: 'end', forfeitGrantedReward: false }, context);
      expect(finished.accepted).toBe(true);
      expect(finished.state.result?.endReason).toBe('death-declined');
      expect(canResumePractice({ status: 'ready', state: finished.state, revision: 1 })).toBe(
        false,
      );
    },
  );
  it('keeps a store visit recoverable, but records a later menu exit as finished', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    };
    const state = dead();
    expect(shouldFinishPracticeOnExit(state, 'store')).toBe(false);
    const store = createTestStore(storage);
    store.saveRun(state);
    expect(
      canResumePractice({
        status: 'ready',
        state: createTestStore(storage).snapshot().checkpoint!,
        revision: 1,
      }),
    ).toBe(true);
    store.saveRun(
      transitionRun(state, { type: 'end', forfeitGrantedReward: false }, context).state,
    );
    expect(
      canResumePractice({
        status: 'ready',
        state: createTestStore(storage).snapshot().checkpoint!,
        revision: 2,
      }),
    ).toBe(false);
  });
  it('retains pending or already earned rewards instead of discarding them on exit', () => {
    const state = dead();
    expect(
      shouldFinishPracticeOnExit(
        { ...state, pendingReward: { deathId: state.death!.id, ordinal: 1, intentId: 'pending' } },
        'home',
      ),
    ).toBe(false);
    const granted = transitionRun(
      state,
      { type: 'grant-revive', deathId: state.death!.id, ordinal: 1, grantId: 'earned' },
      context,
    );
    expect(granted.accepted).toBe(true);
    expect(shouldFinishPracticeOnExit(granted.state, 'home')).toBe(false);
  });
});
