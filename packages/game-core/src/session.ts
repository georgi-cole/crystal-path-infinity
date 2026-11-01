import { assertRunState, transitionRun } from './run.ts';
import type {
  RandomSource,
  RejectionReason,
  RunCommand,
  RunState,
  TileSide,
  TransitionContext,
  TransitionResult,
} from './types.ts';

/** Gameplay row/life come from the displayed session snapshot, not a later callback. */
export type SessionCommand =
  | { readonly type: 'choose'; readonly side: TileSide }
  | { readonly type: 'hint' }
  | { readonly type: 'mystery' }
  | Exclude<RunCommand, { readonly row: string }>;

export type SessionTime = Omit<TransitionContext, 'rng'>;
export type SessionRejectionReason =
  RejectionReason | 'session-disposed' | 'stale-command' | 'command-consumed';

export interface SessionTransitionResult extends Omit<TransitionResult, 'reason'> {
  readonly reason: SessionRejectionReason | null;
}

export type BoundRunCommand = (time: SessionTime) => SessionTransitionResult;

export interface RunSession {
  readonly getState: () => RunState;
  /** Bind when presenting an action. Non-tick bindings deliver at most one core transition. */
  readonly bind: (command: SessionCommand) => BoundRunCommand;
  /** Invalidate callbacks and retain the checkpoint; never implicitly end the run. */
  readonly dispose: () => RunState;
}

/**
 * Synchronous ownership for one trusted practice/authority state in one JS context.
 * It owns no clock, listener, timer, persistence, reward verification or network ledger.
 * A new or recovered run gets a new session; an old closure can never target that owner.
 */
export function createRunSession(initialState: RunState, rng: RandomSource): RunSession {
  assertRunState(initialState, rng);
  let state = initialState;
  let disposed = false;
  // An opaque identity avoids both counter overflow and pending -> clear ABA reuse.
  let controlEpoch: object = {};

  function reject(reason: SessionRejectionReason): SessionTransitionResult {
    return { state, events: [], accepted: false, reason };
  }

  return {
    getState: () => state,
    dispose() {
      disposed = true;
      return state;
    },
    bind(input) {
      // Retain only small scope values, not a full historical RunState or event log.
      const row = state.currentRow;
      const life = state.revivesApplied;
      const status = state.status;
      const endEpoch = controlEpoch;
      const command: RunCommand =
        input.type === 'choose' || input.type === 'hint' || input.type === 'mystery'
          ? { ...input, row, life }
          : { ...input };
      let consumed = false;

      return (time) => {
        // Ignore invalidated deliveries before consulting their potentially old clocks.
        if (disposed) return reject('session-disposed');
        if (state.status === 'finished') return reject('finished');
        if (consumed) return reject('command-consumed');
        if (
          state.revivesApplied !== life ||
          state.status !== status ||
          (('row' in command || command.type === 'end') && state.currentRow !== row) ||
          (command.type === 'end' && controlEpoch !== endEpoch)
        ) {
          return reject('stale-command');
        }

        const next = transitionRun(state, command, { ...time, rng });
        // A rejected input can still carry due effects/death. Always commit its state.
        // A thrown transition leaves both the owned checkpoint and binding untouched.
        if (
          state.status !== next.state.status ||
          state.death?.id !== next.state.death?.id ||
          state.pendingReward !== next.state.pendingReward ||
          state.revivesGranted !== next.state.revivesGranted ||
          state.revivesApplied !== next.state.revivesApplied
        ) {
          controlEpoch = {};
        }
        state = next.state;
        consumed = command.type !== 'tick';
        return next;
      };
    },
  };
}
