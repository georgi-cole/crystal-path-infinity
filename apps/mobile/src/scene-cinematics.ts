import type {
  EffectKind,
  RunState,
  TileSide,
  TimedSessionResult,
} from '@crystal-path-infinity/game-core';
import { presentInfinityScene } from './infinity-presentation';
import type { PresentedRow } from './infinity-presentation';

export interface SceneFeedback {
  readonly row: string;
  readonly side: TileSide;
  readonly kind: 'safe' | 'wrong';
}
export interface MysteryReveal {
  readonly kind: EffectKind;
  readonly spDelta: number;
  readonly hintDelta: number;
}
export interface SceneCinematic {
  readonly id: number;
  readonly phase: 'contact' | 'impact' | 'travel' | 'reveal' | 'collapse';
  readonly rows: readonly PresentedRow[] | null;
  readonly feedback: SceneFeedback | null;
  readonly mystery: MysteryReveal | null;
  readonly fatal: boolean;
}
export const STEP_TIMING = Object.freeze({
  contact: 110,
  safe: 430,
  wrong: 820,
  travel: 460,
  death: 1800,
  mystery: 1450,
});

/** Presentation only: canonical state, time, saves and rewards settle immediately. */
export function createSceneDirector(
  initial: RunState,
  publish: (beat: SceneCinematic | null) => void,
  schedule: (callback: () => void, delay: number) => () => void,
  reduced: () => boolean,
) {
  let previous = initial;
  let sequence = 0;
  let busy = false;
  let disposed = false;
  let cancellations: (() => void)[] = [];
  function cancel() {
    sequence++;
    for (const stop of cancellations) stop();
    cancellations = [];
    busy = false;
  }
  function finish() {
    cancel();
    if (!disposed) publish(null);
  }
  return {
    isBusy: () => busy,
    finish,
    receive(result: TimedSessionResult) {
      const before = previous;
      previous = result.state;
      if (disposed) return;
      const choice = result.events.find((event) => event.type === 'choice-resolved');
      const mystery = result.events.find((event) => event.type === 'mystery-resolved');
      const fatal = result.events.some((event) => event.type === 'death');
      if (!choice && !mystery && !fatal) return;
      cancel();
      if (reduced()) {
        publish(null);
        return;
      }
      const id = sequence;
      busy = !!choice || fatal;
      const beat: SceneCinematic = {
        id,
        phase: choice ? 'contact' : fatal ? 'collapse' : 'reveal',
        rows: choice || fatal ? presentInfinityScene(before).rows : null,
        feedback: choice
          ? {
              row: (BigInt(choice.row) - 1n).toString(),
              side: choice.side,
              kind: choice.wrong ? 'wrong' : 'safe',
            }
          : null,
        mystery: mystery
          ? { kind: mystery.kind, spDelta: mystery.spDelta, hintDelta: mystery.hintDelta }
          : null,
        fatal,
      };
      publish(beat);
      function at(delay: number, callback: () => void) {
        cancellations.push(
          schedule(() => {
            if (!disposed && sequence === id) callback();
          }, delay),
        );
      }
      if (choice)
        at(STEP_TIMING.contact, () => publish({ ...beat, phase: fatal ? 'collapse' : 'impact' }));
      if (fatal) {
        at(STEP_TIMING.death, finish);
      } else if (choice) {
        const settle = choice.wrong ? STEP_TIMING.wrong : STEP_TIMING.safe;
        at(settle, () => publish({ ...beat, phase: 'travel', rows: null }));
        at(settle + STEP_TIMING.travel, finish);
      } else {
        at(STEP_TIMING.mystery, finish);
      }
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}

/** Integer-only interpolation keeps even very large scores exact. */
export function countResultAt(value: string, progress: number): string {
  const fraction = Math.round(Math.min(1, Math.max(0, progress)) * 10000);
  return ((BigInt(value) * BigInt(fraction)) / 10000n).toString();
}
