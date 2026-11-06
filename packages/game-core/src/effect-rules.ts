import {
  BALANCE_RULESET_VERSION,
  EFFECT_DURATION_MS,
  EFFECT_TICK_MS,
  MAX_ACTIVE_EFFECTS,
} from './rules.ts';
import { assertNonNegativeInteger } from './numbers.ts';
import type { ActiveEffect, RunState, TimedActiveEffect } from './types.ts';

export function effectDuration(kind: ActiveEffect['kind']): number | null {
  if (kind === 'regen_3rows' || kind === 'bleed_3rows') return null;
  return kind.endsWith('_21s') ? 21_000 : EFFECT_DURATION_MS;
}

export function isTimedEffect(effect: ActiveEffect): effect is TimedActiveEffect {
  return effect.expiresAt !== null;
}

export function assertActiveEffects(
  effects: readonly ActiveEffect[],
  now: number,
  version: string,
): void {
  if (effects.length > MAX_ACTIVE_EFFECTS) throw new RangeError('Too many active effects.');
  for (const effect of effects) {
    assertNonNegativeInteger(effect.startedAt, 'Effect start');
    if (effect.startedAt > now) throw new RangeError('Effect starts in the future.');
    if (!isTimedEffect(effect)) {
      if (
        version !== BALANCE_RULESET_VERSION ||
        !['regen_3rows', 'bleed_3rows'].includes(effect.kind) ||
        effect.nextTickAt !== null ||
        !Number.isInteger(effect.rowsLeft) ||
        effect.rowsLeft < 1 ||
        effect.rowsLeft > 3
      ) {
        throw new RangeError('Invalid row effect.');
      }
      continue;
    }
    const newKind = effect.kind === 'double_gain_21s' || effect.kind === 'double_loss_21s';
    if (newKind && version !== BALANCE_RULESET_VERSION) throw new RangeError('Unsupported effect.');
    assertNonNegativeInteger(effect.expiresAt, 'Effect expiry');
    if (
      effect.expiresAt - effect.startedAt !== effectDuration(effect.kind) ||
      effect.expiresAt <= now
    ) {
      throw new RangeError('Invalid effect interval.');
    }
    if (effect.kind === 'regen_5s' || effect.kind === 'drain_5s') {
      if (effect.nextTickAt === null) throw new RangeError('Missing periodic schedule.');
      assertNonNegativeInteger(effect.nextTickAt, 'Effect tick');
      if (
        effect.nextTickAt <= now ||
        effect.nextTickAt <= effect.startedAt ||
        effect.nextTickAt > effect.expiresAt ||
        (effect.nextTickAt - effect.startedAt) % EFFECT_TICK_MS !== 0
      )
        throw new RangeError('Invalid periodic schedule.');
    } else if (
      effect.nextTickAt !== null ||
      ![
        'shield_5s',
        'lucky_5s',
        'fragility_5s',
        'inversion_5s',
        'double_gain_21s',
        'double_loss_21s',
      ].includes(effect.kind)
    ) {
      throw new RangeError('Invalid one-shot effect.');
    }
  }
}

/** Modifies awards/damage only. Prices of voluntary trades and debts stay exact. */
export function scaleSpDelta(
  state: Pick<RunState, 'effects' | 'activeTimeMs'>,
  delta: number,
): number {
  const kind = delta > 0 ? 'double_gain_21s' : 'double_loss_21s';
  const factor = state.effects.some(
    (effect) =>
      effect.kind === kind && effect.expiresAt !== null && effect.expiresAt > state.activeTimeMs,
  )
    ? 2
    : 1;
  const scaled = delta * factor;
  if (!Number.isSafeInteger(scaled)) throw new RangeError('SP change exceeds integer precision.');
  return scaled;
}

export function tickRowEffects(effects: readonly ActiveEffect[]): {
  effects: ActiveEffect[];
  gain: number;
  loss: number;
  rowsLeft: number;
} {
  let gain = 0;
  let loss = 0;
  let rowsLeft = 0;
  const remaining: ActiveEffect[] = [];
  for (const effect of effects) {
    if (isTimedEffect(effect)) {
      remaining.push(effect);
      continue;
    }
    if (effect.kind === 'regen_3rows') gain += 6;
    else loss -= 3;
    rowsLeft = effect.rowsLeft - 1;
    if (rowsLeft > 0) remaining.push({ ...effect, rowsLeft });
  }
  return { effects: remaining, gain, loss, rowsLeft };
}
