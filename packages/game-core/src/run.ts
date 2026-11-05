import {
  applyMysteryEffect,
  mergeEffect,
  resolveWrongTileDelta,
  rollMysteryEffect,
} from './effects.ts';
import {
  addDecimal,
  addSafeInteger,
  assertNonEmpty,
  assertNonNegativeInteger,
  decimal,
} from './numbers.ts';
import { assertRandomCursor, drawRandom } from './random.ts';
import {
  createRunPacing,
  nextSurvivalBonusAt,
  PACED_RULESET_VERSION,
  SCAN_RULESET_VERSION,
  rowDeadline,
  SURVIVAL_BONUS_INTERVAL_MS,
  SURVIVAL_BONUS_SP,
} from './pacing.ts';
import { assertRowStream, createRowStream, takeRows } from './rows.ts';
import {
  clampSp,
  EFFECT_DURATION_MS,
  EFFECT_TICK_MS,
  EFFECT_TICK_SP,
  getReviveSp,
  getRowBandDamage,
  getRuleset,
  MAX_ACTIVE_EFFECTS,
  MAX_BUFFER_ROWS,
  MAX_REVIVES,
  getMaxRevives,
  STORE_TEST_RULESET_VERSION,
  RESERVE_SP_PER_RUN,
  MAX_SP,
  RULESET_VERSION,
  STARTING_HINTS,
  STARTING_SP,
} from './rules.ts';
import type {
  BufferPolicy,
  CreateRunOptions,
  CurrentRowState,
  DeathCause,
  EndReason,
  RandomSource,
  RejectionReason,
  ReviveReceipt,
  RunCommand,
  RunEvent,
  RunResult,
  RunState,
  TransitionContext,
  TransitionResult,
} from './types.ts';

function emptyCurrent(): CurrentRowState {
  return { revealedSafeSide: null, mysteryOutcome: null, lastChoice: null };
}

function assertBuffer(buffer: BufferPolicy): void {
  assertNonNegativeInteger(buffer.ahead, 'Ahead buffer');
  assertNonNegativeInteger(buffer.history, 'History buffer');
  if (buffer.ahead < 1 || buffer.ahead + buffer.history > MAX_BUFFER_ROWS) {
    throw new RangeError(
      `Buffer requires a current row and at most ${MAX_BUFFER_ROWS} total rows.`,
    );
  }
}

export function createRun(options: CreateRunOptions, rng: RandomSource): RunState {
  const rulesetVersion = options.rulesetVersion ?? RULESET_VERSION;
  getRuleset(rulesetVersion);
  assertNonEmpty(options.runId, 'Run ID');
  if (rulesetVersion === STORE_TEST_RULESET_VERSION && !options.runId.startsWith('practice-'))
    throw new RangeError('Test economy requires a local practice run.');
  assertNonNegativeInteger(options.observedAt, 'Observation timestamp');
  const activeTimeMs = options.activeTimeMs ?? 0;
  assertNonNegativeInteger(activeTimeMs, 'Active time');
  assertRandomCursor(options.mysteryRng, rng);
  const buffer = { ...(options.buffer ?? { ahead: 8, history: 2 }) };
  assertBuffer(buffer);
  const generated = takeRows(
    createRowStream(options.routeRng, rng, rulesetVersion),
    buffer.ahead,
    rng,
  );
  return {
    ...(rulesetVersion === STORE_TEST_RULESET_VERSION
      ? {
          storeTest: {
            assisted: false,
            reserveSpent: 0,
            hintsSpent: 0,
            creditContinues: 0,
            adContinues: 0,
            sequence: 0,
          },
        }
      : {}),
    schemaVersion: 1,
    rulesetVersion,
    runId: options.runId,
    status: 'playing',
    sp: STARTING_SP,
    hints: STARTING_HINTS,
    lastClearedRow: '0',
    currentRow: '1',
    achievedAt: null,
    activeTimeMs,
    lastObservedAt: options.observedAt,
    ...([PACED_RULESET_VERSION, SCAN_RULESET_VERSION, STORE_TEST_RULESET_VERSION].includes(
      rulesetVersion,
    )
      ? { pacing: createRunPacing(activeTimeMs) }
      : {}),
    effects: [],
    buffer,
    bufferOffset: '0',
    rows: generated.rows,
    resolutions: [],
    current: emptyCurrent(),
    stream: generated.stream,
    mysteryRng: { ...options.mysteryRng },
    deaths: 0,
    death: null,
    pendingReward: null,
    reviveReceipts: [],
    revivesGranted: 0,
    revivesApplied: 0,
    revivesToReachScore: 0,
    result: null,
  };
}

/** Validates trusted core checkpoints; network JSON validation/authentication belongs to the adapter. */
export function assertRunState(state: RunState, rng?: RandomSource): void {
  if (state.schemaVersion !== 1) throw new RangeError('Unsupported run schema.');
  getRuleset(state.rulesetVersion);
  assertNonEmpty(state.runId, 'Run ID');
  if (state.rulesetVersion === STORE_TEST_RULESET_VERSION) {
    const economy = state.storeTest;
    if (!state.runId.startsWith('practice-') || !economy)
      throw new RangeError('Test economy requires a local practice run.');
    for (const value of [
      economy.reserveSpent,
      economy.hintsSpent,
      economy.creditContinues,
      economy.adContinues,
      economy.sequence,
    ])
      assertNonNegativeInteger(value, 'Test resource counter');
    if (
      economy.reserveSpent > RESERVE_SP_PER_RUN ||
      economy.adContinues > 10 ||
      economy.creditContinues + economy.adContinues !== state.revivesApplied ||
      economy.sequence < economy.hintsSpent + economy.creditContinues + economy.adContinues ||
      economy.assisted !==
        (economy.reserveSpent > 0 || economy.hintsSpent > 0 || economy.creditContinues > 0)
    )
      throw new RangeError('Invalid test resource accounting.');
  } else if (state.storeTest !== undefined)
    throw new RangeError('Test resources are unavailable on this ruleset.');
  assertBuffer(state.buffer);
  decimal(state.lastClearedRow);
  decimal(state.currentRow);
  decimal(state.bufferOffset);
  if (state.currentRow !== addDecimal(state.lastClearedRow))
    throw new RangeError('Inconsistent progress.');
  for (const [name, value] of Object.entries({
    sp: state.sp,
    hints: state.hints,
    activeTimeMs: state.activeTimeMs,
    lastObservedAt: state.lastObservedAt,
    deaths: state.deaths,
    revivesGranted: state.revivesGranted,
    revivesApplied: state.revivesApplied,
    revivesToReachScore: state.revivesToReachScore,
  }))
    assertNonNegativeInteger(value, name);
  if (state.achievedAt !== null) {
    assertNonNegativeInteger(state.achievedAt, 'Score timestamp');
    if (state.achievedAt > state.lastObservedAt)
      throw new RangeError('Score timestamp is in the future.');
  }
  if (
    state.sp > MAX_SP ||
    state.revivesGranted > getMaxRevives(state.rulesetVersion) ||
    state.revivesApplied > state.revivesGranted ||
    state.revivesToReachScore > state.revivesApplied ||
    state.deaths > getMaxRevives(state.rulesetVersion) + 1
  )
    throw new RangeError('Invalid resource counters.');
  if (!['playing', 'dead', 'finished'].includes(state.status))
    throw new RangeError('Invalid run status.');
  if (
    state.status === 'playing' &&
    (state.sp === 0 || state.death !== null || state.pendingReward !== null)
  ) {
    throw new RangeError('Playing run has an unresolved death.');
  }
  if (
    state.status === 'dead' &&
    (state.sp !== 0 ||
      state.death === null ||
      state.revivesApplied >= getMaxRevives(state.rulesetVersion))
  ) {
    throw new RangeError('Invalid unresolved death.');
  }
  if ((state.status === 'finished') !== (state.result !== null))
    throw new RangeError('Invalid terminal result.');
  if (
    [PACED_RULESET_VERSION, SCAN_RULESET_VERSION, STORE_TEST_RULESET_VERSION].includes(
      state.rulesetVersion,
    )
  ) {
    if (!state.pacing) throw new RangeError('Missing row and survival schedules.');
    assertNonNegativeInteger(state.pacing.rowEnteredAt, 'Row entry');
    assertNonNegativeInteger(state.pacing.nextSurvivalBonusAt, 'Survival schedule');
    if (state.pacing.hintScanStartedAt !== undefined) {
      assertNonNegativeInteger(state.pacing.hintScanStartedAt, 'Hint scan start');
      if (
        ![SCAN_RULESET_VERSION, STORE_TEST_RULESET_VERSION].includes(state.rulesetVersion) ||
        state.pacing.hintScanStartedAt < state.pacing.rowEnteredAt ||
        state.pacing.hintScanStartedAt > state.activeTimeMs ||
        state.current.revealedSafeSide === null
      )
        throw new RangeError('Invalid hint scan hold.');
    }
    if (
      state.pacing.rowEnteredAt > state.activeTimeMs ||
      state.pacing.nextSurvivalBonusAt % SURVIVAL_BONUS_INTERVAL_MS !== 0 ||
      state.pacing.nextSurvivalBonusAt < state.activeTimeMs ||
      (state.status === 'playing' &&
        (rowDeadline(state.pacing) <= state.activeTimeMs ||
          state.pacing.nextSurvivalBonusAt === state.activeTimeMs))
    ) {
      throw new RangeError('Invalid row or survival schedule.');
    }
  } else if (state.pacing !== undefined)
    throw new RangeError('Unexpected pacing on a historical ruleset.');
  assertRowStream(state.stream, rng);
  assertRandomCursor(state.mysteryRng, rng);
  if (state.stream.rulesetVersion !== state.rulesetVersion)
    throw new RangeError('Mismatched stream ruleset.');
  if (
    state.rows.length < 1 ||
    state.rows.length > state.buffer.ahead + state.buffer.history ||
    state.resolutions.length > state.buffer.history
  )
    throw new RangeError('Unbounded row state.');
  state.rows.forEach((row, position) => {
    if (
      row.index !== addDecimal(state.bufferOffset, BigInt(position)) ||
      (row.safeSide !== 'left' && row.safeSide !== 'right') ||
      typeof row.hasMystery !== 'boolean'
    ) {
      throw new RangeError('Invalid or non-contiguous row buffer.');
    }
  });
  if (state.stream.nextIndex !== addDecimal(state.bufferOffset, BigInt(state.rows.length))) {
    throw new RangeError('Stream and buffer do not meet.');
  }
  getCurrentRow(state);
  if (state.effects.length > MAX_ACTIVE_EFFECTS) throw new RangeError('Too many active effects.');
  state.effects.forEach((effect) => {
    assertNonNegativeInteger(effect.startedAt, 'Effect start');
    assertNonNegativeInteger(effect.expiresAt, 'Effect expiry');
    if (
      effect.expiresAt - effect.startedAt !== EFFECT_DURATION_MS ||
      effect.startedAt > state.activeTimeMs ||
      effect.expiresAt <= state.activeTimeMs
    ) {
      throw new RangeError('Invalid effect interval.');
    }
    const periodic = effect.kind === 'regen_5s' || effect.kind === 'drain_5s';
    if (periodic) {
      if (effect.nextTickAt === null) throw new RangeError('Missing periodic schedule.');
      assertNonNegativeInteger(effect.nextTickAt, 'Effect tick');
      if (
        effect.nextTickAt <= state.activeTimeMs ||
        effect.nextTickAt <= effect.startedAt ||
        effect.nextTickAt > effect.expiresAt ||
        (effect.nextTickAt - effect.startedAt) % EFFECT_TICK_MS !== 0
      ) {
        throw new RangeError('Invalid periodic schedule.');
      }
    } else if (
      effect.nextTickAt !== null ||
      !['shield_5s', 'lucky_5s', 'fragility_5s', 'inversion_5s'].includes(effect.kind)
    ) {
      throw new RangeError('Invalid one-shot effect.');
    }
  });
  if (
    state.reviveReceipts.length !== state.revivesGranted ||
    state.reviveReceipts.filter((receipt) => receipt.status === 'applied').length !==
      state.revivesApplied
  ) {
    throw new RangeError('Revive receipts do not match counters.');
  }
  const grantIds = new Set<string>();
  const deathIds = new Set<string>();
  state.reviveReceipts.forEach((receipt, position) => {
    assertNonEmpty(receipt.grantId, 'Grant ID');
    assertNonEmpty(receipt.deathId, 'Death ID');
    if (
      receipt.ordinal !== position + 1 ||
      receipt.sp !== getReviveSp(receipt.ordinal, state.rulesetVersion) ||
      grantIds.has(receipt.grantId) ||
      deathIds.has(receipt.deathId) ||
      !['granted', 'applied', 'forfeited'].includes(receipt.status)
    )
      throw new RangeError('Invalid revive receipt.');
    grantIds.add(receipt.grantId);
    deathIds.add(receipt.deathId);
  });
}

/** Private helper for authoritative logic/tests; does expose the safe side. */
export function getCurrentRow(state: RunState) {
  const position = BigInt(state.lastClearedRow) - BigInt(state.bufferOffset);
  if (position < 0n || position >= BigInt(state.rows.length))
    throw new RangeError('Current row outside buffer.');
  return state.rows[Number(position)];
}

function keepWindow(state: RunState, rng: RandomSource): RunState {
  const currentIndex = BigInt(state.lastClearedRow);
  const first =
    currentIndex > BigInt(state.buffer.history) ? currentIndex - BigInt(state.buffer.history) : 0n;
  const rows = state.rows.filter((row) => BigInt(row.index) >= first);
  const missing = currentIndex + BigInt(state.buffer.ahead) - BigInt(state.stream.nextIndex);
  if (missing < 0n || missing > BigInt(MAX_BUFFER_ROWS))
    throw new RangeError('Invalid row refill.');
  const generated = takeRows(state.stream, Number(missing), rng);
  return {
    ...state,
    rows: [...rows, ...generated.rows],
    stream: generated.stream,
    bufferOffset: first.toString(),
    resolutions: state.resolutions.filter((row) => BigInt(row.index) >= first),
  };
}

function result(
  state: RunState,
  events: readonly RunEvent[],
  reason: RejectionReason | null = null,
): TransitionResult {
  return { state, events, accepted: reason === null, reason };
}

function eventTime(state: RunState) {
  return { activeTimeMs: state.activeTimeMs, observedAt: state.lastObservedAt };
}

function finish(state: RunState, reason: EndReason, events: RunEvent[]): RunState {
  const finalResult: RunResult = {
    ...(state.storeTest ? { storeTest: { ...state.storeTest } } : {}),
    runId: state.runId,
    rulesetVersion: state.rulesetVersion,
    lastClearedRow: state.lastClearedRow,
    fatalRow: state.death?.fatalRow ?? null,
    deathCause: state.death?.cause ?? null,
    endReason: reason,
    revivesGranted: state.revivesGranted,
    revivesApplied: state.revivesApplied,
    revivesToReachScore: state.revivesToReachScore,
    achievedAt: state.achievedAt,
    endedAt: state.lastObservedAt,
    activeTimeMs: state.activeTimeMs,
    sp: state.sp,
    hints: state.hints,
  };
  events.push({ ...eventTime(state), type: 'run-ended', result: finalResult });
  return { ...state, status: 'finished', effects: [], result: finalResult };
}

function die(state: RunState, cause: DeathCause, events: RunEvent[]): RunState {
  const sequence = state.deaths + 1;
  const death = {
    id: `${state.runId}:death:${sequence}`,
    sequence,
    fatalRow: state.currentRow,
    cause,
    activeTimeMs: state.activeTimeMs,
    observedAt: state.lastObservedAt,
  };
  const dead: RunState = {
    ...state,
    status: 'dead',
    sp: 0,
    deaths: sequence,
    death,
    pendingReward: null,
  };
  events.push({ ...eventTime(dead), type: 'death', death });
  return state.revivesApplied === getMaxRevives(state.rulesetVersion)
    ? finish(dead, 'revive-limit', events)
    : dead;
}

/** At most nine pulses per remaining effect, independent of an arbitrarily large clock jump. */
function settleTime(state: RunState, context: TransitionContext, events: RunEvent[]): RunState {
  let next = { ...state, lastObservedAt: context.achievedAt };
  while (true) {
    let due = Number.MAX_SAFE_INTEGER;
    for (const effect of next.effects) {
      due = Math.min(due, effect.expiresAt);
      if (effect.nextTickAt !== null && effect.nextTickAt < effect.expiresAt)
        due = Math.min(due, effect.nextTickAt);
    }
    const deadline = next.pacing ? rowDeadline(next.pacing) : null;
    if (deadline !== null) due = Math.min(due, deadline, next.pacing!.nextSurvivalBonusAt);
    if (due === Number.MAX_SAFE_INTEGER && next.effects.length === 0 && !next.pacing) break;
    if (due > context.activeTimeMs) break;
    const expired = next.effects.filter((effect) => effect.expiresAt <= due);
    let delta = 0;
    let pulses = 0;
    const effects = next.effects
      .filter((effect) => effect.expiresAt > due)
      .map((effect) => {
        if (effect.nextTickAt !== due) return effect;
        delta += effect.kind === 'regen_5s' ? EFFECT_TICK_SP : -EFFECT_TICK_SP;
        pulses += 1;
        return { ...effect, nextTickAt: addSafeInteger(due, EFFECT_TICK_MS, 'Next effect tick') };
      });
    next = { ...next, effects, activeTimeMs: due, sp: clampSp(next.sp + delta) };
    if (expired.length)
      events.push({
        ...eventTime(next),
        type: 'effects-expired',
        kinds: expired.map((effect) => effect.kind),
      });
    if (pulses) events.push({ ...eventTime(next), type: 'effects-ticked', delta, sp: next.sp });
    if (next.sp === 0) return die(next, 'drain', events);
    // An expired row and a lethal periodic pulse win over a simultaneous bonus.
    if (deadline === due) return die(next, 'idle', events);
    if (next.pacing?.nextSurvivalBonusAt === due) {
      const sp = clampSp(next.sp + SURVIVAL_BONUS_SP);
      events.push({
        ...eventTime(next),
        type: 'survival-bonus',
        amount: SURVIVAL_BONUS_SP,
        spDelta: sp - next.sp,
        sp,
        minute: due / SURVIVAL_BONUS_INTERVAL_MS,
      });
      next = {
        ...next,
        sp,
        pacing: { ...next.pacing, nextSurvivalBonusAt: nextSurvivalBonusAt(due) },
      };
    }
  }
  return { ...next, activeTimeMs: context.activeTimeMs };
}

export function getRunResult(state: RunState): RunResult | null {
  return state.result;
}

type RewardCommand = Extract<RunCommand, { deathId: string }>;

function rewardTransition(
  state: RunState,
  command: RewardCommand,
  context: TransitionContext,
): TransitionResult {
  assertNonEmpty(command.deathId, 'Death ID');
  assertNonNegativeInteger(command.ordinal, 'Revive ordinal');
  if ('grantId' in command) assertNonEmpty(command.grantId, 'Grant ID');
  if ('intentId' in command && command.intentId !== undefined)
    assertNonEmpty(command.intentId, 'Intent ID');
  const existing = state.reviveReceipts.find((receipt) => receipt.deathId === command.deathId);
  if (command.type === 'grant-revive' && existing) {
    return result(
      state,
      [],
      existing.grantId === command.grantId && existing.ordinal === command.ordinal
        ? 'duplicate-revive'
        : 'reward-already-granted',
    );
  }
  if (command.type === 'apply-revive' && existing?.status === 'applied') {
    return result(
      state,
      [],
      existing.grantId === command.grantId && existing.ordinal === command.ordinal
        ? 'duplicate-revive'
        : 'grant-mismatch',
    );
  }
  if (state.status !== 'dead' || !state.death) return result(state, [], 'not-dead');
  if (command.deathId !== state.death.id) return result(state, [], 'wrong-death');
  if (command.ordinal !== state.revivesApplied + 1)
    return result(state, [], 'wrong-revive-ordinal');

  const next = { ...state, lastObservedAt: context.achievedAt };
  const pending = state.pendingReward;
  switch (command.type) {
    case 'mark-reward-pending': {
      if (existing) return result(state, [], 'reward-already-granted');
      if (pending) return result(state, [], 'reward-pending');
      if (state.revivesGranted >= getMaxRevives(state.rulesetVersion))
        return result(state, [], 'revive-limit');
      const reward = {
        deathId: command.deathId,
        ordinal: command.ordinal,
        intentId: command.intentId,
      };
      return result({ ...next, pendingReward: reward }, [
        { ...eventTime(next), type: 'reward-pending', reward },
      ]);
    }
    case 'clear-reward-pending': {
      if (
        !pending ||
        pending.intentId !== command.intentId ||
        pending.ordinal !== command.ordinal ||
        pending.deathId !== command.deathId
      ) {
        return result(state, [], 'wrong-reward-intent');
      }
      return result({ ...next, pendingReward: null }, [
        { ...eventTime(next), type: 'reward-cleared', intentId: command.intentId },
      ]);
    }
    case 'grant-revive': {
      if (state.reviveReceipts.some((receipt) => receipt.grantId === command.grantId))
        return result(state, [], 'grant-mismatch');
      if (state.revivesGranted >= getMaxRevives(state.rulesetVersion))
        return result(state, [], 'revive-limit');
      if (state.revivesGranted + 1 !== command.ordinal)
        return result(state, [], 'wrong-revive-ordinal');
      if (
        pending &&
        (pending.intentId !== command.intentId ||
          pending.ordinal !== command.ordinal ||
          pending.deathId !== command.deathId)
      ) {
        return result(state, [], 'wrong-reward-intent');
      }
      const receipt: ReviveReceipt = {
        deathId: command.deathId,
        ordinal: command.ordinal,
        grantId: command.grantId,
        sp: getReviveSp(command.ordinal, state.rulesetVersion),
        status: 'granted',
      };
      return result(
        {
          ...next,
          pendingReward: null,
          revivesGranted: state.revivesGranted + 1,
          reviveReceipts: [...state.reviveReceipts, receipt],
        },
        [{ ...eventTime(next), type: 'revive-granted', receipt }],
      );
    }
    case 'apply-revive': {
      if (pending) return result(state, [], 'reward-pending');
      if (!existing) return result(state, [], 'missing-grant');
      if (
        existing.grantId !== command.grantId ||
        existing.ordinal !== command.ordinal ||
        existing.status !== 'granted'
      ) {
        return result(state, [], 'grant-mismatch');
      }
      const receipt: ReviveReceipt = { ...existing, status: 'applied' };
      return result(
        {
          ...next,
          status: 'playing',
          death: null,
          sp: receipt.sp,
          effects: [],
          ...(state.pacing
            ? {
                pacing: {
                  rowEnteredAt: state.activeTimeMs,
                  nextSurvivalBonusAt: Math.max(
                    state.pacing.nextSurvivalBonusAt,
                    nextSurvivalBonusAt(state.activeTimeMs),
                  ),
                },
              }
            : {}),
          revivesApplied: state.revivesApplied + 1,
          reviveReceipts: state.reviveReceipts.map((previous) =>
            previous === existing ? receipt : previous,
          ),
        },
        [{ ...eventTime(next), type: 'revive-applied', receipt }],
      );
    }
  }
}

/** Local simulator grants only; the host commits the wallet and this checkpoint atomically. */
function testResourceTransition(
  state: RunState,
  command: Extract<RunCommand, { type: 'test-resource' }>,
  context: TransitionContext,
  events: RunEvent[],
): TransitionResult {
  const economy = state.storeTest;
  if (
    state.rulesetVersion !== STORE_TEST_RULESET_VERSION ||
    !state.runId.startsWith('practice-') ||
    !economy
  )
    return result(state, events, 'test-only');
  if (command.sequence !== economy.sequence + 1) return result(state, events, 'duplicate-revive');
  assertNonNegativeInteger(command.amount, 'Resource amount');
  assertNonNegativeInteger(command.sequence, 'Resource sequence');
  const resource = command.resource;
  if (!['sp', 'hints', 'credit', 'ad'].includes(resource) || command.amount < 1)
    return result(state, events, 'invalid-resource');
  let next: RunState;
  if (resource === 'sp' || resource === 'hints') {
    if (state.status !== 'playing') return result(state, events, 'not-playing');
    if (resource === 'sp') {
      if (command.amount > Math.min(MAX_SP - state.sp, RESERVE_SP_PER_RUN - economy.reserveSpent))
        return result(state, events, 'resource-limit');
      next = { ...state, sp: state.sp + command.amount };
    } else {
      if (command.amount !== 1) return result(state, events, 'invalid-resource');
      next = { ...state, hints: addSafeInteger(state.hints, 1, 'Hints') };
    }
  } else {
    if (command.amount !== 1) return result(state, events, 'invalid-resource');
    if (state.status !== 'dead' || !state.death) return result(state, events, 'not-dead');
    if (resource === 'ad' && state.revivesApplied >= MAX_REVIVES)
      return result(state, events, 'revive-limit');
    if (state.pendingReward || state.revivesGranted !== state.revivesApplied)
      return result(state, events, 'reward-pending');
    const grantId = `${state.runId}:test:${command.sequence}`;
    const identity = { deathId: state.death.id, ordinal: state.revivesApplied + 1, grantId };
    const granted = rewardTransition(state, { type: 'grant-revive', ...identity }, context);
    if (!granted.accepted) return result(state, events, granted.reason);
    const applied = rewardTransition(granted.state, { type: 'apply-revive', ...identity }, context);
    if (!applied.accepted) return result(state, events, applied.reason);
    next = applied.state;
    events.push(...granted.events, ...applied.events);
  }
  next = {
    ...next,
    storeTest: {
      assisted: economy.assisted || resource !== 'ad',
      reserveSpent: economy.reserveSpent + (resource === 'sp' ? command.amount : 0),
      hintsSpent: economy.hintsSpent + (resource === 'hints' ? 1 : 0),
      creditContinues: economy.creditContinues + (resource === 'credit' ? 1 : 0),
      adContinues: economy.adContinues + (resource === 'ad' ? 1 : 0),
      sequence: command.sequence,
    },
  };
  events.push({ ...eventTime(next), type: 'test-resource-used', resource, amount: command.amount });
  return result(next, events);
}

/** Pure transition. The caller owns authenticated commands, active clock and RNG adapter. */
export function transitionRun(
  state: RunState,
  command: RunCommand,
  context: TransitionContext,
): TransitionResult {
  assertRunState(state, context.rng);
  assertNonNegativeInteger(context.activeTimeMs, 'Active time');
  assertNonNegativeInteger(context.achievedAt, 'Observation timestamp');
  if (context.activeTimeMs < state.activeTimeMs || context.achievedAt < state.lastObservedAt) {
    throw new RangeError('Clocks cannot move backwards.');
  }
  if (state.status === 'finished') return result(state, [], 'finished');
  if (state.status === 'dead' && context.activeTimeMs !== state.activeTimeMs) {
    throw new RangeError('The active clock must be frozen while dead or awaiting a reward.');
  }
  if ('deathId' in command) return rewardTransition(state, command, context);
  if ('row' in command) {
    decimal(command.row);
    assertNonNegativeInteger(command.life, 'Expected life');
    if (command.life !== state.revivesApplied) return result(state, [], 'wrong-life');
    if (command.row !== state.currentRow) return result(state, [], 'wrong-row');
    if (state.status !== 'playing') return result(state, [], 'not-playing');
  }
  if (command.type === 'choose' && command.side !== 'left' && command.side !== 'right') {
    throw new RangeError('Choose requires left or right.');
  }
  if (command.type === 'tick' && state.status !== 'playing')
    return result(state, [], 'not-playing');

  const events: RunEvent[] = [];
  let next =
    state.status === 'playing'
      ? settleTime(state, context, events)
      : { ...state, lastObservedAt: context.achievedAt };
  if (state.status === 'playing' && next.status !== 'playing') {
    return result(next, events, command.type === 'tick' ? null : 'died-before-command');
  }
  switch (command.type) {
    case 'tick':
      return result(next, events);
    case 'test-resource':
      return testResourceTransition(next, command, context, events);
    case 'end': {
      if (next.pendingReward) return result(next, events, 'reward-pending');
      const unused = next.reviveReceipts.some((receipt) => receipt.status === 'granted');
      if (unused && command.forfeitGrantedReward !== true)
        return result(next, events, 'forfeiture-required');
      if (unused)
        next = {
          ...next,
          reviveReceipts: next.reviveReceipts.map((receipt) =>
            receipt.status === 'granted' ? { ...receipt, status: 'forfeited' } : receipt,
          ),
        };
      return result(finish(next, next.death ? 'death-declined' : 'user-ended', events), events);
    }
    case 'hint': {
      if (next.current.revealedSafeSide !== null) return result(next, events, 'already-revealed');
      if (next.hints === 0) return result(next, events, 'no-hints');
      const safeSide = getCurrentRow(next).safeSide;
      next = {
        ...next,
        hints: next.hints - 1,
        current: { ...next.current, revealedSafeSide: safeSide },
        ...([SCAN_RULESET_VERSION, STORE_TEST_RULESET_VERSION].includes(next.rulesetVersion) &&
        next.pacing
          ? { pacing: { ...next.pacing, hintScanStartedAt: next.activeTimeMs } }
          : {}),
      };
      events.push({ ...eventTime(next), type: 'hint-used', row: next.currentRow, safeSide });
      return result(next, events);
    }
    case 'mystery': {
      if (!getCurrentRow(next).hasMystery) return result(next, events, 'no-mystery');
      if (next.current.mysteryOutcome !== null) return result(next, events, 'mystery-consumed');
      const draw = drawRandom(next.mysteryRng, context.rng);
      const kind = rollMysteryEffect(draw.value);
      const applied = applyMysteryEffect(kind, next.activeTimeMs);
      const hints =
        applied.hintDelta < 0
          ? Math.max(0, next.hints + applied.hintDelta)
          : addSafeInteger(next.hints, applied.hintDelta, 'Hints');
      const sp = clampSp(next.sp + applied.spDelta);
      events.push({
        ...eventTime(next),
        type: 'mystery-resolved',
        row: next.currentRow,
        kind,
        spDelta: sp - next.sp,
        hintDelta: hints - next.hints,
      });
      next = {
        ...next,
        sp,
        hints,
        mysteryRng: draw.cursor,
        effects: mergeEffect(next.effects, applied.addedEffect, next.activeTimeMs),
        current: { ...next.current, mysteryOutcome: kind },
      };
      return result(sp === 0 ? die(next, 'mystery', events) : next, events);
    }
    case 'choose': {
      const row = getCurrentRow(next);
      const wrong = command.side !== row.safeSide;
      const resolution = wrong
        ? resolveWrongTileDelta(getRowBandDamage(next.currentRow), next.effects, next.activeTimeMs)
        : { delta: 0, newEffects: [...next.effects] };
      const sp = clampSp(next.sp + resolution.delta);
      events.push({
        ...eventTime(next),
        type: 'choice-resolved',
        row: next.currentRow,
        side: command.side,
        wrong,
        spDelta: sp - next.sp,
        consumedKind: resolution.consumedKind ?? null,
      });
      next = {
        ...next,
        sp,
        effects: resolution.newEffects,
        current: {
          ...next.current,
          revealedSafeSide: row.safeSide,
          lastChoice: { side: command.side, wrong },
        },
      };
      if (sp === 0) return result(die(next, 'wrong_tile', events), events);
      const clearedRow = next.currentRow;
      next = keepWindow(
        {
          ...next,
          lastClearedRow: clearedRow,
          currentRow: addDecimal(clearedRow),
          achievedAt: context.achievedAt,
          revivesToReachScore: next.revivesApplied,
          resolutions: [...next.resolutions, { index: row.index, ...next.current }],
          current: emptyCurrent(),
          ...(next.pacing
            ? {
                pacing: {
                  rowEnteredAt: next.activeTimeMs,
                  nextSurvivalBonusAt: next.pacing.nextSurvivalBonusAt,
                },
              }
            : {}),
        },
        context.rng,
      );
      events.push({
        ...eventTime(next),
        type: 'row-cleared',
        row: clearedRow,
        revivesToReachScore: next.revivesToReachScore,
      });
      return result(next, events);
    }
  }
}
