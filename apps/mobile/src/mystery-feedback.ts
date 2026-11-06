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
    | 'traded'
    | 'walked_away'
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
      (event.consumedKind || event.protectedBy || (event.wrong && event.spDelta > 0)),
  );
  const pulse = latest.find(
    (event) => event.type === 'effects-ticked' && (event.appliedDelta ?? event.delta) !== 0,
  );
  const rowPulse = latest.find((event) => event.type === 'row-effect-ticked' && event.delta !== 0);
  const event = pact ?? mystery ?? rowPulse ?? choice ?? pulse;
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
      action:
        event.outcome === 'declined' && ['half_life', 'marketing'].includes(event.kind)
          ? 'walked_away'
          : event.outcome,
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
      kind: event.consumedKind ?? event.protectedBy ?? 'inversion_5s',
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
  if (event.type === 'row-effect-ticked')
    return { id, kind: event.kind, spDelta: event.delta, hintDelta: 0, action: 'triggered' };
  return null;
}

export interface ConsumptionCue {
  readonly id: string;
  readonly kind: 'shield_5s' | 'lucky_5s';
  readonly spDelta: number;
}
export interface HintCue {
  readonly id: string;
  readonly delta: number;
}
export interface RunCues {
  readonly consumption?: ConsumptionCue;
  readonly hints?: HintCue;
}

/** Independent signals keep a shield break visible even when another effect also fires. */
export function runCuesFromEvents(events: readonly RunEvent[], state: RunState): RunCues {
  const result: { consumption?: ConsumptionCue; hints?: HintCue } = {};
  let hintDelta = 0;
  for (const event of events) {
    const id = `${event.type}:${event.activeTimeMs}:${event.observedAt}:${state.currentRow}:${state.hints}`;
    if (event.type === 'hint-used') hintDelta -= 1;
    else if (event.type === 'mystery-resolved' || event.type === 'pact-resolved')
      hintDelta += event.hintDelta;
    if (
      event.type === 'choice-resolved' &&
      (event.consumedKind === 'shield_5s' || event.consumedKind === 'lucky_5s')
    ) {
      result.consumption = { id, kind: event.consumedKind, spDelta: event.spDelta };
    }
  }
  if (hintDelta !== 0)
    result.hints = {
      id: `hints:${state.activeTimeMs}:${state.lastObservedAt}:${state.hints}`,
      delta: hintDelta,
    };
  return result;
}
