import type { AccountSessionOwner } from '../account/session-owner';
import {
  BALANCE_PACT_KINDS,
  usesBalanceRules,
  usesRiskRules,
  usesMysteryDirectorRules,
  usesDiscoveryRules,
  assertDiscovery,
  MYSTERY_TIERS,
  getRuleset,
  supportsPacts,
  assertActiveEffects,
  PACT_OPTIONS,
  VAULT_PAYOUTS,
  usesBusinessRules,
  LIVE_RULESET_VERSION,
} from '@crystal-path-infinity/game-core';
import type {
  ActiveEffect,
  MysteryPact,
  PactKind,
  PactOption,
  TimedEffectKind,
  MysteryTier,
  MysteryRhythm,
  MysteryDiscovery,
} from '@crystal-path-infinity/game-core';
import { canRecheckOperation, parseOperationFailure } from '../operations/operation-failure.ts';
import type { OperationFailure } from '../operations/operation-failure';
import {
  PACED_RULESET_VERSION,
  SCAN_RULESET_VERSION,
  HINT_SCAN_MS,
  ROW_GRACE_MS,
  DEATH_CLOCK_MS,
  SURVIVAL_BONUS_INTERVAL_MS,
} from '@crystal-path-infinity/game-core';

export type RankedSide = 'left' | 'right';
export type RankedCommand =
  | {
      readonly type: 'choose';
      readonly side: RankedSide;
      readonly row: string;
      readonly life: number;
    }
  | { readonly type: 'hint' | 'mystery'; readonly row: string; readonly life: number }
  | {
      readonly type: 'pact';
      readonly row: string;
      readonly life: number;
      readonly option: PactOption;
    }
  | { readonly type: 'heartbeat' | 'pause' | 'resume' | 'end' };
export interface RankedCurrent {
  readonly revealedSafeSide: RankedSide | null;
  readonly mysteryOutcome: string | null;
  readonly lastChoice: { readonly side: RankedSide; readonly wrong: boolean } | null;
  readonly noSafeTile?: true;
  readonly mysteryTier?: MysteryTier;
}
export interface RankedRun {
  readonly economy?: {
    readonly assisted: boolean;
    readonly reserveSpent: number;
    readonly hintsSpent: number;
    readonly creditContinues: number;
    readonly adContinues: number;
  };
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly status: 'playing' | 'dead' | 'finished';
  readonly region: {
    readonly countryCode: string | null;
    readonly continent: string | null;
    readonly mappingVersion: string;
  };
  readonly nextSequence: string;
  readonly lastClearedRow: string;
  readonly currentRow: string;
  readonly sp: number;
  readonly hints: number;
  readonly activeTimeMs: number;
  readonly pacing?: {
    readonly rowEnteredAt: number;
    readonly nextSurvivalBonusAt: number;
    readonly hintScanStartedAt?: number;
  };
  readonly achievedAt: number | null;
  readonly paused: boolean;
  readonly current: RankedCurrent & { readonly hasMystery: boolean };
  readonly history: readonly (RankedCurrent & { readonly index: string })[];
  readonly effects: readonly ActiveEffect[];
  readonly pact?: MysteryPact | null;
  readonly mysteryRhythm?: MysteryRhythm | null;
  readonly discovery?: MysteryDiscovery;
  readonly deathClock?: {
    readonly warningAt: number;
    readonly expiresAt: number;
    readonly firstLossAt?: number;
  } | null;
  readonly death: {
    readonly id: string;
    readonly fatalRow: string;
    readonly cause: 'wrong_tile' | 'mystery' | 'drain' | 'death_clock' | 'idle';
  } | null;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
  readonly rewardPending: boolean;
}
interface RankedReply {
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly snapshot: RankedRun;
  readonly lease: {
    readonly token: string;
    readonly generation: string;
    readonly expiresAt: number;
  };
}
export type RankedClientPhase =
  | 'unavailable'
  | 'idle'
  | 'ready'
  | 'pending'
  | 'retry'
  | 'offline'
  | 'recovery'
  | 'lease_lost'
  | 'blocked'
  | 'error'
  | 'finished';
export interface RankedClientState {
  readonly phase: RankedClientPhase;
  readonly run: RankedRun | null;
  readonly online: boolean;
  readonly canRetry: boolean;
  readonly rejected: boolean;
  readonly problem?: OperationFailure | null;
}
export interface RankedClient {
  snapshot(): RankedClientState;
  subscribe(observer: () => void): () => void;
  start(): Promise<void>;
  lookupActive(): Promise<string | null>;
  command(command: RankedCommand): Promise<void>;
  spendResource?(resource: 'sp' | 'hints' | 'credit', amount: number): Promise<boolean>;
  /** Explicit use of a server-verified grant; never accepts SP or client proof. */
  applyVerifiedGrant(grantId: string, expectedRunId: string): Promise<boolean>;
  /** Explicitly detach a dead pending/granted run while retaining its server reward. */
  archivePending(expectedRunId: string): Promise<boolean>;
  retry(): Promise<void>;
  recover(runId: string, takeover?: boolean): Promise<void>;
  setOnline(online: boolean): void;
  /** Synchronous privacy fence, also invoked by session invalidation. */
  clear(): void;
  dispose(): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[A-Za-z0-9._-]{1,80}$/;
const CONTINENTS = ['AF', 'AS', 'EU', 'NA', 'SA', 'OC', 'AN'];
const EFFECTS = [
  'heal_10',
  'heal_20',
  'gain_hint',
  'shield_5s',
  'regen_5s',
  'lucky_5s',
  'hurt_10',
  'hurt_15',
  'lose_hint',
  'fragility_5s',
  'drain_5s',
  'inversion_5s',
  ...BALANCE_PACT_KINDS,
  'double_gain_21s',
  'double_loss_21s',
  'regen_3rows',
  'bleed_3rows',
  'coyote_10s',
  'mystery_silence_30s',
  'mystery_surge_30s',
];
const REASONS = new Set([
  'finished',
  'not-playing',
  'not-dead',
  'wrong-row',
  'wrong-life',
  'no-hints',
  'already-revealed',
  'no-mystery',
  'mystery-consumed',
  'pact-decision-required',
  'invalid-pact-choice',
  'oracle-blocks-hints',
  'died-before-command',
  'wrong-death',
  'wrong-revive-ordinal',
  'revive-limit',
  'duplicate-revive',
  'reward-pending',
  'wrong-reward-intent',
  'reward-already-granted',
  'missing-grant',
  'grant-mismatch',
  'forfeiture-required',
  'invalid-resource',
  'resource-limit',
]);

function object(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key) || optional.includes(key))
  );
}

function points(value: unknown, version: string): value is number {
  return (
    typeof value === 'number' &&
    value >= 0 &&
    Number.isSafeInteger(usesBusinessRules(version) ? value * 2 : value)
  );
}
function decimal(value: unknown, positive = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 1000 &&
    (positive ? /^[1-9][0-9]*$/ : /^(0|[1-9][0-9]*)$/).test(value)
  );
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function side(value: unknown): value is RankedSide {
  return value === 'left' || value === 'right';
}
function visibleCurrent(
  value: unknown,
  extraKeys: readonly string[] = [],
  riskRules = false,
  directorRules = false,
): RankedCurrent | null {
  const hasNoSafeTile =
    riskRules && value !== null && typeof value === 'object' && 'noSafeTile' in value;
  const hasTier =
    directorRules && value !== null && typeof value === 'object' && 'mysteryTier' in value;
  if (
    !object(value, [
      'revealedSafeSide',
      'mysteryOutcome',
      'lastChoice',
      ...extraKeys,
      ...(hasNoSafeTile ? ['noSafeTile'] : []),
      ...(hasTier ? ['mysteryTier'] : []),
    ]) ||
    ('noSafeTile' in value && (value.noSafeTile !== true || value.revealedSafeSide !== null)) ||
    ('mysteryTier' in value &&
      !(MYSTERY_TIERS as readonly unknown[]).includes(value.mysteryTier)) ||
    (value.revealedSafeSide !== null && !side(value.revealedSafeSide)) ||
    (value.mysteryOutcome !== null &&
      (typeof value.mysteryOutcome !== 'string' || !EFFECTS.includes(value.mysteryOutcome)))
  )
    return null;
  const choice = value.lastChoice;
  if (
    choice !== null &&
    (!object(choice, ['side', 'wrong']) || !side(choice.side) || typeof choice.wrong !== 'boolean')
  )
    return null;
  return {
    revealedSafeSide: value.revealedSafeSide,
    ...('noSafeTile' in value ? { noSafeTile: true as const } : {}),
    ...('mysteryTier' in value ? { mysteryTier: value.mysteryTier as MysteryTier } : {}),
    mysteryOutcome: value.mysteryOutcome,
    lastChoice:
      choice === null
        ? null
        : {
            side: (choice as { side: RankedSide }).side,
            wrong: (choice as { wrong: boolean }).wrong,
          },
  };
}

/** Strict allowlisted public wire schema. Private fields invalidate the entire reply. */
export function parseRankedReply(value: unknown): RankedReply | null {
  if (
    !object(value, ['accepted', 'reason', 'snapshot', 'lease']) ||
    typeof value.accepted !== 'boolean' ||
    (value.reason !== null && (typeof value.reason !== 'string' || !REASONS.has(value.reason))) ||
    value.accepted !== (value.reason === null)
  )
    return null;
  const raw = value.snapshot;
  const version =
    raw && typeof raw === 'object' ? String((raw as Record<string, unknown>).rulesetVersion) : '';
  const live = version === LIVE_RULESET_VERSION,
    maxRevives = live ? 15 : 10;
  const directorRules =
    raw !== null &&
    typeof raw === 'object' &&
    usesMysteryDirectorRules(String((raw as Record<string, unknown>).rulesetVersion));
  const discoveryRules =
    raw !== null &&
    typeof raw === 'object' &&
    usesDiscoveryRules(String((raw as Record<string, unknown>).rulesetVersion));
  const usesPacts =
    raw !== null &&
    typeof raw === 'object' &&
    supportsPacts(String((raw as Record<string, unknown>).rulesetVersion));
  const lease = value.lease;
  if (
    !object(
      raw,
      [
        'runId',
        'rulesetVersion',
        'status',
        'region',
        'nextSequence',
        'lastClearedRow',
        'currentRow',
        'sp',
        'hints',
        'activeTimeMs',
        'achievedAt',
        'paused',
        'current',
        'history',
        'effects',
        'death',
        'revivesGranted',
        'revivesApplied',
        'revivesToReachScore',
        'rewardPending',
        ...(usesPacts ? ['pact'] : []),
        ...(directorRules ? ['mysteryRhythm', 'deathClock'] : []),
        ...(discoveryRules ? ['discovery'] : []),
        ...(live ? ['economy'] : []),
      ],
      ['pacing'],
    ) ||
    !object(lease, ['token', 'generation', 'expiresAt']) ||
    typeof lease.token !== 'string' ||
    !UUID.test(lease.token) ||
    !decimal(lease.generation, true) ||
    !integer(lease.expiresAt) ||
    typeof raw.runId !== 'string' ||
    !UUID.test(raw.runId) ||
    typeof raw.rulesetVersion !== 'string' ||
    !VERSION.test(raw.rulesetVersion) ||
    !['playing', 'dead', 'finished'].includes(String(raw.status)) ||
    !decimal(raw.nextSequence, true) ||
    !decimal(raw.lastClearedRow) ||
    !decimal(raw.currentRow, true) ||
    BigInt(raw.currentRow) !== BigInt(raw.lastClearedRow) + 1n ||
    !points(raw.sp, version) ||
    !integer(raw.hints) ||
    !integer(raw.activeTimeMs) ||
    (raw.achievedAt !== null && !integer(raw.achievedAt)) ||
    typeof raw.paused !== 'boolean' ||
    typeof raw.rewardPending !== 'boolean' ||
    !integer(raw.revivesGranted, maxRevives) ||
    !integer(raw.revivesApplied, raw.revivesGranted) ||
    !integer(raw.revivesToReachScore, raw.revivesApplied) ||
    !Array.isArray(raw.history) ||
    raw.history.length > 2 ||
    !Array.isArray(raw.effects) ||
    raw.effects.length > 2
  )
    return null;
  let economy: RankedRun['economy'];
  if (live) {
    const e = raw.economy;
    if (
      !object(e, ['assisted', 'reserveSpent', 'hintsSpent', 'creditContinues', 'adContinues']) ||
      typeof e.assisted !== 'boolean' ||
      !integer(e.reserveSpent, 200) ||
      !integer(e.hintsSpent) ||
      !integer(e.creditContinues, 15) ||
      !integer(e.adContinues, 10) ||
      e.creditContinues + e.adContinues !== raw.revivesApplied ||
      e.assisted !== (e.reserveSpent > 0 || e.hintsSpent > 0 || e.creditContinues > 0)
    )
      return null;
    economy = {
      assisted: e.assisted,
      reserveSpent: e.reserveSpent,
      hintsSpent: e.hintsSpent,
      creditContinues: e.creditContinues,
      adContinues: e.adContinues,
    };
  }
  const pacing = raw.pacing;
  if (raw.rulesetVersion === PACED_RULESET_VERSION || raw.rulesetVersion === SCAN_RULESET_VERSION) {
    if (
      !object(
        pacing,
        ['rowEnteredAt', 'nextSurvivalBonusAt'],
        raw.rulesetVersion === SCAN_RULESET_VERSION ? ['hintScanStartedAt'] : [],
      ) ||
      !integer(pacing.rowEnteredAt) ||
      !integer(pacing.nextSurvivalBonusAt) ||
      pacing.rowEnteredAt > raw.activeTimeMs ||
      pacing.nextSurvivalBonusAt < raw.activeTimeMs ||
      pacing.nextSurvivalBonusAt % SURVIVAL_BONUS_INTERVAL_MS !== 0 ||
      (raw.status === 'playing' &&
        (pacing.rowEnteredAt +
          ROW_GRACE_MS +
          DEATH_CLOCK_MS +
          (pacing.hintScanStartedAt === undefined ? 0 : HINT_SCAN_MS) <=
          raw.activeTimeMs ||
          pacing.nextSurvivalBonusAt === raw.activeTimeMs))
    )
      return null;
    if (
      pacing.hintScanStartedAt !== undefined &&
      (!integer(pacing.hintScanStartedAt) ||
        pacing.hintScanStartedAt < pacing.rowEnteredAt ||
        pacing.hintScanStartedAt > raw.activeTimeMs)
    )
      return null;
  } else if (pacing !== undefined) return null;
  const region = raw.region;
  if (
    !object(region, ['countryCode', 'continent', 'mappingVersion']) ||
    typeof region.mappingVersion !== 'string' ||
    !VERSION.test(region.mappingVersion) ||
    !(
      (region.countryCode === null && region.continent === null) ||
      (typeof region.countryCode === 'string' &&
        /^[A-Z]{2}$/.test(region.countryCode) &&
        typeof region.continent === 'string' &&
        CONTINENTS.includes(region.continent))
    )
  )
    return null;
  const riskRules = usesRiskRules(raw.rulesetVersion);
  const current = visibleCurrent(raw.current, ['hasMystery'], riskRules, directorRules);
  if (!current || typeof (raw.current as Record<string, unknown>).hasMystery !== 'boolean')
    return null;
  if (pacing && pacing.hintScanStartedAt !== undefined && current.revealedSafeSide === null)
    return null;
  const history: (RankedCurrent & { index: string })[] = [];
  for (const entry of raw.history) {
    const visible = visibleCurrent(entry, ['index'], riskRules, directorRules);
    if (!visible || !decimal((entry as Record<string, unknown>).index)) return null;
    const index = (entry as { index: string }).index;
    if (
      BigInt(index) >= BigInt(raw.lastClearedRow) ||
      (history.length > 0 && BigInt(index) !== BigInt(history.at(-1)!.index) + 1n)
    )
      return null;
    history.push({ ...visible, index });
  }
  let pact: MysteryPact | null = null;
  if (usesPacts && raw.pact !== null) {
    const candidate = raw.pact;
    if (
      !object(candidate, [
        'kind',
        'phase',
        'rowsLeft',
        'bank',
        'omen',
        ...(directorRules ? ['offeredAt'] : []),
      ]) ||
      (directorRules &&
        (!integer(candidate.offeredAt) || candidate.offeredAt > raw.activeTimeMs)) ||
      typeof candidate.kind !== 'string' ||
      !(BALANCE_PACT_KINDS as readonly string[]).includes(candidate.kind) ||
      !['offered', 'active'].includes(String(candidate.phase)) ||
      !integer(candidate.rowsLeft, 3) ||
      !integer(candidate.bank, 85) ||
      !(candidate.omen === null || side(candidate.omen)) ||
      raw.status !== 'playing'
    )
      return null;
    if (candidate.phase === 'offered') {
      if (
        candidate.rowsLeft !== 0 ||
        candidate.bank !== 0 ||
        candidate.omen !== null ||
        current.mysteryOutcome !== candidate.kind
      )
        return null;
    } else {
      if (
        candidate.rowsLeft < 1 ||
        ['soul_exchange', 'half_life', 'marketing'].includes(candidate.kind) ||
        (candidate.kind === 'hungry_vault'
          ? candidate.bank !== VAULT_PAYOUTS[3 - candidate.rowsLeft]
          : candidate.bank !== 0) ||
        (candidate.kind === 'false_oracle' ? !side(candidate.omen) : candidate.omen !== null)
      )
        return null;
    }
    pact = {
      kind: candidate.kind as PactKind,
      phase: candidate.phase as MysteryPact['phase'],
      rowsLeft: candidate.rowsLeft,
      bank: candidate.bank,
      omen: candidate.omen,
      ...(directorRules ? { offeredAt: candidate.offeredAt as number } : {}),
    };
  }
  if (
    !usesPacts &&
    [current, ...history].some(
      (row) =>
        row.mysteryOutcome !== null &&
        (BALANCE_PACT_KINDS as readonly string[]).includes(row.mysteryOutcome),
    )
  )
    return null;
  const effects: ActiveEffect[] = [];
  for (const effect of raw.effects) {
    const rowEffect =
      effect !== null &&
      typeof effect === 'object' &&
      ['regen_3rows', 'bleed_3rows'].includes(String((effect as Record<string, unknown>).kind));
    if (
      !object(effect, [
        'kind',
        'startedAt',
        'expiresAt',
        'nextTickAt',
        ...(rowEffect ? ['rowsLeft'] : []),
      ]) ||
      typeof effect.kind !== 'string' ||
      !EFFECTS.includes(effect.kind) ||
      !integer(effect.startedAt)
    )
      return null;
    if (rowEffect) {
      if (
        effect.expiresAt !== null ||
        effect.nextTickAt !== null ||
        !integer(effect.rowsLeft, 3) ||
        effect.rowsLeft === 0
      )
        return null;
      effects.push({
        kind: effect.kind as 'regen_3rows' | 'bleed_3rows',
        startedAt: effect.startedAt,
        expiresAt: null,
        nextTickAt: null,
        rowsLeft: effect.rowsLeft,
      });
    } else {
      if (!integer(effect.expiresAt) || (effect.nextTickAt !== null && !integer(effect.nextTickAt)))
        return null;
      effects.push({
        kind: effect.kind as TimedEffectKind,
        startedAt: effect.startedAt,
        expiresAt: effect.expiresAt,
        nextTickAt: effect.nextTickAt,
      });
    }
  }
  try {
    const rules = getRuleset(raw.rulesetVersion);
    if (rules.maxSp !== null && raw.sp > rules.maxSp) return null;
    const outcomes = new Set(rules.mysteryTable.map((entry) => entry.kind as string));
    if (
      [current, ...history].some(
        (row) => row.mysteryOutcome !== null && !outcomes.has(row.mysteryOutcome),
      )
    )
      return null;
    if (
      pact &&
      ['half_life', 'marketing'].includes(pact.kind) &&
      !usesBalanceRules(raw.rulesetVersion)
    )
      return null;
    assertActiveEffects(effects, raw.activeTimeMs, raw.rulesetVersion);
  } catch {
    return null;
  }
  let rhythm: MysteryRhythm | null = null;
  let discovery: MysteryDiscovery | undefined;
  if (discoveryRules) {
    const value = raw.discovery;
    if (
      !object(value, ['known', 'introduction']) ||
      (value.introduction !== null &&
        !object(value.introduction, ['kind', 'startedAt', 'expiresAt']))
    )
      return null;
    try {
      assertDiscovery(value as unknown as MysteryDiscovery, raw.activeTimeMs);
    } catch {
      return null;
    }
    discovery = {
      known: [...(value.known as MysteryDiscovery['known'])],
      introduction:
        value.introduction === null
          ? null
          : { ...(value.introduction as NonNullable<MysteryDiscovery['introduction']>) },
    };
    if (
      discovery.introduction &&
      (raw.status !== 'playing' ||
        pact?.phase === 'offered' ||
        current.mysteryOutcome !== discovery.introduction.kind)
    )
      return null;
  }
  let deathClock: RankedRun['deathClock'] = null;
  if (directorRules) {
    if (raw.mysteryRhythm !== null) {
      const item = raw.mysteryRhythm;
      if (
        !object(item, ['kind', 'startedAt', 'expiresAt']) ||
        !['mystery_silence_30s', 'mystery_surge_30s'].includes(String(item.kind)) ||
        !integer(item.startedAt) ||
        !integer(item.expiresAt) ||
        item.expiresAt - item.startedAt !== 30000 ||
        item.startedAt > raw.activeTimeMs
      )
        return null;
      rhythm = {
        kind: item.kind as MysteryRhythm['kind'],
        startedAt: item.startedAt,
        expiresAt: item.expiresAt,
      };
    }
    if (raw.status === 'playing') {
      const item = raw.deathClock;
      if (
        !object(item, [
          'warningAt',
          'expiresAt',
          ...(usesBusinessRules(version) ? ['firstLossAt'] : []),
        ]) ||
        !integer(item.warningAt) ||
        !integer(item.expiresAt) ||
        item.expiresAt - item.warningAt !== 10000 ||
        (usesBusinessRules(version) && item.firstLossAt !== item.warningAt + 3000) ||
        item.expiresAt <= raw.activeTimeMs ||
        (pact?.phase === 'offered' && item.warningAt !== pact.offeredAt! + 60000) ||
        (discovery?.introduction && item.warningAt !== discovery.introduction.expiresAt + 3000)
      )
        return null;
      deathClock = {
        warningAt: item.warningAt,
        expiresAt: item.expiresAt,
        ...(usesBusinessRules(version) ? { firstLossAt: item.firstLossAt as number } : {}),
      };
    } else if (raw.deathClock !== null) return null;
  }
  const death = raw.death;
  if (
    death !== null &&
    (!object(death, ['id', 'fatalRow', 'cause']) ||
      typeof death.id !== 'string' ||
      death.id.length < 1 ||
      death.id.length > 120 ||
      !/^[A-Za-z0-9:_-]+$/.test(death.id) ||
      !decimal(death.fatalRow, true) ||
      ![
        'wrong_tile',
        'mystery',
        'drain',
        ...(directorRules ? ['death_clock'] : []),
        ...([PACED_RULESET_VERSION, SCAN_RULESET_VERSION].includes(String(raw.rulesetVersion))
          ? ['idle']
          : []),
      ].includes(String(death.cause)))
  )
    return null;
  if (
    (raw.status === 'playing' && (raw.sp === 0 || death !== null || raw.rewardPending)) ||
    (raw.status === 'dead' &&
      (raw.sp !== 0 || death === null || raw.revivesApplied >= maxRevives)) ||
    (raw.rewardPending && raw.status !== 'dead') ||
    (death !== null && (death as { fatalRow: string }).fatalRow !== raw.currentRow) ||
    (raw.lastClearedRow !== '0' && raw.achievedAt === null)
  )
    return null;
  return {
    accepted: value.accepted,
    reason: value.reason,
    lease: { token: lease.token, generation: lease.generation, expiresAt: lease.expiresAt },
    snapshot: {
      runId: raw.runId,
      rulesetVersion: raw.rulesetVersion,
      status: raw.status as RankedRun['status'],
      region: {
        countryCode: region.countryCode,
        continent: region.continent,
        mappingVersion: region.mappingVersion,
      },
      nextSequence: raw.nextSequence,
      lastClearedRow: raw.lastClearedRow,
      currentRow: raw.currentRow,
      sp: raw.sp,
      hints: raw.hints,
      activeTimeMs: raw.activeTimeMs,
      ...(pacing
        ? {
            pacing: {
              rowEnteredAt: (pacing as NonNullable<RankedRun['pacing']>).rowEnteredAt,
              nextSurvivalBonusAt: (pacing as NonNullable<RankedRun['pacing']>).nextSurvivalBonusAt,
              ...((pacing as NonNullable<RankedRun['pacing']>).hintScanStartedAt === undefined
                ? {}
                : {
                    hintScanStartedAt: (pacing as NonNullable<RankedRun['pacing']>)
                      .hintScanStartedAt,
                  }),
            },
          }
        : {}),
      achievedAt: raw.achievedAt,
      paused: raw.paused,
      current: { ...current, hasMystery: (raw.current as { hasMystery: boolean }).hasMystery },
      ...(directorRules ? { mysteryRhythm: rhythm, deathClock } : {}),
      ...(discoveryRules ? { discovery } : {}),
      history,
      effects,
      ...(usesPacts ? { pact } : {}),
      death:
        death === null
          ? null
          : {
              id: (death as { id: string }).id,
              fatalRow: (death as { fatalRow: string }).fatalRow,
              cause: (death as { cause: NonNullable<RankedRun['death']>['cause'] }).cause,
            },
      revivesGranted: raw.revivesGranted,
      revivesApplied: raw.revivesApplied,
      revivesToReachScore: raw.revivesToReachScore,
      rewardPending: raw.rewardPending,
      ...(economy ? { economy } : {}),
    },
  };
}

interface PendingRequest {
  readonly route:
    'start' | 'action' | 'recover' | 'active' | 'reward_apply' | 'archive' | 'resource';
  readonly body: string;
  readonly runId: string | null;
  readonly grantId?: string;
}
async function readPublicReply(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ranked-unavailable');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 32768) {
        await reader.cancel();
        throw new Error('ranked-unavailable');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    reader.releaseLock();
  }
}
type Session = Pick<
  AccountSessionOwner,
  'withAccountRequest' | 'accountScope' | 'subscribeAccountScope'
>;
export interface RankedClientOptions {
  readonly baseUrl: string | undefined;
  readonly session: Session;
  readonly fetcher?: typeof fetch;
  readonly newId?: () => string;
  readonly online?: boolean;
}

/** No automatic start, storage, account capture or local-practice state import. */
export function createRankedClient(options: RankedClientOptions): RankedClient | null {
  if (!options.baseUrl) return null;
  let base: URL;
  try {
    base = new URL(options.baseUrl);
  } catch {
    return null;
  }
  if (
    base.protocol !== 'https:' ||
    !base.hostname ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    /\/(auth|rest)\/v1/.test(base.pathname)
  )
    return null;
  const path = base.pathname.replace(/\/$/, '');
  if (path !== '' && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(path)) return null;
  const endpoint = base.origin + path + '/ranked/';
  const fetcher = options.fetcher ?? fetch;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const observers = new Set<() => void>();
  let account = options.session.accountScope();
  let epoch: object = {};
  let latest: RankedReply | null = null;
  let discoveredRunId: string | null = null;
  let pending: PendingRequest | null = null;
  let flight: AbortController | null = null;
  let online = options.online ?? true;
  let phase: RankedClientPhase = 'idle';
  let rejected = false;
  let problem: OperationFailure | null = null;
  let disposed = false;
  const notify = () => {
    for (const observer of observers) {
      try {
        observer();
      } catch {
        /* An observer cannot bypass a state fence. */
      }
    }
  };
  const clear = () => {
    epoch = {};
    flight?.abort();
    flight = null;
    latest = null;
    discoveredRunId = null;
    pending = null;
    phase = 'idle';
    rejected = false;
    problem = null;
    notify();
  };
  const syncAccount = () => {
    const current = options.session.accountScope();
    if (current !== account) {
      account = current;
      clear();
    }
    return current;
  };
  const unsubscribe = options.session.subscribeAccountScope(() => {
    syncAccount();
    notify();
  });
  const grantRestored = (scope: object, runId: string): boolean =>
    scope === options.session.accountScope() &&
    latest?.snapshot.runId === runId &&
    latest.snapshot.status === 'playing' &&
    phase === 'ready';
  const runArchived = (scope: object): boolean =>
    scope === options.session.accountScope() &&
    latest === null &&
    pending === null &&
    phase === 'idle';
  const client: RankedClient = {
    async spendResource(resource, amount) {
      syncAccount();
      if (
        !latest ||
        latest.snapshot.rulesetVersion !== LIVE_RULESET_VERSION ||
        pending ||
        flight ||
        phase !== 'ready' ||
        !online ||
        !account ||
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 200
      )
        return false;
      const owner = account,
        run = latest.snapshot;
      pending = {
        route: 'resource',
        runId: run.runId,
        body: JSON.stringify({
          schemaVersion: 1,
          runId: run.runId,
          idempotencyKey: newId(),
          sequence: run.nextSequence,
          leaseToken: latest.lease.token,
          leaseGeneration: latest.lease.generation,
          row: run.currentRow,
          life: run.revivesApplied,
          resource,
          amount,
        }),
      };
      await send(pending);
      return (
        owner === options.session.accountScope() &&
        latest?.snapshot.runId === run.runId &&
        phase === 'ready' &&
        !rejected &&
        !pending
      );
    },
    snapshot() {
      const scope = syncAccount();
      return {
        phase:
          disposed || !scope ? 'unavailable' : !online ? 'offline' : flight ? 'pending' : phase,
        run: scope && !disposed && latest ? structuredClone(latest.snapshot) : null,
        online,
        canRetry: !!scope && !!pending && !flight && online && canRecheckOperation(problem),
        rejected,
        problem,
      };
    },
    subscribe(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    async start() {
      if ((latest && latest.snapshot.status !== 'finished') || pending || flight) return;
      const id = newId();
      if (!UUID.test(id)) return;
      pending = { route: 'start', body: JSON.stringify({ idempotencyKey: id }), runId: null };
      await send(pending);
    },
    async lookupActive() {
      syncAccount();
      if (flight || pending || !online || !account) return null;
      discoveredRunId = null;
      pending = { route: 'active', body: '{}', runId: null };
      await send(pending);
      return discoveredRunId;
    },
    async command(command) {
      syncAccount();
      if (!latest || pending || flight || !online || !account || phase !== 'ready') return;
      if (command === null || typeof command !== 'object' || Array.isArray(command)) return;
      const snapshot = latest.snapshot;
      const type = command.type;
      let safe: RankedCommand;
      if (type === 'choose' || type === 'hint' || type === 'mystery' || type === 'pact') {
        if (
          !object(
            command,
            type === 'choose'
              ? ['type', 'side', 'row', 'life']
              : type === 'pact'
                ? ['type', 'row', 'life', 'option']
                : ['type', 'row', 'life'],
          ) ||
          command.row !== snapshot.currentRow ||
          command.life !== snapshot.revivesApplied ||
          snapshot.status !== 'playing' ||
          snapshot.paused
        )
          return;
        if (type === 'choose' && !side(command.side)) return;
        if (type === 'pact' && !(PACT_OPTIONS as readonly string[]).includes(command.option))
          return;
        safe =
          type === 'choose'
            ? { type, row: command.row, life: command.life, side: command.side }
            : type === 'pact'
              ? { type, row: command.row, life: command.life, option: command.option }
              : { type, row: command.row, life: command.life };
      } else {
        if (!object(command, ['type']) || !['heartbeat', 'pause', 'resume', 'end'].includes(type))
          return;
        safe = { type };
      }
      const id = newId();
      if (!UUID.test(id)) return;
      pending = {
        route: 'action',
        body: JSON.stringify({
          runId: snapshot.runId,
          sequence: snapshot.nextSequence,
          idempotencyKey: id,
          leaseToken: latest.lease.token,
          command: safe,
        }),
        runId: snapshot.runId,
      };
      await send(pending);
    },
    async retry() {
      if (pending && !flight && online && canRecheckOperation(problem)) await send(pending);
    },
    async applyVerifiedGrant(grantId, expectedRunId) {
      const scope = syncAccount();
      if (
        !scope ||
        disposed ||
        !online ||
        flight ||
        !latest ||
        !UUID.test(grantId) ||
        expectedRunId !== latest.snapshot.runId
      )
        return false;
      const runId = latest.snapshot.runId;
      if (pending?.route === 'reward_apply') {
        if (pending.runId !== runId || pending.grantId !== grantId) return false;
        if (!canRecheckOperation(problem)) return false;
        await send(pending);
        return grantRestored(scope, runId);
      }
      let recovered = false;
      if (pending) {
        // Preserve an uncertain recovery request too. Never overwrite a possibly
        // committed action/application with a newly minted idempotency key.
        if (pending.route !== 'recover' || pending.runId !== runId || !canRecheckOperation(problem))
          return false;
        await send(pending);
        if (pending) return false;
        recovered = true;
      }
      // An ad/SSV delay may outlast the 60-second lease. Renew only the same
      // device; another device's ownership requires the visible takeover flow.
      if (!recovered) await client.recover(runId, false);
      syncAccount();
      if (
        scope !== account ||
        !latest ||
        latest.snapshot.runId !== runId ||
        phase !== 'ready' ||
        pending ||
        flight
      )
        return false;
      if (latest.snapshot.status === 'playing') return true;
      if (
        latest.snapshot.status !== 'dead' ||
        latest.snapshot.rewardPending ||
        latest.snapshot.revivesGranted <= latest.snapshot.revivesApplied
      )
        return false;
      const key = newId();
      if (!UUID.test(key)) return false;
      pending = {
        route: 'reward_apply',
        runId,
        grantId,
        body: JSON.stringify({
          runId,
          grantId,
          idempotencyKey: key,
          sequence: latest.snapshot.nextSequence,
          leaseToken: latest.lease.token,
        }),
      };
      await send(pending);
      return grantRestored(scope, runId);
    },
    async archivePending(expectedRunId) {
      const scope = syncAccount();
      if (
        !scope ||
        disposed ||
        !online ||
        flight ||
        !latest ||
        latest.snapshot.runId !== expectedRunId
      )
        return false;
      const runId = latest.snapshot.runId;
      if (pending?.route === 'archive') {
        if (pending.runId !== runId) return false;
        if (!canRecheckOperation(problem)) return false;
        await send(pending);
        return runArchived(scope);
      }
      let recovered = false;
      if (pending) {
        if (pending.route !== 'recover' || pending.runId !== runId || !canRecheckOperation(problem))
          return false;
        await send(pending);
        if (pending) return false;
        recovered = true;
      }
      if (!recovered) await client.recover(runId, false);
      syncAccount();
      if (
        scope !== account ||
        !latest ||
        latest.snapshot.runId !== runId ||
        phase !== 'ready' ||
        pending ||
        flight ||
        latest.snapshot.status !== 'dead' ||
        (!latest.snapshot.rewardPending &&
          latest.snapshot.revivesGranted <= latest.snapshot.revivesApplied)
      )
        return false;
      const key = newId();
      if (!UUID.test(key)) return false;
      pending = {
        route: 'archive',
        runId,
        body: JSON.stringify({
          runId,
          sequence: latest.snapshot.nextSequence,
          idempotencyKey: key,
          leaseToken: latest.lease.token,
        }),
      };
      await send(pending);
      return runArchived(scope);
    },
    async recover(runId, takeover = false) {
      syncAccount();
      if (
        flight ||
        pending ||
        !online ||
        !account ||
        !UUID.test(runId) ||
        (latest && latest.snapshot.status !== 'finished' && latest.snapshot.runId !== runId)
      )
        return;
      const id = newId();
      if (!UUID.test(id)) return;
      pending = {
        route: 'recover',
        body: JSON.stringify({ runId, idempotencyKey: id, takeover }),
        runId,
      };
      await send(pending);
    },
    setOnline(value) {
      if (value === online) return;
      online = value;
      if (!online) {
        epoch = {};
        flight?.abort();
        flight = null;
      } else if (pending) phase = 'retry';
      else if (latest && latest.snapshot.status !== 'finished') phase = 'recovery';
      notify();
    },
    clear,
    dispose() {
      disposed = true;
      unsubscribe();
      clear();
      observers.clear();
    },
  };
  async function send(request: PendingRequest): Promise<void> {
    syncAccount();
    if (disposed || !account || !online || flight) return;
    const owner = account;
    const requestEpoch = epoch;
    const controller = new AbortController();
    flight = controller;
    phase = 'pending';
    rejected = false;
    problem = null;
    notify();
    try {
      const result = await options.session.withAccountRequest(async (lease) => {
        const response = await fetcher(
          request.route === 'resource'
            ? base.origin + path + '/commerce/spend'
            : request.route === 'reward_apply'
              ? base.origin + path + '/rewards/apply'
              : endpoint + request.route,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              authorization: 'Bearer ' + lease.accessToken,
            },
            body: request.body,
            signal: AbortSignal.any([lease.signal, controller.signal, AbortSignal.timeout(8000)]),
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
          },
        );
        if (lease.signal.aborted || controller.signal.aborted)
          throw new Error('ranked-unavailable');
        const raw = await readPublicReply(response);
        if (!response.ok) {
          const code = object(raw, ['code']) && typeof raw.code === 'string' ? raw.code : '';
          return {
            error: code,
            operation: parseOperationFailure(raw, response.status),
            reply: null,
            active: undefined,
          };
        }
        if (request.route === 'archive') {
          if (
            object(raw, ['status', 'runId']) &&
            raw.status === 'archived' &&
            raw.runId === request.runId
          )
            return { error: null, reply: null, active: undefined, archived: raw.runId };
          throw new Error('ranked-unavailable');
        }
        if (request.route === 'active') {
          if (object(raw, ['status']) && raw.status === 'none')
            return { error: null, reply: null, active: null };
          if (
            object(raw, ['status', 'runId']) &&
            raw.status === 'active' &&
            typeof raw.runId === 'string' &&
            UUID.test(raw.runId)
          )
            return { error: null, reply: null, active: raw.runId };
          throw new Error('ranked-unavailable');
        }
        const parsed = parseRankedReply(raw);
        if (!parsed || (request.runId !== null && parsed.snapshot.runId !== request.runId))
          throw new Error('ranked-unavailable');
        return { error: null, reply: parsed, active: undefined };
      });
      if (
        controller.signal.aborted ||
        requestEpoch !== epoch ||
        owner !== options.session.accountScope() ||
        disposed
      )
        return;
      if ('archived' in result && result.archived === request.runId) {
        latest = null;
        discoveredRunId = null;
        pending = null;
        phase = 'idle';
        rejected = false;
      } else if (result.active !== undefined) {
        discoveredRunId = result.active;
        pending = null;
        phase =
          latest?.snapshot.status === 'finished'
            ? 'finished'
            : latest
              ? 'ready'
              : result.active
                ? 'recovery'
                : 'idle';
      } else if (result.reply) {
        const incoming = result.reply;
        if (
          latest &&
          !(
            (request.route === 'start' || request.route === 'recover') &&
            latest.snapshot.status === 'finished'
          ) &&
          (incoming.snapshot.runId !== latest.snapshot.runId ||
            incoming.snapshot.rulesetVersion !== latest.snapshot.rulesetVersion ||
            JSON.stringify(incoming.snapshot.region) !== JSON.stringify(latest.snapshot.region) ||
            BigInt(incoming.lease.generation) < BigInt(latest.lease.generation) ||
            BigInt(incoming.snapshot.nextSequence) < BigInt(latest.snapshot.nextSequence))
        ) {
          pending = null;
          phase = 'recovery';
          return;
        }
        latest = incoming;
        pending = null;
        rejected = !incoming.accepted;
        phase = incoming.snapshot.status === 'finished' ? 'finished' : 'ready';
      } else {
        if ('operation' in result && result.operation) {
          // Even a definitive pre-mutation refusal keeps the exact queued body:
          // a preceding response may have been lost and only its receipt can settle it.
          problem = result.operation;
          phase = result.operation === 'service_unavailable' ? 'retry' : 'blocked';
          return;
        }
        const code =
          result.error === 'reward-lease-lost'
            ? 'lease-lost'
            : result.error === 'reward-lease-expired'
              ? 'lease-expired'
              : result.error === 'reward-sequence-conflict'
                ? 'sequence-conflict'
                : result.error;
        if (code === 'lease-lost' || code === 'takeover-required') {
          pending = null;
          phase = 'lease_lost';
        } else if (
          code === 'lease-expired' ||
          code === 'sequence-conflict' ||
          code === 'recovery-required' ||
          code === 'active-run-exists' ||
          code === 'reward-not-offered' ||
          code === 'reward-already-pending' ||
          code === 'reward-grant-unavailable' ||
          code === 'reward-state-conflict' ||
          code === 'archive-not-pending' ||
          code === 'run-archived'
        ) {
          if (code === 'active-run-exists' && latest?.snapshot.status === 'finished') {
            latest = null;
            discoveredRunId = null;
          }
          pending = null;
          phase = 'recovery';
        } else if (
          code === 'invalid-request' ||
          code === 'idempotency-conflict' ||
          code === 'run-finished' ||
          code === 'run-not-found' ||
          code === 'incompatible-ruleset' ||
          code === 'invalid-reward-request' ||
          code === 'reward-account-unavailable' ||
          code === 'reward-run-unavailable' ||
          code === 'reward-privacy-unavailable' ||
          code === 'reward-idempotency-conflict'
        ) {
          pending = null;
          phase = 'error';
        } else phase = 'retry';
      }
    } catch {
      if (requestEpoch === epoch && owner === options.session.accountScope() && !disposed)
        phase = 'retry';
    } finally {
      if (flight === controller) {
        flight = null;
        notify();
      }
    }
  }
  return client;
}
