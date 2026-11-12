import { adventurePrice } from './adventure-prices';
import type { JourneyMark, JourneyRoute, Season, TileSide } from '@crystal-path-infinity/game-core';

export const CHAPTERS = {
  lighthouse: {
    name: 'Lighthouse Coast',
    title: 'The Lighthouse',
    glyph: '✦',
    restored: 'The Lighthouse is shining',
  },
  mill: {
    name: 'Copperwater Mill',
    title: 'The Mill',
    glyph: '◉',
    restored: 'The Mill is turning',
  },
  tower: {
    name: 'Sunspire Cliffs',
    title: 'The Tower',
    glyph: '♢',
    restored: 'The Tower is ringing',
  },
  frostbank: {
    name: 'Frostbank Landing',
    title: 'Frostbank',
    glyph: '❄',
    restored: 'Frostbank is alight',
  },
  gate: {
    name: 'The Far Gate',
    title: 'The Far Gate',
    glyph: '◈',
    restored: 'The Far Gate is open',
  },
  observatory: {
    name: 'Starfall Observatory',
    title: 'The Observatory',
    glyph: '✧',
    restored: 'The Observatory sees the stars',
  },
  harbour: {
    name: 'Cloudrest Harbour',
    title: 'The Harbour',
    glyph: '⚓',
    restored: 'The Harbour lights are home',
  },
} as const;
export type Chapter = keyof typeof CHAPTERS;
export type MissionObjective =
  | { readonly type: 'mystery'; readonly row?: number }
  | { readonly type: 'hints'; readonly count: number }
  | { readonly type: 'hint-follow'; readonly row: number }
  | { readonly type: 'trade'; readonly row: number }
  | { readonly type: 'hint-limit'; readonly count: number }
  | { readonly type: 'clean'; readonly rows: readonly number[] }
  | { readonly type: 'shield'; readonly row: number }
  | { readonly type: 'mysteries'; readonly rows: readonly number[] }
  | { readonly type: 'hint-steps'; readonly rows: readonly number[] }
  | { readonly type: 'shield-steps'; readonly rows: readonly number[] };
export type Goal =
  MissionObjective | { readonly type: 'all'; readonly goals: readonly MissionObjective[] };
export const missionObjectives = (goal?: Goal): readonly MissionObjective[] =>
  !goal ? [] : goal.type === 'all' ? goal.goals : [goal];
export type BridgeSlot = 'tiles' | 'rails' | 'lighting' | 'trail';
export const STYLES = {
  'comet-trail': {
    slot: 'trail',
    name: 'Comet Footsteps',
    note: 'Little gold-tailed stars follow your safe steps',
    unlock: 'wish-upon-a-bridge',
    price: null,
  },
  'harbour-lanterns': {
    slot: 'lighting',
    name: 'Pearl Lanterns',
    note: 'Warm pearl lanterns welcome you along the bridge',
    unlock: 'bring-the-dawn-home',
    price: null,
  },
  torches: {
    slot: 'lighting',
    name: 'Keeper’s Torches',
    note: 'Warm keeper’s torches along the equipped bridge',
    unlock: 'light-the-lighthouse',
    price: null,
  },
  copper: {
    slot: 'rails',
    name: 'Copper Rails',
    note: 'Riveted copper trusses and timber crossbeams',
    unlock: 'turn-the-mill',
    price: null,
  },
  echo: {
    slot: 'trail',
    name: 'Echo Footsteps',
    note: 'Pale rings linger on your last step',
    unlock: 'two-clean-chords',
    price: null,
  },
  amber: {
    slot: 'lighting',
    name: 'Amber LEDs',
    note: 'A line of amber lights along the crossing',
    unlock: 'ring-the-tower',
    price: null,
  },
  frost: {
    slot: 'tiles',
    name: 'Frosted Glass',
    note: 'Clear ice tiles resting on carved froststone piers',
    unlock: 'frostbank-landing',
    price: null,
  },
  aurora: {
    slot: 'tiles',
    name: 'Bounce Boulevard',
    note: 'Springy trampolines with a soft landing bounce',
    unlock: null,
    price: adventurePrice('aurora'),
  },
  'prism-glass': {
    slot: 'tiles',
    name: 'Cosmic Tiles',
    note: 'Deep space tiles filled with stars and tiny galaxies',
    unlock: null,
    price: adventurePrice('prism-kit'),
  },
  'prism-lights': {
    slot: 'lighting',
    name: 'Starlight LEDs',
    note: 'Pink and blue light along the rail',
    unlock: null,
    price: adventurePrice('prism-kit'),
  },
  'prism-trail': {
    slot: 'trail',
    name: 'Stardust Trail',
    note: 'A scatter of light behind each step',
    unlock: null,
    price: adventurePrice('prism-kit'),
  },
  'lily-pads': {
    slot: 'tiles',
    name: 'Lily Drift',
    note: 'A chain of broad lily pads drifting on dark water',
    unlock: 'the-first-rainbow',
    price: null,
  },
  'jelly-cushions': {
    slot: 'tiles',
    name: 'Jelly Path',
    note: 'Glossy berry jelly cushions with a spring in every step',
    unlock: 'two-clean-chords',
    price: null,
  },
  'cookie-tiles': {
    slot: 'tiles',
    name: 'Cookie Crossing',
    note: 'Golden biscuits with cream filling and chocolate chips',
    unlock: null,
    price: adventurePrice('cookie-bridge'),
  },
} as const;
export type StyleId = keyof typeof STYLES;
export type BridgeStyle = Partial<Record<BridgeSlot, StyleId>>;
export const BRIDGE_MODELS = {
  original: {
    name: 'World Bridge',
    note: 'The crossing that belongs to your chosen World.',
    style: {},
  },
  trestle: {
    name: 'Mill Trestle',
    note: 'Cross a ravine on timber braces and riveted copper.',
    style: { rails: 'copper' },
  },
  frost: {
    name: 'Frostbank Causeway',
    note: 'Step across clear ice tiles and carved stone supports.',
    style: { tiles: 'frost' },
  },
  lily: {
    name: 'Lily Drift',
    note: 'Hop across floating lily pads. A bad landing sends a pad under with a ripple.',
    style: { tiles: 'lily-pads' },
  },
  jelly: {
    name: 'Jelly Path',
    note: 'A wonderfully wobbly crossing. Jelly sags, stretches and splats when it gives way.',
    style: { tiles: 'jelly-cushions' },
  },
  aurora: {
    name: 'Bounce Boulevard',
    note: 'Bounce, bounce… steady! A broken trampoline tears open.',
    style: { tiles: 'aurora' },
  },
  prism: {
    name: 'Cosmic Crossing',
    note: 'Walk above tiny galaxies. Broken tiles dissolve into stardust.',
    style: { tiles: 'prism-glass', lighting: 'prism-lights', trail: 'prism-trail' },
  },
  cookie: {
    name: 'Cookie Crossing',
    note: 'Cream-filled biscuit tiles. A broken cookie snaps into crunchy crumbs.',
    style: { tiles: 'cookie-tiles' },
  },
} as const satisfies Record<string, { name: string; note: string; style: BridgeStyle }>;
export type BridgeModel = keyof typeof BRIDGE_MODELS;
export function bridgeModel(style?: BridgeStyle): BridgeModel {
  if (style?.tiles === 'cookie-tiles') return 'cookie';
  if (style?.tiles === 'jelly-cushions') return 'jelly';
  if (style?.tiles === 'lily-pads') return 'lily';
  if (style?.tiles === 'prism-glass') return 'prism';
  if (style?.tiles === 'aurora') return 'aurora';
  if (style?.tiles === 'frost') return 'frost';
  if (style?.rails === 'copper') return 'trestle';
  return 'original';
}
export type StyleOffer = 'aurora' | 'prism-kit' | 'cookie-bridge';
export const STYLE_OFFERS = {
  aurora: { name: 'Bounce Boulevard', price: adventurePrice('aurora'), items: ['aurora'] },
  'cookie-bridge': {
    name: 'Cookie Crossing',
    price: adventurePrice('cookie-bridge'),
    items: ['cookie-tiles'],
  },
  'prism-kit': {
    name: 'Cosmic Style Kit',
    price: adventurePrice('prism-kit'),
    items: ['prism-glass', 'prism-lights', 'prism-trail'],
  },
} as const satisfies Record<StyleOffer, { name: string; price: string; items: readonly StyleId[] }>;

export interface MissionGrant {
  readonly sp?: number;
  readonly hints?: number;
  readonly continues?: number;
  readonly shields?: number;
  readonly style?: StyleId;
  readonly seasonChanges?: number;
}
export interface MissionRoute {
  readonly season: Season;
  readonly targetRow: number;
  readonly minimumStability: number;
  readonly startingSp: number;
  readonly startingHints: number;
  readonly goal?: Goal;
  readonly windows?: JourneyRoute['windows'];
  readonly marks?: JourneyRoute['marks'];
}
export interface MissionDefinition<Id extends string = string> extends MissionRoute {
  readonly id: Id;
  readonly name: string;
  readonly chapter: Chapter;
  readonly objective: string;
  readonly reward: string;
  readonly grant: MissionGrant;
  readonly assist?: true;
  readonly alternate?: MissionRoute & { readonly objective: string };
  readonly revision?: '0.4';
}
const windowAt = (
  start: number,
  weather: NonNullable<JourneyRoute['windows']>[number]['weather'],
) => ({ start, weather });
const span = (first: number) => [first, first + 1, first + 2];
const marked = (
  first: number,
  cue: JourneyMark['cue'],
  sides: readonly TileSide[] = ['left', 'right', 'left'],
) => sides.map((safe, offset): JourneyMark => ({ row: first + offset, cue, safe }));
function mission<const Id extends string>(
  id: Id,
  name: string,
  chapter: Chapter,
  season: Season,
  targetRow: number,
  startingSp: number,
  minimumStability: number,
  objective: string,
  reward: string,
  grant: MissionGrant,
  options: Partial<
    Omit<
      MissionDefinition,
      keyof MissionRoute | 'id' | 'name' | 'chapter' | 'objective' | 'reward' | 'grant'
    >
  > &
    Pick<Partial<MissionRoute>, 'goal' | 'marks' | 'windows' | 'startingHints'> = {},
): MissionDefinition<Id> {
  return {
    id,
    name,
    chapter,
    season,
    targetRow,
    startingSp,
    minimumStability,
    startingHints: 2,
    objective,
    reward,
    grant,
    ...options,
  };
}

export const CAMPAIGN_MISSIONS = [
  mission(
    'first-steps',
    'The Coast Is Clear-ish',
    'lighthouse',
    'spring',
    24,
    300,
    240,
    'Reach the first signal with at least 240 Stability.',
    '+25 reserve SP',
    { sp: 25 },
  ),
  mission(
    'lost-lens',
    'Lens, Actually',
    'lighthouse',
    'spring',
    36,
    300,
    210,
    'Open the lens cache at row 8 and reach the landing.',
    '+1 reserve hint',
    { hints: 1 },
    { goal: { type: 'mystery', row: 8 }, marks: [{ row: 8, encounter: 'heal_10' }] },
  ),
  mission(
    'focus-the-beam',
    'Two Sparks Ahead',
    'lighthouse',
    'spring',
    48,
    300,
    200,
    'Use two hints on different rows and reach the landing.',
    '+1 reserve hint',
    { hints: 1 },
    { goal: { type: 'hints', count: 2 } },
  ),
  mission(
    'light-the-lighthouse',
    'Light It Up, Keeper!',
    'lighthouse',
    'spring',
    60,
    300,
    175,
    'Reach the lighthouse landing. Follow the lights on the final three rows.',
    'Keeper’s Torches and Lighthouse lit',
    { style: 'torches' },
    { marks: marked(58, 'beacon') },
  ),
  mission(
    'rain-on-glass',
    'Puddle Trouble',
    'mill',
    'spring',
    50,
    300,
    145,
    'Follow the beam to the Mill road through three showers. Two cracked tiles can still be crossed at a cost.',
    'Spring Rain in Infinity',
    {},
    {
      windows: [windowAt(4, 'rain'), windowAt(20, 'rain'), windowAt(39, 'rain')],
      marks: [{ row: 5, bothBroken: true, cue: 'crack' }],
    },
  ),
  mission(
    'dry-foothold',
    'Dry Socks, Please',
    'mill',
    'spring',
    34,
    125,
    30,
    'Use a hint at wet row 12, then step on the revealed tile.',
    '+25 reserve SP',
    { sp: 25 },
    {
      assist: true,
      windows: [windowAt(10, 'rain'), windowAt(25, 'rain')],
      goal: { type: 'hint-follow', row: 12 },
      marks: [{ row: 12, safe: 'right' }],
    },
  ),
  mission(
    'bargain-at-the-mill',
    'The Hint Heist',
    'mill',
    'spring',
    37,
    120,
    35,
    'Open the Marketing cache at row 10 and sell exactly one starting hint.',
    '+1 reserve hint',
    { hints: 1 },
    {
      assist: true,
      windows: [windowAt(21, 'rain')],
      goal: { type: 'trade', row: 10 },
      marks: [{ row: 10, encounter: 'marketing' }],
    },
  ),
  mission(
    'turn-the-mill',
    'One Good Turn',
    'mill',
    'spring',
    42,
    150,
    65,
    'Reach the millrace with enough Stability to turn the wheel.',
    'Copper Rails and +1 continue',
    { style: 'copper', continues: 1 },
    {
      assist: true,
      windows: [windowAt(9, 'rain'), windowAt(28, 'rain')],
      marks: marked(40, 'beacon'),
    },
  ),
  mission(
    'sun-on-the-cliffs',
    'Don’t Trust the Shine',
    'tower',
    'summer',
    36,
    135,
    35,
    'Read three reflected clues at rows 11–13. Land opposite the mirror glint.',
    'Summer and Heat Surges in Infinity',
    {},
    {
      windows: [windowAt(11, 'heat')],
      marks: marked(11, 'mirror'),
      goal: { type: 'clean', rows: span(11) },
    },
  ),
  mission(
    'save-a-hint',
    'One Hint Wonder',
    'tower',
    'summer',
    40,
    140,
    35,
    'Spend at most one hint. Read the free bridge cues along the way.',
    '+25 reserve SP',
    { sp: 25 },
    {
      assist: true,
      windows: [windowAt(17, 'heat')],
      marks: [...marked(7, 'echo'), ...marked(17, 'mirror')],
      goal: { type: 'hint-limit', count: 1 },
    },
  ),
  mission(
    'two-clean-chords',
    'Six Steps, No Stumbles',
    'tower',
    'summer',
    43,
    145,
    40,
    'Cross the three Echo steps at rows 10–12 and the three Mirror steps at rows 28–30 cleanly.',
    'Echo Footsteps and Jelly Path',
    { style: 'echo' },
    {
      marks: [...marked(10, 'echo'), ...marked(28, 'mirror', ['right', 'left', 'right'])],
      goal: { type: 'clean', rows: [...span(10), ...span(28)] },
    },
  ),
  mission(
    'ring-the-tower',
    'For Whom the Glass Tolls',
    'tower',
    'summer',
    50,
    170,
    55,
    'Cross a summer shower and a heat surge, then land all three final Echo steps cleanly.',
    'Amber LEDs and Tower restored',
    { style: 'amber' },
    {
      assist: true,
      windows: [windowAt(12, 'shower'), windowAt(32, 'heat')],
      marks: marked(48, 'echo'),
      goal: { type: 'clean', rows: span(48) },
    },
  ),
  mission(
    'first-snow',
    'Snow Way Across',
    'frostbank',
    'winter',
    38,
    125,
    35,
    'Cross two snow windows. Ice hardens some of the brittle tiles.',
    'Winter and Snow in Infinity',
    {},
    { windows: [windowAt(8, 'snow'), windowAt(24, 'snow')] },
  ),
  mission(
    'trust-the-shield',
    'Crack Me If You Can',
    'frostbank',
    'winter',
    43,
    150,
    45,
    'Open the shield cache on row 14, then step on the marked crack while the shield is active.',
    '+1 reserve shield',
    { shields: 1 },
    {
      windows: [windowAt(22, 'snow')],
      marks: [{ row: 14, encounter: 'shield_5s', cue: 'crack', bothBroken: true }],
      goal: { type: 'shield', row: 14 },
    },
  ),
  mission(
    'the-long-crossing',
    'The Frost Mile',
    'frostbank',
    'winter',
    64,
    190,
    55,
    'Cross alternating snow and clear spans to reach the north ridge.',
    '+1 continue',
    { continues: 1 },
    { assist: true, windows: [windowAt(6, 'snow'), windowAt(26, 'snow'), windowAt(47, 'snow')] },
  ),
  mission(
    'frostbank-landing',
    'The Great Thaw-Through',
    'frostbank',
    'winter',
    56,
    175,
    75,
    'Keep your Stability through two thaw windows and the snowfield to reach Frostbank.',
    'Frosted Glass and Frostbank restored',
    { style: 'frost' },
    {
      assist: true,
      windows: [windowAt(7, 'thaw'), windowAt(21, 'snow'), windowAt(39, 'thaw')],
      marks: marked(54, 'beacon'),
    },
  ),
  mission(
    'the-first-rainbow',
    'Chasing Prismtails',
    'gate',
    'spring',
    42,
    145,
    40,
    'Follow three prism lights at rows 16–18. Each light marks a tile that will hold.',
    'Lily Drift and rainbows in Spring Infinity',
    { style: 'lily-pads' },
    { windows: [windowAt(16, 'rainbow')], goal: { type: 'clean', rows: span(16) } },
  ),
  mission(
    'after-the-rain',
    'Make Mine a Rainbow',
    'gate',
    'spring',
    53,
    165,
    55,
    'Cross the rain. Two clear rows later, take all three rainbow-lit steps.',
    '+25 reserve SP',
    { sp: 25 },
    {
      assist: true,
      windows: [windowAt(13, 'rain'), windowAt(21, 'rainbow')],
      goal: { type: 'clean', rows: span(21) },
    },
  ),
  mission(
    'two-ways-to-the-gate',
    'A Squall or a Long Walk',
    'gate',
    'autumn',
    48,
    160,
    50,
    'Take the short route through two squalls. Reach the gate road with at least 50 Stability.',
    'Autumn and Leaf Gusts in Infinity',
    {},
    {
      assist: true,
      windows: [windowAt(9, 'squall'), windowAt(29, 'squall')],
      alternate: {
        season: 'autumn',
        targetRow: 58,
        startingSp: 180,
        minimumStability: 50,
        startingHints: 2,
        objective:
          'Take the ridge route. Read two Echo phrases and the Leaf Gusts along the longer crossing.',
        windows: [windowAt(10, 'gust'), windowAt(32, 'gust')],
        marks: [...marked(20, 'echo'), ...marked(47, 'echo')],
      },
    },
  ),
  mission(
    'light-the-far-gate',
    'One Last Light',
    'gate',
    'autumn',
    72,
    230,
    70,
    'Survive Squall, Gust and Squall, then take the last three beacon steps cleanly.',
    'Far Gate restored',
    {},
    {
      assist: true,
      windows: [windowAt(9, 'squall'), windowAt(30, 'gust'), windowAt(49, 'squall')],
      marks: marked(70, 'beacon'),
      goal: { type: 'clean', rows: span(70) },
    },
  ),
  mission(
    'a-letter-from-the-stars',
    'A Letter from the Stars',
    'observatory',
    'spring',
    52,
    180,
    50,
    'Recover both star-chart caches at rows 9 and 31. Follow the rainbow to the Observatory road.',
    '+1 reserve hint',
    { hints: 1 },
    {
      revision: '0.4',
      assist: true,
      goal: { type: 'mysteries', rows: [9, 31] },
      windows: [windowAt(17, 'rain'), windowAt(41, 'rainbow')],
      marks: [
        { row: 9, encounter: 'heal_10' },
        { row: 31, encounter: 'heal_10' },
      ],
    },
  ),
  mission(
    'pack-light-shine-bright',
    'Pack Light, Shine Bright',
    'observatory',
    'summer',
    54,
    185,
    50,
    'Use no hints. Cross the three Mirror steps at rows 18–20 without a wrong landing.',
    '+25 reserve SP',
    { sp: 25 },
    {
      revision: '0.4',
      assist: true,
      goal: {
        type: 'all',
        goals: [
          { type: 'hint-limit', count: 0 },
          { type: 'clean', rows: span(18) },
        ],
      },
      windows: [windowAt(18, 'heat'), windowAt(39, 'shower')],
      marks: marked(18, 'mirror'),
    },
  ),
  mission(
    'handle-with-scare',
    'Handle with Scare',
    'observatory',
    'winter',
    56,
    180,
    50,
    'Open the shield cache at row 15 and block that row’s crack. Recover the lens cache at row 38 before you leave the icy ridge.',
    '+2 reserve shields',
    { shields: 2 },
    {
      revision: '0.4',
      assist: true,
      goal: {
        type: 'all',
        goals: [
          { type: 'shield', row: 15 },
          { type: 'mysteries', rows: [38] },
        ],
      },
      windows: [windowAt(9, 'thaw'), windowAt(25, 'snow'), windowAt(43, 'thaw')],
      marks: [
        { row: 15, encounter: 'shield_5s', cue: 'crack', bothBroken: true },
        { row: 38, encounter: 'heal_10' },
      ],
    },
  ),
  mission(
    'a-fair-trade-in-starlight',
    'A Fair Trade in Starlight',
    'observatory',
    'summer',
    60,
    195,
    55,
    'Sell one starting hint at row 12. Use your remaining hint at row 34 and follow the tile it reveals.',
    '+1 continue',
    { continues: 1 },
    {
      revision: '0.4',
      assist: true,
      goal: {
        type: 'all',
        goals: [
          { type: 'trade', row: 12 },
          { type: 'hint-follow', row: 34 },
        ],
      },
      windows: [windowAt(19, 'heat'), windowAt(43, 'shower')],
      marks: [
        { row: 12, encounter: 'marketing' },
        { row: 34, safe: 'right' },
      ],
    },
  ),
  mission(
    'wish-upon-a-bridge',
    'Wish Upon a Bridge',
    'observatory',
    'summer',
    72,
    245,
    70,
    'Open the two alignment caches at rows 14 and 45. Land all three final beacon steps cleanly to point the telescope at the stars.',
    'Comet Footsteps and Observatory restored',
    { style: 'comet-trail' },
    {
      revision: '0.4',
      assist: true,
      goal: {
        type: 'all',
        goals: [
          { type: 'mysteries', rows: [14, 45] },
          { type: 'clean', rows: span(70) },
        ],
      },
      windows: [windowAt(23, 'heat'), windowAt(53, 'shower')],
      marks: [
        { row: 14, encounter: 'heal_10' },
        { row: 45, encounter: 'heal_10' },
        ...marked(70, 'beacon'),
      ],
    },
  ),
  mission(
    'special-delivery-dry-ish',
    'Special Delivery: Dry-ish',
    'harbour',
    'autumn',
    56,
    190,
    50,
    'Collect all three delivery caches at rows 8, 26 and 46. Bring them through the gusts and storm to the Harbour road.',
    '+25 reserve SP and +1 hint',
    { sp: 25, hints: 1 },
    {
      revision: '0.4',
      assist: true,
      goal: { type: 'mysteries', rows: [8, 26, 46] },
      windows: [windowAt(15, 'gust'), windowAt(34, 'squall')],
      marks: [
        { row: 8, encounter: 'heal_10' },
        { row: 26, encounter: 'heal_10' },
        { row: 46, encounter: 'heal_10' },
      ],
    },
  ),
  mission(
    'mind-the-melt',
    'Mind the Melt',
    'harbour',
    'winter',
    58,
    190,
    55,
    'Save a hint for each thaw: use one on row 17 and one on row 41, and land safely on both rows.',
    '+2 reserve hints',
    { hints: 2 },
    {
      revision: '0.4',
      assist: true,
      goal: { type: 'hint-steps', rows: [17, 41] },
      windows: [
        windowAt(6, 'snow'),
        windowAt(17, 'thaw'),
        windowAt(28, 'snow'),
        windowAt(41, 'thaw'),
      ],
      marks: [
        { row: 17, safe: 'left' },
        { row: 41, safe: 'right' },
      ],
    },
  ),
  mission(
    'rainbow-relay',
    'Rainbow Relay',
    'harbour',
    'spring',
    64,
    205,
    60,
    'Cross three showers and follow every rainbow-lit step at rows 12–14, 32–34 and 52–54. Keep the Harbour signals connected.',
    '+1 continue',
    { continues: 1 },
    {
      revision: '0.4',
      assist: true,
      goal: { type: 'clean', rows: [...span(12), ...span(32), ...span(52)] },
      windows: [
        windowAt(4, 'rain'),
        windowAt(12, 'rainbow'),
        windowAt(24, 'rain'),
        windowAt(32, 'rainbow'),
        windowAt(44, 'rain'),
        windowAt(52, 'rainbow'),
      ],
    },
  ),
  mission(
    'the-night-watch',
    'The Night Watch',
    'harbour',
    'autumn',
    68,
    230,
    65,
    'Two cracks guard the bell tower. Open the shield cache on row 18 and again on row 47, crossing each crack while its shield is active.',
    '+2 reserve shields',
    { shields: 2 },
    {
      revision: '0.4',
      assist: true,
      goal: { type: 'shield-steps', rows: [18, 47] },
      windows: [windowAt(16, 'squall'), windowAt(31, 'gust'), windowAt(45, 'squall')],
      marks: [
        { row: 18, encounter: 'shield_5s', cue: 'crack', bothBroken: true },
        { row: 47, encounter: 'shield_5s', cue: 'crack', bothBroken: true },
      ],
    },
  ),
  mission(
    'bring-the-dawn-home',
    'Bring the Dawn Home',
    'harbour',
    'spring',
    88,
    300,
    85,
    'Open the dawn caches at rows 13 and 51. Spend at most one hint, then cross the final three beacons cleanly to light Cloudrest Harbour.',
    'Pearl Lanterns, +2 Season Changes and Harbour restored',
    { style: 'harbour-lanterns', seasonChanges: 2 },
    {
      revision: '0.4',
      assist: true,
      goal: {
        type: 'all',
        goals: [
          { type: 'mysteries', rows: [13, 51] },
          { type: 'hint-limit', count: 1 },
          { type: 'clean', rows: span(86) },
        ],
      },
      windows: [
        windowAt(22, 'rain'),
        windowAt(30, 'rainbow'),
        windowAt(62, 'rain'),
        windowAt(70, 'rainbow'),
      ],
      marks: [
        { row: 13, encounter: 'heal_10' },
        { row: 51, encounter: 'heal_10' },
        ...marked(86, 'beacon'),
      ],
    },
  ),
] as const;
export type CampaignMissionId = (typeof CAMPAIGN_MISSIONS)[number]['id'];
export type CampaignMission = (typeof CAMPAIGN_MISSIONS)[number];
export const LANDMARK_CLEARS: Record<Chapter, CampaignMissionId> = {
  lighthouse: 'light-the-lighthouse',
  mill: 'turn-the-mill',
  tower: 'ring-the-tower',
  frostbank: 'frostbank-landing',
  gate: 'light-the-far-gate',
  observatory: 'wish-upon-a-bridge',
  harbour: 'bring-the-dawn-home',
};
