import {
  createRunPacing,
  nextSurvivalBonusAt,
  PACED_RULESET_VERSION,
  SCAN_RULESET_VERSION,
  rowDeadline,
  SURVIVAL_BONUS_INTERVAL_MS,
  SURVIVAL_BONUS_SP,
} from './pacing.ts';
import {
  assertDiscovery,
  discoverMystery,
  settleDiscoveryIntroduction,
  endDiscoveryIntroduction,
} from './discovery.ts';
import {
  assertActiveEffects,
  isTimedEffect,
  scaleSpDelta,
  tickRowEffects,
} from './effect-rules.ts';
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
  prepareMysteryRow,
  scheduleNextMystery,
  mysteryEligibleKinds,
  recordMysteryOpen,
  advanceMysteryRow,
  assertMysteryDirector,
  getDeathClock,
  rebaseDeathPressure,
  deathClockPaid,
} from './mystery-director.ts';
import {
  assertRowStream,
  assertRowRisk,
  createRowStream,
  takeRows,
  hintSafeSide,
  isBrokenTile,
} from './rows.ts';
import {
  assertPact,
  choosePact,
  drawOmen,
  isPactKind,
  offerPact,
  resolvePactStep,
} from './pacts.ts';
import {
  clampSp,
  EFFECT_TICK_MS,
  EFFECT_TICK_SP,
  getReviveSp,
  getRowBandDamage,
  getRuleset,
  MAX_BUFFER_ROWS,
  MAX_REVIVES,
  getMaxRevives,
  STORE_TEST_RULESET_VERSION,
  RESERVE_SP_PER_RUN,
  RULESET_VERSION,
  supportsPacts,
  STARTING_HINTS,
  STARTING_SP,
  usesMysteryDirectorRules,
  usesDiscoveryRules,
  usesStoreTestRules,
  CHOICE_GRACE_MS,
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
  if (options.discoveredMysteries !== undefined) {
    if (!usesDiscoveryRules(rulesetVersion)) throw new RangeError('Discoveries outside v7.');
    assertDiscovery(
      { known: options.discoveredMysteries, introduction: null },
      options.activeTimeMs ?? 0,
    );
  }
  assertNonEmpty(options.runId, 'Run ID');
  if (usesStoreTestRules(rulesetVersion) && !options.runId.startsWith('practice-'))
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
  const state: RunState = {
    ...(usesStoreTestRules(rulesetVersion)
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
    ...(usesDiscoveryRules(rulesetVersion)
      ? { discovery: { known: [...(options.discoveredMysteries ?? [])], introduction: null } }
      : {}),
    ...(supportsPacts(rulesetVersion) ? { pact: null } : {}),
    ...(usesMysteryDirectorRules(rulesetVersion)
      ? { mysteryDirector: { nextRow: '5', lastStepAt: activeTimeMs, history: [], rhythm: null } }
      : {}),
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
  return prepareMysteryRow(
    state.mysteryDirector ? scheduleNextMystery(state, '0', rng) : state,
    rng,
  );
}

/** Validates trusted core checkpoints; network JSON validation/authentication belongs to the adapter. */
export function assertRunState(state: RunState, rng?: RandomSource): void {
  if (state.schemaVersion !== 1) throw new RangeError('Unsupported run schema.');
  getRuleset(state.rulesetVersion);
  assertPact(state);
  assertMysteryDirector(state);
  if (usesDiscoveryRules(state.rulesetVersion)) {
    const discovery = state.discovery;
    if (!discovery) throw new RangeError('Missing mystery discoveries.');
    assertDiscovery(discovery, state.activeTimeMs);
    if (
      discovery.introduction &&
      (state.status !== 'playing' ||
        state.pact?.phase === 'offered' ||
        state.current.mysteryOutcome !== discovery.introduction.kind)
    )
      throw new RangeError('Introduction outside active play.');
  } else if (state.discovery !== undefined) throw new RangeError('Discoveries outside v7.');
  assertNonEmpty(state.runId, 'Run ID');
  if (usesStoreTestRules(state.rulesetVersion)) {
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
    (getRuleset(state.rulesetVersion).maxSp !== null &&
      state.sp > getRuleset(state.rulesetVersion).maxSp!) ||
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
    assertRowRisk(row, state.rulesetVersion);
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
  if (
    state.current.noSafeTile !== undefined &&
    (state.current.noSafeTile !== true ||
      hintSafeSide(getCurrentRow(state)) !== null ||
      state.current.revealedSafeSide !== null)
  )
    throw new RangeError('Invalid no-safe-tile hint.');
  assertActiveEffects(state.effects, state.activeTimeMs, state.rulesetVersion);
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
  return {
    ...state,
    status: 'finished',
    effects: [],
    ...(state.pact ? { pact: null } : {}),
    result: finalResult,
    ...(state.discovery ? { discovery: { ...state.discovery, introduction: null } } : {}),
  };
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
    ...(state.discovery ? { discovery: { ...state.discovery, introduction: null } } : {}),
    sp: 0,
    deaths: sequence,
    death,
    pendingReward: null,
    ...(state.pact ? { pact: null } : {}),
  };
  events.push({ ...eventTime(dead), type: 'death', death });
  return state.revivesApplied === getMaxRevives(state.rulesetVersion)
    ? finish(dead, 'revive-limit', events)
    : dead;
}

/** At most nine pulses per remaining effect, independent of an arbitrarily large clock jump. */
function settleTime(state: RunState, context: TransitionContext, events: RunEvent[]): RunState {
  state = settleDiscoveryIntroduction(state, context.activeTimeMs, context.achievedAt);
  const clock = getDeathClock(state);
  const clockExpired = clock !== null && clock.expiresAt <= context.activeTimeMs;
  if (clockExpired) context = { ...context, activeTimeMs: clock.expiresAt };
  // Reading a contract must not burn the five-second effects already owned.
  // This deterministic freeze also survives checkpoint/recovery, with no UI timer authority.
  if (state.pact?.phase === 'offered') {
    const elapsed = usesMysteryDirectorRules(state.rulesetVersion)
      ? Math.min(
          context.activeTimeMs - state.activeTimeMs,
          Math.max(0, state.pact.offeredAt! + CHOICE_GRACE_MS - state.activeTimeMs),
        )
      : context.activeTimeMs - state.activeTimeMs;
    state = {
      ...state,
      activeTimeMs: state.activeTimeMs + elapsed,
      lastObservedAt: context.achievedAt,
      ...(state.mysteryDirector?.rhythm
        ? {
            mysteryDirector: {
              ...state.mysteryDirector,
              rhythm: {
                ...state.mysteryDirector.rhythm,
                startedAt: addSafeInteger(
                  state.mysteryDirector.rhythm.startedAt,
                  elapsed,
                  'Frozen rhythm start',
                ),
                expiresAt: addSafeInteger(
                  state.mysteryDirector.rhythm.expiresAt,
                  elapsed,
                  'Frozen rhythm expiry',
                ),
              },
            },
          }
        : {}),
      effects: state.effects.map((effect) =>
        !isTimedEffect(effect)
          ? {
              ...effect,
              startedAt: addSafeInteger(effect.startedAt, elapsed, 'Frozen effect start'),
            }
          : {
              ...effect,
              startedAt: addSafeInteger(effect.startedAt, elapsed, 'Frozen effect start'),
              expiresAt: addSafeInteger(effect.expiresAt, elapsed, 'Frozen effect expiry'),
              nextTickAt:
                effect.nextTickAt === null
                  ? null
                  : addSafeInteger(effect.nextTickAt, elapsed, 'Frozen effect tick'),
            },
      ),
    };
    if (!usesMysteryDirectorRules(state.rulesetVersion)) return state;
  }
  let next = { ...state, lastObservedAt: context.achievedAt };
  while (true) {
    let due = Number.MAX_SAFE_INTEGER;
    const pressure = next.mysteryDirector?.pressure;
    if (clock && clock.warningAt <= context.activeTimeMs && next.activeTimeMs < clock.expiresAt)
      due = pressure
        ? clock.warningAt + (Math.floor((next.activeTimeMs - clock.warningAt) / 100) + 1) * 100
        : clock.warningAt;
    for (const effect of next.effects) {
      if (!isTimedEffect(effect)) continue;
      due = Math.min(due, effect.expiresAt);
      if (effect.nextTickAt !== null && effect.nextTickAt < effect.expiresAt)
        due = Math.min(due, effect.nextTickAt);
    }
    const deadline = next.pacing ? rowDeadline(next.pacing) : null;
    if (deadline !== null) due = Math.min(due, deadline, next.pacing!.nextSurvivalBonusAt);
    if (due === Number.MAX_SAFE_INTEGER) break;
    if (due > context.activeTimeMs) break;
    const expired = next.effects.filter(
      (effect) => isTimedEffect(effect) && effect.expiresAt <= due,
    );
    let delta = 0;
    let pulses = 0;
    const effects = next.effects
      .filter((effect) => !isTimedEffect(effect) || effect.expiresAt > due)
      .map((effect) => {
        if (!isTimedEffect(effect) || effect.nextTickAt !== due) return effect;
        delta += scaleSpDelta(
          { effects: next.effects, activeTimeMs: due },
          effect.kind === 'regen_5s' ? EFFECT_TICK_SP : -EFFECT_TICK_SP,
        );
        pulses += 1;
        return { ...effect, nextTickAt: addSafeInteger(due, EFFECT_TICK_MS, 'Next effect tick') };
      });
    const previousSp = next.sp;
    let pressureLoss = 0;
    let paid = pressure?.paid ?? 0;
    if (pressure && clock && due > pressure.anchorAt) {
      paid = deathClockPaid(pressure.anchorSp, pressure.anchorAt, clock.warningAt, due);
      pressureLoss = paid - pressure.paid;
      if (due === clock.expiresAt) pressureLoss = Math.max(0, next.sp + delta);
    }
    next = {
      ...next,
      effects,
      activeTimeMs: due,
      sp: clampSp(next.sp + delta - pressureLoss, next.rulesetVersion),
      ...(next.mysteryDirector && clock && due >= clock.warningAt
        ? {
            mysteryDirector: {
              ...next.mysteryDirector,
              pressure:
                !pressure || delta !== 0
                  ? {
                      anchorAt: due,
                      anchorSp: Math.max(0, next.sp + delta - pressureLoss),
                      paid: 0,
                    }
                  : { ...pressure, paid },
            },
          }
        : {}),
    };
    if (expired.length)
      events.push({
        ...eventTime(next),
        type: 'effects-expired',
        kinds: expired.map((effect) => effect.kind),
      });
    if (pulses)
      events.push({
        ...eventTime(next),
        type: 'effects-ticked',
        delta,
        appliedDelta: next.sp - previousSp,
        sp: next.sp,
      });
    if (pressureLoss > 0)
      events.push({
        ...eventTime(next),
        type: 'death-clock-ticked',
        delta: -pressureLoss,
        sp: next.sp,
      });
    if (next.sp === 0) return die(next, pressureLoss > 0 ? 'death_clock' : 'drain', events);
    if (deadline === due) return die(next, 'idle', events);
    if (next.pacing?.nextSurvivalBonusAt === due) {
      const sp = clampSp(next.sp + SURVIVAL_BONUS_SP, next.rulesetVersion);
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
  next = { ...next, activeTimeMs: context.activeTimeMs };
  return clockExpired ? die(next, 'death_clock', events) : next;
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
          ...(state.mysteryDirector
            ? {
                mysteryDirector: {
                  ...state.mysteryDirector,
                  lastStepAt: state.activeTimeMs,
                  pressure: undefined,
                },
              }
            : {}),
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
          effects: [],
          ...(state.pact ? { pact: null } : {}),
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
  if (!usesStoreTestRules(state.rulesetVersion) || !state.runId.startsWith('practice-') || !economy)
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
      if (
        command.amount >
        Math.min(
          (getRuleset(state.rulesetVersion).maxSp ?? Number.MAX_SAFE_INTEGER) - state.sp,
          RESERVE_SP_PER_RUN - economy.reserveSpent,
        )
      )
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
  return result(rebaseDeathPressure(next, state.sp), events);
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
  next = prepareMysteryRow(next, context.rng);
  if (next.pact?.phase === 'offered' && ['choose', 'hint', 'mystery'].includes(command.type)) {
    return result(next, events, 'pact-decision-required');
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
      if (next.pact?.kind === 'false_oracle' && next.pact.phase === 'active')
        return result(next, events, 'oracle-blocks-hints');
      if (next.current.revealedSafeSide !== null || next.current.noSafeTile)
        return result(next, events, 'already-revealed');
      if (next.hints === 0) return result(next, events, 'no-hints');
      const safeSide = hintSafeSide(getCurrentRow(next));
      if (safeSide === null) {
        next = { ...next, current: { ...next.current, noSafeTile: true } };
        events.push({ ...eventTime(next), type: 'hint-unavailable', row: next.currentRow });
        return result(next, events);
      }
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
      const directed = usesMysteryDirectorRules(next.rulesetVersion);
      const kind = rollMysteryEffect(
        draw.value,
        next.rulesetVersion,
        !next.pact,
        directed ? mysteryEligibleKinds(next, next.current.mysteryTier!) : undefined,
      );
      const applied = applyMysteryEffect(kind, next.activeTimeMs);
      const beforeMysterySp = next.sp;
      const hints =
        applied.hintDelta < 0
          ? Math.max(0, next.hints + applied.hintDelta)
          : addSafeInteger(next.hints, applied.hintDelta, 'Hints');
      const sp = clampSp(next.sp + scaleSpDelta(next, applied.spDelta), next.rulesetVersion);
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
        effects: mergeEffect(
          next.effects,
          applied.addedEffect,
          next.activeTimeMs,
          next.rulesetVersion,
        ),
        ...(isPactKind(kind)
          ? { pact: { ...offerPact(kind), ...(directed ? { offeredAt: next.activeTimeMs } : {}) } }
          : {}),
        current: { ...next.current, mysteryOutcome: kind },
      };
      if (directed)
        next = rebaseDeathPressure(recordMysteryOpen(next, kind, context.rng), beforeMysterySp);
      next = discoverMystery(next, kind);
      return result(sp === 0 ? die(next, 'mystery', events) : next, events);
    }
    case 'pact': {
      const pact = next.pact;
      const beforePactSp = next.sp;
      const pactRow = getCurrentRow(next);
      const change = choosePact(
        next,
        command.option,
        pactRow.risk?.lowRiskSide ?? pactRow.safeSide,
        context.rng,
      );
      if (!pact || !change) return result(next, events, 'invalid-pact-choice');
      const reward =
        (pact.kind === 'blood_oath' ||
          (pact.kind === 'hungry_vault' && command.option === 'cashout')) &&
        change.spDelta > 0;
      const sp = clampSp(
        next.sp + (reward ? scaleSpDelta(next, change.spDelta) : change.spDelta),
        next.rulesetVersion,
      );
      const hints =
        change.hintDelta < 0
          ? Math.max(0, next.hints + change.hintDelta)
          : addSafeInteger(next.hints, change.hintDelta, 'Hints');
      events.push({
        ...eventTime(next),
        type: 'pact-resolved',
        kind: pact.kind,
        option: command.option,
        outcome: change.outcome,
        spDelta: sp - next.sp,
        hintDelta: hints - next.hints,
        bank: change.pact?.bank ?? 0,
      });
      next = {
        ...next,
        sp,
        hints,
        pact: change.pact
          ? {
              ...change.pact,
              ...(usesMysteryDirectorRules(next.rulesetVersion)
                ? { offeredAt: next.pact!.offeredAt }
                : {}),
            }
          : null,
        mysteryRng: change.cursor,
        ...(next.mysteryDirector && pact.phase === 'offered'
          ? {
              mysteryDirector: {
                ...next.mysteryDirector,
                lastStepAt: next.activeTimeMs,
                pressure: undefined,
              },
            }
          : {}),
      };
      next = rebaseDeathPressure(next, beforePactSp);
      return result(sp === 0 ? die(next, 'mystery', events) : next, events);
    }
    case 'choose': {
      next = endDiscoveryIntroduction(next);
      const row = getCurrentRow(next);
      const wrong = isBrokenTile(row, command.side);
      const resolution = wrong
        ? resolveWrongTileDelta(
            getRowBandDamage(next.currentRow, next.rulesetVersion),
            next.effects,
            next.activeTimeMs,
            next.rulesetVersion,
          )
        : { delta: 0, newEffects: [...next.effects] };
      const pactChange = resolvePactStep(next, wrong, resolution.delta);
      const tileDelta = scaleSpDelta(next, resolution.delta);
      const pactDelta = pactChange
        ? next.pact?.kind === 'blood_oath' ||
          next.pact?.kind === 'false_oracle' ||
          (next.pact?.kind === 'hungry_vault' && pactChange.spDelta > 0)
          ? scaleSpDelta(next, pactChange.spDelta)
          : pactChange.spDelta
        : 0;
      const tileSp = clampSp(next.sp + tileDelta, next.rulesetVersion);
      const beforeRows = clampSp(next.sp + tileDelta + pactDelta, next.rulesetVersion);
      const rowTick =
        beforeRows > 0
          ? tickRowEffects(resolution.newEffects)
          : { effects: resolution.newEffects, gain: 0, loss: 0, rowsLeft: 0 };
      const rowDelta = scaleSpDelta(next, rowTick.gain) + scaleSpDelta(next, rowTick.loss);
      const sp = clampSp(beforeRows + rowDelta, next.rulesetVersion);
      events.push({
        ...eventTime(next),
        type: 'choice-resolved',
        row: next.currentRow,
        side: command.side,
        wrong,
        spDelta: sp - next.sp,
        consumedKind: resolution.consumedKind ?? null,
        ...(wrong &&
        resolution.delta === 0 &&
        next.effects.some((effect) => effect.kind === 'coyote_10s')
          ? { protectedBy: 'coyote_10s' as const }
          : {}),
      });
      if (pactChange && next.pact)
        events.push({
          ...eventTime(next),
          type: 'pact-resolved',
          kind: next.pact.kind,
          option: 'step',
          outcome: pactChange.outcome,
          spDelta: beforeRows - tileSp,
          hintDelta: 0,
          bank: pactChange.pact?.bank ?? 0,
        });
      if (rowTick.gain !== 0 || rowTick.loss !== 0)
        events.push({
          ...eventTime(next),
          type: 'row-effect-ticked',
          kind: rowDelta >= 0 ? 'regen_3rows' : 'bleed_3rows',
          delta: sp - beforeRows,
          sp,
          rowsLeft: rowTick.rowsLeft,
        });
      next = {
        ...next,
        sp,
        effects: rowTick.effects,
        ...(pactChange ? { pact: pactChange.pact } : {}),
        current: {
          ...next.current,
          revealedSafeSide: hintSafeSide(row),
          lastChoice: { side: command.side, wrong },
        },
      };
      if (sp === 0)
        return result(
          die(
            next,
            beforeRows > 0 && rowDelta < 0
              ? 'drain'
              : pactChange && pactDelta < 0 && tileSp > 0
                ? 'mystery'
                : 'wrong_tile',
            events,
          ),
          events,
        );
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
      next = prepareMysteryRow(advanceMysteryRow(next, clearedRow, context.rng), context.rng);
      if (next.pact?.kind === 'false_oracle' && next.pact.phase === 'active') {
        const nextRow = getCurrentRow(next);
        const omen = drawOmen(
          nextRow.risk?.lowRiskSide ?? nextRow.safeSide,
          next.mysteryRng,
          context.rng,
        );
        next = { ...next, mysteryRng: omen.cursor, pact: { ...next.pact, omen: omen.omen } };
      }
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
