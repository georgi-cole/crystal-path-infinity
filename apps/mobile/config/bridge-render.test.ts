import { describe, expect, it } from 'vitest';
import { createPracticeCursor, createRun, PRACTICE_RNG } from '@crystal-path-infinity/game-core';
import { presentInfinityScene } from '../src/infinity-presentation';
import { sameBridgePresentation } from '../src/bridge-render';

describe('bridge render isolation', () => {
  const state = createRun(
    {
      runId: 'practice-render',
      routeRng: createPracticeCursor(12),
      mysteryRng: createPracticeCursor(42),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
  it('skips fresh but visually identical row projections on clock ticks', () => {
    const onChoose = () => {};
    expect(
      sameBridgePresentation(
        { rows: presentInfinityScene(state).rows, onChoose },
        { rows: presentInfinityScene({ ...state, activeTimeMs: 100 }).rows, onChoose },
      ),
    ).toBe(true);
  });
  it('updates for every row field and cue change', () => {
    const rows = presentInfinityScene(state).rows;
    for (const key of Object.keys(rows[0])) {
      expect(
        sameBridgePresentation(
          { rows },
          {
            rows: [{ ...rows[0], [key]: Symbol(key) }, ...rows.slice(1)],
          },
        ),
        key,
      ).toBe(false);
    }
    expect(sameBridgePresentation({ rows }, { rows: rows.slice(1) })).toBe(false);
    const withCue = (side: string) => ({ rows: [{ ...rows[0], cue: { kind: 'echo', side } }] });
    expect(sameBridgePresentation(withCue('left'), withCue('left'))).toBe(true);
    expect(sameBridgePresentation(withCue('left'), withCue('right'))).toBe(false);
  });
  it('does not hide changed handlers, control locks, style, motion or hint recovery', () => {
    expect(sameBridgePresentation({ onChoose: () => {} }, { onChoose: () => {} })).toBe(false);
    for (const key of [
      'interactive',
      'collapsed',
      'reducedMotion',
      'phase',
      'eventId',
      'bridgeStyle',
    ])
      expect(sameBridgePresentation({ [key]: false }, { [key]: true })).toBe(false);
    const scan = { id: 'scan', row: '1', side: 'left', activeAt: 100 };
    expect(sameBridgePresentation({ hintScan: scan }, { hintScan: { ...scan } })).toBe(true);
    expect(
      sameBridgePresentation({ hintScan: scan }, { hintScan: { ...scan, activeAt: 200 } }),
    ).toBe(false);
  });
});
