import { drawRandom } from './random.ts';
import { PACT_RULESET_VERSION } from './rules.ts';
import type {
  EffectKind,
  MysteryPact,
  PactKind,
  PactOption,
  RandomCursor,
  RandomSource,
  RunState,
  TileSide,
} from './types.ts';

export const PACT_KINDS: readonly PactKind[] = Object.freeze([
  'blood_oath',
  'false_oracle',
  'hungry_vault',
  'borrowed_time',
  'soul_exchange',
]);
export const VAULT_PAYOUTS = Object.freeze([0, 15, 40, 85]);
export const PACT_OPTIONS: readonly PactOption[] = Object.freeze([
  'accept',
  'decline',
  'cashout',
  'settle',
  'sp',
  'hint',
]);

export function isPactKind(kind: EffectKind): kind is PactKind {
  return (PACT_KINDS as readonly string[]).includes(kind);
}

export function offerPact(kind: PactKind): MysteryPact {
  return { kind, phase: 'offered', rowsLeft: 0, bank: 0, omen: null };
}

export function assertPact(state: RunState): void {
  const pact = state.pact;
  if (!pact) return;
  if (
    state.rulesetVersion !== PACT_RULESET_VERSION ||
    state.status !== 'playing' ||
    !isPactKind(pact.kind)
  ) {
    throw new RangeError('Pact outside a supported, playing run.');
  }
  if (pact.phase === 'offered') {
    if (
      pact.rowsLeft !== 0 ||
      pact.bank !== 0 ||
      pact.omen !== null ||
      state.current.mysteryOutcome !== pact.kind
    ) {
      throw new RangeError('Invalid pact offer.');
    }
    return;
  }
  if (
    pact.phase !== 'active' ||
    pact.kind === 'soul_exchange' ||
    !Number.isInteger(pact.rowsLeft) ||
    pact.rowsLeft < 1 ||
    pact.rowsLeft > 3
  ) {
    throw new RangeError('Invalid active pact.');
  }
  if (
    pact.kind === 'hungry_vault' ? pact.bank !== VAULT_PAYOUTS[3 - pact.rowsLeft] : pact.bank !== 0
  ) {
    throw new RangeError('Invalid vault bank.');
  }
  if (
    pact.kind === 'false_oracle' ? !['left', 'right'].includes(pact.omen ?? '') : pact.omen !== null
  ) {
    throw new RangeError('Invalid oracle omen.');
  }
}

export interface PactResolution {
  readonly pact: MysteryPact | null;
  readonly spDelta: number;
  readonly hintDelta: number;
  readonly cursor: RandomCursor;
  readonly outcome: 'accepted' | 'declined' | 'won' | 'lost' | 'banked' | 'paid' | 'expired';
}

/** The omen is freshly sampled once per row; it is never a confirmed hint. */
export function drawOmen(safeSide: TileSide, cursor: RandomCursor, rng: RandomSource) {
  const draw = drawRandom(cursor, rng);
  return {
    omen:
      draw.value < 0.7 ? safeSide : safeSide === 'left' ? ('right' as const) : ('left' as const),
    cursor: draw.cursor,
  };
}

export function choosePact(
  state: RunState,
  option: PactOption,
  safeSide: TileSide,
  rng: RandomSource,
): PactResolution | null {
  const pact = state.pact;
  if (!pact) return null;
  const result = (
    spDelta: number,
    hintDelta = 0,
    next: MysteryPact | null = null,
    outcome: PactResolution['outcome'] = 'accepted',
    cursor = state.mysteryRng,
  ): PactResolution => ({ pact: next, spDelta, hintDelta, cursor, outcome });

  if (pact.phase === 'active') {
    if (pact.kind === 'hungry_vault' && option === 'cashout' && pact.bank > 0) {
      return result(pact.bank, 0, null, 'banked');
    }
    if (pact.kind === 'borrowed_time' && option === 'settle' && pact.rowsLeft < 3) {
      return result(-55, 0, null, 'paid');
    }
    return null;
  }
  if (pact.kind === 'soul_exchange') {
    if (option !== 'sp' && option !== 'hint') return null;
    if (option === 'hint' && state.hints < 1) return null;
    // An SP sacrifice must be survived before any prize is delivered.
    if (option === 'sp' && state.sp <= 25) return result(-25, 0, null, 'lost');
    const draw = drawRandom(state.mysteryRng, rng);
    const won = draw.value < 0.65;
    return option === 'sp'
      ? result(won ? -25 : -40, won ? 2 : 1, null, won ? 'won' : 'lost', draw.cursor)
      : result(won ? 40 : -30, -1, null, won ? 'won' : 'lost', draw.cursor);
  }
  if (option === 'decline') {
    return pact.kind === 'false_oracle'
      ? result(state.hints > 0 ? 0 : -15, state.hints > 0 ? -1 : 0, null, 'declined')
      : result(-8, 0, null, 'declined');
  }
  if (option !== 'accept') return null;
  const active: MysteryPact = { ...pact, phase: 'active', rowsLeft: 3 };
  switch (pact.kind) {
    case 'blood_oath':
      return result(35, 0, active);
    case 'false_oracle': {
      // A previously revealed row cannot be turned into a certain oracle reward.
      if (state.current.revealedSafeSide !== null) return null;
      const draw = drawOmen(safeSide, state.mysteryRng, rng);
      return result(0, 0, { ...active, omen: draw.omen }, 'accepted', draw.cursor);
    }
    case 'hungry_vault':
      return result(-12, 0, state.sp > 12 ? active : null, state.sp > 12 ? 'accepted' : 'lost');
    case 'borrowed_time':
      return result(50, 0, active);
  }
}

/** Extra SP adjustment, resolved with the tile before the single clamp/death check. */
export function resolvePactStep(
  state: RunState,
  wrong: boolean,
  baseDelta: number,
): PactResolution | null {
  const pact = state.pact;
  if (!pact || pact.phase !== 'active') return null;
  const rowsLeft = pact.rowsLeft - 1;
  let next: MysteryPact | null = rowsLeft > 0 ? { ...pact, rowsLeft } : null;
  let spDelta = 0;
  let outcome: PactResolution['outcome'] = rowsLeft === 0 ? 'expired' : 'accepted';
  switch (pact.kind) {
    case 'blood_oath':
      // Shields and healing inversions still work; the oath amplifies actual damage.
      if (wrong && baseDelta < 0) spDelta = -15;
      break;
    case 'false_oracle':
      spDelta = wrong ? Math.min(0, baseDelta) : 5;
      break;
    case 'hungry_vault':
      if (wrong) {
        spDelta = -10;
        next = null;
        outcome = 'lost';
      } else if (rowsLeft === 0) {
        spDelta = 85;
        outcome = 'banked';
      } else {
        next = { ...pact, rowsLeft, bank: VAULT_PAYOUTS[3 - rowsLeft] };
      }
      break;
    case 'borrowed_time':
      if (rowsLeft === 0) {
        spDelta = -65;
        outcome = 'paid';
      }
      break;
  }
  return { pact: next, spDelta, hintDelta: 0, cursor: state.mysteryRng, outcome };
}
