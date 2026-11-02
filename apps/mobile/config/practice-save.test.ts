import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  createPracticeCursor,
  createRun,
  getCurrentRow,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import {
  clearPracticeCheckpoint,
  DEFAULT_PRACTICE_SETTINGS,
  PRACTICE_SAVE_KEYS,
  readPracticeCheckpoint,
  readPracticeSettings,
  writePracticeCheckpoint,
  writePracticeSettings,
} from '../src/practice-save';
import type { PracticeStorage } from '../src/practice-save';

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
    writePracticeSettings(store, { music: false, soundEffects: true, reducedMotion: true });
    expect(readPracticeSettings(store).settings.reducedMotion).toBe(true);
    store.setItem(PRACTICE_SAVE_KEYS.settings, 'invalid');
    expect(readPracticeSettings(store).warning).not.toBeNull();
    expect(readPracticeCheckpoint(store).status).toBe('empty');
  });
});
