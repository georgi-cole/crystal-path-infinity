import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  createPracticeCursor,
  createRun,
  getCurrentRow,
  PRACTICE_RNG,
  PACED_RULESET_VERSION,
  presentRowPressure,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import {
  clearPracticeCheckpoint,
  DEFAULT_PRACTICE_SETTINGS,
  PRACTICE_SAVE_KEYS,
  recordPracticePersonalBest,
  readPracticeCheckpoint,
  readPracticeSettings,
  writePracticeCheckpoint,
  writePracticeSettings,
  upgradePracticePacing,
} from '../src/practice-save';
import type { PracticeStorage } from '../src/practice-save';
import { PRACTICE_RULESET_VERSION } from '../src/practice-rules';

class MemoryStorage implements PracticeStorage {
  readonly map = new Map<string, string>();
  failKey: string | null = null;
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('Simulated abrupt termination.');
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}
function newRun(): RunState {
  return createRun(
    {
      runId: 'practice-save-fixture',
      observedAt: 1_000,
      routeRng: createPracticeCursor(1),
      mysteryRng: createPracticeCursor(2),
      buffer: { ahead: 8, history: 2 },
    },
    PRACTICE_RNG,
  );
}
function chooseSafe(state: RunState): RunState {
  const answer = getCurrentRow(state).safeSide;
  const result = transitionRun(
    state,
    {
      type: 'choose',
      row: state.currentRow,
      life: state.revivesApplied,
      side: answer,
    },
    {
      activeTimeMs: state.activeTimeMs + 10,
      achievedAt: state.lastObservedAt + 10,
      rng: PRACTICE_RNG,
    },
  );
  expect(result.accepted).toBe(true);
  return result.state;
}
describe('CPI-009 atomic local practice snapshots', () => {
  it('upgrades v2 without resetting row pressure or granting a retroactive scan hold', () => {
    const base = createRun(
      {
        runId: 'practice-v2-upgrade',
        rulesetVersion: PACED_RULESET_VERSION,
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
        observedAt: 0,
      },
      PRACTICE_RNG,
    );
    const old = transitionRun(
      base,
      { type: 'hint', row: base.currentRow, life: 0 },
      { activeTimeMs: 5000, achievedAt: 5000, rng: PRACTICE_RNG },
    ).state;
    const next = upgradePracticePacing(old);
    expect(next.rulesetVersion).toBe(PRACTICE_RULESET_VERSION);
    expect(next.pacing).toEqual(old.pacing);
    expect(presentRowPressure(next)).toEqual(presentRowPressure(old));
    expect(next.pacing?.hintScanStartedAt).toBeUndefined();
    expect(next.current.revealedSafeSide).toBe(old.current.revealedSafeSide);
    expect(next.hints).toBe(old.hints);
    const store = new MemoryStorage();
    writePracticeCheckpoint(store, next);
    const loaded = readPracticeCheckpoint(store);
    expect(loaded.status === 'ready' && loaded.state).toEqual(next);
  });
  it('upgrades only a living legacy practice without rerolling or retroactive minute rewards', () => {
    const old = transitionRun(
      chooseSafe(newRun()),
      { type: 'tick' },
      {
        activeTimeMs: 123_456,
        achievedAt: 124_456,
        rng: PRACTICE_RNG,
      },
    ).state;
    const next = upgradePracticePacing(old);
    expect(next.rulesetVersion).toBe(PRACTICE_RULESET_VERSION);
    expect(next.pacing).toEqual({ rowEnteredAt: 123_456, nextSurvivalBonusAt: 180_000 });
    expect(presentRowPressure(next)?.active).toBe(false);
    expect(next.rows).toEqual(old.rows);
    expect(next.stream.rng).toEqual(old.stream.rng);
    expect(next.mysteryRng).toEqual(old.mysteryRng);
    expect(next.currentRow).toBe(old.currentRow);
    expect(next.lastClearedRow).toBe(old.lastClearedRow);
    expect(next.sp).toBe(old.sp);
    const store = new MemoryStorage();
    writePracticeCheckpoint(store, next);
    const loaded = readPracticeCheckpoint(store);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') throw new Error('Missing paced checkpoint');
    expect(loaded.state).toEqual(next);
    expect(upgradePracticePacing(loaded.state)).toBe(loaded.state);
    expect(
      upgradePracticePacing(
        transitionRun(
          old,
          { type: 'end' },
          {
            activeTimeMs: old.activeTimeMs,
            achievedAt: old.lastObservedAt,
            rng: PRACTICE_RNG,
          },
        ).state,
      ).rulesetVersion,
    ).toBe('infinity-v1');
  });
  it('restores exact SP, hints, route/mystery cursors and resolved rows', () => {
    const store = new MemoryStorage();
    let state = newRun();
    state = chooseSafe(state);
    const revision = writePracticeCheckpoint(store, state);
    expect(revision).toBe(1);
    const loaded = readPracticeCheckpoint(store);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    expect(loaded.state).toEqual(state);
    assertRunState(loaded.state, PRACTICE_RNG);
    expect([...store.map.keys()].every((k) => k.startsWith('cpi.practice.'))).toBe(true);
  });
  it('does not accept an uncommitted later slot after a slot/pointer crash', () => {
    const store = new MemoryStorage();
    let state = chooseSafe(newRun());
    writePracticeCheckpoint(store, state);
    const before = readPracticeCheckpoint(store);
    state = chooseSafe(state);
    store.failKey = PRACTICE_SAVE_KEYS.head;
    expect(() => writePracticeCheckpoint(store, state)).toThrow('Simulated');
    expect(readPracticeCheckpoint(store)).toEqual(before);
    store.failKey = PRACTICE_SAVE_KEYS.slots[1];
    expect(() => writePracticeCheckpoint(store, state)).toThrow('Simulated');
    expect(readPracticeCheckpoint(store)).toEqual(before);
  });
  it('never silently falls back to stale SP or revive state if the committed slot is damaged', () => {
    const store = new MemoryStorage();
    writePracticeCheckpoint(store, newRun());
    writePracticeCheckpoint(store, chooseSafe(newRun()));
    const head: unknown = JSON.parse(store.getItem(PRACTICE_SAVE_KEYS.head)!);
    if (
      !head ||
      typeof head !== 'object' ||
      !('slot' in head) ||
      (head.slot !== 0 && head.slot !== 1)
    )
      throw new Error('Invalid test slot');
    store.setItem(PRACTICE_SAVE_KEYS.slots[head.slot], '{bad');
    expect(readPracticeCheckpoint(store).status).toBe('corrupt');
    expect(() => writePracticeCheckpoint(store, newRun())).toThrow();
    clearPracticeCheckpoint(store);
    expect(readPracticeCheckpoint(store)).toEqual({ status: 'empty' });
  });
  it('safely rejects unknown envelope and official IDs', () => {
    const store = new MemoryStorage();
    expect(() => writePracticeCheckpoint(store, { ...newRun(), runId: 'ranked-1' })).toThrow();
    writePracticeCheckpoint(store, newRun());
    store.setItem(
      PRACTICE_SAVE_KEYS.head,
      JSON.stringify({ version: 2, slot: 0, revision: 1, digest: 'abcdef01' }),
    );
    expect(readPracticeCheckpoint(store).status).toBe('corrupt');
  });
  it('restores beyond 350 and across a row allocation boundary without reroll', () => {
    const store = new MemoryStorage();
    let state = newRun();
    for (let i = 0; i < 355; i++) state = chooseSafe(state);
    expect(state.currentRow).toBe('356');
    writePracticeCheckpoint(store, state);
    const loaded = readPracticeCheckpoint(store);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    expect(loaded.state).toEqual(state);
    expect(loaded.state.rows.length).toBeLessThanOrEqual(10);
    expect(loaded.state.stream.rng).toEqual(state.stream.rng);
  });
  it('settings are versioned, isolated and safely default when damaged', () => {
    const store = new MemoryStorage();
    expect(readPracticeSettings(store)).toEqual({
      settings: DEFAULT_PRACTICE_SETTINGS,
      warning: null,
    });
    writePracticeSettings(store, {
      music: false,
      soundEffects: true,
      haptics: false,
      reducedMotion: true,
    });
    expect(readPracticeSettings(store).settings.haptics).toBe(false);
    expect(readPracticeSettings(store).settings.reducedMotion).toBe(true);
    store.setItem(PRACTICE_SAVE_KEYS.settings, 'invalid');
    expect(readPracticeSettings(store).warning).not.toBeNull();
    expect(readPracticeCheckpoint(store).status).toBe('empty');
  });
});

describe('CPI-010 preference and personal-best migrations', () => {
  it('reads historical v1 audio settings and defaults haptics safely', () => {
    const store = new MemoryStorage();
    store.setItem(
      PRACTICE_SAVE_KEYS.settings,
      JSON.stringify({
        version: 1,
        settings: { music: false, soundEffects: true, reducedMotion: false },
      }),
    );
    expect(readPracticeSettings(store).settings).toEqual({
      music: false,
      soundEffects: true,
      haptics: true,
      reducedMotion: false,
    });
    expect(readPracticeSettings(store).warning).toBeNull();
    store.setItem(
      PRACTICE_SAVE_KEYS.settings,
      JSON.stringify({
        version: 2,
        settings: { music: true, soundEffects: true, reducedMotion: false },
      }),
    );
    expect(readPracticeSettings(store).warning).not.toBeNull();
  });
  it('records a local best only when strictly higher and never mutates a run', () => {
    const store = new MemoryStorage();
    expect(recordPracticePersonalBest(store, '350')).toBe(true);
    expect(recordPracticePersonalBest(store, '349')).toBe(false);
    expect(recordPracticePersonalBest(store, '350')).toBe(false);
    expect(recordPracticePersonalBest(store, '351')).toBe(true);
    expect(store.getItem(PRACTICE_SAVE_KEYS.personalBest)).toBe('351');
    expect(readPracticeCheckpoint(store).status).toBe('empty');
    expect(() => recordPracticePersonalBest(store, '-1')).toThrow();
  });
});
