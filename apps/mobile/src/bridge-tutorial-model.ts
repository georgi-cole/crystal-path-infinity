import {
  createPracticeCursor,
  createRun,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type {
  BridgeRow,
  RunCommand,
  RunState,
  TransitionResult,
} from '@crystal-path-infinity/game-core';
import { GUIDE_PACING } from './crystal-guide-contract';
import { PRACTICE_RULESET_VERSION } from './practice-rules';

export type TutorialStep =
  | 'safe'
  | 'wrong'
  | 'hint'
  | 'hint-revealed'
  | 'pressure'
  | 'mystery'
  | 'mystery-opened'
  | 'complete';
export type TutorialAction =
  | 'choose-safe'
  | 'choose-wrong'
  | 'use-hint'
  | 'choose-hinted'
  | 'escape-pressure'
  | 'try-mystery'
  | 'skip-mystery'
  | 'end-run';
export interface TutorialSession {
  readonly step: TutorialStep;
  readonly run: RunState;
  readonly lastTransition: TransitionResult | null;
  readonly mysteryChoice: 'pending' | 'tried' | 'skipped';
}

/** A contained rehearsal using the live practice reducer. Its clock advances
 * only with lesson actions: reading never costs a life. Never persist this run. */
export function createTutorialSession(): TutorialSession {
  const run = createRun(
    {
      runId: 'tutorial-only-not-a-score',
      rulesetVersion: PRACTICE_RULESET_VERSION,
      routeRng: createPracticeCursor(14014),
      mysteryRng: createPracticeCursor(14141),
      observedAt: 0,
      buffer: { ahead: 8, history: 2 },
    },
    PRACTICE_RNG,
  );
  const rows = run.rows.map((row, index): BridgeRow =>
    index < 5
      ? {
          ...row,
          safeSide: index === 1 ? 'right' : 'left',
          hasMystery: index === 4,
        }
      : row,
  );
  return { step: 'safe', run: { ...run, rows }, lastTransition: null, mysteryChoice: 'pending' };
}

function advance(run: RunState, command: RunCommand, time = run.activeTimeMs): TransitionResult {
  const result = transitionRun(run, command, {
    rng: PRACTICE_RNG,
    activeTimeMs: time,
    achievedAt: time,
  });
  if (!result.accepted) throw new Error('Crystal rehearsal needs review: ' + result.reason);
  return result;
}
function cross(run: RunState, time = run.activeTimeMs) {
  return advance(
    run,
    { type: 'choose', row: run.currentRow, life: run.revivesApplied, side: 'left' },
    time,
  );
}
function next(
  session: TutorialSession,
  step: TutorialStep,
  result: TransitionResult,
): TutorialSession {
  return { ...session, step, run: result.state, lastTransition: result };
}
export function applyTutorialAction(
  session: TutorialSession,
  action: TutorialAction,
): TutorialSession {
  const { run, step } = session;
  switch (action) {
    case 'choose-safe':
      return step === 'safe' ? next(session, 'wrong', cross(run)) : session;
    case 'choose-wrong':
      return step === 'wrong' ? next(session, 'hint', cross(run)) : session;
    case 'use-hint':
      return step === 'hint'
        ? next(
            session,
            'hint-revealed',
            advance(run, { type: 'hint', row: run.currentRow, life: run.revivesApplied }),
          )
        : session;
    case 'choose-hinted': {
      if (step !== 'hint-revealed') return session;
      const crossed = cross(run);
      const pressure = advance(
        crossed.state,
        { type: 'tick' },
        crossed.state.activeTimeMs + GUIDE_PACING.grace,
      );
      return next(session, 'pressure', {
        ...pressure,
        events: [...crossed.events, ...pressure.events],
      });
    }
    case 'escape-pressure':
      return step === 'pressure'
        ? next(
            session,
            'mystery',
            cross(run, run.activeTimeMs + Math.floor(GUIDE_PACING.countdown / 2)),
          )
        : session;
    case 'try-mystery':
      return step === 'mystery'
        ? {
            ...next(
              session,
              'mystery-opened',
              advance(run, { type: 'mystery', row: run.currentRow, life: run.revivesApplied }),
            ),
            mysteryChoice: 'tried',
          }
        : session;
    case 'skip-mystery':
      return step === 'mystery'
        ? { ...next(session, 'complete', advance(run, { type: 'end' })), mysteryChoice: 'skipped' }
        : session;
    case 'end-run':
      return step === 'mystery-opened'
        ? next(session, 'complete', advance(run, { type: 'end' }))
        : session;
  }
}
