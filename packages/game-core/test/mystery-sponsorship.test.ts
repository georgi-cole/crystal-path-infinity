import { describe, expect, it } from 'vitest';
import {
  createRun,
  createPracticeCursor,
  PRACTICE_RNG,
  transitionRun,
  assertRunState,
  READING_RULESET_VERSION,
} from '../src/index.ts';
import type { RunState, RunCommand } from '../src/index.ts';
import { offerPact } from '../src/pacts.ts';
import { sponsorMystery } from '../src/mystery-sponsorship.ts';

function fresh(enabled = true) {
  return createRun(
    {
      runId: 'practice-sponsor',
      rulesetVersion: READING_RULESET_VERSION,
      routeRng: createPracticeCursor(12),
      mysteryRng: createPracticeCursor(42),
      observedAt: 1000,
      sponsoredMysteries: enabled,
    },
    PRACTICE_RNG,
  );
}
function act(state: RunState, command: RunCommand) {
  return transitionRun(state, command, {
    activeTimeMs: state.activeTimeMs,
    achievedAt: state.lastObservedAt,
    rng: PRACTICE_RNG,
  });
}
function offered(
  kind: 'heal_10' | 'marketing' | 'hurt_10' | 'hurt_15' | 'lose_hint',
  spDelta = 0,
  hintDelta = 0,
) {
  const state = fresh();
  return sponsorMystery(
    {
      ...state,
      current: { ...state.current, mysteryOutcome: kind },
      sp: 100,
      hints: 1,
      ...(kind === 'marketing' ? { pact: { ...offerPact(kind), offeredAt: 0 } } : {}),
    },
    {
      type: 'mystery-resolved',
      row: state.currentRow,
      kind,
      spDelta,
      hintDelta,
      activeTimeMs: 0,
      observedAt: 1000,
    },
    true,
  );
}

describe('versioned local mystery sponsorship', () => {
  it('preserves historical runs and rejects sponsored rewards without opt-in', () => {
    const state = fresh(false);
    expect(state.sponsorship).toBeUndefined();
    expect(act(state, { type: 'sponsor-claim', offerId: 'fake' }).accepted).toBe(false);
    expect(() =>
      assertRunState({
        ...state,
        runId: 'ranked-run',
        sponsorship: { version: 1, claimed: 0, offer: null },
      }),
    ).toThrow();
  });
  it.each([
    ['heal_10', 0, 0, 110, 1],
    ['hurt_10', -10, 0, 110, 1],
    ['hurt_15', -15, 0, 115, 1],
    ['lose_hint', 0, -1, 100, 2],
  ] as const)(
    'grants one exact %s reward without touching RNG, row or revive quota',
    (kind, spDelta, hintDelta, sp, hints) => {
      const state = offered(kind, spDelta, hintDelta);
      const offer = state.sponsorship!.offer!;
      const grant = act(state, { type: 'sponsor-claim', offerId: offer.id });
      expect(grant.accepted).toBe(true);
      expect(grant.state).toMatchObject({
        sp,
        hints,
        currentRow: state.currentRow,
        mysteryRng: state.mysteryRng,
        revivesGranted: 0,
        sponsorship: { claimed: 1, offer: { status: 'earned' } },
      });
      expect(grant.events.some((event) => event.type === 'mystery-sponsorship')).toBe(true);
      expect(act(grant.state, { type: 'sponsor-claim', offerId: offer.id }).accepted).toBe(false);
      const restored = JSON.parse(JSON.stringify(grant.state)) as RunState;
      assertRunState(restored, PRACTICE_RNG);
      expect(act(restored, { type: 'sponsor-claim', offerId: offer.id }).accepted).toBe(false);
      expect(
        act(restored, { type: 'sponsor-dismiss', offerId: offer.id }).state.sponsorship?.offer,
      ).toBeNull();
    },
  );
  it('Market sponsorship resolves the pact without fabricating a hint sale', () => {
    const state = offered('marketing');
    const granted = act(state, { type: 'sponsor-claim', offerId: state.sponsorship!.offer!.id });
    expect(granted.state.sp).toBe(120);
    expect(granted.state.hints).toBe(1);
    expect(granted.state.pact).toBeNull();
    expect(granted.events.some((event) => event.type === 'pact-resolved')).toBe(false);
  });
  it('opening a sponsored box preserves the ordinary outcome and RNG consumption', () => {
    const base = fresh();
    const state: RunState = {
      ...base,
      current: { ...base.current, mysteryTier: 'standard' },
      mysteryDirector: { ...base.mysteryDirector!, nextRow: '1' },
    };
    const ordinary = act(state, { type: 'mystery', row: '1', life: 0 });
    const sponsored = act(state, { type: 'mystery', row: '1', life: 0, sponsor: true });
    expect(ordinary.accepted).toBe(true);
    expect(sponsored.accepted).toBe(true);
    expect(sponsored.state.mysteryRng).toEqual(ordinary.state.mysteryRng);
    expect(sponsored.events).toEqual(ordinary.events);
    expect(sponsored.state.current).toEqual(ordinary.state.current);
    expect(sponsored.state.sp).toBe(ordinary.state.sp);
    expect(sponsored.state.hints).toBe(ordinary.state.hints);
  });
  it('declining preserves the original penalty and adds no new penalty', () => {
    const state = offered('hurt_10', -10);
    const declined = act(state, { type: 'sponsor-dismiss', offerId: state.sponsorship!.offer!.id });
    expect(declined.state.sp).toBe(state.sp);
    expect(declined.state.sponsorship?.claimed).toBe(0);
    expect(act(state, { type: 'choose', row: '1', life: 0, side: 'left' }).accepted).toBe(false);
  });
  it('does not offer lethal relief, excessive losses, empty hint protection or incompatible outcomes', () => {
    const state = fresh();
    const event = {
      type: 'mystery-resolved',
      row: '1',
      kind: 'hurt_10',
      spDelta: -20,
      hintDelta: 0,
      activeTimeMs: 0,
      observedAt: 1000,
    } as const;
    expect(sponsorMystery(state, event, true).sponsorship?.offer).toBeNull();
    expect(
      sponsorMystery({ ...state, sp: 0 }, { ...event, spDelta: -10 }, true).sponsorship?.offer,
    ).toBeNull();
    expect(
      sponsorMystery(state, { ...event, kind: 'lose_hint', spDelta: 0 }, true).sponsorship?.offer,
    ).toBeNull();
    expect(
      sponsorMystery(state, { ...event, kind: 'false_oracle' }, true).sponsorship?.offer,
    ).toBeNull();
    expect(sponsorMystery(state, { ...event, spDelta: -10 }, false).sponsorship?.offer).toBeNull();
  });
});
