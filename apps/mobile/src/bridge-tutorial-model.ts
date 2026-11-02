import {
  createPracticeCursor,
  createRun,
  getRowBandDamage,
  PRACTICE_RNG,
  STARTING_SP,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type {
  BridgeRow,
  RunCommand,
  RunState,
  TransitionResult,
} from '@crystal-path-infinity/game-core';

export type TutorialStep =
  'safe' | 'wrong' | 'hint' | 'hint-revealed' | 'mystery' | 'end' | 'fatal' | 'complete';

export type TutorialAction =
  | 'choose-safe'
  | 'choose-wrong'
  | 'use-hint'
  | 'choose-hinted'
  | 'try-mystery'
  | 'skip-mystery'
  | 'show-fatal'
  | 'end-run';

export interface TutorialSession {
  readonly step: TutorialStep;
  readonly run: RunState;
  readonly notice: string;
  readonly mysteryChoice: 'pending' | 'tried' | 'skipped';
}

/**
 * A deliberately scripted LOCAL demonstration. Only its instance of the pure
 * game-core reducer is used. Never pass this run to practice save, audio,
 * analytics, ads, or ranked services.
 */
export function createTutorialSession(): TutorialSession {
  const run = createRun(
    {
      runId: 'tutorial-only-not-a-score',
      routeRng: createPracticeCursor(14014),
      mysteryRng: createPracticeCursor(14141),
      observedAt: 0,
      buffer: { ahead: 8, history: 2 },
    },
    PRACTICE_RNG,
  );
  const rows = run.rows.map((row, index): BridgeRow =>
    index < 4
      ? {
          ...row,
          safeSide: index % 2 === 0 ? 'left' : 'right',
          hasMystery: index === 3,
        }
      : row,
  );
  return {
    step: 'safe',
    run: { ...run, rows },
    notice: 'Training only. Start with the left pane to cross Row 1 safely.',
    mysteryChoice: 'pending',
  };
}

function advance(run: RunState, command: RunCommand): TransitionResult {
  const result = transitionRun(run, command, {
    rng: PRACTICE_RNG,
    activeTimeMs: run.activeTimeMs,
    achievedAt: run.lastObservedAt,
  });
  if (!result.accepted) {
    throw new Error('Scripted tutorial rejected ' + command.type + ': ' + result.reason);
  }
  return result;
}

function choice(run: RunState, side: 'left' | 'right'): RunState {
  return advance(run, {
    type: 'choose',
    row: run.currentRow,
    life: run.revivesApplied,
    side,
  }).state;
}

/** Single-action transitions make repeated taps and out-of-order clicks harmless. */
export function applyTutorialAction(
  session: TutorialSession,
  action: TutorialAction,
): TutorialSession {
  const run = session.run;
  switch (action) {
    case 'choose-safe':
      if (session.step !== 'safe') return session;
      return {
        ...session,
        step: 'wrong',
        run: choice(run, 'left'),
        notice: 'Safe! Row 1 counts, and your SP remains ' + STARTING_SP + '.',
      };
    case 'choose-wrong':
      if (session.step !== 'wrong') return session;
      return {
        ...session,
        step: 'hint',
        run: choice(run, 'left'),
        notice:
          'Wrong glass cost ' +
          getRowBandDamage(run.currentRow) +
          ' SP, but you survived. Row 2 still counts.',
      };
    case 'use-hint':
      if (session.step !== 'hint') return session;
      return {
        ...session,
        step: 'hint-revealed',
        run: advance(run, {
          type: 'hint',
          row: run.currentRow,
          life: run.revivesApplied,
        }).state,
        notice: 'The safe pane is LEFT. One hint was spent; SP did not change.',
      };
    case 'choose-hinted':
      if (session.step !== 'hint-revealed') return session;
      return {
        ...session,
        step: 'mystery',
        run: choice(run, 'left'),
        notice: 'Row 3 cleared. The centre mystery is optional, never guaranteed safe.',
      };
    case 'try-mystery': {
      if (session.step !== 'mystery') return session;
      const result = advance(run, {
        type: 'mystery',
        row: run.currentRow,
        life: run.revivesApplied,
      });
      const event = result.events.find((item) => item.type === 'mystery-resolved');
      const effect =
        event?.type === 'mystery-resolved'
          ? event.kind.replaceAll('_', ' ') +
            ' (' +
            (event.spDelta > 0 ? '+' : '') +
            event.spDelta +
            ' SP, ' +
            (event.hintDelta > 0 ? '+' : '') +
            event.hintDelta +
            ' hints)'
          : 'an uncertain effect';
      return {
        ...session,
        step: 'end',
        run: result.state,
        mysteryChoice: 'tried',
        notice: 'Mystery outcome: ' + effect + '. Real mysteries can help or hurt.',
      };
    }
    case 'skip-mystery':
      if (session.step !== 'mystery') return session;
      return {
        ...session,
        step: 'end',
        mysteryChoice: 'skipped',
        notice: 'You skipped the optional mystery. There is no penalty for skipping it.',
      };
    case 'show-fatal': {
      if (session.step !== 'end') return session;
      // Set up a transparent fatal teaching example, independent of any random
      // mystery buff or damage mitigation. The actual reducer still resolves it.
      const fatalExample: RunState = {
        ...run,
        sp: getRowBandDamage(run.currentRow),
        effects: [],
      };
      const fatal = choice(fatalExample, 'left');
      if (fatal.status !== 'dead' || fatal.lastClearedRow !== run.lastClearedRow) {
        throw new Error('Fatal teaching example broke the score contract.');
      }
      return {
        ...session,
        step: 'fatal',
        run: fatal,
        notice:
          'Fatal Row ' +
          fatal.currentRow +
          ' did NOT count. Last cleared remains ' +
          fatal.lastClearedRow +
          '.',
      };
    }
    case 'end-run':
      if (session.step !== 'end' && session.step !== 'fatal') return session;
      return {
        ...session,
        step: 'complete',
        run: advance(run, { type: 'end', forfeitGrantedReward: true }).state,
        notice:
          'Tutorial complete. The result is only a demo: no saved practice, ranking, ad or reward.',
      };
  }
}
