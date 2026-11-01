/** Independent expectations from immutable source; never generated from this core. */
export const sourceProvenance = {
  repository: 'georgi-cole/bbmobilenew-source',
  commit: '6ace929a60410e728928aa51eaf80ba9b5cf2262',
  verifiedOn: '2026-11-01',
  files: [
    {
      path: 'src/minigames/crystalPathShattered/shatteredLogic.ts',
      gitBlobSha: '29cdc2d70b9ad1959f968fe2e9c51f88ca6d9d82',
      sha256: '0224cdd6f70c96ddd044daa6901850780392ce1a18ea86dbcc059b91800a0c76',
    },
    {
      path: 'src/minigames/crystalPathShattered/CrystalPathShatteredGame.tsx',
      gitBlobSha: '7d7c9d34907511f9f899cf56d9329abb1b90b62f',
      sha256: 'dfbb6f6bd5b09d2774cf02fde927ddc2c48883f57894bce11e9a703693c6c2e2',
    },
    {
      path: 'src/store/rng.ts',
      gitBlobSha: '498decae570d00c97f975a998f7ec0a7f5374e3f',
      sha256: '33434f89caf6038bc8412ca936066b15884ddd5c66bfe62426fd6f06ae8c67d2',
    },
    {
      path: 'tests/crystalPathShattered.logic.test.ts',
      gitBlobSha: 'a012623844ac9ce2391da57560252c9ae79d0b54',
      sha256: 'b7674708c9d5635eb5c89d8b4b4ba28f325ca24e2b9bcbd93bfac51413438c56',
    },
    {
      path: 'tests/crystalPathShattered.asyncFlow.test.tsx',
      gitBlobSha: '767fe985da1ad9f5c23eeddc1ec7fa4ca97dd278',
      sha256: 'e71748fc153882395727a90487984bfe29553b73adb2d74b0d5b4660ab159fcd',
    },
  ],
} as const;

// shatteredLogic.ts:31–41,157–160. Damage uses the displayed, one-based row.
export const initialResources = { sp: 300, hints: 2 } as const;
// Original rollMysteryEffect captured at the floating-point boundary around 57.
export const floatingRollCases = [
  { sample: 0.57, kind: 'lucky_5s' },
  { sample: 0.5700000000000001, kind: 'hurt_10' },
] as const;
export const damageCases = [
  { row: '1', damage: 10 },
  { row: '10', damage: 10 },
  { row: '11', damage: 15 },
  { row: '25', damage: 15 },
  { row: '26', damage: 20 },
  { row: '350', damage: 20 },
] as const;

// shatteredLogic.ts:202–224. Total is 100; intervals are [start, end).
export const mysteryCases = [
  { kind: 'heal_10', weight: 14, start: 0, end: 14, spDelta: 10, hintDelta: 0, timed: false },
  { kind: 'heal_20', weight: 8, start: 14, end: 22, spDelta: 20, hintDelta: 0, timed: false },
  { kind: 'gain_hint', weight: 10, start: 22, end: 32, spDelta: 0, hintDelta: 1, timed: false },
  { kind: 'shield_5s', weight: 10, start: 32, end: 42, spDelta: 0, hintDelta: 0, timed: true },
  { kind: 'regen_5s', weight: 8, start: 42, end: 50, spDelta: 0, hintDelta: 0, timed: true },
  { kind: 'lucky_5s', weight: 7, start: 50, end: 57, spDelta: 0, hintDelta: 0, timed: true },
  { kind: 'hurt_10', weight: 12, start: 57, end: 69, spDelta: -10, hintDelta: 0, timed: false },
  { kind: 'hurt_15', weight: 7, start: 69, end: 76, spDelta: -15, hintDelta: 0, timed: false },
  { kind: 'lose_hint', weight: 6, start: 76, end: 82, spDelta: 0, hintDelta: -1, timed: false },
  { kind: 'fragility_5s', weight: 7, start: 82, end: 89, spDelta: 0, hintDelta: 0, timed: true },
  { kind: 'drain_5s', weight: 5, start: 89, end: 94, spDelta: 0, hintDelta: 0, timed: true },
  { kind: 'inversion_5s', weight: 6, start: 94, end: 100, spDelta: 0, hintDelta: 0, timed: true },
] as const;

// Logic:168–191. Inputs put lower-priority effect first; base damage is 15.
export const priorityCases = [
  { effects: ['lucky_5s', 'shield_5s'], delta: 0, consumed: 'shield_5s', remaining: ['lucky_5s'] },
  {
    effects: ['inversion_5s', 'shield_5s'],
    delta: 0,
    consumed: 'shield_5s',
    remaining: ['inversion_5s'],
  },
  {
    effects: ['fragility_5s', 'shield_5s'],
    delta: 0,
    consumed: 'shield_5s',
    remaining: ['fragility_5s'],
  },
  {
    effects: ['inversion_5s', 'lucky_5s'],
    delta: 15,
    consumed: 'lucky_5s',
    remaining: ['inversion_5s'],
  },
  {
    effects: ['fragility_5s', 'lucky_5s'],
    delta: 15,
    consumed: 'lucky_5s',
    remaining: ['fragility_5s'],
  },
  {
    effects: ['fragility_5s', 'inversion_5s'],
    delta: 7,
    consumed: null,
    remaining: ['fragility_5s', 'inversion_5s'],
  },
] as const;

// Captured by running ORIGINAL createRowStream(mulberry32(seed)).take(20).
export const routeCases = [
  {
    seed: 0,
    sides: [
      'left',
      'left',
      'left',
      'left',
      'right',
      'right',
      'left',
      'right',
      'left',
      'left',
      'left',
      'right',
      'right',
      'right',
      'right',
      'right',
      'left',
      'right',
      'left',
      'right',
    ],
    mysteryIndices: ['4', '9', '15', '18'],
    samples: [
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
      0.46732782293111086, 0.5450490827206522, 0.6152513844426721, 0.6489853798411787,
      0.45600721263326705, 0.581218967679888, 0.24625753005966544, 0.09785169479437172,
      0.9034309543203562, 0.40820372267626226, 0.7202955442480743, 0.6599067240022123,
      0.8058585098478943, 0.6261914535425603, 0.5696913106366992, 0.12123633874580264,
      0.24193100933916867, 0.8153759187553078, 0.323521607555449, 0.08783002896234393,
      0.7895766077563167,
    ],
  },
  {
    seed: 12345,
    sides: [
      'left',
      'left',
      'right',
      'right',
      'left',
      'left',
      'right',
      'right',
      'left',
      'right',
      'right',
      'right',
      'right',
      'left',
      'left',
      'right',
      'right',
      'right',
      'right',
      'right',
    ],
    mysteryIndices: ['6', '12', '15'],
    samples: [
      0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203,
      0.5094283693470061, 0.34747186047025025, 0.07375754183158278, 0.7663964673411101,
      0.9968264393974096, 0.8250224851071835, 0.4599348735064268, 0.9458441860042512,
      0.8906230411957949, 0.9693436855450273, 0.6276605280581862, 0.24882567464374006,
      0.47334283916279674, 0.30504514812491834, 0.772419034736231, 0.8651748767588288,
      0.6464686228428036, 0.7801495490130037, 0.7873199039604515, 0.6529157503973693,
    ],
  },
] as const;

// Accepted standalone expectations, NOT preserved historical outcomes.
export const standaloneCases = {
  fatalWrongSequence: {
    after10Wrong: { sp: 200, lastClearedRow: '10' },
    after23Wrong: { sp: 5, lastClearedRow: '23' },
    after24Wrong: { sp: 0, lastClearedRow: '23', fatalRow: '24', deathCause: 'wrong_tile' },
    historicalFatalProgressAfterAnimation: 24,
  },
  spCap: 400,
  endlessDamageRows: ['351', '4294967297', '9007199254740993'],
  timedPulseOffsetsMs: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500],
  effectDurationMs: 5000,
  hintRevealMs: 3500,
  reviveSp: [200, 200, 200, 200, 200, 150, 150, 150, 150, 150],
} as const;
