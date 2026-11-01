import { describe, expect, it } from 'vitest';
import { createPracticeCursor, createRun, PRACTICE_RNG } from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import { MAX_PRESENTED_ROWS, presentInfinityScene } from '../src/infinity-presentation';

function initial() {
  return createRun({
    runId: 'projection-test',
    routeRng: createPracticeCursor(123),
    mysteryRng: createPracticeCursor(456),
    observedAt: 1000,
    buffer: { ahead: 8, history: 2 },
  }, PRACTICE_RNG);
}
describe('CPI-008 absolute-index scene projection', () => {
  it('does not expose future safe-side or RNG, and limits the visual DOM window', () => {
    const state = initial();
    const projected = presentInfinityScene(state);
    expect(projected.rows.length).toBeLessThanOrEqual(MAX_PRESENTED_ROWS);
    expect(projected.rows[0]?.label).toBe('1');
    expect(projected.rows[0]?.phase).toBe('current');
    expect(JSON.stringify(projected)).not.toContain('"safeSide"');
    expect(JSON.stringify(projected)).not.toContain('"rng"');
    expect(Object.keys(projected.rows[1] ?? {})).not.toContain('hintSide');
  });
  it('maps 350→351, keeping 350 as an ordinary cleared row', () => {
    const base = initial();
    const state: RunState = {
      ...base,
      lastClearedRow: '350', currentRow: '351', bufferOffset: '349',
      rows: [349,350,351,352,353,354,355,356].map((index) => ({
        index: String(index), safeSide: index % 2 ? 'left' as const : 'right' as const, hasMystery: false,
      })),
      resolutions: [{ index: '349', revealedSafeSide: null, mysteryOutcome: null, lastChoice: { side: 'left', wrong: false } }],
    };
    const projected = presentInfinityScene(state);
    expect(projected.rows.map((row) => row.label)).toEqual(['350','351','352','353','354']);
    expect(projected.rows[0]?.phase).toBe('past');
    expect(projected.rows[1]?.phase).toBe('current');
    expect(projected.currentRow).toBe('351');
    expect(projected.status).toBe('playing');
  });
  it('preserves lossless decimal labels beyond safe integer range', () => {
    const base = initial();
    const huge = 900719925474099312345678n;
    const state: RunState = {
      ...base,
      lastClearedRow: huge.toString(),
      currentRow: (huge + 1n).toString(),
      bufferOffset: (huge - 1n).toString(),
      rows: Array.from({length:8},(_,i)=>({
        index: (huge - 1n + BigInt(i)).toString(),
        safeSide:'left' as const, hasMystery: false
      })), resolutions: []
    };
    const p = presentInfinityScene(state);
    expect(p.rows[1]?.label).toBe((huge + 1n).toString());
    expect(p.rows.map(r=>r.index)).toHaveLength(5);
    expect(p.rows[4]?.tone).toBe(Number((huge+3n)%3n));
  });
  it('uses only active-time remaining, not wall time', () => {
    const base = initial();
    const state:RunState={...base,activeTimeMs:2000,effects:[{kind:'shield_5s',startedAt:1000,expiresAt:6000,nextTickAt:null}]};
    expect(presentInfinityScene(state).effects[0]).toMatchObject({remainingMs:4000,percent:80,name:'Shield'});
  });
  it('never reveals a future safe answer even when a hint is active', () => {
    const base=initial();
    const state:RunState={...base,current:{...base.current,revealedSafeSide:'right'}};
    const p=presentInfinityScene(state);
    expect(p.rows[0]?.hint).toBe('right');
    expect(p.rows.slice(1).every(r=>r.hint===null&&r.chosen===null)).toBe(true);
  });
});
