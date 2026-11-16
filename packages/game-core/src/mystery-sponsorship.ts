import type { RunEvent, RunState } from './types.ts';
import { getRuleset } from './rules.ts';

export interface MysterySponsorOffer {
  readonly id: string;
  readonly kind: 'market' | 'healing' | 'sp-protection' | 'hint-protection' | 'cleanse';
  readonly amount: number;
  readonly at: number;
  readonly status: 'offered' | 'earned';
}
export interface MysterySponsorship {
  readonly version: 1;
  readonly claimed: number;
  readonly offer: MysterySponsorOffer | null;
}

/** Local-device rewards only. No server-ranked command may enable this extension. */
export function sponsorMystery(state: RunState, event: RunEvent, eligible: boolean): RunState {
  if (
    !eligible ||
    !state.sponsorship ||
    state.status !== 'playing' ||
    state.sp === 0 ||
    event.type !== 'mystery-resolved' ||
    state.sponsorship.offer
  )
    return state;
  let kind: MysterySponsorOffer['kind'] | undefined;
  let amount = 0;
  if (event.kind === 'marketing' && state.pact?.phase === 'offered') {
    kind = 'market';
    amount = 20;
  } else if (event.kind === 'heal_10' || event.kind === 'heal_20') {
    kind = 'healing';
    amount = 10;
  } else if (
    (event.kind === 'hurt_10' || event.kind === 'hurt_15') &&
    event.spDelta < 0 &&
    event.spDelta >= -15
  ) {
    kind = 'sp-protection';
    amount = -event.spDelta;
  } else if (event.kind === 'lose_hint' && event.hintDelta === -1) {
    kind = 'hint-protection';
    amount = 1;
  } else if (event.kind === 'bleed_3rows') {
    kind = 'cleanse';
    amount = 9;
  }
  if (!kind) return state;
  const cap = getRuleset(state.rulesetVersion).maxSp;
  if (
    ['market', 'healing', 'sp-protection'].includes(kind) &&
    cap !== null &&
    state.sp + amount > cap
  )
    return state;
  return {
    ...state,
    sponsorship: {
      ...state.sponsorship,
      offer: {
        id: `${state.runId}:${state.currentRow}:${state.revivesApplied}`,
        kind,
        amount,
        at: state.activeTimeMs,
        status: 'offered',
      },
    },
  };
}

export function assertSponsorship(state: RunState): void {
  const value = state.sponsorship;
  if (value === undefined) return;
  if (
    !state.runId.startsWith('practice-') ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.claimed) ||
    value.claimed < 0
  )
    throw new RangeError('Invalid local mystery sponsorship.');
  const offer = value.offer;
  if (!offer) return;
  const allowed = {
    market: [20],
    healing: [10],
    'sp-protection': Array.from({ length: 30 }, (_, i) => (i + 1) / 2),
    'hint-protection': [1],
    cleanse: [9],
  };
  if (
    !Object.hasOwn(allowed, offer.kind) ||
    !allowed[offer.kind].includes(offer.amount) ||
    offer.id !== `${state.runId}:${state.currentRow}:${state.revivesApplied}` ||
    !Number.isSafeInteger(offer.at) ||
    offer.at < 0 ||
    offer.at > state.activeTimeMs ||
    !['offered', 'earned'].includes(offer.status) ||
    state.status !== 'playing'
  )
    throw new RangeError('Invalid mystery sponsor offer.');
}
