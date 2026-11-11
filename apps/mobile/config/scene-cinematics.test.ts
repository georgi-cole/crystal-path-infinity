import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  createTimedRunSession,
  getCurrentRow,
  PRACTICE_RNG,
} from '@crystal-path-infinity/game-core';
import { countResultAt, createSceneDirector, STEP_TIMING } from '../src/scene-cinematics';
import type { SceneCinematic } from '../src/scene-cinematics';
import { bridgePane } from '../src/bridge-geometry';
import { fractureGlass, glassPattern, glassSeed } from '../src/glass-fracture';
import { canResumePractice } from '../src/menu-navigation';

function fixture(sp = 300, reduced = false) {
  vi.useFakeTimers();
  const state = {
    ...createRun(
      {
        runId: 'practice-cinematics',
        routeRng: createPracticeCursor(12),
        mysteryRng: createPracticeCursor(42),
        observedAt: 0,
      },
      PRACTICE_RNG,
    ),
    sp,
  };
  const session = createTimedRunSession(state, PRACTICE_RNG, {
    monotonicNow: () => 0,
    observedAt: 0,
  });
  session.releaseRecovery();
  const updates: (SceneCinematic | null)[] = [];
  const director = createSceneDirector(
    state,
    (beat) => updates.push(beat),
    (callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
    () => reduced,
  );
  const choose = (wrong: boolean) => {
    const safe = getCurrentRow(state).safeSide;
    const result = session.bind({
      type: 'choose',
      side: wrong ? (safe === 'left' ? 'right' : 'left') : safe,
    })();
    director.receive(result);
    return result;
  };
  return { state, session, director, updates, choose };
}
afterEach(() => vi.useRealTimers());
describe('readable step and death presentation', () => {
  it.each([false, true])('unlocks exactly at the shorter visual boundary (wrong=%s)', (wrong) => {
    const f = fixture();
    f.choose(wrong);
    const duration = (wrong ? STEP_TIMING.wrong : STEP_TIMING.safe) + STEP_TIMING.travel;
    expect(duration).toBe(wrong ? 850 : 600);
    vi.advanceTimersByTime(duration - 1);
    expect(f.director.isBusy()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.director.isBusy()).toBe(false);
    expect(f.updates.at(-1)).toBe(null);
  });
  it('cancels a completed sequence before the next step so old timers cannot clear it', () => {
    const f = fixture();
    f.choose(false);
    vi.advanceTimersByTime(STEP_TIMING.safe + STEP_TIMING.travel);
    const next = f.session.bind({
      type: 'choose',
      side: getCurrentRow(f.session.getState()).safeSide,
    })();
    f.director.receive(next);
    expect(next.accepted).toBe(true);
    expect(f.director.isBusy()).toBe(true);
    vi.advanceTimersByTime(STEP_TIMING.contact);
    expect(f.updates.at(-1)?.phase).toBe('impact');
    f.director.dispose();
    const count = f.updates.length;
    vi.runAllTimers();
    expect(f.updates).toHaveLength(count);
  });

  it('commits gameplay immediately but holds the chosen row through contact and impact before travel', () => {
    const f = fixture();
    expect(f.choose(false).state.currentRow).toBe('2');
    expect(f.updates.at(-1)?.phase).toBe('contact');
    expect(f.updates.at(-1)?.rows?.find((row) => row.phase === 'current')?.index).toBe('0');
    vi.advanceTimersByTime(STEP_TIMING.contact);
    expect(f.updates.at(-1)?.phase).toBe('impact');
    vi.advanceTimersByTime(STEP_TIMING.safe - STEP_TIMING.contact);
    expect(f.updates.at(-1)?.phase).toBe('travel');
    expect(f.updates.at(-1)?.rows).toBe(null);
    vi.advanceTimersByTime(STEP_TIMING.travel);
    expect(f.updates.at(-1)).toBe(null);
    expect(f.director.isBusy()).toBe(false);
  });
  it('lets wrong glass fall before moving on, while keeping the surviving row credited', () => {
    const f = fixture();
    const result = f.choose(true);
    expect(result.state.lastClearedRow).toBe('1');
    vi.advanceTimersByTime(STEP_TIMING.safe);
    expect(f.updates.at(-1)?.phase).toBe('impact');
    expect(f.updates.at(-1)?.feedback?.kind).toBe('wrong');
    vi.advanceTimersByTime(STEP_TIMING.wrong - STEP_TIMING.safe);
    expect(f.updates.at(-1)?.phase).toBe('travel');
  });
  it('lets a player leave a nonfatal mystery while its symbol is still travelling', () => {
    const f = fixture();
    while (!getCurrentRow(f.session.getState()).hasMystery) {
      const step = f.session.bind({
        type: 'choose',
        side: getCurrentRow(f.session.getState()).safeSide,
      })();
      f.director.receive(step);
      vi.advanceTimersByTime(STEP_TIMING.wrong + STEP_TIMING.travel);
    }
    const mystery = f.session.bind({ type: 'mystery' })();
    expect(mystery.state.status).toBe('playing');
    f.director.receive(mystery);
    expect(f.updates.at(-1)?.phase).toBe('reveal');
    expect(f.director.isBusy()).toBe(false);
    const step = f.session.bind({
      type: 'choose',
      side: getCurrentRow(f.session.getState()).safeSide,
    })();
    f.director.receive(step);
    expect(step.accepted).toBe(true);
    expect(f.updates.at(-1)?.phase).toBe('contact');
    f.director.dispose();
  });
  it('collapses the whole bridge on fatal SP loss and reveals the dialog only after the death beat', () => {
    const f = fixture(10);
    const result = f.choose(true);
    expect(result.state.status).toBe('dead');
    expect(result.state.lastClearedRow).toBe('0');
    expect(canResumePractice({ status: 'ready', state: result.state, revision: 1 })).toBe(false);
    vi.advanceTimersByTime(STEP_TIMING.contact);
    expect(f.updates.at(-1)?.phase).toBe('collapse');
    expect(f.updates.at(-1)?.fatal).toBe(true);
    vi.advanceTimersByTime(STEP_TIMING.death - STEP_TIMING.contact - 1);
    expect(f.director.isBusy()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.updates.at(-1)).toBe(null);
  });
  it('cancels old beats on background/disposal and skips them for reduced motion', () => {
    const f = fixture();
    f.choose(true);
    f.director.finish();
    const count = f.updates.length;
    vi.runAllTimers();
    expect(f.updates).toHaveLength(count);
    const reduced = fixture(300, true);
    reduced.choose(true);
    expect(reduced.director.isBusy()).toBe(false);
    expect(reduced.updates.at(-1)).toBe(null);
    f.director.dispose();
    reduced.director.dispose();
  });
  it('counts to an exact result without losing precision on unlimited row indices', () => {
    expect(countResultAt('35', 0)).toBe('0');
    expect(countResultAt('35', 1)).toBe('35');
    expect(countResultAt('900719925474099312345678', 0.5)).toBe('450359962737049656172839');
    expect(countResultAt('900719925474099312345678', 1)).toBe('900719925474099312345678');
  });
});
describe('glass impact mesh', () => {
  const area = (points: readonly { x: number; y: number }[]) =>
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0) / 2,
    );
  it('covers each perspective pane exactly with deterministic irregular shards', () => {
    for (const side of ['left', 'right'] as const)
      for (const distance of [0, 1, 7]) {
        const pane = bridgePane(distance, side);
        const shards = fractureGlass(pane, 91);
        expect(shards.length).toBeGreaterThan(12);
        expect(shards.length).toBeLessThan(80);
        expect(shards.reduce((sum, shard) => sum + area(shard.points), 0)).toBeCloseTo(
          area(pane),
          5,
        );
        expect(
          shards.every((shard) =>
            shard.points.every((point) => Number.isFinite(point.x + point.y)),
          ),
        ).toBe(true);
        expect(shards).toEqual(fractureGlass(pane, 91));
        expect(shards).not.toEqual(fractureGlass(pane, 92));
      }
  });
  it('varies the impact, fragments and retained rim chips between panes without using game randomness', () => {
    let anchored = 0;
    const layouts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const seed = glassSeed(`practice-${i}:1:left`);
      const pattern = glassPattern(seed);
      expect(pattern.reduce((sum, shard) => sum + area(shard.points), 0)).toBeCloseTo(1, 8);
      const chips = pattern.filter((shard) => shard.retained);
      const chipArea = chips.reduce((sum, shard) => sum + area(shard.points), 0);
      if (chips.length) anchored++;
      expect(chipArea).toBeLessThan(0.22);
      expect(
        chips.every((shard) =>
          shard.points.some((p) => p.x < 0.06 || p.x > 0.94 || p.y < 0.06 || p.y > 0.94),
        ),
      ).toBe(true);
      expect(pattern.filter((shard) => !shard.retained).length).toBeGreaterThan(10);
      layouts.add(JSON.stringify(pattern.map((shard) => shard.points)));
    }
    expect(anchored).toBeGreaterThanOrEqual(30);
    expect(layouts.size).toBe(40);
  });
});
