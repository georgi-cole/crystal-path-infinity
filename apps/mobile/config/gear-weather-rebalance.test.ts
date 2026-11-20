import { describe, expect, it } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  getRowBandDamage,
  journeyGearEffect,
  parseTileExperiment,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { GearId, JourneyRoute, RunCommand, RunState } from '@crystal-path-infinity/game-core';
import {
  CAMPAIGN_MISSIONS,
  claimTestOffer,
  createCampaignInfinityRun,
  createCampaignRun,
  EMPTY_CAMPAIGN_PROGRESS,
  equipCampaignGear,
  gearOffer,
  GEAR_REWARD_MISSION,
  grantCampaignClear,
  journeyRuleset,
  ownsCampaignGear,
  readCampaignSave,
  startCampaignAttempt,
  writeCampaignSave,
} from '../src/campaign-test';
import { presentInfinityScene } from '../src/infinity-presentation';
import { missionRewardItems } from '../src/campaign-reward-presentation';

function advance(state: RunState, command: RunCommand) {
  const result = transitionRun(state, command, {
    rng: PRACTICE_RNG,
    activeTimeMs: state.activeTimeMs,
    achievedAt: state.lastObservedAt,
  });
  expect(result.accepted).toBe(true);
  return result.state;
}

function choose(state: RunState, side: 'left' | 'right' = 'right') {
  return advance(state, {
    type: 'choose',
    row: state.currentRow,
    life: state.revivesApplied,
    side,
  });
}

function wear(state: RunState, value: boolean) {
  return advance(state, {
    type: 'journey-gear',
    row: state.currentRow,
    life: state.revivesApplied,
    wear: value,
  });
}

function testRun(gear: GearId, journey: JourneyRoute, rebalance: boolean) {
  const rulesetVersion =
    journeyRuleset(journey.season, true) + '-supplies-shield-stack' + (rebalance ? '-gear-v2' : '');
  return createRun(
    {
      runId: 'practice-campaign-infinity-gear-test',
      rulesetVersion,
      routeRng: createPracticeCursor(7n),
      mysteryRng: createPracticeCursor(41n),
      observedAt: 0,
      buffer: { ahead: 8, history: 2 },
      journey,
      journeyGear: gear,
    },
    PRACTICE_RNG,
  );
}

function storageFixture() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('Outfitted weather rules', () => {
  it('uses the complete weather matrix and keeps the earlier ruleset', () => {
    const gear = [
      'umbrella',
      'sunshades',
      'sun-balm',
      'frost-runners',
      'storm-boots',
      'trail-scarf',
    ] as const;
    const conditions = [
      ['spring', undefined, [0, 0, 0, 0, 0, 0]],
      ['summer', undefined, [0, 0, 0, 0, 0, 0]],
      ['autumn', undefined, [0, 0, 0, 0, 0, 0]],
      ['winter', undefined, [0, 0, 0, 1, 0, 1]],
      ['spring', 'rain', [3, 0, 0, -1, 1, -1]],
      ['spring', 'rainbow', [0, 0, 0, 0, 0, 0]],
      ['summer', 'shower', [2, -1, 0, -1, 2, -1]],
      ['summer', 'heat', [0, 1, 0, 0, 0, 0]],
      ['autumn', 'gust', [-2, 0, 0, -1, 2, 1]],
      ['autumn', 'squall', [-3, -2, 0, -2, 3, -2]],
      ['winter', 'snow', [0, -1, 0, 3, -1, 1]],
      ['winter', 'thaw', [0, 0, 0, -2, 1, 1]],
    ] as const;
    for (const [season, weather, relief] of conditions)
      expect(
        gear.map((item) => journeyGearEffect(item, season, weather, true).hitRelief ?? 0),
      ).toEqual(relief);
    expect(journeyGearEffect('sunshades', 'summer', 'heat', true)).toEqual({
      hitRelief: 1,
      clearGlint: true,
    });
    expect(journeyGearEffect('umbrella', 'autumn', 'squall').hitRelief).toBe(-2);
    expect(journeyGearEffect('sun-balm', 'summer').cleanGain).toBe(1);
    expect(
      parseTileExperiment(journeyRuleset('winter', false, false, true, true) + '-gear-v2'),
    ).toBeNull();
  });

  it('applies wrong-step drawbacks after shields and only until the gear is stowed', () => {
    const route: JourneyRoute = {
      version: 1,
      season: 'autumn',
      windows: [{ start: 1, weather: 'squall' }],
      marks: [1, 2].map((row) => ({ row, bothBroken: true, cue: 'crack' })),
    };
    const initial = testRun('umbrella', route, true);
    const damage = getRowBandDamage('1', initial.rulesetVersion);
    const queued = wear(initial, false);
    const landed = choose(queued);
    expect(landed.sp).toBe(initial.sp - damage - 3);
    expect(landed.journeyGear?.worn).toBe(false);
    expect(choose(landed).sp).toBe(landed.sp - damage);
    const guarded = choose({ ...initial, journeyShields: 1 });
    expect(guarded.sp).toBe(initial.sp);
    expect(guarded.journeyShields).toBe(0);
  });

  it('counts pairs across stowing, caps clear recovery, and resets on Heat and wet conditions', () => {
    const route: JourneyRoute = {
      version: 1,
      season: 'summer',
      windows: [
        { start: 10, weather: 'heat' },
        { start: 14, weather: 'shower' },
      ],
      marks: Array.from({ length: 15 }, (_, i) => ({ row: i + 1, safe: 'right' })),
    };
    const initial = testRun('sun-balm', route, true);
    let state = choose(initial);
    expect(state.sp).toBe(initial.sp);
    state = choose(wear(state, false));
    expect(state.sp).toBe(initial.sp + 1);
    state = choose(state);
    state = choose(wear(state, true));
    for (let i = 0; i < 5; i++) state = choose(state);
    expect(state.sp).toBe(initial.sp + 3);
    const storage = storageFixture();
    state = choose(state);
    writeCampaignSave(storage, EMPTY_CAMPAIGN_PROGRESS, null, state);
    state = readCampaignSave(storage).infinityCheckpoint!;
    expect(state?.journeyGear?.recovery).toMatchObject({ window: '10', pending: true });
    state = choose(state);
    expect(state.sp).toBe(initial.sp + 5);
    state = choose(choose(choose(state)));
    expect(state.sp).toBe(initial.sp + 5);
    expect(state.journeyGear?.recovery).toBeUndefined();
    const legacy = testRun('sun-balm', route, false);
    expect(choose(legacy).sp).toBe(legacy.sp + 1);
  });

  it('keeps the visible Sunshades cue direct and leaves a double crack unreadable as safe', () => {
    const initial = testRun(
      'sunshades',
      {
        version: 1,
        season: 'summer',
        windows: [{ start: 1, weather: 'heat' }],
        marks: [
          { row: 1, safe: 'right', cue: 'mirror' },
          { row: 2, bothBroken: true, cue: 'crack' },
        ],
      },
      true,
    );
    expect(
      presentInfinityScene(initial).rows.find(({ phase }) => phase === 'current')?.cue,
    ).toEqual({ kind: 'lens', side: 'right' });
    expect(
      presentInfinityScene(choose(initial)).rows.find(({ phase }) => phase === 'current')?.cue,
    ).toEqual({ kind: 'crack', side: null });
  });
});

describe('Campaign gear ownership and runs', () => {
  it.each(Object.entries(GEAR_REWARD_MISSION) as [GearId, (typeof GEAR_REWARD_MISSION)[GearId]][])(
    '%s is earned by its first clear and restores from previous progress',
    (gear, missionId) => {
      const index = CAMPAIGN_MISSIONS.findIndex(({ id }) => id === missionId);
      const clearedBefore = CAMPAIGN_MISSIONS.slice(0, index).map(({ id }) => id);
      const first = startCampaignAttempt(
        { ...EMPTY_CAMPAIGN_PROGRESS, cleared: clearedBefore },
        missionId,
      );
      const mission = first.activeMissionSnapshot!;
      expect(ownsCampaignGear(first, gear)).toBe(false);
      const cleared = grantCampaignClear(first, mission, createCampaignRun(mission, 1n));
      expect(ownsCampaignGear(cleared, gear)).toBe(true);
      expect(missionRewardItems(mission)).toContainEqual(
        expect.objectContaining({ art: { type: 'gear', item: gear } }),
      );
      const kit = equipCampaignGear(cleared, gear);
      expect(kit.gear).toBe(gear);
      expect(kit.offers).not.toContain(gearOffer(gear));
      const infinity = createCampaignInfinityRun(kit);
      expect(parseTileExperiment(infinity.rulesetVersion)).toMatchObject({
        gearV2: true,
        geared: true,
      });
      const storage = storageFixture();
      writeCampaignSave(storage, kit, null, infinity);
      expect(readCampaignSave(storage).progress.gear).toBe(gear);
    },
  );

  it('gives replays one owned item, while regular runs keep the original kit and Mastery', () => {
    const bought = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, gearOffer('umbrella'));
    expect(() => startCampaignAttempt(bought, 'first-steps', 'main', 'umbrella')).toThrow();
    const cleared = { ...bought, cleared: ['first-steps' as const] };
    const normal = startCampaignAttempt(cleared, 'first-steps').activeMissionSnapshot!;
    expect(createCampaignRun(normal, 1n).journeyGear).toBeUndefined();
    const replay = startCampaignAttempt(cleared, 'first-steps', 'main', 'umbrella');
    const snapshot = replay.activeMissionSnapshot!;
    const state = createCampaignRun(snapshot, 1n);
    expect(parseTileExperiment(state.rulesetVersion)).toMatchObject({
      gearV2: true,
      missionKit: true,
    });
    expect(state.journeyGear?.item).toBe('umbrella');
    expect(grantCampaignClear(replay, snapshot, state).mastered).toEqual([]);
    const storage = storageFixture();
    writeCampaignSave(storage, replay, state);
    expect(readCampaignSave(storage).checkpoint?.journeyGear?.item).toBe('umbrella');
  });
});
