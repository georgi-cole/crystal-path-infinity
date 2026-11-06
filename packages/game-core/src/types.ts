/** Canonical non-negative decimal integer; never convert row indices to Number. */
export type Decimal = string;
export type TileSide = 'left' | 'right';

export type EffectKind =
  | 'heal_10'
  | 'heal_20'
  | 'gain_hint'
  | 'shield_5s'
  | 'regen_5s'
  | 'lucky_5s'
  | 'hurt_10'
  | 'hurt_15'
  | 'lose_hint'
  | 'fragility_5s'
  | 'drain_5s'
  | 'inversion_5s'
  | 'double_gain_21s'
  | 'double_loss_21s'
  | 'coyote_10s'
  | 'mystery_silence_30s'
  | 'mystery_surge_30s'
  | RowEffectKind
  | PactKind;

export type PactKind =
  | 'blood_oath'
  | 'false_oracle'
  | 'hungry_vault'
  | 'borrowed_time'
  | 'soul_exchange'
  | 'half_life'
  | 'marketing';
export type PactOption =
  'accept' | 'decline' | 'cashout' | 'settle' | 'sp' | 'hint' | 'sell_one' | 'sell_all';

export type MysteryTier = 'standard' | 'choice' | 'major' | 'anomaly';
export interface MysteryDiscovery {
  readonly known: readonly EffectKind[];
  readonly introduction: {
    readonly kind: EffectKind;
    readonly startedAt: number;
    readonly expiresAt: number;
  } | null;
}
export interface MysteryRhythm {
  readonly kind: 'mystery_silence_30s' | 'mystery_surge_30s';
  readonly startedAt: number;
  readonly expiresAt: number;
}
export interface MysteryDirector {
  readonly nextRow: Decimal;
  readonly lastStepAt: number;
  readonly pressure?: {
    readonly anchorAt: number;
    readonly anchorSp: number;
    readonly paid: number;
  };
  /** PRIVATE cooldown ledger; one most recent entry per result. */
  readonly history: readonly {
    readonly kind: EffectKind;
    readonly row: Decimal;
    readonly at: number;
  }[];
  readonly rhythm: MysteryRhythm | null;
}

/** A bounded, row-based contract. No hidden roll or future safe side is stored here. */
export interface MysteryPact {
  readonly kind: PactKind;
  readonly phase: 'offered' | 'active';
  readonly rowsLeft: number;
  readonly bank: number;
  /** A deliberately fallible prediction, never a confirmed hint. */
  readonly omen: TileSide | null;
  /** v5+ decision grace begins once, survives saves and is not reset by rendering. */
  readonly offeredAt?: number;
}

export type TimedEffectKind = Extract<
  EffectKind,
  `${string}_5s` | `${string}_10s` | `${string}_21s`
>;
export type RowEffectKind = 'regen_3rows' | 'bleed_3rows';

export interface TimedActiveEffect {
  readonly kind: TimedEffectKind;
  readonly startedAt: number;
  readonly expiresAt: number;
  /** Per-instance active-time schedule; null for effects without periodic SP changes. */
  readonly nextTickAt: number | null;
}

export interface RowActiveEffect {
  readonly kind: RowEffectKind;
  readonly startedAt: number;
  readonly expiresAt: null;
  readonly nextTickAt: null;
  readonly rowsLeft: number;
}

export type ActiveEffect = TimedActiveEffect | RowActiveEffect;

export interface RandomCursor {
  readonly algorithm: string;
  /** Adapter-owned serializable state, private for any future ranked authority. */
  readonly state: string;
  readonly draws: Decimal;
}

export interface RandomSource {
  readonly algorithm: string;
  /** Pure: one value in [0, 1), a new cursor, draws incremented by exactly one. */
  next(cursor: RandomCursor): { readonly value: number; readonly cursor: RandomCursor };
}

export interface BridgeRow {
  /** Zero-based absolute index, matching the inspected source's convention. */
  readonly index: Decimal;
  /** Legacy safe side; v4 prefers a surviving tile, falling back to low risk if neither survives.
   * Use hintSafeSide/isBrokenTile for outcome decisions. */
  readonly safeSide: TileSide;
  readonly hasMystery: boolean;
  /** PRIVATE v4 draws. Neither assignment nor unchosen outcomes belong in rendered/network rows. */
  readonly risk?: {
    readonly lowRiskSide: TileSide;
    readonly broken: Readonly<Record<TileSide, boolean>>;
  };
}

export interface RowStreamState {
  readonly rulesetVersion: string;
  readonly nextIndex: Decimal;
  readonly nextMysteryIndex: Decimal;
  readonly rng: RandomCursor;
}

export interface BufferPolicy {
  /** Includes the current unresolved row. */
  readonly ahead: number;
  readonly history: number;
}

export interface CurrentRowState {
  readonly revealedSafeSide: TileSide | null;
  readonly mysteryOutcome: EffectKind | null;
  readonly lastChoice: { readonly side: TileSide; readonly wrong: boolean } | null;
  /** A hint inspected this row and found no surviving tile. No hint charge was taken. */
  readonly noSafeTile?: true;
  readonly mysteryTier?: MysteryTier;
}

export interface RowResolution extends CurrentRowState {
  readonly index: Decimal;
}

export type DeathCause = 'wrong_tile' | 'mystery' | 'drain' | 'death_clock' | 'idle';
export interface RunPacing {
  readonly rowEnteredAt: number;
  readonly nextSurvivalBonusAt: number;
  readonly hintScanStartedAt?: number;
}
export interface DeathSnapshot {
  readonly id: string;
  readonly sequence: number;
  readonly fatalRow: Decimal;
  readonly cause: DeathCause;
  readonly activeTimeMs: number;
  readonly observedAt: number;
}

export interface PendingReward {
  readonly deathId: string;
  readonly ordinal: number;
  readonly intentId: string;
}

export interface ReviveReceipt {
  readonly deathId: string;
  readonly ordinal: number;
  readonly grantId: string;
  readonly sp: number;
  readonly status: 'granted' | 'applied' | 'forfeited';
}

export type EndReason = 'user-ended' | 'death-declined' | 'revive-limit';
export type TestResource = 'sp' | 'hints' | 'credit' | 'ad';
export interface StoreTestRun {
  readonly assisted: boolean;
  readonly reserveSpent: number;
  readonly hintsSpent: number;
  readonly creditContinues: number;
  readonly adContinues: number;
  readonly sequence: number;
}
export interface RunResult {
  readonly storeTest?: StoreTestRun;
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly lastClearedRow: Decimal;
  readonly fatalRow: Decimal | null;
  readonly deathCause: DeathCause | null;
  readonly endReason: EndReason;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
  readonly achievedAt: number | null;
  readonly endedAt: number;
  readonly activeTimeMs: number;
  readonly sp: number;
  readonly hints: number;
}

/** PRIVATE authoritative/practice state. Never a ranked-client response. */
export interface RunState {
  readonly storeTest?: StoreTestRun;
  readonly schemaVersion: 1;
  readonly rulesetVersion: string;
  readonly runId: string;
  readonly status: 'playing' | 'dead' | 'finished';
  readonly sp: number;
  readonly hints: number;
  readonly lastClearedRow: Decimal;
  /** One-based unresolved row, always lastClearedRow + 1. */
  readonly currentRow: Decimal;
  readonly achievedAt: number | null;
  readonly activeTimeMs: number;
  readonly lastObservedAt: number;
  /** Required by infinity-v2/v3; absent on historical infinity-v1 checkpoints. */
  readonly pacing?: RunPacing;
  readonly effects: readonly ActiveEffect[];
  /** Absent in legacy v1 checkpoints. Only the versioned pact ruleset can use this. */
  readonly pact?: MysteryPact | null;
  readonly mysteryDirector?: MysteryDirector;
  readonly discovery?: MysteryDiscovery;
  readonly buffer: BufferPolicy;
  /** Zero-based index of rows[0], independent of bounded array positions. */
  readonly bufferOffset: Decimal;
  readonly rows: readonly BridgeRow[];
  readonly resolutions: readonly RowResolution[];
  readonly current: CurrentRowState;
  readonly stream: RowStreamState;
  readonly mysteryRng: RandomCursor;
  readonly deaths: number;
  readonly death: DeathSnapshot | null;
  readonly pendingReward: PendingReward | null;
  /** Bounded by this run's versioned continuation limit. */
  readonly reviveReceipts: readonly ReviveReceipt[];
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
  readonly result: RunResult | null;
}

export interface CreateRunOptions {
  /** Trusted practice/profile discoveries. Never accepted from a ranked action. */
  readonly discoveredMysteries?: readonly EffectKind[];
  readonly runId: string;
  readonly routeRng: RandomCursor;
  readonly mysteryRng: RandomCursor;
  /** Injected authority/practice observation timestamp in integer milliseconds. */
  readonly observedAt: number;
  readonly activeTimeMs?: number;
  readonly rulesetVersion?: string;
  readonly buffer?: BufferPolicy;
}

export interface TransitionContext {
  readonly activeTimeMs: number;
  /** Captured as the score's achievedAt on progress only. */
  readonly achievedAt: number;
  readonly rng: RandomSource;
}

export type RunCommand =
  | {
      readonly type: 'choose';
      readonly row: Decimal;
      readonly life: number;
      readonly side: TileSide;
    }
  | { readonly type: 'hint'; readonly row: Decimal; readonly life: number }
  | { readonly type: 'mystery'; readonly row: Decimal; readonly life: number }
  | {
      readonly type: 'pact';
      readonly row: Decimal;
      readonly life: number;
      readonly option: PactOption;
    }
  | { readonly type: 'tick' }
  | {
      readonly type: 'test-resource';
      readonly resource: TestResource;
      readonly amount: number;
      readonly sequence: number;
    }
  | { readonly type: 'end'; readonly forfeitGrantedReward?: boolean }
  | ({ readonly type: 'mark-reward-pending' } & PendingReward)
  | ({ readonly type: 'clear-reward-pending' } & PendingReward)
  | {
      readonly type: 'grant-revive';
      readonly deathId: string;
      readonly ordinal: number;
      readonly grantId: string;
      /** Must match an existing pending marker, if any. */
      readonly intentId?: string;
    }
  | {
      readonly type: 'apply-revive';
      readonly deathId: string;
      readonly ordinal: number;
      readonly grantId: string;
    };

export type RejectionReason =
  | 'finished'
  | 'not-playing'
  | 'not-dead'
  | 'wrong-row'
  | 'wrong-life'
  | 'no-hints'
  | 'already-revealed'
  | 'no-mystery'
  | 'mystery-consumed'
  | 'pact-decision-required'
  | 'invalid-pact-choice'
  | 'oracle-blocks-hints'
  | 'died-before-command'
  | 'wrong-death'
  | 'wrong-revive-ordinal'
  | 'revive-limit'
  | 'duplicate-revive'
  | 'reward-pending'
  | 'wrong-reward-intent'
  | 'reward-already-granted'
  | 'missing-grant'
  | 'grant-mismatch'
  | 'forfeiture-required'
  | 'test-only'
  | 'invalid-resource'
  | 'resource-limit';

interface EventTime {
  readonly activeTimeMs: number;
  readonly observedAt: number;
}

export type RunEvent = EventTime &
  (
    | {
        readonly type: 'effects-ticked';
        readonly delta: number;
        readonly appliedDelta?: number;
        readonly sp: number;
      }
    | { readonly type: 'effects-expired'; readonly kinds: readonly ActiveEffect['kind'][] }
    | {
        readonly type: 'row-effect-ticked';
        readonly kind: RowEffectKind;
        readonly delta: number;
        readonly sp: number;
        readonly rowsLeft: number;
      }
    | {
        readonly type: 'survival-bonus';
        readonly amount: number;
        readonly spDelta: number;
        readonly sp: number;
        readonly minute: number;
      }
    | {
        readonly type: 'test-resource-used';
        readonly resource: TestResource;
        readonly amount: number;
      }
    | { readonly type: 'hint-used'; readonly row: Decimal; readonly safeSide: TileSide }
    | { readonly type: 'hint-unavailable'; readonly row: Decimal }
    | { readonly type: 'death-clock-ticked'; readonly delta: number; readonly sp: number }
    | {
        readonly type: 'pact-resolved';
        readonly kind: PactKind;
        readonly option: PactOption | 'step';
        readonly outcome:
          'accepted' | 'declined' | 'won' | 'lost' | 'banked' | 'paid' | 'traded' | 'expired';
        readonly spDelta: number;
        readonly hintDelta: number;
        readonly bank: number;
      }
    | {
        readonly type: 'mystery-resolved';
        readonly row: Decimal;
        readonly kind: EffectKind;
        readonly spDelta: number;
        readonly hintDelta: number;
      }
    | {
        readonly type: 'choice-resolved';
        readonly row: Decimal;
        readonly side: TileSide;
        readonly wrong: boolean;
        readonly spDelta: number;
        readonly consumedKind: TimedEffectKind | null;
        readonly protectedBy?: 'coyote_10s';
      }
    | { readonly type: 'row-cleared'; readonly row: Decimal; readonly revivesToReachScore: number }
    | { readonly type: 'death'; readonly death: DeathSnapshot }
    | { readonly type: 'run-ended'; readonly result: RunResult }
    | { readonly type: 'reward-pending'; readonly reward: PendingReward }
    | { readonly type: 'reward-cleared'; readonly intentId: string }
    | { readonly type: 'revive-granted'; readonly receipt: ReviveReceipt }
    | { readonly type: 'revive-applied'; readonly receipt: ReviveReceipt }
  );

export interface TransitionResult {
  readonly state: RunState;
  readonly events: readonly RunEvent[];
  readonly accepted: boolean;
  readonly reason: RejectionReason | null;
}
