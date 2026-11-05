import type { EffectKind, RunEvent, RunState } from '@crystal-path-infinity/game-core';

export interface MysteryFeedback {
  readonly id: string;
  readonly kind: EffectKind;
  readonly spDelta: number;
  readonly hintDelta: number;
  readonly action:
    | 'triggered'
    | 'pulse'
    | 'accepted'
    | 'declined'
    | 'won'
    | 'lost'
    | 'banked'
    | 'paid'
    | 'expired'
    | null;
}

export function mysteryFeedbackFromEvents(
  events: readonly RunEvent[],
  state: RunState,
): MysteryFeedback | null {
  const latest = [...events].reverse();
  const pact = latest.find(
    (event) =>
      event.type === 'pact-resolved' &&
      (event.option !== 'step' || event.outcome !== 'accepted' || event.spDelta !== 0),
  );
  const mystery = latest.find((event) => event.type === 'mystery-resolved');
  const choice = latest.find(
    (event) =>
      event.type === 'choice-resolved' &&
      (event.consumedKind || (event.wrong && event.spDelta > 0)),
  );
  const pulse = latest.find(
    (event) => event.type === 'effects-ticked' && (event.appliedDelta ?? event.delta) !== 0,
  );
  const event = pact ?? mystery ?? choice ?? pulse;
  if (!event) return null;
  const id = `${event.type}:${event.activeTimeMs}:${event.observedAt}:${state.currentRow}`;
  if (event.type === 'pact-resolved') {
    const step = latest.find((item) => item.type === 'choice-resolved');
    return {
      id,
      kind: event.kind,
      spDelta:
        event.option === 'step' && step?.type === 'choice-resolved' ? step.spDelta : event.spDelta,
      hintDelta: event.hintDelta,
      action: event.outcome,
    };
  }
  if (event.type === 'mystery-resolved')
    return {
      id,
      kind: event.kind,
      spDelta: event.spDelta,
      hintDelta: event.hintDelta,
      action: null,
    };
  if (event.type === 'choice-resolved')
    return {
      id,
      kind: event.consumedKind ?? 'inversion_5s',
      spDelta: event.spDelta,
      hintDelta: 0,
      action: 'triggered',
    };
  if (event.type === 'effects-ticked')
    return {
      id,
      kind: event.delta > 0 ? 'regen_5s' : 'drain_5s',
      spDelta: event.appliedDelta ?? event.delta,
      hintDelta: 0,
      action: 'pulse',
    };
  return null;
}
