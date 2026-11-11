import { adventurePrice } from './adventure-prices';
import {
  assertJourneyRoute,
  assertRunState,
  createPracticeCursor,
  createRun,
  GEAR_IDS,
  PRACTICE_RNG,
  SEASONS,
  tileExperimentVersion,
  parseTileExperiment,
  getMaxRevives,
  getRuleset,
} from '@crystal-path-infinity/game-core';
import type {
  GearId,
  JourneyRoute,
  RunEvent,
  RunState,
  Season,
  TileSide,
} from '@crystal-path-infinity/game-core';
import { CAMPAIGN_MISSIONS, missionObjectives, STYLES, STYLE_OFFERS } from './campaign-content';
import type {
  BridgeSlot,
  BridgeStyle,
  CampaignMission,
  CampaignMissionId,
  Goal,
  MissionDefinition,
  StyleId,
  StyleOffer,
} from './campaign-content';
import type { PracticeStorage } from './practice-save';
import { THEME_IDS } from './store-catalog';
import type { ThemeId } from './store-catalog';

export { CAMPAIGN_MISSIONS };
export type { CampaignMissionId };

export const CAMPAIGN_TEST_PROGRESS_KEY = 'cpi.campaign-test.v1.progress';
export const CAMPAIGN_RUN_NAMESPACE = 'campaign-test-run';
export const CAMPAIGN_INFINITY_RULESET = tileExperimentVersion(50, 50, false, true);
export const CAMPAIGN_RAIN_RULESET = tileExperimentVersion(60, 60, false, true);
export const journeyRuleset = (
  mode: Season | 'plain',
  geared = false,
  clockless = false,
  safeHints = true,
  missionKit = false,
) =>
  CAMPAIGN_INFINITY_RULESET +
  '-journey1-' +
  mode +
  (geared ? '-gear' : '') +
  (clockless ? '-clockless' : '') +
  (safeHints ? '-safe-hints' : '') +
  (missionKit ? '-mission-kit' : '');
const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'] as const satisfies readonly Season[];
export type CampaignResource = 'sp' | 'hint' | 'shield' | 'continue';
export type CampaignApproach = 'main' | 'ridge';
export const EXTRA_SUPPLY_OFFERS = {
  'shield-pack': { title: '10 Shields', price: adventurePrice('shield-pack') },
  'season-change-pack': { title: '10 Season Changes', price: adventurePrice('season-change-pack') },
  'all-seasons': { title: 'Unlock All Seasons', price: adventurePrice('all-seasons') },
  'clock-free': { title: 'No Clock', price: adventurePrice('clock-free') },
} as const;
type ExtraSupplyOffer = keyof typeof EXTRA_SUPPLY_OFFERS;
export type CampaignOffer =
  StyleOffer | ExtraSupplyOffer | 'sp-pack' | 'hint-pack' | 'continue-pack' | `gear:${GearId}`;
export const gearOffer = (gear: GearId): CampaignOffer => `gear:${gear}`;
const SUPPLY_PACKS = {
  'sp-pack': ['reserveSp', 500],
  'hint-pack': ['reserveHints', 10],
  'continue-pack': ['continues', 3],
  'shield-pack': ['shields', 10],
  'season-change-pack': ['seasonChanges', 10],
} as const;
export function isRepeatableSupply(offer: CampaignOffer): offer is keyof typeof SUPPLY_PACKS {
  return Object.hasOwn(SUPPLY_PACKS, offer);
}
export function supplyPackFits(progress: CampaignProgress, offer: CampaignOffer): boolean {
  if (!isRepeatableSupply(offer)) return true;
  const [balance, amount] = SUPPLY_PACKS[offer];
  return progress[balance] <= 10000 - amount;
}

export interface CampaignMissionSnapshot extends Omit<
  MissionDefinition<CampaignMissionId>,
  'alternate'
> {
  readonly contentRevision: '0.1' | '0.2' | '0.3' | '0.4';
  readonly weather: 'clear' | 'rain';
  readonly rulesetVersion: string;
  readonly approach: CampaignApproach;
  readonly gear?: GearId;
}

export interface CampaignProgress {
  /** Unacknowledged server transfers, saved atomically with their local resource grants. */
  readonly supplyAllocations?: readonly string[];
  readonly ownedWorlds?: readonly ThemeId[];
  readonly version: 3;
  readonly cleared: readonly CampaignMissionId[];
  readonly mastered: readonly CampaignMissionId[];
  readonly reserveSp: number;
  readonly reserveHints: number;
  readonly continues: number;
  readonly shields: number;
  readonly style: BridgeStyle;
  readonly world: ThemeId;
  readonly gear: GearId | null;
  readonly offers: readonly CampaignOffer[];
  readonly rotation: number;
  readonly seasonChanges: number;
  readonly clockFree: boolean;
  readonly activeMissionId: CampaignMissionId | null;
  readonly activeMissionSnapshot: CampaignMissionSnapshot | null;
  readonly hintRows: readonly string[];
  readonly mysteryRows: readonly string[];
  readonly cleanRows: readonly string[];
  readonly followedHint: boolean;
  readonly soldHint: boolean;
  readonly shieldWorked: boolean;
  readonly shieldRows: readonly string[];
  readonly requiredHintSide: TileSide | null;
  readonly used: readonly CampaignResource[];
}

const EMPTY_ATTEMPT = {
  hintRows: [],
  mysteryRows: [],
  cleanRows: [],
  followedHint: false,
  soldHint: false,
  shieldWorked: false,
  shieldRows: [],
  requiredHintSide: null,
  used: [],
} as const;

export const EMPTY_CAMPAIGN_PROGRESS: CampaignProgress = Object.freeze({
  supplyAllocations: [],
  ownedWorlds: ['obsidian'] as const,
  version: 3,
  cleared: [],
  mastered: [],
  reserveSp: 0,
  reserveHints: 0,
  continues: 0,
  shields: 0,
  style: {},
  world: 'obsidian',
  gear: null,
  offers: [],
  rotation: 0,
  seasonChanges: 0,
  clockFree: false,
  activeMissionId: null,
  activeMissionSnapshot: null,
  ...EMPTY_ATTEMPT,
});

export function namespacePracticeStorage(
  storage: PracticeStorage,
  namespace: string,
): PracticeStorage {
  if (!/^[a-z0-9-]{1,40}$/.test(namespace)) throw new TypeError('Invalid local save namespace.');
  const prefix = 'cpi.' + namespace + ':';
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: (key) => storage.removeItem(prefix + key),
  };
}

function definition(id: CampaignMissionId): CampaignMission {
  const mission = CAMPAIGN_MISSIONS.find((entry) => entry.id === id);
  if (!mission) throw new RangeError('Unknown Campaign crossing.');
  return mission;
}
function isMissionId(value: unknown): value is CampaignMissionId {
  return CAMPAIGN_MISSIONS.some((mission) => mission.id === value);
}
function isOffer(value: unknown): value is CampaignOffer {
  return (
    typeof value === 'string' &&
    (Object.hasOwn(STYLE_OFFERS, value) ||
      Object.hasOwn(EXTRA_SUPPLY_OFFERS, value) ||
      ['sp-pack', 'hint-pack', 'continue-pack'].includes(value) ||
      GEAR_IDS.some((id) => gearOffer(id) === value))
  );
}
function isGearId(value: unknown): value is GearId {
  return GEAR_IDS.some((id) => id === value);
}
export function ownsCampaignGear(
  progress: Pick<CampaignProgress, 'offers'>,
  gear: GearId,
): boolean {
  return progress.offers.includes(gearOffer(gear));
}
export function equipCampaignGear(
  progress: CampaignProgress,
  gear: GearId | null,
): CampaignProgress {
  return gear && !ownsCampaignGear(progress, gear) ? progress : { ...progress, gear };
}
function isRows(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 256 &&
    value.every((row) => typeof row === 'string' && /^[1-9]\d*$/.test(row))
  );
}
function isBalance(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function newMissionSnapshot(
  id: CampaignMissionId,
  approach: CampaignApproach = 'main',
): CampaignMissionSnapshot {
  const { alternate, ...mission } = definition(id);
  const ridge = approach === 'ridge' && alternate;
  return {
    ...mission,
    ...(ridge || {}),
    approach: ridge ? 'ridge' : 'main',
    contentRevision: mission.revision ?? '0.3',
    weather: 'clear',
    assist: undefined,
    rulesetVersion: journeyRuleset((ridge || mission).season, false, false, true, true),
  };
}

function legacySnapshot(
  id: CampaignMissionId,
  version: '0.1' | '0.2',
  saved: Record<string, unknown>,
): CampaignMissionSnapshot {
  const base = newMissionSnapshot(id);
  const index = CAMPAIGN_MISSIONS.findIndex((item) => item.id === id);
  const targets = version === '0.1' ? [8, 12, 14, 18, 18] : [24, 36, 48, 60, 50];
  const floors = [240, 210, 200, 175, 145];
  const weather = id === 'rain-on-glass' ? 'rain' : 'clear';
  const targetRow =
    isBalance(saved.targetRow) && saved.targetRow > 0
      ? saved.targetRow
      : (targets[index] ?? base.targetRow);
  const minimumStability =
    version === '0.1'
      ? 0
      : isBalance(saved.minimumStability)
        ? saved.minimumStability
        : (floors[index] ?? 0);
  const goal: Goal | undefined =
    id === 'lost-lens'
      ? { type: 'mystery' }
      : id === 'focus-the-beam'
        ? { type: 'hints', count: 2 }
        : undefined;
  return {
    ...base,
    goal,
    weather,
    targetRow,
    minimumStability,
    marks: undefined,
    windows: undefined,
    assist: undefined,
    rulesetVersion: weather === 'rain' ? CAMPAIGN_RAIN_RULESET : CAMPAIGN_INFINITY_RULESET,
    objective:
      typeof saved.objective === 'string'
        ? saved.objective
        : (goal?.type === 'mystery'
            ? 'Resolve a Mystery, then reach row '
            : goal?.type === 'hints'
              ? 'Use two hints, then reach row '
              : 'Reach row ') +
          targetRow +
          '.',
    contentRevision: version,
  };
}

export function campaignMissionSnapshot(
  progress: CampaignProgress,
  id: CampaignMissionId,
): CampaignMissionSnapshot {
  return progress.activeMissionId === id && progress.activeMissionSnapshot
    ? progress.activeMissionSnapshot
    : newMissionSnapshot(id);
}

export function campaignRunMatches(state: RunState, mission: CampaignMissionSnapshot): boolean {
  return (
    state.rulesetVersion === mission.rulesetVersion &&
    state.journeyGear?.item === mission.gear &&
    state.runId.startsWith('practice-campaign-' + mission.id + '-')
  );
}

export function readCampaignSave(storage: Pick<PracticeStorage, 'getItem'>): {
  progress: CampaignProgress;
  checkpoint: RunState | null;
  infinityCheckpoint: RunState | null;
  infinitySaved: boolean;
  legacy: boolean;
} {
  const empty = {
    progress: EMPTY_CAMPAIGN_PROGRESS,
    checkpoint: null,
    infinityCheckpoint: null,
    infinitySaved: false,
    legacy: false,
  };
  try {
    const raw = storage.getItem(CAMPAIGN_TEST_PROGRESS_KEY);
    if (!raw || raw.length > 200000) return empty;
    const data = record(JSON.parse(raw));
    const value = data.version === 3 ? record(data.progress) : data;
    if (
      ![1, 2, 3].includes(Number(value.version)) ||
      !Array.isArray(value.cleared) ||
      !value.cleared.every(isMissionId) ||
      !isBalance(value.reserveSp) ||
      !isBalance(value.reserveHints)
    )
      return empty;
    const cleared = [...new Set(value.cleared)];
    const activeMissionId = isMissionId(value.activeMissionId) ? value.activeMissionId : null;
    const candidate = record(value.activeMissionSnapshot);
    const revision = candidate.contentRevision;
    let activeMissionSnapshot: CampaignMissionSnapshot | null = null;
    if (
      (activeMissionId && !cleared.includes(activeMissionId)) ||
      (activeMissionId && value.version === 3)
    ) {
      if (
        (revision === '0.3' || revision === '0.4') &&
        candidate.id === activeMissionId &&
        value.version === 3
      ) {
        const snapshot = candidate as unknown as CampaignMissionSnapshot;
        if (
          snapshot.rulesetVersion ===
            journeyRuleset(
              snapshot.season,
              !!snapshot.gear,
              !!parseTileExperiment(snapshot.rulesetVersion)?.clockless,
              !!parseTileExperiment(snapshot.rulesetVersion)?.safeHints,
              !!parseTileExperiment(snapshot.rulesetVersion)?.missionKit,
            ) &&
          (snapshot.gear === undefined || (snapshot.assist && isGearId(snapshot.gear))) &&
          isBalance(snapshot.targetRow) &&
          snapshot.targetRow > 0 &&
          isBalance(snapshot.minimumStability) &&
          isBalance(snapshot.startingSp) &&
          snapshot.startingSp > 0 &&
          isBalance(snapshot.startingHints) &&
          typeof snapshot.objective === 'string' &&
          typeof snapshot.name === 'string' &&
          typeof snapshot.reward === 'string' &&
          (snapshot.approach === 'main' || snapshot.approach === 'ridge')
        ) {
          assertJourneyRoute(missionJourney(snapshot));
          activeMissionSnapshot = snapshot;
        }
      } else if (isMissionId(activeMissionId)) {
        activeMissionSnapshot = legacySnapshot(
          activeMissionId,
          value.version === 1 || revision === '0.1' ? '0.1' : '0.2',
          candidate,
        );
      }
    }
    const offers = Array.isArray(value.offers) ? [...new Set(value.offers.filter(isOffer))] : [];
    const style: BridgeStyle = {};
    for (const [slot, id] of Object.entries(record(value.style))) {
      if (
        typeof id === 'string' &&
        Object.hasOwn(STYLES, id) &&
        STYLES[id as StyleId].slot === slot &&
        ownsStyle({ cleared, offers }, id as StyleId)
      )
        style[slot] = id as StyleId;
    }
    if (value.version !== 3 && value.torchEquipped && cleared.includes('light-the-lighthouse'))
      style.lighting = 'torches';
    const unlocked = unlockedSeasons({ cleared, offers });
    const rotation = isBalance(value.rotation) ? value.rotation : 0;
    const legacyOrder = SEASONS.filter((season) => unlocked.includes(season));
    const legacyMode =
      value.infinityForecast === 'cycle'
        ? legacyOrder[rotation % legacyOrder.length]
        : (value.infinityForecast as Season);
    const legacySeason = unlocked.indexOf(legacyMode);
    const progress: CampaignProgress = {
      ...EMPTY_CAMPAIGN_PROGRESS,
      ownedWorlds: Array.isArray(value.ownedWorlds)
        ? [
            ...new Set(
              value.ownedWorlds.filter((id): id is ThemeId => THEME_IDS.includes(id as ThemeId)),
            ),
          ]
        : ['obsidian'],
      supplyAllocations:
        Array.isArray(value.supplyAllocations) && value.supplyAllocations.length <= 100
          ? [
              ...new Set(
                value.supplyAllocations.filter(
                  (id): id is string =>
                    typeof id === 'string' &&
                    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id),
                ),
              ),
            ]
          : [],
      cleared,
      style,
      offers,
      gear: isGearId(value.gear) && ownsCampaignGear({ offers }, value.gear) ? value.gear : null,
      world: THEME_IDS.includes(value.world as ThemeId) ? (value.world as ThemeId) : 'obsidian',
      mastered: Array.isArray(value.mastered)
        ? [...new Set(value.mastered.filter(isMissionId))].filter((id) => cleared.includes(id))
        : [],
      reserveSp: value.reserveSp,
      reserveHints: value.reserveHints,
      continues: isBalance(value.continues)
        ? value.continues
        : cleared.includes('turn-the-mill')
          ? 1
          : 0,
      shields: isBalance(value.shields)
        ? value.shields
        : cleared.includes('trust-the-shield')
          ? 1
          : 0,
      rotation: legacySeason >= 0 ? legacySeason : rotation,
      seasonChanges: isBalance(value.seasonChanges) ? value.seasonChanges : 0,
      clockFree: offers.includes('clock-free') && value.clockFree !== false,
      activeMissionId: activeMissionSnapshot?.id ?? null,
      activeMissionSnapshot,
      hintRows: isRows(value.hintRows) ? value.hintRows : [],
      mysteryRows: isRows(value.mysteryRows) ? value.mysteryRows : [],
      cleanRows: isRows(value.cleanRows) ? value.cleanRows : [],
      followedHint: value.followedHint === true,
      soldHint: value.soldHint === true,
      shieldWorked: value.shieldWorked === true,
      shieldRows: isRows(value.shieldRows) ? value.shieldRows : [],
      requiredHintSide:
        value.requiredHintSide === 'left' || value.requiredHintSide === 'right'
          ? value.requiredHintSide
          : null,
      used: Array.isArray(value.used)
        ? value.used.filter((item): item is CampaignResource =>
            ['sp', 'hint', 'shield', 'continue'].includes(item as string),
          )
        : [],
    };
    let checkpoint: RunState | null = null;
    if (data.checkpoint && activeMissionSnapshot) {
      try {
        const state = data.checkpoint as RunState;
        assertRunState(state, PRACTICE_RNG);
        if (campaignRunMatches(state, activeMissionSnapshot)) checkpoint = state;
      } catch {
        // Keep supplies and the completed route even if the active crossing is damaged.
      }
    }
    let infinityCheckpoint: RunState | null = null;
    if (data.infinityCheckpoint) {
      try {
        const state = data.infinityCheckpoint as RunState;
        assertRunState(state, PRACTICE_RNG);
        if (
          state.runId.startsWith('practice-campaign-infinity-') &&
          parseTileExperiment(state.rulesetVersion)?.journey &&
          !parseTileExperiment(state.rulesetVersion)?.missionKit &&
          (state.journeyShields ?? 0) <= progress.shields
        )
          infinityCheckpoint = state;
      } catch {
        // Preserve inventory and the Campaign slot if the Infinity slot is damaged.
      }
    }
    return {
      progress,
      checkpoint,
      infinityCheckpoint,
      infinitySaved: Object.hasOwn(data, 'infinityCheckpoint'),
      legacy: value.version !== 3,
    };
  } catch {
    return empty;
  }
}

export function writeCampaignSave(
  storage: Pick<PracticeStorage, 'setItem'>,
  progress: CampaignProgress,
  checkpoint: RunState | null,
  infinityCheckpoint?: RunState | null,
) {
  const data = JSON.stringify({
    version: 3,
    progress,
    checkpoint,
    ...(infinityCheckpoint !== undefined ? { infinityCheckpoint } : {}),
  });
  if (data.length > 200000) throw new RangeError('Journey save is too large.');
  storage.setItem(CAMPAIGN_TEST_PROGRESS_KEY, data);
}

export function isMissionUnlocked(progress: CampaignProgress, id: CampaignMissionId): boolean {
  const index = CAMPAIGN_MISSIONS.findIndex((mission) => mission.id === id);
  return index === 0 || (index > 0 && progress.cleared.includes(CAMPAIGN_MISSIONS[index - 1].id));
}
export function nextCampaignMission(progress: CampaignProgress): CampaignMission | null {
  return CAMPAIGN_MISSIONS.find((mission) => !progress.cleared.includes(mission.id)) ?? null;
}
export function unlockedSeasons(progress: Pick<CampaignProgress, 'cleared' | 'offers'>): Season[] {
  const unlocks: Record<Season, CampaignMissionId> = {
    spring: 'rain-on-glass',
    summer: 'sun-on-the-cliffs',
    winter: 'first-snow',
    autumn: 'two-ways-to-the-gate',
  };
  return SEASON_ORDER.filter(
    (season) =>
      progress.offers.includes('all-seasons') || progress.cleared.includes(unlocks[season]),
  );
}
export function selectedInfinitySeason(progress: CampaignProgress): Season | 'plain' {
  const unlocked = unlockedSeasons(progress);
  return unlocked[progress.rotation % unlocked.length] ?? 'plain';
}
export function advanceInfinityCycle(progress: CampaignProgress): CampaignProgress {
  const count = unlockedSeasons(progress).length;
  return count > 1 ? { ...progress, rotation: (progress.rotation + 1) % count } : progress;
}
export function spendSeasonChange(progress: CampaignProgress): CampaignProgress {
  if (progress.seasonChanges === 0 || unlockedSeasons(progress).length < 2) return progress;
  return { ...advanceInfinityCycle(progress), seasonChanges: progress.seasonChanges - 1 };
}

export function ownsStyle(
  progress: Pick<CampaignProgress, 'cleared' | 'offers'>,
  id: StyleId,
): boolean {
  const item = STYLES[id];
  if (item.unlock) return progress.cleared.includes(item.unlock);
  return progress.offers.some(
    (offer) =>
      Object.hasOwn(STYLE_OFFERS, offer) &&
      (STYLE_OFFERS[offer as StyleOffer].items as readonly StyleId[]).includes(id),
  );
}

export function equipBridgeStyle(
  progress: CampaignProgress,
  slot: BridgeSlot,
  id: StyleId | null,
): CampaignProgress {
  if (id && (STYLES[id].slot !== slot || !ownsStyle(progress, id))) return progress;
  const style = { ...progress.style };
  if (id) style[slot] = id;
  else delete style[slot];
  return { ...progress, style };
}

export function equipBridgeDesign(
  progress: CampaignProgress,
  style: BridgeStyle,
): CampaignProgress {
  if (
    !Object.entries(style).every(
      ([slot, id]) => STYLES[id].slot === slot && ownsStyle(progress, id),
    )
  )
    return progress;
  return { ...progress, style: { ...style } };
}

export function claimTestOffer(progress: CampaignProgress, offer: CampaignOffer): CampaignProgress {
  if (
    (progress.offers.includes(offer) && !isRepeatableSupply(offer)) ||
    !supplyPackFits(progress, offer)
  )
    return progress;
  if (offer === 'season-change-pack' && unlockedSeasons(progress).length < 2) return progress;
  return {
    ...progress,
    offers: progress.offers.includes(offer) ? progress.offers : [...progress.offers, offer],
    reserveSp: progress.reserveSp + (offer === 'sp-pack' ? 500 : 0),
    reserveHints: progress.reserveHints + (offer === 'hint-pack' ? 10 : 0),
    continues: progress.continues + (offer === 'continue-pack' ? 3 : 0),
    shields: progress.shields + (offer === 'shield-pack' ? 10 : 0),
    seasonChanges: progress.seasonChanges + (offer === 'season-change-pack' ? 10 : 0),
    clockFree: offer === 'clock-free' || progress.clockFree,
  };
}

export function startCampaignAttempt(
  progress: CampaignProgress,
  id: CampaignMissionId,
  approach: CampaignApproach = 'main',
): CampaignProgress {
  if (!isMissionUnlocked(progress, id)) throw new RangeError('This crossing is sealed.');
  const mission = newMissionSnapshot(id, approach);
  return {
    ...progress,
    ...EMPTY_ATTEMPT,
    activeMissionId: id,
    activeMissionSnapshot: mission,
  };
}

export function campaignProgressFromEvents(
  progress: CampaignProgress,
  mission: CampaignMissionSnapshot,
  events: readonly RunEvent[],
  currentRow: string,
): CampaignProgress {
  if (
    !events.some((event) =>
      [
        'hint-used',
        'mystery-resolved',
        'choice-resolved',
        'pact-resolved',
        'journey-resource-used',
      ].includes(event.type),
    )
  )
    return progress;
  const goals = missionObjectives(mission.goal);
  const next = { ...progress };
  for (const event of events) {
    if (event.type === 'hint-used') {
      next.hintRows = [...new Set([...next.hintRows, event.row])];
      if (goals.some((goal) => goal.type === 'hint-follow' && event.row === String(goal.row)))
        next.requiredHintSide = event.safeSide;
    }
    if (event.type === 'mystery-resolved')
      next.mysteryRows = [...new Set([...next.mysteryRows, event.row])];
    if (
      event.type === 'pact-resolved' &&
      goals.some((goal) => goal.type === 'trade' && currentRow === String(goal.row)) &&
      event.kind === 'marketing' &&
      event.outcome === 'traded' &&
      event.hintDelta === -1
    )
      next.soldHint = true;
    if (event.type === 'choice-resolved') {
      if (
        !event.wrong &&
        goals.some(
          (goal) =>
            (goal.type === 'clean' || goal.type === 'hint-steps') &&
            goal.rows.some((row) => String(row) === event.row),
        )
      )
        next.cleanRows = [...new Set([...next.cleanRows, event.row])];
      if (
        !event.wrong &&
        goals.some((goal) => goal.type === 'hint-follow' && event.row === String(goal.row)) &&
        event.side === next.requiredHintSide
      )
        next.followedHint = true;
      if (
        goals.some(
          (goal) =>
            (goal.type === 'shield' && event.row === String(goal.row)) ||
            (goal.type === 'shield-steps' && goal.rows.some((row) => String(row) === event.row)),
        ) &&
        event.consumedKind === 'shield_5s'
      ) {
        next.shieldWorked = true;
        next.shieldRows = [...new Set([...next.shieldRows, event.row])];
      }
    }
    if (event.type === 'journey-resource-used') {
      if (!canUseCampaignResource(next, mission, event.resource))
        throw new RangeError('That supply is unavailable.');
      next.used = [...next.used, event.resource];
      if (event.resource === 'sp') next.reserveSp -= 25;
      if (event.resource === 'hint') next.reserveHints -= 1;
      if (event.resource === 'shield') next.shields -= 1;
      if (event.resource === 'continue') next.continues -= 1;
    }
  }
  return next;
}

export function canUseCampaignResource(
  progress: CampaignProgress,
  mission: CampaignMissionSnapshot,
  item: CampaignResource,
): boolean {
  if (!mission.assist || (item !== 'hint' && progress.used.includes(item))) return false;
  switch (item) {
    case 'sp':
      return progress.reserveSp >= 25;
    case 'hint':
      return progress.reserveHints > 0;
    case 'shield':
      return progress.shields > 0;
    case 'continue':
      return progress.continues > 0;
  }
}

/** Infinity owns shop stock; Campaign kits never debit these balances. */
export function canUseInfinitySupply(
  progress: CampaignProgress,
  state: RunState,
  item: CampaignResource,
): boolean {
  if (
    !state.runId.startsWith('practice-campaign-infinity-') ||
    !parseTileExperiment(state.rulesetVersion)?.infinitySupplies
  )
    return false;
  if (item === 'continue')
    return (
      state.status === 'dead' &&
      progress.continues > 0 &&
      state.revivesGranted < getMaxRevives(state.rulesetVersion)
    );
  if (state.status !== 'playing' || state.pact?.phase === 'offered') return false;
  if (item === 'hint')
    return (
      progress.reserveHints > 0 &&
      state.hints === 0 &&
      state.current.revealedSafeSide === null &&
      !state.current.noSafeTile
    );
  if (item === 'shield')
    return parseTileExperiment(state.rulesetVersion)?.shieldStacks
      ? progress.shields > (state.journeyShields ?? 0)
      : progress.shields > 0 && !state.effects.some((effect) => effect.kind === 'shield_5s');
  const max = getRuleset(state.rulesetVersion).maxSp;
  return progress.reserveSp >= 25 && (max === null || state.sp <= max - 25);
}

export function infinityProgressFromEvents(
  progress: CampaignProgress,
  previous: RunState,
  events: readonly RunEvent[],
): CampaignProgress {
  let next = progress;
  for (const event of events) {
    if (event.type === 'journey-loadout-applied') {
      const stacks = !!parseTileExperiment(previous.rulesetVersion)?.shieldStacks;
      const target = (previous.journeyShields ?? 0) + event.shieldDelta;
      if (
        !previous.runId.startsWith('practice-campaign-infinity-') ||
        !parseTileExperiment(previous.rulesetVersion)?.infinitySupplies ||
        previous.status !== 'playing' ||
        previous.pact?.phase === 'offered' ||
        next.reserveSp < event.stabilityDoses * 25 ||
        (stacks
          ? target < 0 || target > next.shields
          : event.shieldDelta < 0 || event.shieldDelta > next.shields)
      )
        throw new RangeError('That Kit selection is unavailable.');
      next = {
        ...next,
        reserveSp: next.reserveSp - event.stabilityDoses * 25,
        shields: stacks ? next.shields : next.shields - event.shieldDelta,
      };
      continue;
    }
    if (event.type === 'choice-resolved' && event.shieldChargeUsed) {
      if (
        !previous.runId.startsWith('practice-campaign-infinity-') ||
        !parseTileExperiment(previous.rulesetVersion)?.shieldStacks ||
        (previous.journeyShields ?? 0) < 1 ||
        next.shields < 1
      )
        throw new RangeError('No loaded shield is available.');
      next = { ...next, shields: next.shields - 1 };
      continue;
    }
    if (event.type !== 'journey-resource-used') continue;
    if (!canUseInfinitySupply(next, previous, event.resource))
      throw new RangeError('That Infinity supply is unavailable.');
    next = {
      ...next,
      reserveSp: next.reserveSp - (event.resource === 'sp' ? 25 : 0),
      reserveHints: next.reserveHints - (event.resource === 'hint' ? 1 : 0),
      shields: next.shields - (event.resource === 'shield' ? 1 : 0),
      continues: next.continues - (event.resource === 'continue' ? 1 : 0),
    };
  }
  return next;
}

export function touchesInfinitySupplies(events: readonly RunEvent[]): boolean {
  return events.some(
    (event) =>
      event.type === 'journey-resource-used' ||
      event.type === 'journey-loadout-applied' ||
      (event.type === 'choice-resolved' && !!event.shieldChargeUsed),
  );
}

export function campaignGoalProgress(
  mission: CampaignMissionSnapshot,
  progress: CampaignProgress,
): string {
  return missionObjectives(mission.goal)
    .map((goal) => {
      switch (goal.type) {
        case 'mystery':
          return progress.mysteryRows.some(
            (row) => goal.row === undefined || row === String(goal.row),
          )
            ? 'Lens recovered'
            : 'Find the lens cache';
        case 'mysteries':
          return (
            goal.rows.filter((row) => progress.mysteryRows.includes(String(row))).length +
            ' / ' +
            goal.rows.length +
            ' caches opened'
          );
        case 'hints':
          return progress.hintRows.length + ' / ' + goal.count + ' hints used';
        case 'hint-follow':
          return progress.followedHint ? 'Hint followed' : 'Follow a hint on row ' + goal.row;
        case 'trade':
          return progress.soldHint ? 'Hint sold' : 'Sell one hint on row ' + goal.row;
        case 'hint-limit':
          return progress.hintRows.length + ' / ' + goal.count + ' hints spent';
        case 'clean':
          return (
            goal.rows.filter((row) => progress.cleanRows.includes(String(row))).length +
            ' / ' +
            goal.rows.length +
            ' marked steps'
          );
        case 'shield':
          return progress.shieldWorked ? 'Crack blocked' : 'Block the crack at row ' + goal.row;
        case 'shield-steps':
          return (
            goal.rows.filter((row) => progress.shieldRows.includes(String(row))).length +
            ' / ' +
            goal.rows.length +
            ' cracks blocked'
          );
        case 'hint-steps':
          return (
            goal.rows.filter(
              (row) =>
                progress.hintRows.includes(String(row)) && progress.cleanRows.includes(String(row)),
            ).length +
            ' / ' +
            goal.rows.length +
            ' hinted landings'
          );
      }
    })
    .join(' · ');
}

export type CampaignFailureReason = string | null;
export function campaignFailureReason(
  mission: CampaignMissionSnapshot,
  progress: CampaignProgress,
  stability: number,
): CampaignFailureReason {
  const fulfilled = missionObjectives(mission.goal).every((goal) => {
    switch (goal.type) {
      case 'mystery':
        return progress.mysteryRows.some(
          (row) => goal.row === undefined || row === String(goal.row),
        );
      case 'mysteries':
        return goal.rows.every((row) => progress.mysteryRows.includes(String(row)));
      case 'hints':
        return progress.hintRows.length >= goal.count;
      case 'hint-follow':
        return progress.followedHint;
      case 'trade':
        return progress.soldHint;
      case 'hint-limit':
        return progress.hintRows.length <= goal.count;
      case 'clean':
        return goal.rows.every((row) => progress.cleanRows.includes(String(row)));
      case 'shield':
        return progress.shieldWorked;
      case 'shield-steps':
        return goal.rows.every((row) => progress.shieldRows.includes(String(row)));
      case 'hint-steps':
        return goal.rows.every(
          (row) =>
            progress.hintRows.includes(String(row)) && progress.cleanRows.includes(String(row)),
        );
    }
  });
  if (!fulfilled)
    return 'The crossing goal is still open. ' + campaignGoalProgress(mission, progress) + '.';
  return stability < mission.minimumStability
    ? 'You reached the landing with ' +
        stability +
        ' Stability. You need at least ' +
        mission.minimumStability +
        '.'
    : null;
}

export function grantCampaignClear(
  progress: CampaignProgress,
  mission: CampaignMissionSnapshot,
  state: RunState,
): CampaignProgress {
  const first = !progress.cleared.includes(mission.id);
  const mastery =
    progress.used.length === 0 &&
    state.revivesApplied === 0 &&
    !state.journeyGear &&
    !parseTileExperiment(state.rulesetVersion)?.clockless &&
    !progress.mastered.includes(mission.id);
  return {
    ...progress,
    ...EMPTY_ATTEMPT,
    cleared: first ? [...progress.cleared, mission.id] : progress.cleared,
    mastered: mastery ? [...progress.mastered, mission.id] : progress.mastered,
    reserveSp: progress.reserveSp + (first ? (mission.grant.sp ?? 0) : 0),
    reserveHints: progress.reserveHints + (first ? (mission.grant.hints ?? 0) : 0),
    continues: progress.continues + (first ? (mission.grant.continues ?? 0) : 0),
    shields: progress.shields + (first ? (mission.grant.shields ?? 0) : 0),
    seasonChanges: progress.seasonChanges + (first ? (mission.grant.seasonChanges ?? 0) : 0),
    activeMissionId: null,
    activeMissionSnapshot: null,
  };
}

function missionJourney(mission: CampaignMissionSnapshot): JourneyRoute {
  return {
    version: 1,
    season: mission.season,
    windows: mission.windows,
    marks: mission.marks,
    reviveSp: Math.ceil(mission.startingSp / 2),
  };
}
function freshRouteSeed(): bigint {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  return (BigInt(words[0]) << 32n) | BigInt(words[1]);
}

/** An explicit seed is only for reproducible fixtures; every player retry draws fresh entropy. */
export function createCampaignRun(mission: CampaignMissionSnapshot, seed?: bigint): RunState {
  const route = seed ?? freshRouteSeed();
  return {
    ...createRun(
      {
        runId: 'practice-campaign-' + mission.id + '-' + crypto.randomUUID().replaceAll('-', ''),
        rulesetVersion: mission.rulesetVersion,
        routeRng: createPracticeCursor(route),
        mysteryRng: createPracticeCursor(route ^ 0x9e3779b97f4a7c15n),
        observedAt: Date.now(),
        buffer: { ahead: 8, history: 2 },
        ...(['0.3', '0.4'].includes(mission.contentRevision)
          ? { journey: missionJourney(mission) }
          : {}),
        ...(mission.gear ? { journeyGear: mission.gear } : {}),
      },
      PRACTICE_RNG,
    ),
    sp: mission.startingSp,
    hints: mission.startingHints,
  };
}

export function createCampaignInfinityRun(progress: CampaignProgress): RunState {
  const seed = new Uint32Array(2);
  crypto.getRandomValues(seed);
  const route = (BigInt(seed[0]) << 32n) | BigInt(seed[1]);
  const mode = selectedInfinitySeason(progress);
  const journey: JourneyRoute = {
    version: 1,
    reviveSp: 150,
    season: mode === 'plain' ? 'spring' : mode,
    ...(mode === 'plain'
      ? {}
      : {
          rotation: {
            offset: seed[1] % 6,
            rainbow: progress.cleared.includes('the-first-rainbow'),
          },
        }),
  };
  return createRun(
    {
      runId: 'practice-campaign-infinity-' + crypto.randomUUID().replaceAll('-', ''),
      rulesetVersion:
        journeyRuleset(mode, !!progress.gear, progress.clockFree) + '-supplies-shield-stack',
      routeRng: createPracticeCursor(route),
      mysteryRng: createPracticeCursor(route ^ 0x9e3779b97f4a7c15n),
      observedAt: Date.now(),
      buffer: { ahead: 8, history: 2 },
      journey,
      ...(progress.gear ? { journeyGear: progress.gear } : {}),
    },
    PRACTICE_RNG,
  );
}
