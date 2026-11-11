import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createPracticeCursor,
  createRunSession,
  createRowStream,
  getCurrentRow,
  hintSafeSide,
  journeyExpectedSide,
  journeyForecast,
  journeyGearEffect,
  getDeathClock,
  parseTileExperiment,
  journeyRow,
  PRACTICE_RNG,
  takeRows,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { JourneyRoute, RunCommand, RunState } from '@crystal-path-infinity/game-core';
import { bridgeModel, CAMPAIGN_MISSIONS, missionObjectives } from '../src/campaign-content';
import {
  CAMPAIGN_INFINITY_RULESET,
  CAMPAIGN_TEST_PROGRESS_KEY,
  EMPTY_CAMPAIGN_PROGRESS,
  advanceInfinityCycle,
  campaignFailureReason,
  campaignProgressFromEvents,
  infinityProgressFromEvents,
  canUseInfinitySupply,
  isRepeatableSupply,
  supplyPackFits,
  claimTestOffer,
  createCampaignInfinityRun,
  createCampaignRun,
  equipCampaignGear,
  equipBridgeDesign,
  gearOffer,
  grantCampaignClear,
  journeyRuleset,
  newMissionSnapshot,
  nextCampaignMission,
  readCampaignSave,
  selectedInfinitySeason,
  unlockedSeasons,
  spendSeasonChange,
  writeCampaignSave,
  startCampaignAttempt,
} from '../src/campaign-test';
import type { CampaignMissionSnapshot } from '../src/campaign-test';
import { presentInfinityScene } from '../src/infinity-presentation';
import { CompanionSeasonGear } from '../src/journey-atmosphere';
import { CampaignMissionHub, CampaignMissionResult } from '../src/campaign-test-ui';

// Stable fixtures are intentional; the player-facing factory has no fixed seed.
function seededCampaignRun(mission: CampaignMissionSnapshot): RunState {
  const index = CAMPAIGN_MISSIONS.findIndex((m) => m.id === mission.id);
  return createCampaignRun(
    mission,
    0x4350490000000001n + BigInt(index + (mission.approach === 'ridge' ? 100 : 0)),
  );
}

function step(state: RunState, command: RunCommand, elapsed = 0) {
  return transitionRun(state, command, {
    rng: PRACTICE_RNG,
    activeTimeMs: state.activeTimeMs + elapsed,
    achievedAt: state.lastObservedAt + elapsed,
  });
}

// The oracle uses private tile state to demonstrate a possible free clear of each fixed route.
// It does not estimate what percentage of players will find that route on a phone.
function demonstrateClear(mission: CampaignMissionSnapshot) {
  let state = seededCampaignRun(mission);
  let progress = EMPTY_CAMPAIGN_PROGRESS;
  const act = (command: RunCommand) => {
    const result = step(state, command, 450);
    expect(result.accepted).toBe(true);
    progress = campaignProgressFromEvents(
      progress,
      mission,
      result.events,
      result.state.currentRow,
    );
    state = result.state;
  };
  while (BigInt(state.lastClearedRow) < BigInt(mission.targetRow) && state.status === 'playing') {
    const row = getCurrentRow(state);
    const scope = { row: state.currentRow, life: 0 };
    if (row.encounter) {
      act({ type: 'mystery', ...scope });
      if (row.encounter === 'marketing') act({ type: 'pact', option: 'sell_one', ...scope });
    }
    const goals = missionObjectives(mission.goal);
    if (
      goals.some(
        (goal) =>
          (goal.type === 'hints' && state.hints > 0 && hintSafeSide(row) !== null) ||
          (goal.type === 'hint-follow' && scope.row === String(goal.row)) ||
          (goal.type === 'hint-steps' && goal.rows.some((n) => scope.row === String(n))),
      )
    )
      act({ type: 'hint', ...scope });
    act({
      type: 'choose',
      side:
        state.current.revealedSafeSide ?? journeyExpectedSide(row) ?? hintSafeSide(row) ?? 'left',
      ...scope,
    });
  }
  expect(state.lastClearedRow).toBe(String(mission.targetRow));
  expect(campaignFailureReason(mission, progress, state.sp)).toBeNull();
  return { progress, state };
}

describe('Beacon Route playtest', () => {
  it.each([
    ['sp-pack', 'reserveSp', 500],
    ['hint-pack', 'reserveHints', 10],
    ['continue-pack', 'continues', 3],
    ['shield-pack', 'shields', 10],
    ['season-change-pack', 'seasonChanges', 10],
  ] as const)(
    'stacks repeated %s packs and permits restocking after use',
    (offer, balance, amount) => {
      const initial = { ...EMPTY_CAMPAIGN_PROGRESS, offers: ['all-seasons'] as const };
      const once = claimTestOffer(initial, offer),
        twice = claimTestOffer(once, offer);
      expect(isRepeatableSupply(offer)).toBe(true);
      expect(twice[balance]).toBe(amount * 2);
      expect(twice.offers.filter((value) => value === offer)).toHaveLength(1);
      expect(claimTestOffer({ ...twice, [balance]: 0 }, offer)[balance]).toBe(amount);
      const full = { ...twice, [balance]: 10000 };
      expect(supplyPackFits(full, offer)).toBe(false);
      expect(claimTestOffer(full, offer)).toBe(full);
      let stored = '';
      writeCampaignSave(
        {
          setItem: (_, value) => {
            stored = value;
          },
        },
        twice,
        null,
      );
      expect(readCampaignSave({ getItem: () => stored }).progress[balance]).toBe(amount * 2);
    },
  );
  it('draws new route and Mystery entropy for each Campaign attempt, while an explicit fixture seed reproduces both', () => {
    const entropy = vi.spyOn(crypto, 'getRandomValues');
    const mission = newMissionSnapshot('first-steps');
    let first: RunState, second: RunState;
    try {
      first = createCampaignRun(mission);
      second = createCampaignRun(mission);
      expect(entropy).toHaveBeenCalledTimes(2);
    } finally {
      entropy.mockRestore();
    }
    expect(first!.stream.rng).not.toEqual(second!.stream.rng);
    expect(first!.mysteryRng).not.toEqual(second!.mysteryRng);
    const a = createCampaignRun(mission, 125n),
      b = createCampaignRun(mission, 125n);
    expect(a.rows).toEqual(b.rows);
    expect(a.stream).toEqual(b.stream);
    expect(a.mysteryRng).toEqual(b.mysteryRng);
  });

  it('guarantees a safe hinted landing on a double crack and keeps the drawn route unchanged', () => {
    const mission = {
      ...newMissionSnapshot('dry-foothold'),
      marks: [{ row: 1, bothBroken: true as const, cue: 'crack' as const }],
    };
    const initial = seededCampaignRun(mission);
    const hinted = step(initial, { type: 'hint', row: '1', life: 0 });
    const side = hinted.state.current.revealedSafeSide!;
    expect(side).not.toBeNull();
    expect(hinted.state.current.noSafeTile).toBeUndefined();
    expect(hinted.state.hints).toBe(initial.hints - 1);
    expect(hinted.state.rows).toEqual(initial.rows);
    expect(hinted.state.stream).toEqual(initial.stream);
    expect(hinted.events.filter((e) => e.type === 'hint-used')).toHaveLength(1);
    expect(step(hinted.state, { type: 'hint', row: '1', life: 0 }).reason).toBe('already-revealed');
    const landed = step(hinted.state, { type: 'choose', row: '1', life: 0, side });
    expect(landed.events.find((e) => e.type === 'choice-resolved')).toMatchObject({ wrong: false });
    expect(landed.state.sp).toBe(hinted.state.sp);
    const view = presentInfinityScene(hinted.state).rows.find((r) => r.phase === 'current')!;
    expect(view.hint).toBe(side);
    expect(view.noSafeTile).toBeUndefined();
    expect(view.cue).toBeUndefined();
  });

  it('debits one Infinity reserve hint atomically with its protected landing and preserves both slots', () => {
    const attempt = startCampaignAttempt(
      claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, 'hint-pack'),
      'first-steps',
    );
    const campaign = seededCampaignRun(attempt.activeMissionSnapshot!);
    const initial = {
      ...seededCampaignRun({
        ...newMissionSnapshot('first-steps'),
        startingHints: 0,
        rulesetVersion: journeyRuleset('spring') + '-supplies',
        marks: [{ row: 1, bothBroken: true as const }],
      }),
      runId: 'practice-campaign-infinity-inventory-test',
    };
    const session = createRunSession(initial, PRACTICE_RNG);
    let progress = attempt,
      stored = '';
    const use = session.bind({ type: 'journey-hint' }, (result, previous) => {
      const next = infinityProgressFromEvents(progress, previous, result.events);
      writeCampaignSave(
        {
          setItem: (_, value) => {
            stored = value;
          },
        },
        next,
        campaign,
        result.state,
      );
      progress = next;
    });
    const hinted = use({ activeTimeMs: 0, achievedAt: initial.lastObservedAt });
    expect(hinted.accepted).toBe(true);
    expect(progress.reserveHints).toBe(9);
    expect(use({ activeTimeMs: 0, achievedAt: initial.lastObservedAt }).accepted).toBe(false);
    expect(progress.reserveHints).toBe(9);
    const loaded = readCampaignSave({ getItem: () => stored });
    expect(loaded.infinityCheckpoint).toEqual(hinted.state);
    expect(loaded.checkpoint).toEqual(campaign);
    expect(loaded.progress.reserveHints).toBe(9);
    const landed = step(loaded.infinityCheckpoint!, {
      type: 'choose',
      row: '1',
      life: 0,
      side: hinted.state.current.revealedSafeSide!,
    });
    expect(landed.events.find((e) => e.type === 'choice-resolved')).toMatchObject({ wrong: false });
    expect(takeRows(loaded.infinityCheckpoint!.stream, 8, PRACTICE_RNG)).toEqual(
      takeRows(hinted.state.stream, 8, PRACTICE_RNG),
    );
  });

  it('keeps stored hints until the two free Infinity hints are spent, including new starts', () => {
    let progress = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, 'hint-pack');
    let state = createCampaignInfinityRun(progress);
    expect(state.hints + progress.reserveHints).toBe(12);
    expect(canUseInfinitySupply(progress, state, 'hint')).toBe(false);
    for (let n = 0; n < 2; n++) {
      const hint = step(state, { type: 'hint', row: state.currentRow, life: 0 });
      progress = infinityProgressFromEvents(progress, state, hint.events);
      state = step(hint.state, {
        type: 'choose',
        row: state.currentRow,
        life: 0,
        side: hint.state.current.revealedSafeSide!,
      }).state;
    }
    expect(progress.reserveHints).toBe(10);
    expect(canUseInfinitySupply(progress, state, 'hint')).toBe(true);
    const hint = step(state, { type: 'journey-hint', row: state.currentRow, life: 0 });
    progress = infinityProgressFromEvents(progress, state, hint.events);
    expect(progress.reserveHints).toBe(9);
    expect(createCampaignInfinityRun(progress).hints + progress.reserveHints).toBe(11);
  });

  it('rolls back Infinity supply use when its atomic save fails', () => {
    const progress = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, 'hint-pack');
    const initial = { ...createCampaignInfinityRun(progress), hints: 0 };
    const session = createRunSession(initial, PRACTICE_RNG);
    const use = session.bind({ type: 'journey-hint' }, (result, previous) => {
      writeCampaignSave(
        {
          setItem: () => {
            throw new Error('storage full');
          },
        },
        infinityProgressFromEvents(progress, previous, result.events),
        null,
        result.state,
      );
    });
    expect(() => use({ activeTimeMs: 0, achievedAt: initial.lastObservedAt })).toThrow(
      'storage full',
    );
    expect(session.getState()).toEqual(initial);
    expect(progress.reserveHints).toBe(10);
  });

  it('spends Infinity Stability, shields and continues only when their effect is accepted', () => {
    let progress = { ...EMPTY_CAMPAIGN_PROGRESS, reserveSp: 500, shields: 10, continues: 3 };
    let state = createCampaignInfinityRun(progress);
    const boost = step(state, { type: 'journey-resource', resource: 'sp' });
    expect(boost.state.sp).toBe(state.sp + 25);
    progress = infinityProgressFromEvents(progress, state, boost.events);
    expect(progress.reserveSp).toBe(475);
    state = boost.state;
    const shield = step(state, { type: 'journey-resource', resource: 'shield' });
    progress = infinityProgressFromEvents(progress, state, shield.events);
    expect(progress.shields).toBe(10);
    expect(shield.state.journeyShields).toBe(1);
    expect(canUseInfinitySupply(progress, shield.state, 'shield')).toBe(true);
    expect(step(shield.state, { type: 'journey-resource', resource: 'shield' }).accepted).toBe(
      true,
    );
    state = { ...shield.state, sp: 1 };
    for (let n = 0; n < 2; n++) {
      const fallen = step(state, { type: 'tick' }, 3_600_000).state;
      expect(fallen.status).toBe('dead');
      expect(canUseInfinitySupply(progress, fallen, 'continue')).toBe(true);
      const resumed = step(fallen, { type: 'journey-resource', resource: 'continue' });
      expect(resumed.accepted).toBe(true);
      expect(resumed.state.sp).toBe(150);
      expect(resumed.state.currentRow).toBe(fallen.currentRow);
      progress = infinityProgressFromEvents(progress, fallen, resumed.events);
      state = resumed.state;
    }
    expect(progress.continues).toBe(1);
    expect(canUseInfinitySupply(progress, state, 'continue')).toBe(false);
  });

  it('gives every new Campaign only its mission kit despite a fully stocked shop', () => {
    const stocked = {
      ...EMPTY_CAMPAIGN_PROGRESS,
      cleared: CAMPAIGN_MISSIONS.map((m) => m.id),
      reserveSp: 500,
      reserveHints: 10,
      shields: 10,
      continues: 3,
      clockFree: true,
      gear: 'umbrella' as const,
    };
    for (const { id } of CAMPAIGN_MISSIONS) {
      const progress = startCampaignAttempt(stocked, id);
      const mission = progress.activeMissionSnapshot!;
      const state = seededCampaignRun(mission);
      expect(state.hints).toBe(mission.startingHints);
      expect(state.sp).toBe(mission.startingSp);
      expect(state.journeyGear).toBeUndefined();
      expect(parseTileExperiment(state.rulesetVersion)).toMatchObject({ missionKit: true });
      expect(getDeathClock(state)).not.toBeNull();
      expect(
        step(state, { type: 'journey-loadout', stabilityDoses: 1, shieldDelta: 5 }).reason,
      ).toBe('journey-resource-unavailable');
      expect(step({ ...state, hints: 0 }, { type: 'journey-hint', row: '1', life: 0 }).reason).toBe(
        'journey-resource-unavailable',
      );
      for (const resource of ['sp', 'shield', 'continue'] as const)
        expect(step(state, { type: 'journey-resource', resource }).reason).toBe(
          'journey-resource-unavailable',
        );
      expect(progress.reserveHints).toBe(10);
    }
  });

  it('keeps a pre-guarantee saved attempt on its original rules and gives the retry the new policy', () => {
    const legacy = {
      ...newMissionSnapshot('first-steps'),
      rulesetVersion: journeyRuleset('spring', false, false, false),
    };
    const attempt = {
      ...startCampaignAttempt(EMPTY_CAMPAIGN_PROGRESS, 'first-steps'),
      activeMissionSnapshot: legacy,
    };
    const state = seededCampaignRun(legacy);
    let stored = '';
    writeCampaignSave(
      {
        setItem: (_, v) => {
          stored = v;
        },
      },
      attempt,
      state,
    );
    const loaded = readCampaignSave({ getItem: () => stored });
    expect(loaded.progress.activeMissionSnapshot).toEqual(legacy);
    expect(loaded.checkpoint).toEqual(state);
    const retry = startCampaignAttempt(loaded.progress, 'first-steps');
    expect(parseTileExperiment(retry.activeMissionSnapshot!.rulesetVersion)?.safeHints).toBe(true);
    expect(parseTileExperiment(state.rulesetVersion)?.safeHints).toBeUndefined();
  });
  it('snapshots the permanent clock unlock and keeps old attempts and records separate', () => {
    const original = createCampaignInfinityRun(EMPTY_CAMPAIGN_PROGRESS);
    expect(getDeathClock(original)).not.toBeNull();
    const purchased = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, 'clock-free');
    expect(claimTestOffer(purchased, 'clock-free')).toBe(purchased);
    const run = createCampaignInfinityRun(purchased);
    expect(parseTileExperiment(run.rulesetVersion)?.clockless).toBe(true);
    expect(getDeathClock(run)).toBeNull();
    const waited = step(run, { type: 'tick' }, 90_000).state;
    expect(waited.status).toBe('playing');
    expect(waited.sp).toBe(run.sp);
    expect(getDeathClock(original)).not.toBeNull();
    expect(createCampaignInfinityRun({ ...purchased, clockFree: false }).rulesetVersion).toBe(
      original.rulesetVersion,
    );
    const outfitted = equipCampaignGear(
      claimTestOffer(purchased, gearOffer('umbrella')),
      'umbrella',
    );
    const gearedRun = createCampaignInfinityRun(outfitted);
    expect(gearedRun.rulesetVersion).toContain('-gear-clockless');
    expect(getDeathClock(gearedRun)).toBeNull();
    const attempt = startCampaignAttempt(outfitted, 'first-steps');
    const mission = attempt.activeMissionSnapshot!;
    const state = seededCampaignRun(mission);
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    writeCampaignSave(storage, attempt, state);
    const restored = readCampaignSave(storage);
    expect(restored.progress.clockFree).toBe(true);
    expect(restored.checkpoint?.rulesetVersion).toBe(state.rulesetVersion);
    expect(getDeathClock(restored.checkpoint!)).not.toBeNull();
    expect(state.journeyGear).toBeUndefined();
    expect(grantCampaignClear(attempt, mission, state).mastered).toContain('first-steps');
  });
  it('fits sunshades without overlapping the summer visor and keeps rain clothing', () => {
    const props = { world: 'puppy', season: 'summer', frame: 0 } as const;
    expect(renderToStaticMarkup(createElement(CompanionSeasonGear, props))).not.toBe('');
    expect(
      renderToStaticMarkup(createElement(CompanionSeasonGear, { ...props, gear: 'sunshades' })),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        createElement(CompanionSeasonGear, { ...props, gear: 'sunshades', weather: 'shower' }),
      ),
    ).not.toBe('');
  });
  it('keeps earned torches usable without the removed ivy bridge and unlocks Jelly Path', () => {
    const progress = {
      ...EMPTY_CAMPAIGN_PROGRESS,
      cleared: ['light-the-lighthouse', 'two-clean-chords'] as const,
    };
    const lit = equipBridgeDesign(progress, { lighting: 'torches' });
    expect(lit.style.lighting).toBe('torches');
    expect(bridgeModel(lit.style)).toBe('original');
    const jelly = equipBridgeDesign(lit, { tiles: 'jelly-cushions' });
    expect(bridgeModel(jelly.style)).toBe('jelly');
  });
  it('rotates unlocked seasons in calendar order and keeps the active run on its own route', () => {
    const clear = EMPTY_CAMPAIGN_PROGRESS;
    expect(selectedInfinitySeason(clear)).toBe('plain');
    expect(claimTestOffer(clear, 'season-change-pack')).toBe(clear);
    const spring = claimTestOffer(clear, 'all-seasons');
    expect(unlockedSeasons(spring)).toEqual(['spring', 'summer', 'autumn', 'winter']);
    const run = createCampaignInfinityRun(spring);
    const summer = advanceInfinityCycle(spring);
    const packed = claimTestOffer(summer, 'season-change-pack');
    expect(packed.seasonChanges).toBe(10);
    const autumn = spendSeasonChange(packed);
    expect(selectedInfinitySeason(autumn)).toBe('autumn');
    expect(autumn.seasonChanges).toBe(9);
    expect(run.stream.journey?.season).toBe('spring');
    expect(selectedInfinitySeason(advanceInfinityCycle(autumn))).toBe('winter');
  });

  it('stores shield and season-change balances across reloads and allows another pack', () => {
    let progress = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, 'all-seasons');
    progress = claimTestOffer(progress, 'season-change-pack');
    progress = spendSeasonChange(claimTestOffer(progress, 'shield-pack'));
    let stored = '';
    writeCampaignSave(
      {
        setItem: (_key, value) => {
          stored = value;
        },
      },
      progress,
      null,
    );
    const reloaded = readCampaignSave({ getItem: () => stored }).progress;
    expect(reloaded.shields).toBe(10);
    expect(reloaded.seasonChanges).toBe(9);
    expect(claimTestOffer(reloaded, 'shield-pack').shields).toBe(20);
    expect(claimTestOffer(reloaded, 'season-change-pack').seasonChanges).toBe(19);
  });

  it.each(CAMPAIGN_MISSIONS)('$name has a supplied-kit clear', ({ id }) => {
    demonstrateClear(newMissionSnapshot(id));
  });

  it('requires both hinted landings on the specified rows, with no credit for misses or other hints', () => {
    const mission = newMissionSnapshot('mind-the-melt');
    const wrongRows = { ...EMPTY_CAMPAIGN_PROGRESS, hintRows: ['1', '2'], cleanRows: ['17', '41'] };
    expect(campaignFailureReason(mission, wrongRows, 190)).not.toBeNull();
    const missed = { ...wrongRows, hintRows: ['17', '41'], cleanRows: ['17'] };
    expect(campaignFailureReason(mission, missed, 190)).not.toBeNull();
    expect(campaignFailureReason(mission, { ...missed, cleanRows: ['17', '41'] }, 190)).toBeNull();
  });

  it('requires distinct shield saves and all parts of a combined mission goal', () => {
    const watch = newMissionSnapshot('the-night-watch');
    expect(
      campaignFailureReason(
        watch,
        { ...EMPTY_CAMPAIGN_PROGRESS, shieldWorked: true, shieldRows: ['18'] },
        230,
      ),
    ).not.toBeNull();
    expect(
      campaignFailureReason(watch, { ...EMPTY_CAMPAIGN_PROGRESS, shieldRows: ['18', '47'] }, 230),
    ).toBeNull();
    const telescope = newMissionSnapshot('wish-upon-a-bridge');
    expect(
      campaignFailureReason(
        telescope,
        { ...EMPTY_CAMPAIGN_PROGRESS, mysteryRows: ['14', '45'] },
        245,
      ),
    ).not.toBeNull();
    expect(
      campaignFailureReason(
        telescope,
        { ...EMPTY_CAMPAIGN_PROGRESS, mysteryRows: ['14', '45'], cleanRows: ['70', '71', '72'] },
        245,
      ),
    ).toBeNull();
  });

  it('continues from the old Far Gate milestone into chapter six and preserves partial new attempts', () => {
    const progress = {
      ...EMPTY_CAMPAIGN_PROGRESS,
      cleared: CAMPAIGN_MISSIONS.slice(0, 20).map((m) => m.id),
    };
    expect(nextCampaignMission(progress)?.id).toBe('a-letter-from-the-stars');
    const attempt = startCampaignAttempt(
      { ...progress, cleared: CAMPAIGN_MISSIONS.slice(0, 28).map((m) => m.id) },
      'the-night-watch',
    );
    const partial = { ...attempt, shieldRows: ['18'] };
    let stored = '';
    writeCampaignSave(
      {
        setItem: (_, v) => {
          stored = v;
        },
      },
      partial,
      null,
    );
    const restored = readCampaignSave({ getItem: () => stored }).progress;
    expect(restored.activeMissionSnapshot).toEqual(attempt.activeMissionSnapshot);
    expect(restored.activeMissionSnapshot?.contentRevision).toBe('0.4');
    expect(restored.shieldRows).toEqual(['18']);
    expect(newMissionSnapshot('light-the-far-gate').contentRevision).toBe('0.3');
  });

  it('grants the new finale cosmetics and season charges only once', () => {
    const mission = newMissionSnapshot('bring-the-dawn-home');
    const { progress, state } = demonstrateClear(mission);
    const first = grantCampaignClear(progress, mission, state);
    const replay = grantCampaignClear(first, mission, state);
    expect(first.seasonChanges).toBe(2);
    expect(replay.seasonChanges).toBe(2);
    expect(equipBridgeDesign(first, { lighting: 'harbour-lanterns' }).style.lighting).toBe(
      'harbour-lanterns',
    );
  });

  it('keeps later new missions mysterious and treats the old finale as a milestone', () => {
    const progress = {
      ...EMPTY_CAMPAIGN_PROGRESS,
      cleared: CAMPAIGN_MISSIONS.slice(0, 20).map((m) => m.id),
    };
    const hub = renderToStaticMarkup(
      createElement(CampaignMissionHub, {
        progress,
        saved: { status: 'empty' },
        onStartMission: () => {},
      }),
    );
    expect(hub).toContain('A Letter from the Stars · Current crossing');
    expect(hub).toContain('Pack Light, Shine Bright · Upcoming crossing');
    expect(hub).not.toContain('Handle with Scare');
    const result = (id: 'light-the-far-gate' | 'bring-the-dawn-home') =>
      renderToStaticMarkup(
        createElement(CampaignMissionResult, {
          mission: newMissionSnapshot(id),
          cleared: true,
          goalReached: true,
          firstClear: true,
          failureReason: null,
          stability: 100,
          mastery: true,
          world: 'wilds',
          reducedMotion: true,
          onContinue: () => {},
          onRetry: () => {},
        }),
      );
    expect(result('light-the-far-gate')).toContain('Follow the stars to the Observatory');
    expect(result('light-the-far-gate')).not.toContain('Every signal on the route is lit');
    expect(result('bring-the-dawn-home')).toContain('Every signal on the route is lit');
  });

  it('lets the longer ridge route complete the same mission', () => {
    const mission = newMissionSnapshot('two-ways-to-the-gate', 'ridge');
    const { progress, state } = demonstrateClear(mission);
    expect(grantCampaignClear(progress, mission, state).cleared).toEqual(['two-ways-to-the-gate']);
  });

  it('grants first-clear supplies once and stores a cleared crossing in the same save', () => {
    const mission = newMissionSnapshot('turn-the-mill');
    const { progress, state } = demonstrateClear(mission);
    const cleared = grantCampaignClear(progress, mission, state);
    const replayed = grantCampaignClear(cleared, mission, state);
    expect(replayed.continues).toBe(1);
    expect(replayed.mastered).toEqual([mission.id]);
    let stored = '';
    writeCampaignSave(
      {
        setItem: (_, value) => {
          stored = value;
        },
      },
      replayed,
      null,
    );
    expect(readCampaignSave({ getItem: () => stored })).toMatchObject({
      progress: { cleared: [mission.id], continues: 1, activeMissionId: null },
      checkpoint: null,
    });
  });

  it('migrates the Lighthouse goal and the equipped torch from an earlier playtest', () => {
    const old = JSON.stringify({
      version: 1,
      cleared: ['first-steps'],
      reserveSp: 25,
      reserveHints: 0,
      activeMissionId: 'lost-lens',
      hintRows: [],
      mysteryRows: ['3'],
    });
    const { progress, legacy } = readCampaignSave({
      getItem: (key) => (key === CAMPAIGN_TEST_PROGRESS_KEY ? old : null),
    });
    expect(legacy).toBe(true);
    expect(progress.activeMissionSnapshot).toMatchObject({
      rulesetVersion: CAMPAIGN_INFINITY_RULESET,
      targetRow: 12,
      minimumStability: 0,
      contentRevision: '0.1',
    });
    expect(progress.mysteryRows).toEqual(['3']);
    expect(
      readCampaignSave({
        getItem: () =>
          JSON.stringify({
            version: 2,
            cleared: ['light-the-lighthouse'],
            reserveSp: 0,
            reserveHints: 0,
            torchEquipped: true,
          }),
      }).progress.style.lighting,
    ).toBe('torches');
  });

  it('preserves legacy reserve-hint behavior and continues on the same tile', () => {
    const mission = {
      ...newMissionSnapshot('dry-foothold'),
      rulesetVersion: journeyRuleset('spring', false, false, false),
    };
    const initial = seededCampaignRun({
      ...mission,
      startingSp: 5,
      startingHints: 0,
      marks: [{ row: 1, cue: 'crack', bothBroken: true }],
    });
    const hint = step(initial, { type: 'journey-hint', row: '1', life: 0 });
    expect(hint.events.map((event) => event.type)).toContain('hint-unavailable');
    expect(hint.events.map((event) => event.type)).not.toContain('journey-resource-used');
    const fall = step(hint.state, { type: 'choose', side: 'left', row: '1', life: 0 });
    expect(fall.state.status).toBe('dead');
    const revived = step(fall.state, { type: 'journey-resource', resource: 'continue' });
    expect(revived.state).toMatchObject({
      status: 'playing',
      currentRow: '1',
      sp: 3,
      revivesApplied: 1,
    });
    expect(getCurrentRow(revived.state)).toEqual(getCurrentRow(fall.state));
  });

  it('keeps the weather boundaries and tile draws independent of buffer batch size', () => {
    const route: JourneyRoute = {
      version: 1,
      season: 'spring',
      rotation: { offset: 2, rainbow: true },
    };
    expect(journeyForecast(route, 24n)).toEqual({ weather: 'rain', startsIn: 1n, rowsLeft: 6n });
    expect(journeyForecast(route, 30n)).toEqual({ weather: 'rain', startsIn: 0n, rowsLeft: 1n });
    expect(journeyForecast(route, 31n)).toEqual({ weather: 'rainbow', startsIn: 2n, rowsLeft: 3n });
    expect(journeyForecast(route, 36n)).toEqual({ weather: 'rain', startsIn: 25n, rowsLeft: 6n });
    const initial = createRowStream(
      createPracticeCursor(21n),
      PRACTICE_RNG,
      journeyRuleset('spring'),
      route,
    );
    const whole = takeRows(initial, 75, PRACTICE_RNG);
    const first = takeRows(initial, 27, PRACTICE_RNG);
    const rest = takeRows(first.stream, 48, PRACTICE_RNG);
    expect([...first.rows, ...rest.rows]).toEqual(whole.rows);
    expect(rest.stream).toEqual(whole.stream);
    for (const row of whole.rows.slice(32, 35)) {
      expect(row.cue?.kind).toBe('prism');
      expect(row.risk?.broken[journeyExpectedSide(row)!]).toBe(false);
    }
  });

  it('protects a rain landing with an umbrella, then applies a queued stow after landing', () => {
    const mission = newMissionSnapshot('dry-foothold');
    const unassisted = {
      ...mission,
      windows: [{ start: 1, weather: 'rain' as const }],
      marks: [
        { row: 1, bothBroken: true as const },
        { row: 2, bothBroken: true as const },
      ],
    };
    const standard = seededCampaignRun(unassisted);
    const equipped = seededCampaignRun({
      ...unassisted,
      gear: 'umbrella',
      rulesetVersion: journeyRuleset('spring', true),
    });
    expect(equipped.rows).toEqual(standard.rows);
    const queued = step(equipped, { type: 'journey-gear', row: '1', life: 0, wear: false });
    expect(queued.state.journeyGear).toEqual({ item: 'umbrella', worn: true, queued: false });
    const land = step(queued.state, { type: 'choose', side: 'left', row: '1', life: 0 });
    expect(land.state.sp).toBe(equipped.sp - 2);
    expect(land.state.journeyGear).toEqual({ item: 'umbrella', worn: false, queued: null });
    const later = step(land.state, { type: 'choose', side: 'left', row: '2', life: 0 });
    expect(later.state.sp).toBe(land.state.sp - 5);
  });

  it('changes each tile draw with the actual weather, including stronger snow glass', () => {
    const spring: JourneyRoute = {
      version: 1,
      season: 'spring',
      windows: [{ start: 2, weather: 'rain' }],
    };
    const winter: JourneyRoute = {
      version: 1,
      season: 'winter',
      windows: [{ start: 2, weather: 'snow' }],
    };
    const autumn: JourneyRoute = {
      version: 1,
      season: 'autumn',
      windows: [{ start: 2, weather: 'squall' }],
    };
    expect(journeyRow(spring, 1n, 'left', 0.56, 0.61).broken).toEqual({
      left: false,
      right: false,
    });
    expect(journeyRow(spring, 2n, 'left', 0.56, 0.61).broken).toEqual({ left: true, right: false });
    expect(journeyRow(winter, 1n, 'right', 0.29, 0.4).broken).toEqual({ left: true, right: true });
    expect(journeyRow(winter, 2n, 'right', 0.29, 0.4).broken).toEqual({ left: true, right: false });
    expect(journeyRow(autumn, 2n, 'right', 0.63, 0.62).broken).toEqual({ left: true, right: true });
  });

  it('differentiates helpful and harmful gear conditions and requires local ownership', () => {
    const item = 'frost-runners';
    expect(equipCampaignGear(EMPTY_CAMPAIGN_PROGRESS, item).gear).toBeNull();
    const owned = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, gearOffer(item));
    expect(equipCampaignGear(owned, item).gear).toBe(item);
    expect(journeyGearEffect(item, 'winter', 'snow')).toMatchObject({ hitRelief: 2, cleanGain: 1 });
    expect(journeyGearEffect(item, 'spring', 'rain').hitRelief).toBe(-2);
    expect(journeyGearEffect('umbrella', 'autumn', 'squall').hitRelief).toBe(-2);
    expect(journeyGearEffect('sun-balm', 'summer').cleanGain).toBe(1);
    expect(journeyGearEffect('storm-boots', 'autumn', 'squall').hitRelief).toBe(2);
  });

  it('owns and fits the Trail Scarf, with cold protection and a wet-weather penalty on actual landings', () => {
    expect(equipCampaignGear(EMPTY_CAMPAIGN_PROGRESS, 'trail-scarf').gear).toBeNull();
    const owned = claimTestOffer(EMPTY_CAMPAIGN_PROGRESS, gearOffer('trail-scarf'));
    expect(equipCampaignGear(owned, 'trail-scarf').gear).toBe('trail-scarf');
    expect(journeyGearEffect('trail-scarf', 'winter')).toEqual({ hitRelief: 2 });
    expect(journeyGearEffect('trail-scarf', 'winter', 'thaw')).toEqual({ hitRelief: 1 });
    expect(journeyGearEffect('trail-scarf', 'summer')).toEqual({});
    for (const [season, weather, difference] of [
      ['winter', 'snow', 2],
      ['spring', 'rain', -2],
      ['autumn', 'squall', -2],
    ] as const) {
      const snapshot = {
        ...newMissionSnapshot('sun-on-the-cliffs'),
        season,
        windows: [{ start: 1, weather }],
        marks: [{ row: 1, bothBroken: true as const }],
        rulesetVersion: journeyRuleset(season),
      };
      const plain = seededCampaignRun(snapshot);
      const scarf = seededCampaignRun({
        ...snapshot,
        gear: 'trail-scarf',
        rulesetVersion: journeyRuleset(season, true),
      });
      expect(scarf.rows).toEqual(plain.rows);
      const choice = { type: 'choose', side: 'left', row: '1', life: 0 } as const;
      expect(step(scarf, choice).state.sp - step(plain, choice).state.sp).toBe(difference);
    }
    const fitted = renderToStaticMarkup(
      createElement(CompanionSeasonGear, {
        world: 'wilds',
        season: 'winter',
        frame: 0,
        gear: 'trail-scarf',
      }),
    );
    expect(fitted).toBe('');
  });

  it('shows the actual safe side through sunshades and keeps future answers private', () => {
    const mission = newMissionSnapshot('sun-on-the-cliffs');
    const common = {
      ...mission,
      windows: [{ start: 1, weather: 'heat' as const }],
      marks: [{ row: 1, safe: 'right' as const, cue: 'mirror' as const }],
    };
    const standard = seededCampaignRun(common);
    const geared = seededCampaignRun({
      ...common,
      gear: 'sunshades',
      rulesetVersion: journeyRuleset('summer', true),
    });
    expect(presentInfinityScene(standard).rows[0]?.cue).toEqual({ kind: 'mirror', side: 'left' });
    expect(presentInfinityScene(geared).rows[0]?.cue).toEqual({ kind: 'lens', side: 'right' });
    expect(
      presentInfinityScene(geared)
        .rows.slice(1)
        .every((row) => !row.cue),
    ).toBe(true);
  });
});
