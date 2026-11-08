import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIC_STORE_RULESET_VERSION,
  READING_STORE_RULESET_VERSION,
  createRun,
  createPracticeCursor,
  PRACTICE_RNG,
  tileExperimentVersion,
} from '@crystal-path-infinity/game-core';
import { BalanceTuner } from '../src/balance-tuner';
import {
  BALANCE_TUNING_KEY,
  readBalanceTuning,
  writeBalanceTuning,
  nextPracticeRuleset,
} from '../src/balance-tuning';
import {
  readPracticeCheckpoint,
  writePracticeCheckpoint,
  readPracticePersonalBest,
  recordPracticePersonalBest,
} from '../src/practice-save';
import { createTestStore } from '../src/test-store';

class Storage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('local balance tuning', () => {
  it('changes only new runs and preserves saved routes and separate bests', () => {
    const storage = new Storage();
    vi.stubGlobal('window', { localStorage: storage });
    writeBalanceTuning(storage, { mode: 'independent', high: 60, low: 1 });
    const first = nextPracticeRuleset(true);
    const run = createRun(
      {
        runId: 'practice-tuning-save',
        rulesetVersion: first,
        routeRng: createPracticeCursor(11),
        mysteryRng: createPracticeCursor(12),
        observedAt: 0,
      },
      PRACTICE_RNG,
    );
    writePracticeCheckpoint(storage, run);
    recordPracticePersonalBest(storage, '15', first);
    writeBalanceTuning(storage, { mode: 'independent', high: 20, low: 1 });
    const second = nextPracticeRuleset(true);
    expect(first).toBe(tileExperimentVersion(60, 1, true, 'extended-reading'));
    expect(second).toBe(tileExperimentVersion(20, 1, true, 'extended-reading'));
    expect(readPracticeCheckpoint(storage)).toMatchObject({ status: 'ready', state: run });
    expect(readPracticePersonalBest(storage, first)).toBe('15');
    expect(readPracticePersonalBest(storage, second)).toBeNull();
    expect(readPracticePersonalBest(storage, CLASSIC_STORE_RULESET_VERSION)).toBeNull();
    const store = createTestStore(storage);
    store.saveRun(run);
    store.recordAssistedBest('10', first);
    expect(createTestStore(storage).snapshot().checkpoint).toEqual(run);
    expect(store.assistedBest(second)).toBeNull();
  });
  it('falls back safely from corrupt settings and rejects invalid custom percentages', () => {
    const storage = new Storage();
    storage.setItem(
      BALANCE_TUNING_KEY,
      '{"version":1,"tuning":{"mode":"independent","high":900,"low":1}}',
    );
    expect(readBalanceTuning(storage)).toEqual({ mode: 'classic' });
    expect(() => writeBalanceTuning(storage, { mode: 'independent', high: -2, low: 1 })).toThrow();
  });
  it('offers custom odds in the playtest menu and ignores them in production', () => {
    const storage = new Storage();
    vi.stubGlobal('window', { localStorage: storage });
    writeBalanceTuning(storage, { mode: 'independent', high: 45, low: 1 });
    expect(renderToStaticMarkup(createElement(BalanceTuner))).toContain('45% / 1%');
    vi.stubEnv('MODE', 'production');
    expect(renderToStaticMarkup(createElement(BalanceTuner))).toBe('');
    expect(nextPracticeRuleset(true)).toBe(READING_STORE_RULESET_VERSION);
  });
});
