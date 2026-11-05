import { describe, expect, it } from 'vitest';
import {
  createRun,
  createPracticeCursor,
  getCurrentRow,
  MYSTERY_TABLE,
  PRACTICE_RNG,
  presentRowPressure,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import {
  GUIDE_EVENT_COVERAGE,
  GUIDE_MYSTERY_COVERAGE,
  GUIDE_PACING,
  GUIDE_RULE_COVERAGE,
  GUIDE_RULES,
} from '../src/crystal-guide-contract';
import { PRACTICE_RULESET_VERSION } from '../src/practice-rules';
import { crystalGuideEn, crystalGuideBg } from '../src/i18n/crystal-guide-messages';

describe('automatic guide/rules synchronization', () => {
  it('requires a writer to classify every rule field and mystery while reading values live', () => {
    expect(Object.keys(GUIDE_RULE_COVERAGE).sort()).toEqual(Object.keys(GUIDE_RULES).sort());
    expect(Object.keys(GUIDE_MYSTERY_COVERAGE).sort()).toEqual(
      MYSTERY_TABLE.map((item) => item.kind).sort(),
    );
    expect(GUIDE_EVENT_COVERAGE['survival-bonus']).toBe('pursuit');
    expect(GUIDE_EVENT_COVERAGE['hint-used']).toBe('insight');
    expect(GUIDE_RULES.version).toBe(PRACTICE_RULESET_VERSION);
  });
  it('keeps the pursuit warning and light-return promise true under the selected live rules', () => {
    let run = createRun(
      {
        runId: 'guide-policy-check',
        rulesetVersion: PRACTICE_RULESET_VERSION,
        observedAt: 0,
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
      },
      PRACTICE_RNG,
    );
    const time = (at: number) => ({ activeTimeMs: at, achievedAt: at, rng: PRACTICE_RNG });
    const fatal = transitionRun(
      run,
      { type: 'tick' },
      time(GUIDE_PACING.grace + GUIDE_PACING.countdown),
    );
    expect(fatal.state.sp).toBe(0);
    expect(fatal.state.death?.cause).toBe('idle');
    const scan = transitionRun(
      run,
      { type: 'hint', row: run.currentRow, life: 0 },
      time(GUIDE_PACING.grace),
    );
    const held = transitionRun(
      scan.state,
      { type: 'tick' },
      time(GUIDE_PACING.grace + GUIDE_PACING.scan - 1),
    );
    expect(presentRowPressure(held.state)).toMatchObject({
      paused: true,
      remainingMs: GUIDE_PACING.countdown,
    });
    const step = Math.floor((GUIDE_PACING.grace + GUIDE_PACING.countdown) / 2);
    expect(step).toBeGreaterThan(0);
    for (let at = step; at < GUIDE_PACING.interval; at += step) {
      run = transitionRun(
        run,
        { type: 'choose', side: getCurrentRow(run).safeSide, row: run.currentRow, life: 0 },
        time(at),
      ).state;
    }
    const survived = transitionRun(run, { type: 'tick' }, time(GUIDE_PACING.interval));
    expect(survived.state.sp).toBe(
      Math.min(GUIDE_RULES.maxSp, GUIDE_RULES.startingSp + GUIDE_PACING.bonus),
    );
    expect(survived.events).toContainEqual(
      expect.objectContaining({ type: 'survival-bonus', amount: GUIDE_PACING.bonus }),
    );
  });
  it('keeps public lessons free of balance tables, exact deadlines and endpoint spoilers', () => {
    for (const copy of [crystalGuideEn, crystalGuideBg]) {
      const prose = Object.entries(copy)
        .filter(([key]) => key.startsWith('guide.'))
        .map(([, value]) => value)
        .join(' ');
      expect(prose).not.toMatch(
        /\b\d+\b|no finish line|no last row|endless|grants? remain|не е финален|няма финал|няма последен/i,
      );
    }
  });
});
