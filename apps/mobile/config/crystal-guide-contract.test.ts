import { describe, expect, it } from 'vitest';
import {
  createRun,
  createPracticeCursor,
  getCurrentRow,
  MYSTERY_TABLE,
  getRuleset,
  PRACTICE_RNG,
  getDeathClock,
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
      [
        ...new Set(
          [...MYSTERY_TABLE, ...getRuleset(PRACTICE_RULESET_VERSION).mysteryTable].map(
            (item) => item.kind,
          ),
        ),
      ].sort(),
    );
    expect(GUIDE_EVENT_COVERAGE['survival-bonus']).toBe('pursuit');
    expect(GUIDE_EVENT_COVERAGE['hint-used']).toBe('insight');
    expect(GUIDE_RULES.version).toBe(PRACTICE_RULESET_VERSION);
  });
  it('teaches the progressive Death Clock used by the current practice rules', () => {
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
    expect(getDeathClock(run)).toMatchObject({
      warningAt: GUIDE_PACING.grace,
      expiresAt: GUIDE_PACING.grace + GUIDE_PACING.countdown,
    });
    const midpoint = transitionRun(
      run,
      { type: 'tick' },
      time(GUIDE_PACING.grace + GUIDE_PACING.countdown / 2),
    );
    expect(midpoint.state.sp).toBe(GUIDE_RULES.startingSp * 0.8);
    const fatal = transitionRun(
      run,
      { type: 'tick' },
      time(GUIDE_PACING.grace + GUIDE_PACING.countdown),
    );
    expect(fatal.state.sp).toBe(0);
    expect(fatal.state.death?.cause).toBe('death_clock');
    run = transitionRun(
      midpoint.state,
      {
        type: 'choose',
        side: getCurrentRow(midpoint.state).safeSide,
        row: midpoint.state.currentRow,
        life: 0,
      },
      time(midpoint.state.activeTimeMs),
    ).state;
    const after = transitionRun(
      run,
      { type: 'tick' },
      time(run.activeTimeMs + GUIDE_PACING.grace - 1),
    );
    expect(after.state.sp).toBe(run.sp);
    expect(after.state.status).toBe('playing');
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
