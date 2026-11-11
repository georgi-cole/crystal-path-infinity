import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  createRun,
  createRunSession,
  createPracticeCursor,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { GearId, RunCommand, RunState } from '@crystal-path-infinity/game-core';
import {
  EMPTY_CAMPAIGN_PROGRESS,
  claimTestOffer,
  createCampaignInfinityRun,
  infinityProgressFromEvents,
  equipCampaignGear,
  gearOffer,
  ownsCampaignGear,
  journeyRuleset,
  readCampaignSave,
  writeCampaignSave,
} from '../src/campaign-test';
import { runCuesFromEvents } from '../src/mystery-feedback';

function fresh(stacks = true, gear?: GearId) {
  return createRun(
    {
      runId: 'practice-campaign-infinity-kit-fixture',
      rulesetVersion:
        journeyRuleset('spring', !!gear, true) + '-supplies' + (stacks ? '-shield-stack' : ''),
      routeRng: createPracticeCursor(17),
      mysteryRng: createPracticeCursor(9),
      observedAt: 0,
      ...(gear ? { journeyGear: gear } : {}),
      journey: {
        version: 1,
        season: 'spring',
        ...(gear ? { windows: [{ start: 1, weather: 'squall' as const }] } : {}),
        reviveSp: 150,
        marks: Array.from({ length: 10 }, (_, i) => ({ row: i + 1, bothBroken: true as const })),
      },
    },
    PRACTICE_RNG,
  );
}
function step(state: RunState, command: RunCommand, elapsed = 0) {
  return transitionRun(state, command, {
    rng: PRACTICE_RNG,
    activeTimeMs: state.activeTimeMs + elapsed,
    achievedAt: state.lastObservedAt + elapsed,
  });
}
const stock = () => claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, 'shield-pack');

describe('staged Kit and charged shields', () => {
  it('keeps one worn item while preserving both purchases and the choice across saves', () => {
    const both = claimTestOffer(
      claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, gearOffer('sunshades')),
      gearOffer('storm-boots'),
    );
    const changed = equipCampaignGear(equipCampaignGear(both, 'sunshades'), 'storm-boots');
    expect(changed.gear).toBe('storm-boots');
    expect(ownsCampaignGear(changed, 'sunshades')).toBe(true);
    expect(ownsCampaignGear(changed, 'storm-boots')).toBe(true);
    let saved = '';
    writeCampaignSave(
      {
        setItem: (_key, value) => {
          saved = value;
        },
      },
      changed,
      null,
    );
    const restored = readCampaignSave({ getItem: () => saved }).progress;
    expect(restored.gear).toBe('storm-boots');
    expect(ownsCampaignGear(restored, 'sunshades')).toBe(true);
    expect(createCampaignInfinityRun(restored).journeyGear?.item).toBe('storm-boots');
  });

  it('combines gear, bad weather and charged shields without doubling damage or spending extra charges', () => {
    const initial = fresh(true, 'umbrella');
    const loaded = step(initial, {
      type: 'journey-loadout',
      stabilityDoses: 0,
      shieldDelta: 2,
    }).state;
    const queued = step(loaded, { type: 'journey-gear', row: '1', life: 0, wear: false }).state;
    const landing = step(queued, { type: 'choose', row: '1', life: 0, side: 'left' });
    expect(landing.state.sp).toBe(queued.sp);
    expect(landing.state.journeyShields).toBe(1);
    expect(landing.state.journeyGear).toEqual({ item: 'umbrella', worn: false, queued: null });
    expect(landing.events.find((e) => e.type === 'choice-resolved')).toMatchObject({
      shieldChargeUsed: true,
      spDelta: 0,
    });
    const temporary = {
      ...loaded,
      effects: [{ kind: 'shield_5s' as const, startedAt: 0, expiresAt: 5000, nextTickAt: null }],
    };
    const protectedLanding = step(temporary, { type: 'choose', row: '1', life: 0, side: 'left' });
    expect(protectedLanding.state.sp).toBe(temporary.sp);
    expect(protectedLanding.state.journeyShields).toBe(2);
  });

  it('loads five shields without spending stock, then blocks exactly five cracks', () => {
    let progress = stock(),
      state = fresh();
    const loaded = step(state, { type: 'journey-loadout', stabilityDoses: 0, shieldDelta: 5 });
    progress = infinityProgressFromEvents(progress, state, loaded.events);
    state = loaded.state;
    expect(state.journeyShields).toBe(5);
    expect(progress.shields).toBe(10);
    state = step(state, { type: 'tick' }, 120_000).state;
    expect(state.journeyShields).toBe(5);
    expect(state.effects.some((effect) => effect.kind === 'shield_5s')).toBe(false);
    for (let n = 0; n < 5; n++) {
      const before = state;
      const result = step(state, { type: 'choose', row: state.currentRow, life: 0, side: 'left' });
      expect(result.accepted).toBe(true);
      expect(result.events.find((event) => event.type === 'choice-resolved')).toMatchObject({
        wrong: true,
        shieldChargeUsed: true,
        spDelta: 0,
      });
      expect(runCuesFromEvents(result.events, result.state).consumption?.kind).toBe('shield_5s');
      progress = infinityProgressFromEvents(progress, before, result.events);
      state = result.state;
      expect(state.sp).toBe(300);
      expect(state.journeyShields).toBe(4 - n);
      expect(progress.shields).toBe(9 - n);
    }
    const sixth = step(state, { type: 'choose', row: state.currentRow, life: 0, side: 'left' });
    expect(sixth.state.sp).toBeLessThan(state.sp);
    expect(infinityProgressFromEvents(progress, state, sixth.events).shields).toBe(5);
  });
  it('does not waste a loaded charge on a hinted safe landing or a temporary Mystery shield', () => {
    const loaded = step(fresh(), {
      type: 'journey-loadout',
      stabilityDoses: 0,
      shieldDelta: 5,
    }).state;
    const hinted = step(loaded, { type: 'hint', row: '1', life: 0 }).state;
    const clean = step(hinted, {
      type: 'choose',
      row: '1',
      life: 0,
      side: hinted.current.revealedSafeSide!,
    });
    expect(clean.state.journeyShields).toBe(5);
    expect(infinityProgressFromEvents(stock(), hinted, clean.events).shields).toBe(10);
    const temporary = {
      ...loaded,
      effects: [{ kind: 'shield_5s' as const, startedAt: 0, expiresAt: 5000, nextTickAt: null }],
    };
    const blocked = step(temporary, { type: 'choose', row: '1', life: 0, side: 'left' });
    expect(blocked.events.find((event) => event.type === 'choice-resolved')).toMatchObject({
      consumedKind: 'shield_5s',
    });
    expect(blocked.state.journeyShields).toBe(5);
    expect(infinityProgressFromEvents(stock(), temporary, blocked.events).shields).toBe(10);
  });
  it('puts unused charges back and keeps all unused stock on a fresh crossing', () => {
    const progress = stock();
    const loaded = step(fresh(), {
      type: 'journey-loadout',
      stabilityDoses: 0,
      shieldDelta: 5,
    }).state;
    const unloaded = step(loaded, { type: 'journey-loadout', stabilityDoses: 0, shieldDelta: -3 });
    expect(unloaded.state.journeyShields).toBe(2);
    expect(infinityProgressFromEvents(progress, loaded, unloaded.events).shields).toBe(10);
    expect(
      step(unloaded.state, { type: 'journey-loadout', stabilityDoses: 0, shieldDelta: -3 })
        .accepted,
    ).toBe(false);
    expect(createCampaignInfinityRun(progress).journeyShields).toBe(0);
    let saved = '';
    writeCampaignSave(
      {
        setItem: (_, value) => {
          saved = value;
        },
      },
      progress,
      null,
      unloaded.state,
    );
    expect(readCampaignSave({ getItem: () => saved }).infinityCheckpoint?.journeyShields).toBe(2);
    expect(readCampaignSave({ getItem: () => saved }).progress.shields).toBe(10);
  });
  it('commits a mixed selection once and rejects loading more shields than are owned', () => {
    let progress = { ...stock(), reserveSp: 500 },
      stored = '';
    const initial = fresh();
    const session = createRunSession(initial, PRACTICE_RNG);
    const commit = (result: ReturnType<typeof step>, previous: RunState) => {
      const next = infinityProgressFromEvents(progress, previous, result.events);
      writeCampaignSave(
        {
          setItem: (_, value) => {
            stored = value;
          },
        },
        next,
        null,
        result.state,
      );
      progress = next;
    };
    const apply = session.bind(
      { type: 'journey-loadout', stabilityDoses: 2, shieldDelta: 5 },
      commit,
    );
    expect(apply({ activeTimeMs: 0, achievedAt: 0 }).accepted).toBe(true);
    expect(session.getState().sp).toBe(350);
    expect(session.getState().journeyShields).toBe(5);
    expect(progress).toMatchObject({ reserveSp: 450, shields: 10 });
    expect(apply({ activeTimeMs: 0, achievedAt: 0 }).accepted).toBe(false);
    const tooMany = session.bind(
      { type: 'journey-loadout', stabilityDoses: 0, shieldDelta: 6 },
      commit,
    );
    expect(() => tooMany({ activeTimeMs: 0, achievedAt: 0 })).toThrow('Kit selection');
    expect(session.getState().journeyShields).toBe(5);
    expect(readCampaignSave({ getItem: () => stored }).progress.reserveSp).toBe(450);
    expect(session.getState().stream).toEqual(initial.stream);
  });
  it('rolls back the whole selection and a shield-blocked step if saving fails', () => {
    const progress = { ...stock(), reserveSp: 500 };
    const initial = fresh();
    const session = createRunSession(initial, PRACTICE_RNG);
    const brokenSave = () => {
      throw new Error('storage full');
    };
    const apply = session.bind(
      { type: 'journey-loadout', stabilityDoses: 2, shieldDelta: 5 },
      (result, previous) =>
        writeCampaignSave(
          { setItem: brokenSave },
          infinityProgressFromEvents(progress, previous, result.events),
          null,
          result.state,
        ),
    );
    expect(() => apply({ activeTimeMs: 0, achievedAt: 0 })).toThrow('storage full');
    expect(session.getState()).toEqual(initial);
    const loaded = step(initial, {
      type: 'journey-loadout',
      stabilityDoses: 0,
      shieldDelta: 1,
    }).state;
    const protectedSession = createRunSession(loaded, PRACTICE_RNG);
    const hit = protectedSession.bind({ type: 'choose', side: 'left' }, (result, previous) =>
      writeCampaignSave(
        { setItem: brokenSave },
        infinityProgressFromEvents(progress, previous, result.events),
        null,
        result.state,
      ),
    );
    expect(() => hit({ activeTimeMs: 0, achievedAt: 0 })).toThrow('storage full');
    expect(protectedSession.getState()).toEqual(loaded);
    expect(progress.shields).toBe(10);
  });
  it('keeps legacy temporary shields and rejects loaded-charge fields on legacy saves', () => {
    const legacy = fresh(false);
    const shield = step(legacy, { type: 'journey-loadout', stabilityDoses: 0, shieldDelta: 1 });
    expect(shield.state.effects.find((effect) => effect.kind === 'shield_5s')).toMatchObject({
      expiresAt: 5000,
    });
    expect(infinityProgressFromEvents(stock(), legacy, shield.events).shields).toBe(9);
    expect(
      step(shield.state, { type: 'journey-loadout', stabilityDoses: 0, shieldDelta: 1 }).accepted,
    ).toBe(false);
    expect(() => assertRunState({ ...legacy, journeyShields: 1 }, PRACTICE_RNG)).toThrow(
      'loaded Journey shields',
    );
    expect(() => assertRunState({ ...fresh(), journeyShields: -1 }, PRACTICE_RNG)).toThrow(
      'loaded Journey shields',
    );
  });
});
