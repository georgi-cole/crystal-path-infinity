import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { OperationsPolicyError } from './operations-policy.ts';
import {
  addDecimal,
  assertRunState,
  createRun,
  getCurrentRow,
  RULESET_VERSION,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type {
  RandomCursor,
  RandomSource,
  RunCommand,
  RunState,
  TileSide,
} from '@crystal-path-infinity/game-core';

/** Populated by verified server authentication, never from a request body. */
export interface RankedActor {
  readonly subject: string;
  readonly deviceId: string;
  /** Trusted authenticated build binding; never accepted from the command body. */
  readonly clientBuild: number;
}

export interface RankedRegionSnapshot {
  readonly countryCode: string | null;
  readonly continent: string | null;
  readonly mappingVersion: string;
}

export type RankedCommand =
  | {
      readonly type: 'choose';
      readonly row: string;
      readonly life: number;
      readonly side: TileSide;
    }
  | { readonly type: 'hint' | 'mystery'; readonly row: string; readonly life: number }
  | { readonly type: 'heartbeat' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'end' };

/** This private record is persisted atomically; it must never be a network response. */
export interface StoredRankedRun {
  /** Absent on older checkpoints means attached. False preserves a saved unresolved attempt. */
  readonly leaseActive?: boolean;
  readonly subject: string;
  readonly region: RankedRegionSnapshot;
  readonly state: RunState;
  readonly nextSequence: string;
  readonly deviceId: string;
  readonly leaseToken: string;
  readonly leaseGeneration: string;
  readonly leaseExpiresAt: number;
  readonly clockUpdatedAt: number;
  readonly activeUntil: number;
  readonly paused: boolean;
  readonly lastChoiceAt: number | null;
}

export interface RankedSnapshot {
  readonly runId: string;
  readonly rulesetVersion: string;
  readonly status: RunState['status'];
  readonly region: RankedRegionSnapshot;
  readonly nextSequence: string;
  readonly lastClearedRow: string;
  readonly currentRow: string;
  readonly sp: number;
  readonly hints: number;
  readonly activeTimeMs: number;
  readonly pacing?: RunState['pacing'];
  readonly achievedAt: number | null;
  readonly paused: boolean;
  readonly current: RunState['current'] & { readonly hasMystery: boolean };
  readonly history: RunState['resolutions'];
  readonly effects: RunState['effects'];
  readonly death: Pick<NonNullable<RunState['death']>, 'id' | 'fatalRow' | 'cause'> | null;
  readonly revivesGranted: number;
  readonly revivesApplied: number;
  readonly revivesToReachScore: number;
  readonly rewardPending: boolean;
}

export interface RankedReply {
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly snapshot: RankedSnapshot;
  /** A capability for this authenticated device, returned only on the private channel. */
  readonly lease: {
    readonly token: string;
    readonly generation: string;
    readonly expiresAt: number;
  };
}
export type RankedActiveLookup =
  { readonly status: 'none' } | { readonly status: 'active'; readonly runId: string };

export interface RankedReceipt {
  readonly key: string;
  readonly requestFingerprint: string;
  readonly response: RankedReply;
  readonly createdAt: number;
}

export interface RankedAudit {
  readonly runId: string;
  readonly sequence: string;
  readonly idempotencyKey: string;
  readonly command: RankedCommand;
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly receivedAt: number;
  readonly result: RankedSnapshot;
}

export interface RankedTransaction {
  authorizeStart(input: { clientBuild: number; rulesetVersion: string }): Promise<void>;
  authorizeRecovery(input: { clientBuild: number; rulesetVersion: string }): Promise<void>;
  getActiveRun(): Promise<StoredRankedRun | null>;
  getRun(runId: string): Promise<StoredRankedRun | null>;
  getReceipt(key: string): Promise<RankedReceipt | null>;
  /** Locks the profile and returns the accepted mapping version, within this transaction. */
  getRegionSnapshot(): Promise<RankedRegionSnapshot>;
  saveRun(record: StoredRankedRun): Promise<void>;
  saveReceipt(receipt: RankedReceipt): Promise<void>;
  appendAudit(event: RankedAudit): Promise<void>;
}

/**
 * A production implementation must serialize the WHOLE account transaction, including
 * start/lease checks, and commit checkpoint + receipt + audit together. Roll back all
 * writes if the callback throws. A process-local mutex is not a production adapter.
 */
export interface RankedRepository {
  transaction<T>(
    subject: string,
    operation: (transaction: RankedTransaction) => Promise<T>,
  ): Promise<T>;
}

export class RankedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'RankedError';
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER = /^(0|[1-9][0-9]*)$/;
const ALGORITHM = 'hmac-sha256-counter-v1';

/** Server-only keyed deterministic stream. Neither key nor cursor crosses the API. */
export const RANKED_RNG: RandomSource = Object.freeze({
  algorithm: ALGORITHM,
  next(cursor: RandomCursor) {
    if (
      cursor.algorithm !== ALGORITHM ||
      !/^[0-9a-f]{64}$/.test(cursor.state) ||
      !INTEGER.test(cursor.draws) ||
      cursor.draws.length > 1000
    ) {
      throw new RankedError('invalid-private-rng');
    }
    const digest = createHmac('sha256', Buffer.from(cursor.state, 'hex'))
      .update(`cpi-ranked-stream-v1:${cursor.draws}`)
      .digest();
    // Six bytes provide an exactly representable uniform 48-bit fraction.
    return {
      value: digest.readUIntBE(0, 6) / 281_474_976_710_656,
      cursor: { ...cursor, draws: addDecimal(cursor.draws) },
    };
  },
});

function fail(code: string): never {
  throw new RankedError(code);
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-request');
  const candidate = value as Record<string, unknown>;
  const actual = Object.keys(candidate).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) fail('invalid-request');
  return candidate;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('invalid-request');
  return value.toLowerCase();
}

function integer(value: unknown, positive = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 1000 ||
    !INTEGER.test(value) ||
    (positive && value === '0')
  ) {
    fail('invalid-request');
  }
  return value;
}

function actorIdentity(actor: RankedActor): void {
  for (const value of [actor.subject, actor.deviceId]) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(value)) {
      fail('invalid-authentication');
    }
  }
  if (
    !Number.isInteger(actor.clientBuild) ||
    actor.clientBuild < 1 ||
    actor.clientBuild > 2_147_483_647
  )
    throw new OperationsPolicyError('operation_context_required');
}

function parseCommand(value: unknown): RankedCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-request');
  const type = (value as Record<string, unknown>).type;
  if (type === 'heartbeat' || type === 'pause' || type === 'resume' || type === 'end') {
    object(value, ['type']);
    return { type };
  }
  if (type !== 'choose' && type !== 'hint' && type !== 'mystery') fail('invalid-request');
  const input = object(
    value,
    type === 'choose' ? ['type', 'row', 'life', 'side'] : ['type', 'row', 'life'],
  );
  const row = integer(input.row, true);
  const life = input.life;
  if (typeof life !== 'number' || !Number.isInteger(life) || life < 0 || life > 10) {
    fail('invalid-request');
  }
  if (type === 'choose') {
    if (input.side !== 'left' && input.side !== 'right') fail('invalid-request');
    return { type, row, life, side: input.side };
  }
  return { type, row, life };
}

export function rankedSnapshot(record: StoredRankedRun): RankedSnapshot {
  const state = record.state;
  const row = getCurrentRow(state);
  const visible = (current: RunState['current']) => ({
    revealedSafeSide: current.revealedSafeSide,
    mysteryOutcome: current.mysteryOutcome,
    lastChoice: current.lastChoice
      ? { side: current.lastChoice.side, wrong: current.lastChoice.wrong }
      : null,
  });
  return structuredClone({
    runId: state.runId,
    rulesetVersion: state.rulesetVersion,
    status: state.status,
    region: {
      countryCode: record.region.countryCode,
      continent: record.region.continent,
      mappingVersion: record.region.mappingVersion,
    },
    nextSequence: record.nextSequence,
    lastClearedRow: state.lastClearedRow,
    currentRow: state.currentRow,
    sp: state.sp,
    hints: state.hints,
    activeTimeMs: state.activeTimeMs,
    ...(state.pacing
      ? {
          pacing: {
            rowEnteredAt: state.pacing.rowEnteredAt,
            nextSurvivalBonusAt: state.pacing.nextSurvivalBonusAt,
            ...(state.pacing.hintScanStartedAt === undefined
              ? {}
              : { hintScanStartedAt: state.pacing.hintScanStartedAt }),
          },
        }
      : {}),
    achievedAt: state.achievedAt,
    paused: record.paused,
    current: { ...visible(state.current), hasMystery: row.hasMystery },
    history: state.resolutions.map((resolution) => ({
      index: resolution.index,
      ...visible(resolution),
    })),
    effects: state.effects.map((effect) => ({
      kind: effect.kind,
      startedAt: effect.startedAt,
      expiresAt: effect.expiresAt,
      nextTickAt: effect.nextTickAt,
    })),
    death: state.death
      ? { id: state.death.id, fatalRow: state.death.fatalRow, cause: state.death.cause }
      : null,
    revivesGranted: state.revivesGranted,
    revivesApplied: state.revivesApplied,
    revivesToReachScore: state.revivesToReachScore,
    rewardPending: state.pendingReward !== null,
  });
}

function reply(
  record: StoredRankedRun,
  accepted = true,
  reason: string | null = null,
): RankedReply {
  return {
    accepted,
    reason,
    snapshot: rankedSnapshot(record),
    lease: {
      token: record.leaseToken,
      generation: record.leaseGeneration,
      expiresAt: record.leaseExpiresAt,
    },
  };
}

export interface RankedAuthorityOptions {
  readonly repository: RankedRepository;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly newSecret?: () => string;
  /** Trusted configuration. The client cannot select private/test rulesets. */
  readonly rulesetVersion?: string;
  readonly leaseMs?: number;
  readonly heartbeatWindowMs?: number;
  readonly minimumChoiceIntervalMs?: number;
}

export class RankedAuthority {
  private readonly repository: RankedRepository;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly newSecret: () => string;
  private readonly rulesetVersion: string;
  private readonly leaseMs: number;
  private readonly heartbeatWindowMs: number;
  private readonly minimumChoiceIntervalMs: number;

  constructor(options: RankedAuthorityOptions) {
    this.repository = options.repository;
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? randomUUID;
    this.newSecret = options.newSecret ?? (() => randomBytes(32).toString('hex'));
    this.rulesetVersion = options.rulesetVersion ?? RULESET_VERSION;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.heartbeatWindowMs = options.heartbeatWindowMs ?? 10_000;
    this.minimumChoiceIntervalMs = options.minimumChoiceIntervalMs ?? 100;
    for (const value of [this.leaseMs, this.heartbeatWindowMs, this.minimumChoiceIntervalMs]) {
      if (!Number.isSafeInteger(value) || value < 0) fail('invalid-server-configuration');
    }
    if (this.heartbeatWindowMs < 1 || this.leaseMs < this.heartbeatWindowMs) {
      fail('invalid-server-configuration');
    }
  }

  private observation(): number {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - this.leaseMs) {
      fail('invalid-server-clock');
    }
    return now;
  }

  private async repeated(
    transaction: RankedTransaction,
    key: string,
    request: unknown,
  ): Promise<RankedReply | null> {
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const receipt = await transaction.getReceipt(key);
    if (receipt && receipt.requestFingerprint !== fingerprint) fail('idempotency-conflict');
    return receipt ? structuredClone(receipt.response) : null;
  }

  private async remember(
    transaction: RankedTransaction,
    key: string,
    request: unknown,
    response: RankedReply,
    now: number,
  ) {
    await transaction.saveReceipt({
      key,
      requestFingerprint: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      response: structuredClone(response),
      createdAt: now,
    });
    return response;
  }

  private owned(record: StoredRankedRun | null, actor: RankedActor): StoredRankedRun {
    if (!record || record.subject !== actor.subject) fail('run-not-found');
    assertRunState(record.state, RANKED_RNG);
    integer(record.nextSequence, true);
    integer(record.leaseGeneration, true);
    if (record.state.rulesetVersion !== this.rulesetVersion) fail('incompatible-ruleset');
    return record;
  }

  /** Count only the bounded, server-issued connected interval; never the entire offline gap. */
  private settle(record: StoredRankedRun, now: number): StoredRankedRun {
    if (now < record.clockUpdatedAt || now < record.state.lastObservedAt)
      fail('server-clock-regressed');
    const elapsed =
      record.paused || record.state.status !== 'playing'
        ? 0
        : Math.max(0, Math.min(now, record.activeUntil) - record.clockUpdatedAt);
    const activeTimeMs = record.state.activeTimeMs + elapsed;
    if (!Number.isSafeInteger(activeTimeMs)) fail('active-time-exhausted');
    const state =
      record.state.status === 'playing'
        ? transitionRun(
            record.state,
            { type: 'tick' },
            { activeTimeMs, achievedAt: now, rng: RANKED_RNG },
          ).state
        : record.state;
    return { ...record, state, clockUpdatedAt: now };
  }

  /** Authenticated recovery discovery; no lease rotation, clock change or private state. */
  async active(actor: RankedActor, body: unknown): Promise<RankedActiveLookup> {
    actorIdentity(actor);
    object(body, []);
    return this.repository.transaction(actor.subject, async (transaction) => {
      const record = await transaction.getActiveRun();
      if (!record) return { status: 'none' };
      const owned = this.owned(record, actor);
      return { status: 'active', runId: owned.state.runId };
    });
  }

  async start(actor: RankedActor, body: unknown): Promise<RankedReply> {
    actorIdentity(actor);
    const input = object(body, ['idempotencyKey']);
    const key = uuid(input.idempotencyKey);
    const request = { type: 'start', deviceId: actor.deviceId };
    return this.repository.transaction(actor.subject, async (transaction) => {
      const repeated = await this.repeated(transaction, key, request);
      if (repeated) return repeated;
      if (await transaction.getActiveRun()) fail('active-run-exists');
      await transaction.authorizeStart({
        clientBuild: actor.clientBuild,
        rulesetVersion: this.rulesetVersion,
      });
      const now = this.observation();
      const region = structuredClone(await transaction.getRegionSnapshot());
      const state = createRun(
        {
          runId: uuid(this.newId()),
          routeRng: { algorithm: ALGORITHM, state: this.newSecret(), draws: '0' },
          mysteryRng: { algorithm: ALGORITHM, state: this.newSecret(), draws: '0' },
          observedAt: now,
          rulesetVersion: this.rulesetVersion,
          buffer: { ahead: 8, history: 2 },
        },
        RANKED_RNG,
      );
      const record: StoredRankedRun = {
        leaseActive: true,
        subject: actor.subject,
        region,
        state,
        nextSequence: '1',
        deviceId: actor.deviceId,
        leaseToken: uuid(this.newId()),
        leaseGeneration: '1',
        leaseExpiresAt: now + this.leaseMs,
        clockUpdatedAt: now,
        activeUntil: now,
        paused: true,
        lastChoiceAt: null,
      };
      await transaction.saveRun(record);
      return this.remember(transaction, key, request, reply(record), now);
    });
  }

  async execute(actor: RankedActor, body: unknown): Promise<RankedReply> {
    actorIdentity(actor);
    const input = object(body, ['runId', 'sequence', 'idempotencyKey', 'leaseToken', 'command']);
    const runId = uuid(input.runId);
    const sequence = integer(input.sequence, true);
    const key = uuid(input.idempotencyKey);
    const leaseToken = uuid(input.leaseToken);
    const command = parseCommand(input.command);
    const request = {
      type: 'execute',
      deviceId: actor.deviceId,
      runId,
      sequence,
      leaseToken,
      command,
    };
    return this.repository.transaction(actor.subject, async (transaction) => {
      const repeated = await this.repeated(transaction, key, request);
      if (repeated) return repeated;
      let record = this.owned(await transaction.getRun(runId), actor);
      await transaction.authorizeRecovery({
        clientBuild: actor.clientBuild,
        rulesetVersion: record.state.rulesetVersion,
      });
      const now = this.observation();
      if (record.leaseActive === false) fail('run-archived');
      if (record.deviceId !== actor.deviceId || record.leaseToken !== leaseToken)
        fail('lease-lost');
      if (now >= record.leaseExpiresAt) fail('lease-expired');
      if (record.nextSequence !== sequence) fail('sequence-conflict');
      if (record.state.status === 'finished') fail('run-finished');
      if (!record.paused && now > record.activeUntil) fail('recovery-required');
      if (record.paused && !['resume', 'pause', 'end'].includes(command.type)) fail('run-paused');
      if (
        command.type === 'choose' &&
        record.lastChoiceAt !== null &&
        now - record.lastChoiceAt < this.minimumChoiceIntervalMs
      ) {
        fail('action-too-fast');
      }
      record = this.settle(record, now);
      let accepted = true;
      let reason: string | null = null;
      if (command.type === 'resume') {
        record = { ...record, paused: false };
      } else if (command.type === 'pause') {
        record = { ...record, paused: true };
      } else if (command.type !== 'heartbeat') {
        const coreCommand: RunCommand = command.type === 'end' ? { type: 'end' } : command;
        const result = transitionRun(record.state, coreCommand, {
          activeTimeMs: record.state.activeTimeMs,
          achievedAt: now,
          rng: RANKED_RNG,
        });
        accepted = result.accepted;
        reason = result.reason;
        record = { ...record, state: result.state };
      }
      record = {
        ...record,
        nextSequence: addDecimal(record.nextSequence),
        leaseExpiresAt: now + this.leaseMs,
        activeUntil: now + this.heartbeatWindowMs,
        clockUpdatedAt: now,
        lastChoiceAt: command.type === 'choose' ? now : record.lastChoiceAt,
      };
      const response = reply(record, accepted, reason);
      await transaction.saveRun(record);
      await transaction.appendAudit({
        runId,
        sequence,
        idempotencyKey: key,
        command,
        accepted,
        reason,
        receivedAt: now,
        result: response.snapshot,
      });
      return this.remember(transaction, key, request, response, now);
    });
  }

  async recover(actor: RankedActor, body: unknown): Promise<RankedReply> {
    actorIdentity(actor);
    const input = object(body, ['runId', 'idempotencyKey', 'takeover']);
    const runId = uuid(input.runId);
    const key = uuid(input.idempotencyKey);
    if (typeof input.takeover !== 'boolean') fail('invalid-request');
    const request = { type: 'recover', deviceId: actor.deviceId, runId, takeover: input.takeover };
    return this.repository.transaction(actor.subject, async (transaction) => {
      const repeated = await this.repeated(transaction, key, request);
      if (repeated) return repeated;
      let record = this.owned(await transaction.getRun(runId), actor);
      await transaction.authorizeRecovery({
        clientBuild: actor.clientBuild,
        rulesetVersion: record.state.rulesetVersion,
      });
      const now = this.observation();
      if (record.state.status === 'finished') {
        return this.remember(transaction, key, request, reply(record), now);
      }
      const active = await transaction.getActiveRun();
      if (active && active.state.runId !== runId) fail('active-run-exists');
      if (record.deviceId !== actor.deviceId && now < record.leaseExpiresAt && !input.takeover) {
        fail('takeover-required');
      }
      record = this.settle(record, now);
      record = {
        ...record,
        leaseActive: true,
        deviceId: actor.deviceId,
        leaseToken: uuid(this.newId()),
        leaseGeneration: addDecimal(record.leaseGeneration),
        leaseExpiresAt: now + this.leaseMs,
        clockUpdatedAt: now,
        activeUntil: now,
        paused: true,
      };
      await transaction.saveRun(record);
      return this.remember(transaction, key, request, reply(record), now);
    });
  }
}
