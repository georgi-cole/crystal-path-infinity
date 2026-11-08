import type { WorldId } from './store-catalog';
import chaosPlate from './assets/world-previews/chaos-plate.webp?inline';
import chaosCompanion from './assets/world-previews/chaos-companion.webp?inline';
import jellyPlate from './assets/world-previews/jelly-plate.webp?inline';
import jellyCompanion from './assets/world-previews/jelly-companion.webp?inline';
import wildsPlate from './assets/world-previews/wilds-plate.webp?inline';
import wildsCompanion from './assets/world-previews/wilds-companion.webp?inline';
import leaguePlate from './assets/world-previews/league-plate.webp?inline';
import leagueCompanion from './assets/world-previews/league-companion.webp?inline';
import puppyPlate from './assets/world-previews/puppy-plate.webp?inline';
import puppyCompanion from './assets/world-previews/puppy-companion.webp?inline';
import kittenPlate from './assets/world-previews/kitten-plate.webp?inline';
import kittenCompanion from './assets/world-previews/kitten-companion.webp?inline';

// The card and its calm pose arrive in the same bundle, including on a cold store link.
export const WORLD_PREVIEWS = {
  chaos: { plate: chaosPlate, companion: chaosCompanion },
  jelly: { plate: jellyPlate, companion: jellyCompanion },
  wilds: { plate: wildsPlate, companion: wildsCompanion },
  league: { plate: leaguePlate, companion: leagueCompanion },
  puppy: { plate: puppyPlate, companion: puppyCompanion },
  kitten: { plate: kittenPlate, companion: kittenCompanion },
} satisfies Record<WorldId, { plate: string; companion: string }>;
