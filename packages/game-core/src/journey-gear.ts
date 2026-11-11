import type { Season, Weather } from './journey.ts';

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
}

interface GearEffect {
  readonly hitRelief?: number;
  readonly cleanGain?: number;
  readonly clearGlint?: true;
}

const dry = {};
const wet = new Set<Weather>(['rain', 'shower', 'squall']);

/** Gear changes the landing, never the pre-drawn tile. A shield still takes precedence. */
export function journeyGearEffect(item: GearId, season: Season, weather?: Weather): GearEffect {
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
