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
  | 'inversion_5s';

export type TimedEffectKind = Extract<EffectKind, `${string}_5s`>;

export interface ActiveEffect {
  readonly kind: TimedEffectKind;
  readonly startedAt: number;
  readonly expiresAt: number;
  /** Per-instance active-time schedule; null for effects without periodic SP changes. */
  readonly nextTickAt: number | null;
}

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
  readonly safeSide: TileSide;
  readonly hasMystery: boolean;
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
}

export interface RowResolution extends CurrentRowState {
  readonly index: Decimal;
}

export type DeathCause = 'wrong_tile' | 'mystery' | 'drain';
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
export interface RunResult {
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
  readonly effects: readonly ActiveEffect[];
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
  /** At most ten records, retained to reject late duplicate grants/restores. */
  readonly reviveReceipts: readonly ReviveReceipt[];
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
  readonly result: RunResult | null;
}

export interface CreateRunOptions {
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
  | { readonly type: 'tick' }
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
  | 'forfeiture-required';

interface EventTime {
  readonly activeTimeMs: number;
  readonly observedAt: number;
}

export type RunEvent = EventTime &
  (
    | { readonly type: 'effects-ticked'; readonly delta: number; readonly sp: number }
    | { readonly type: 'effects-expired'; readonly kinds: readonly TimedEffectKind[] }
    | { readonly type: 'hint-used'; readonly row: Decimal; readonly safeSide: TileSide }
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
