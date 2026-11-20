import { journeyForecast, WEATHER } from './journey.ts';
import type { JourneyRoute, Season, Weather } from './journey.ts';

export const GEAR_IDS = [
  'umbrella',
  'sunshades',
  'sun-balm',
  'frost-runners',
  'storm-boots',
  'trail-scarf',
] as const;
export type GearId = (typeof GEAR_IDS)[number];
export interface JourneyGear {
  readonly item: GearId;
  readonly worn: boolean;
  readonly queued: boolean | null;
  readonly recovery?: JourneyGearRecovery;
}

interface JourneyGearRecovery {
  /** 'clear' tracks the current dry Summer stretch; a decimal row identifies a Heat episode. */
  readonly window: string;
  readonly pending: boolean;
  readonly restored: number;
}

interface GearEffect {
  readonly hitRelief?: number;
  readonly cleanGain?: number;
  readonly clearGlint?: true;
  readonly recovery?: { readonly sp: number; readonly cap: number };
}

const dry: GearEffect = {};
const clearRecovery = { sp: 1, cap: 3 };
const heatRecovery = { sp: 2, cap: 4 };
const rebalanced: Record<Weather | Season, Partial<Record<GearId, GearEffect>>> = {
  spring: {},
  summer: { 'sun-balm': { recovery: clearRecovery } },
  autumn: {},
  winter: { 'frost-runners': { hitRelief: 1 }, 'trail-scarf': { hitRelief: 1 } },
  rain: {
    umbrella: { hitRelief: 3 },
    'frost-runners': { hitRelief: -1 },
    'storm-boots': { hitRelief: 1 },
    'trail-scarf': { hitRelief: -1 },
  },
  rainbow: {},
  heat: { sunshades: { hitRelief: 1, clearGlint: true }, 'sun-balm': { recovery: heatRecovery } },
  shower: {
    umbrella: { hitRelief: 2 },
    sunshades: { hitRelief: -1 },
    'frost-runners': { hitRelief: -1 },
    'storm-boots': { hitRelief: 2 },
    'trail-scarf': { hitRelief: -1 },
  },
  gust: {
    umbrella: { hitRelief: -2 },
    'frost-runners': { hitRelief: -1 },
    'storm-boots': { hitRelief: 2 },
    'trail-scarf': { hitRelief: 1 },
  },
  squall: {
    umbrella: { hitRelief: -3 },
    sunshades: { hitRelief: -2 },
    'frost-runners': { hitRelief: -2 },
    'storm-boots': { hitRelief: 3 },
    'trail-scarf': { hitRelief: -2 },
  },
  snow: {
    sunshades: { hitRelief: -1 },
    'frost-runners': { hitRelief: 3 },
    'storm-boots': { hitRelief: -1 },
    'trail-scarf': { hitRelief: 1 },
  },
  thaw: {
    'frost-runners': { hitRelief: -2 },
    'storm-boots': { hitRelief: 1 },
    'trail-scarf': { hitRelief: 1 },
  },
};
const wet = new Set<Weather>(['rain', 'shower', 'squall']);

/** Gear changes the landing, never the pre-drawn tile. A shield still takes precedence. */
export function journeyGearEffect(
  item: GearId,
  season: Season,
  weather?: Weather,
  gearV2 = false,
): GearEffect {
  if (gearV2) return rebalanced[weather ?? season][item] ?? dry;
  switch (item) {
    case 'umbrella':
      return weather === 'rain' || weather === 'shower'
        ? { hitRelief: 3 }
        : weather === 'gust' || weather === 'squall'
          ? { hitRelief: -2 }
          : dry;
    case 'sunshades':
      return weather === 'heat'
        ? { hitRelief: 2, clearGlint: true }
        : weather === 'thaw'
          ? { hitRelief: 1 }
          : weather === 'snow' || weather === 'squall'
            ? { hitRelief: -2 }
            : dry;
    case 'sun-balm':
      return weather === 'heat'
        ? { hitRelief: 3 }
        : season === 'summer' && !weather
          ? { cleanGain: 1 }
          : dry;
    case 'frost-runners':
      return weather === 'snow'
        ? { hitRelief: 2, cleanGain: 1 }
        : weather === 'thaw' ||
            weather === 'gust' ||
            (weather && wet.has(weather)) ||
            (season === 'summer' && !weather)
          ? { hitRelief: -2 }
          : dry;
    case 'storm-boots':
      return weather && wet.has(weather)
        ? { hitRelief: 2 }
        : weather === 'gust' || (season === 'autumn' && !weather)
          ? { hitRelief: 1 }
          : weather === 'snow'
            ? { hitRelief: -2 }
            : dry;
    case 'trail-scarf':
      return weather && wet.has(weather)
        ? { hitRelief: -2 }
        : season === 'winter'
          ? { hitRelief: weather === 'thaw' ? 1 : 2 }
          : dry;
  }
}

/** A toggle or a checkpoint never restarts the count for the current weather stretch. */
export function resolveGearRecovery(
  gear: JourneyGear,
  route: JourneyRoute,
  row: bigint,
  clean: boolean,
): { gear: JourneyGear; sp: number } {
  if (gear.item !== 'sun-balm') return { gear, sp: 0 };
  const forecast = journeyForecast(route, row);
  const weather = forecast?.startsIn === 0n ? forecast.weather : undefined;
  const recovery = journeyGearEffect(gear.item, route.season, weather, true).recovery;
  if (!recovery) {
    if (!gear.recovery) return { gear, sp: 0 };
    const { item, worn, queued } = gear;
    return { gear: { item, worn, queued }, sp: 0 };
  }
  const window =
    weather === 'heat' && forecast
      ? (row + forecast.rowsLeft - BigInt(WEATHER.heat.rows)).toString()
      : 'clear';
  let progress = gear.recovery?.window === window ? gear.recovery : undefined;
  if (!gear.worn || !clean || (progress && progress.restored >= recovery.cap)) {
    if (progress === gear.recovery) return { gear, sp: 0 };
    return { gear: { item: gear.item, worn: gear.worn, queued: gear.queued }, sp: 0 };
  }
  progress ??= { window, pending: false, restored: 0 };
  const sp = progress.pending ? Math.min(recovery.sp, recovery.cap - progress.restored) : 0;
  return {
    gear: {
      ...gear,
      recovery: { window, pending: !progress.pending, restored: progress.restored + sp },
    },
    sp,
  };
}

export function isGearRecoveryValid(gear: JourneyGear, gearV2: boolean, row: string): boolean {
  const recovery = gear.recovery;
  if (recovery === undefined) return true;
  if (!recovery || !gearV2 || gear.item !== 'sun-balm') return false;
  const cap = recovery.window === 'clear' ? clearRecovery.cap : heatRecovery.cap;
  return (
    typeof recovery.window === 'string' &&
    (recovery.window === 'clear' ||
      (/^[1-9]\d*$/.test(recovery.window) &&
        recovery.window.length <= row.length &&
        BigInt(recovery.window) <= BigInt(row))) &&
    typeof recovery.pending === 'boolean' &&
    Number.isSafeInteger(recovery.restored) &&
    recovery.restored >= 0 &&
    recovery.restored <= cap &&
    (recovery.window === 'clear' || recovery.restored % heatRecovery.sp === 0) &&
    (!recovery.pending || recovery.restored < cap)
  );
}
