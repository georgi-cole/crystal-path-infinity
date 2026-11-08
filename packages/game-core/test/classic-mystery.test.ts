import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  CLASSIC_MYSTERY_RULESET_VERSION,
  CLASSIC_STORE_RULESET_VERSION,
  createRun,
  createPracticeCursor,
  getCurrentRow,
  getDeathClock,
  hintSafeSide,
  isBrokenTile,
  PRACTICE_RNG,
  transitionRun,
} from '../src/index.ts';

function initial(version: string) {
  return createRun(
    {
      runId: 'practice-classic-combination',
      rulesetVersion: version,
      routeRng: createPracticeCursor(714),
      mysteryRng: createPracticeCursor(391),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
}
describe('classic tiles with mystery discoveries and test Store', () => {
  it.each([CLASSIC_MYSTERY_RULESET_VERSION, CLASSIC_STORE_RULESET_VERSION])(
    '%s always has one intact pane with both sides appearing',
    (version) => {
      let run = initial(version);
      const sides = new Set<string>();
      for (let i = 0; i < 512; i++) {
        const row = getCurrentRow(run),
          safe = hintSafeSide(row)!;
        expect(isBrokenTile(row, 'left')).not.toBe(isBrokenTile(row, 'right'));
        expect(isBrokenTile(row, safe)).toBe(false);
        sides.add(safe);
        const result = transitionRun(
          run,
          { type: 'choose', row: run.currentRow, life: 0, side: safe },
          { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 0 },
        );
        expect(result.accepted).toBe(true);
        run = result.state;
      }
      expect([...sides].sort()).toEqual(['left', 'right']);
      expect(run.sp).toBe(300);
      expect(run.discovery).toEqual({ known: [], introduction: null });
      assertRunState(run, PRACTICE_RNG);
    },
  );
  it('retains the progressive clock and reserve allowance above 400 SP', () => {
    let run = { ...initial(CLASSIC_STORE_RULESET_VERSION), sp: 500 };
    const at = (activeTimeMs: number) => ({
      rng: PRACTICE_RNG,
      activeTimeMs,
      achievedAt: activeTimeMs,
    });
    run = transitionRun(run, { type: 'tick' }, at(4500)).state;
    const before = run.sp,
      deadline = getDeathClock(run)!.expiresAt;
    const refill = transitionRun(
      run,
      { type: 'test-resource', resource: 'sp', amount: 100, sequence: 1 },
      at(4500),
    );
    expect(refill.accepted).toBe(true);
    expect(refill.state.sp).toBe(before + 100);
    expect(refill.state.mysteryDirector!.pressure!.anchorSp).toBe(before + 100);
    expect(getDeathClock(refill.state)!.expiresAt).toBe(deadline);
    const fatal = transitionRun(refill.state, { type: 'tick' }, at(deadline));
    expect(fatal.state.sp).toBe(0);
    expect(fatal.state.death?.cause).toBe('death_clock');
    const continued = transitionRun(
      fatal.state,
      { type: 'test-resource', resource: 'credit', amount: 1, sequence: 2 },
      at(deadline),
    );
    expect(continued.accepted).toBe(true);
    expect(continued.state.status).toBe('playing');
    expect(getDeathClock(continued.state)!.warningAt).toBe(deadline + 3000);
    assertRunState(continued.state, PRACTICE_RNG);
  });
});
