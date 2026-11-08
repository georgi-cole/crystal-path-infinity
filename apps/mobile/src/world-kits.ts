import type { WorldId, ThemeId } from './store-catalog';
import type { MessageKey } from './i18n/messages';

export type WorldMaterial = 'copper' | 'opal' | 'jade' | 'enamel' | 'canvas' | 'moonstone';

interface WorldKit {
  title: MessageKey;
  mood: MessageKey;
  detail: MessageKey;
  journal: MessageKey;
  material: WorldMaterial;
  family: 'adventure' | 'sport' | 'pets';
  safe: MessageKey;
  meet: MessageKey;
  sound: MessageKey;
  surface: MessageKey;
}

/** One identity spans the shop, home, navigation, props, companion and ending. */
export const WORLD_KITS = {
  chaos: {
    title: 'vault.chaos',
    mood: 'vault.chaosMood',
    detail: 'vault.chaosDetail',
    journal: 'vault.workshopJournal',
    material: 'copper',
    family: 'adventure',
    safe: 'vault.pipSafe',
    meet: 'vault.meetPip',
    sound: 'vault.chaosSound',
    surface: 'vault.copperCrystal',
  },
  jelly: {
    title: 'vault.jelly',
    mood: 'vault.jellyMood',
    detail: 'vault.jellyDetail',
    journal: 'vault.starlightJournal',
    material: 'opal',
    family: 'adventure',
    safe: 'vault.lumiSafe',
    meet: 'vault.meetLumi',
    sound: 'vault.jellySound',
    surface: 'vault.opalCrystal',
  },
  wilds: {
    title: 'vault.wilds',
    mood: 'vault.wildsMood',
    detail: 'vault.wildsDetail',
    journal: 'vault.wildsJournal',
    material: 'jade',
    family: 'adventure',
    safe: 'vault.micaSafe',
    meet: 'vault.meetMica',
    sound: 'vault.wildsSound',
    surface: 'vault.jadeCrystal',
  },
  league: {
    title: 'vault.league',
    mood: 'vault.leagueMood',
    detail: 'vault.leagueDetail',
    journal: 'vault.leagueJournal',
    material: 'enamel',
    family: 'sport',
    safe: 'vault.rallySafe',
    meet: 'vault.meetRally',
    sound: 'vault.leagueSound',
    surface: 'vault.arenaCrystal',
  },
  puppy: {
    title: 'vault.puppy',
    mood: 'vault.puppyMood',
    detail: 'vault.puppyDetail',
    journal: 'vault.puppyJournal',
    material: 'canvas',
    family: 'pets',
    safe: 'vault.riffSafe',
    meet: 'vault.meetRiff',
    sound: 'vault.puppySound',
    surface: 'vault.canvasCrystal',
  },
  kitten: {
    title: 'vault.kitten',
    mood: 'vault.kittenMood',
    detail: 'vault.kittenDetail',
    journal: 'vault.kittenJournal',
    material: 'moonstone',
    family: 'pets',
    safe: 'vault.nyxSafe',
    meet: 'vault.meetNyx',
    sound: 'vault.kittenSound',
    surface: 'vault.moonCrystal',
  },
} as const satisfies Record<WorldId, WorldKit>;

export const WORLD_COLORS = {
  chaos: ['#ffe0a4', '#a75e3b', '#392e36', '#baffde'],
  jelly: ['#fff2ff', '#ceacf5', '#5568a6', '#edc9ff'],
  wilds: ['#eadcc0', '#77786a', '#28322e', '#e6bb7c'],
  league: ['#ffd2a3', '#c66e37', '#253548', '#8edeee'],
  puppy: ['#f3dcc4', '#ad755b', '#303746', '#afd3e2'],
  kitten: ['#eadff0', '#7d759c', '#292c48', '#efc584'],
} as const satisfies Record<WorldId, readonly [string, string, string, string]>;

export const isPetWorld = (theme: ThemeId) => theme === 'puppy' || theme === 'kitten';
export const WORLD_ORDER: readonly WorldId[] = [
  'wilds',
  'league',
  'puppy',
  'kitten',
  'chaos',
  'jelly',
];
