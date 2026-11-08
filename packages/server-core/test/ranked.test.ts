import { describe, expect, it } from 'vitest';
import {
  getCurrentRow,
  offerPact,
  PACT_RULESET_VERSION,
  BALANCE_RULESET_VERSION,
  RISK_RULESET_VERSION,
  DIRECTOR_RULESET_VERSION,
  RELIC_RULESET_VERSION,
  DISCOVERY_RULESET_VERSION,
  discoverMystery,
  applyMysteryEffect,
} from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import { RankedAuthority, RankedError, rankedSnapshot, RANKED_RNG } from '../src/ranked.ts';
import type {
  RankedActor,
  RankedAudit,
  RankedCommand,
  RankedReceipt,
  RankedReply,
  RankedRepository,
  RankedTransaction,
  StoredRankedRun,
} from '../src/ranked.ts';
import { OperationsPolicyError } from '../src/operations-policy.ts';

interface Account {
  runs: Map<string, StoredRankedRun>;
  receipts: Map<string, RankedReceipt>;
  audit: RankedAudit[];
  regionLocks: number;
}

/** A rollback-capable serialized fake, used only to exercise the repository contract. */
class Repository implements RankedRepository {
  readonly accounts = new Map<string, Account>();
  private readonly queues = new Map<string, Promise<void>>();
  failReceipt = false;
  startProblem: OperationsPolicyError | null = null;
  recoveryProblem: OperationsPolicyError | null = null;
  readonly operationCalls: string[] = [];

  account(subject = 'account-A'): Account {
    let account = this.accounts.get(subject);
    if (!account) {
      account = { runs: new Map(), receipts: new Map(), audit: [], regionLocks: 0 };
      this.accounts.set(subject, account);
    }
    return account;
  }

  async transaction<T>(
    subject: string,
    operation: (transaction: RankedTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(subject) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(
      subject,
      previous.then(() => gate),
    );
    await previous;
    const draft = structuredClone(this.account(subject));
    const transaction: RankedTransaction = {
      authorizeStart: () => {
        this.operationCalls.push('start');
        return this.startProblem ? Promise.reject(this.startProblem) : Promise.resolve();
      },
      authorizeRecovery: () => {
        this.operationCalls.push('recovery');
        return this.recoveryProblem ? Promise.reject(this.recoveryProblem) : Promise.resolve();
      },
      getActiveRun: () =>
        Promise.resolve(
          [...draft.runs.values()].find(
            (run) => run.leaseActive !== false && run.state.status !== 'finished',
          ) ?? null,
        ),
      getRun: (runId) => Promise.resolve(draft.runs.get(runId) ?? null),
      getReceipt: (key) => Promise.resolve(draft.receipts.get(key) ?? null),
      getRegionSnapshot: () => {
        draft.regionLocks += 1;
        return Promise.resolve({
          countryCode: 'BG',
          continent: 'EU',
          mappingVersion: 'cpi-regions-2026-11-v1',
        });
      },
      saveRun: (record) => {
        draft.runs.set(record.state.runId, structuredClone(record));
        return Promise.resolve();
      },
      saveReceipt: (receipt) => {
        draft.receipts.set(receipt.key, structuredClone(receipt));
        if (this.failReceipt) throw new Error('durable-write-failed');
        return Promise.resolve();
      },
      appendAudit: (event) => {
        draft.audit.push(structuredClone(event));
        return Promise.resolve();
      },
    };
    try {
      const result = await operation(transaction);
      this.accounts.set(subject, draft);
      return result;
    } finally {
      release();
    }
  }
}

const A: RankedActor = { subject: 'account-A', deviceId: 'device-A', clientBuild: 1 };
const B: RankedActor = { subject: 'account-A', deviceId: 'device-B', clientBuild: 1 };
const OTHER: RankedActor = { subject: 'account-B', deviceId: 'device-A', clientBuild: 1 };

function setup(options: { heartbeatWindowMs?: number; rulesetVersion?: string } = {}) {
  const repository = new Repository();
  let time = 1_000_000;
  let id = 1;
  const newId = () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`;
  let secret = 1;
  const authority = new RankedAuthority({
    repository,
    now: () => time,
    newId,
    newSecret: () => String(secret++).padStart(64, '0'),
    ...options,
  });
  const advance = (ms: number) => {
    time += ms;
  };
  const start = () => authority.start(A, { idempotencyKey: newId() });
  const record = (reply: RankedReply) => repository.account().runs.get(reply.snapshot.runId)!;
  const request = (reply: RankedReply, command: RankedCommand) => ({
    runId: reply.snapshot.runId,
    sequence: reply.snapshot.nextSequence,
    idempotencyKey: newId(),
    leaseToken: reply.lease.token,
    command,
  });
  const execute = (reply: RankedReply, command: RankedCommand, actor = A) =>
    authority.execute(actor, request(reply, command));
  const choose = (reply: RankedReply) => {
    const current = record(reply);
    advance(100);
    return execute(reply, {
      type: 'choose',
      row: reply.snapshot.currentRow,
      life: 0,
      side: getCurrentRow(current.state).safeSide,
    });
  };
  return { repository, authority, newId, advance, start, record, request, execute, choose };
}

describe('ranked authority trust boundary', () => {
  it.each([DIRECTOR_RULESET_VERSION, RELIC_RULESET_VERSION, DISCOVERY_RULESET_VERSION])(
    'owns the progressive death clock in %s and exposes no private director ledger',
    async (version) => {
      const f = setup({ rulesetVersion: version });
      let reply = await f.start();
      reply = await f.execute(reply, { type: 'resume' });
      expect(reply.snapshot.deathClock).toEqual({ warningAt: 3000, expiresAt: 13000 });
      f.advance(4000);
      reply = await f.execute(reply, { type: 'heartbeat' });
      f.advance(4000);
      reply = await f.execute(reply, { type: 'heartbeat' });
      expect(reply.snapshot.sp).toBe(240);
      expect(JSON.stringify(reply)).not.toMatch(
        /mysteryDirector|lastStepAt|anchorSp|"pressure"|mysteryRng|lowRiskSide/,
      );
      f.advance(4000);
      reply = await f.execute(reply, { type: 'heartbeat' });
      f.advance(1000);
      reply = await f.execute(reply, { type: 'heartbeat' });
      expect(reply.snapshot.status).toBe('dead');
      expect(reply.snapshot.sp).toBe(0);
      expect(reply.snapshot.death?.cause).toBe('death_clock');
      expect(reply.snapshot.deathClock).toBeNull();
      expect(reply.snapshot.lastClearedRow).toBe('0');
    },
  );
  it('owns the four-second introduction and activates its effect before the next step', async () => {
    const f = setup({ rulesetVersion: DISCOVERY_RULESET_VERSION });
    let reply = await f.start();
    reply = await f.execute(reply, { type: 'resume' });
    const stored = f.record(reply);
    f.repository.account().runs.set(stored.state.runId, {
      ...stored,
      state: discoverMystery(
        {
          ...stored.state,
          current: { ...stored.state.current, mysteryOutcome: 'inversion_5s' },
          effects: [applyMysteryEffect('inversion_5s', 0).addedEffect!],
          rows: stored.state.rows.map((row) => ({
            ...row,
            safeSide: 'left',
            risk: { lowRiskSide: 'left', broken: { left: true, right: true } },
          })),
        },
        'inversion_5s',
      ),
    });
    f.advance(2000);
    reply = await f.execute(reply, { type: 'heartbeat' });
    expect(reply.snapshot.discovery!.introduction?.expiresAt).toBe(4000);
    expect(reply.snapshot.effects[0].expiresAt! - reply.snapshot.activeTimeMs).toBe(5000);
    expect(reply.snapshot.sp).toBe(300);
    reply = await f.choose(reply);
    expect(reply.snapshot.sp).toBe(305);
    expect(reply.snapshot.discovery!.introduction).toBeNull();
    expect(reply.snapshot.discovery!.known).toEqual(['inversion_5s']);
    expect(JSON.stringify(reply)).not.toMatch(/mysteryDirector|mysteryRng|lowRiskSide|anchorSp/);
  });

  it('keeps v4 risks private, persists a free no-safe hint and applies Coyote on the server', async () => {
    const f = setup({ rulesetVersion: RISK_RULESET_VERSION });
    let reply = await f.start();
    reply = await f.execute(reply, { type: 'resume' });
    const stored = f.record(reply);
    f.repository.account().runs.set(stored.state.runId, {
      ...stored,
      state: {
        ...stored.state,
        effects: [applyMysteryEffect('coyote_10s', 0).addedEffect!],
        rows: stored.state.rows.map((row) => ({
          ...row,
          safeSide: 'left',
          risk: { lowRiskSide: 'left', broken: { left: true, right: true } },
        })),
      },
    });
    reply = await f.execute(reply, { type: 'hint', row: '1', life: 0 });
    expect(reply.snapshot.current.noSafeTile).toBe(true);
    expect(reply.snapshot.hints).toBe(2);
    expect(JSON.stringify(reply)).not.toMatch(
      /lowRiskSide|"risk"|"broken"|"safeSide"|mysteryRng|"stream"/,
    );
    const advanced = await f.choose(reply);
    expect(advanced.snapshot.sp).toBe(300);
    expect(advanced.snapshot.effects[0]).toMatchObject({ kind: 'coyote_10s', expiresAt: 10000 });
    expect(advanced.snapshot.history[0].noSafeTile).toBe(true);
  });
  it('projects uncapped v3 resources and row effects without losing their remaining charges', async () => {
    const f = setup({ rulesetVersion: BALANCE_RULESET_VERSION });
    let reply = await f.start();
    reply = await f.execute(reply, { type: 'resume' });
    const stored = f.record(reply);
    f.repository.account().runs.set(stored.state.runId, {
      ...stored,
      state: {
        ...stored.state,
        sp: 5000,
        effects: [
          applyMysteryEffect('regen_3rows', 0).addedEffect!,
          applyMysteryEffect('double_gain_21s', 0).addedEffect!,
        ],
      },
    });
    const advanced = await f.choose(reply);
    expect(advanced.snapshot.rulesetVersion).toBe(BALANCE_RULESET_VERSION);
    expect(advanced.snapshot.sp).toBe(5012);
    expect(advanced.snapshot.effects[0]).toMatchObject({
      kind: 'regen_3rows',
      expiresAt: null,
      rowsLeft: 2,
    });
    expect(advanced.snapshot.effects[1]).toMatchObject({
      kind: 'double_gain_21s',
      expiresAt: 21_000,
    });
    expect(JSON.stringify(advanced)).not.toMatch(/mysteryRng|routeRng|"safeSide"|"stream"/);
  });
  it('projects and executes a versioned pact server-side with idempotent payment', async () => {
    const f = setup({ rulesetVersion: PACT_RULESET_VERSION });
    let current = await f.start();
    expect(current.snapshot.pact).toBeNull();
    current = await f.execute(current, { type: 'resume' });
    const record = f.record(current);
    f.repository.account().runs.set(record.state.runId, {
      ...record,
      state: {
        ...record.state,
        pact: offerPact('blood_oath'),
        current: { ...record.state.current, mysteryOutcome: 'blood_oath' },
      },
    });
    const request = f.request(current, { type: 'pact', row: '1', life: 0, option: 'accept' });
    const accepted = await f.authority.execute(A, request);
    expect(accepted.accepted).toBe(true);
    expect(accepted.snapshot.sp).toBe(335);
    expect(accepted.snapshot.pact).toMatchObject({
      kind: 'blood_oath',
      phase: 'active',
      rowsLeft: 3,
    });
    expect(await f.authority.execute(A, request)).toEqual(accepted);
    expect(JSON.stringify(accepted)).not.toMatch(/mysteryRng|routeRng|"safeSide"|"rows"|"stream"/);
    const forged = {
      ...f.request(accepted, { type: 'pact', row: '1', life: 0, option: 'settle' }),
      command: { type: 'pact', row: '1', life: 0, option: 'settle', sp: 400 },
    };
    await expect(f.authority.execute(A, forged)).rejects.toMatchObject({ code: 'invalid-request' });
    expect(f.record(accepted).state.sp).toBe(335);
  });

  it('keeps legacy ranked snapshots unchanged and rejects arbitrary pact options', async () => {
    const f = setup();
    const current = await f.start();
    expect(current.snapshot.rulesetVersion).toBe('infinity-v1');
    expect(current.snapshot).not.toHaveProperty('pact');
    const request = f.request(current, { type: 'pact', row: '1', life: 0, option: 'accept' });
    await expect(
      f.authority.execute(A, {
        ...request,
        command: { ...request.command, option: 'invent-a-prize' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
  });
  it('gates new starts and recovery before writes, but retrieves committed receipts after a policy change', async () => {
    const f = setup();
    const input = { idempotencyKey: f.newId() };
    f.repository.startProblem = new OperationsPolicyError('maintenance');
    await expect(f.authority.start(A, input)).rejects.toMatchObject({ code: 'maintenance' });
    expect(f.repository.account().runs.size).toBe(0);
    expect(f.repository.account().regionLocks).toBe(0);
    f.repository.startProblem = null;
    const started = await f.authority.start(A, input);
    f.repository.startProblem = new OperationsPolicyError('client_update_required');
    expect(await f.authority.start(A, input)).toEqual(started);
    const request = f.request(started, { type: 'resume' });
    f.repository.recoveryProblem = new OperationsPolicyError('recovery_unavailable');
    const original = structuredClone(f.record(started));
    await expect(f.authority.execute(A, request)).rejects.toMatchObject({
      code: 'recovery_unavailable',
    });
    expect(f.record(started)).toEqual(original);
    await expect(
      f.authority.recover(A, {
        runId: started.snapshot.runId,
        idempotencyKey: f.newId(),
        takeover: false,
      }),
    ).rejects.toMatchObject({ code: 'recovery_unavailable' });
    f.repository.recoveryProblem = null;
    const executed = await f.authority.execute(A, request);
    f.repository.recoveryProblem = new OperationsPolicyError('client_update_required');
    expect(await f.authority.execute(A, request)).toEqual(executed);
    expect(f.record(executed).nextSequence).toBe('2');
  });
  it('fails closed on an absent or untrusted client build before any new transaction', async () => {
    const f = setup();
    for (const clientBuild of [undefined, 0, -1, 1.5, 2_147_483_648]) {
      await expect(
        f.authority.start({ ...A, clientBuild } as RankedActor, { idempotencyKey: f.newId() }),
      ).rejects.toMatchObject({ code: 'operation_context_required' });
    }
    expect(f.repository.operationCalls).toEqual([]);
    expect(f.repository.accounts.size).toBe(0);
  });
  it('keeps saved pending attempts inactive until explicit recovery with no other attached run', async () => {
    const fixture = setup();
    const old = await fixture.start();
    const current = fixture.record(old);
    const archived: StoredRankedRun = {
      ...current,
      leaseActive: false,
      state: {
        ...current.state,
        status: 'dead',
        sp: 0,
        deaths: 1,
        death: {
          id: 'saved-death',
          sequence: 1,
          fatalRow: '1',
          cause: 'wrong_tile',
          activeTimeMs: 0,
          observedAt: current.state.lastObservedAt,
        },
        pendingReward: { deathId: 'saved-death', ordinal: 1, intentId: 'saved-intent' },
      },
    };
    fixture.repository.account().runs.set(old.snapshot.runId, archived);
    expect(await fixture.authority.active(A, {})).toEqual({ status: 'none' });
    await expect(
      fixture.authority.execute(A, fixture.request(old, { type: 'resume' })),
    ).rejects.toMatchObject({ code: 'run-archived' });
    const next = await fixture.start();
    await expect(
      fixture.authority.recover(A, {
        runId: old.snapshot.runId,
        idempotencyKey: fixture.newId(),
        takeover: true,
      }),
    ).rejects.toMatchObject({ code: 'active-run-exists' });
    expect(fixture.repository.account().runs.get(old.snapshot.runId)).toEqual(archived);
    await fixture.execute(next, { type: 'end' });
    const recovered = await fixture.authority.recover(A, {
      runId: old.snapshot.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    expect(fixture.record(recovered).leaseActive).toBe(true);
    expect(recovered.snapshot).toMatchObject({
      status: 'dead',
      rewardPending: true,
      sp: 0,
      lastClearedRow: '0',
      revivesGranted: 0,
      revivesApplied: 0,
    });
    expect(fixture.record(recovered).state.rows).toEqual(archived.state.rows);
    expect(fixture.record(recovered).state.stream).toEqual(archived.state.stream);
    expect(await fixture.authority.active(A, {})).toEqual({
      status: 'active',
      runId: old.snapshot.runId,
    });
  });
  it('discovers only the authenticated account active run without rotating its lease or changing time', async () => {
    const fixture = setup();
    expect(await fixture.authority.active(A, {})).toEqual({ status: 'none' });
    const started = await fixture.start();
    const before = structuredClone(fixture.record(started));
    fixture.advance(100_000);
    expect(await fixture.authority.active(A, {})).toEqual({
      status: 'active',
      runId: started.snapshot.runId,
    });
    expect(await fixture.authority.active(OTHER, {})).toEqual({ status: 'none' });
    expect(fixture.record(started)).toEqual(before);
    await expect(fixture.authority.active(A, { subject: OTHER.subject })).rejects.toMatchObject({
      code: 'invalid-request',
    });
  });
  it('uses private independent cryptographic streams and publishes only a bounded projection', async () => {
    const fixture = setup();
    const started = await fixture.start();
    const stored = fixture.record(started);
    expect(stored.state.stream.rng.algorithm).toBe(RANKED_RNG.algorithm);
    expect(stored.state.stream.rng.state).not.toBe(stored.state.mysteryRng.state);
    expect(started.snapshot.sp).toBe(300);
    expect(started.snapshot.paused).toBe(true);
    expect(started.snapshot.current.revealedSafeSide).toBeNull();
    expect(started.snapshot.currentRow).toBe('1');
    const wire = JSON.stringify(started);
    for (const privateField of [
      'stream',
      'mysteryRng',
      'safeSide',
      'nextMysteryIndex',
      'bufferOffset',
      'subject',
      'deviceId',
    ]) {
      expect(wire).not.toContain(`"${privateField}"`);
    }
    expect(wire).not.toContain(stored.state.stream.rng.state);
    expect(wire).not.toContain(stored.state.mysteryRng.state);
    const resumed = await fixture.execute(started, { type: 'resume' });
    const hinted = await fixture.execute(resumed, { type: 'hint', row: '1', life: 0 });
    expect(hinted.snapshot.current.revealedSafeSide).toBe(getCurrentRow(stored.state).safeSide);
    expect(hinted.snapshot.hints).toBe(1);
    expect(hinted.snapshot.lastClearedRow).toBe('0');
    expect(hinted.snapshot).not.toHaveProperty('rows');
    expect(fixture.repository.account().audit).toHaveLength(2);
    const current = fixture.record(hinted);
    const extraPrivate = {
      ...current,
      region: { ...current.region, privateField: 'never-public' },
      state: {
        ...current.state,
        current: { ...current.state.current, privateField: 'never-public' },
      },
    };
    expect(JSON.stringify(rankedSnapshot(extraPrivate))).not.toContain('never-public');
  });

  it('rejects client state, clock, score, ruleset and reward bypass fields before a transaction', async () => {
    const fixture = setup();
    await expect(
      fixture.authority.start(A, { idempotencyKey: fixture.newId(), rulesetVersion: 'practice' }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    const started = await fixture.start();
    for (const command of [
      { type: 'grant-revive', ordinal: 1 },
      { type: 'choose', row: '1', life: 0, side: 'left', score: '999999' },
      { type: 'end', forfeitGrantedReward: true },
      { type: 'heartbeat', activeTimeMs: 999999 },
      { type: 'choose', row: 1, life: 0, side: 'left' },
      { type: 'choose', row: '01', life: 0, side: 'left' },
    ]) {
      await expect(
        fixture.authority.execute(A, { ...fixture.request(started, { type: 'resume' }), command }),
      ).rejects.toMatchObject({ code: 'invalid-request' });
    }
    expect(fixture.record(started).nextSequence).toBe('1');
    expect(fixture.repository.account().audit).toHaveLength(0);
  });

  it('never loads or mutates a foreign account run', async () => {
    const fixture = setup();
    const started = await fixture.start();
    await expect(
      fixture.authority.execute(OTHER, fixture.request(started, { type: 'resume' })),
    ).rejects.toMatchObject({ code: 'run-not-found' });
    await expect(
      fixture.authority.recover(OTHER, {
        runId: started.snapshot.runId,
        idempotencyKey: fixture.newId(),
        takeover: true,
      }),
    ).rejects.toMatchObject({ code: 'run-not-found' });
    expect(fixture.record(started).nextSequence).toBe('1');
  });

  it('refuses corrupt or practice checkpoints and regressed server observations', async () => {
    const fixture = setup();
    const started = await fixture.start();
    const stored = fixture.record(started);
    fixture.repository.account().runs.set(stored.state.runId, {
      ...stored,
      state: {
        ...stored.state,
        mysteryRng: { algorithm: 'splitmix64-practice-v1', state: '2', draws: '0' },
      },
    });
    await expect(fixture.execute(started, { type: 'resume' })).rejects.toThrow();
    fixture.repository.account().runs.set(stored.state.runId, stored);
    fixture.advance(-1);
    await expect(fixture.execute(started, { type: 'resume' })).rejects.toMatchObject({
      code: 'server-clock-regressed',
    });
    expect(fixture.record(started).nextSequence).toBe('1');
  });

  it('resolves only the current mystery once and recovery retains its consumed random cursor', async () => {
    const fixture = setup();
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    while (!response.snapshot.current.hasMystery) response = await fixture.choose(response);
    const row = response.snapshot.currentRow;
    response = await fixture.execute(response, { type: 'mystery', row, life: 0 });
    expect(response.accepted).toBe(true);
    expect(response.snapshot.current.mysteryOutcome).not.toBeNull();
    const consumed = fixture.record(response).state.mysteryRng;
    const second = await fixture.execute(response, { type: 'mystery', row, life: 0 });
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('mystery-consumed');
    expect(fixture.record(second).state.mysteryRng).toEqual(consumed);
    const recovered = await fixture.authority.recover(A, {
      runId: response.snapshot.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    expect(recovered.snapshot.current.mysteryOutcome).toBe(
      response.snapshot.current.mysteryOutcome,
    );
    expect(fixture.record(recovered).state.mysteryRng).toEqual(consumed);
  });
});

describe('atomic sequence and idempotency ledger', () => {
  it('serializes simultaneous starts and repeated start never locks a country twice', async () => {
    const fixture = setup();
    const key = fixture.newId();
    const responses = await Promise.all([
      fixture.authority.start(A, { idempotencyKey: key }),
      fixture.authority.start(A, { idempotencyKey: key }),
    ]);
    expect(responses[0]).toEqual(responses[1]);
    expect(fixture.repository.account().runs.size).toBe(1);
    expect(fixture.repository.account().regionLocks).toBe(1);
    await expect(fixture.authority.start(B, { idempotencyKey: key })).rejects.toMatchObject({
      code: 'idempotency-conflict',
    });
    await expect(
      fixture.authority.start(B, { idempotencyKey: fixture.newId() }),
    ).rejects.toMatchObject({ code: 'active-run-exists' });
    expect(fixture.repository.account().runs.size).toBe(1);
  });

  it('commits a concurrent sequence once and binds every retry to the original payload', async () => {
    const fixture = setup();
    const started = await fixture.start();
    const command = fixture.request(started, { type: 'resume' });
    const competitor = fixture.request(started, { type: 'resume' });
    const raced = await Promise.allSettled([
      fixture.authority.execute(A, command),
      fixture.authority.execute(A, competitor),
    ]);
    expect(raced.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((raced[1] as PromiseRejectedResult).reason).toMatchObject({ code: 'sequence-conflict' });
    const committed = await fixture.authority.execute(A, command);
    expect(committed.snapshot.nextSequence).toBe('2');
    expect(fixture.repository.account().audit).toHaveLength(1);
    fixture.advance(70_000);
    expect(await fixture.authority.execute(A, command)).toEqual(committed);
    await expect(
      fixture.authority.execute(A, { ...command, command: { type: 'end' } }),
    ).rejects.toMatchObject({ code: 'idempotency-conflict' });
    expect(fixture.repository.account().audit).toHaveLength(1);
  });

  it('rolls back checkpoint, country lock, action and receipt if any durable write fails', async () => {
    const fixture = setup();
    fixture.repository.failReceipt = true;
    await expect(fixture.start()).rejects.toThrow('durable-write-failed');
    expect(fixture.repository.account().runs.size).toBe(0);
    expect(fixture.repository.account().regionLocks).toBe(0);
    fixture.repository.failReceipt = false;
    const started = await fixture.start();
    fixture.repository.failReceipt = true;
    const command = fixture.request(started, { type: 'resume' });
    await expect(fixture.authority.execute(A, command)).rejects.toThrow('durable-write-failed');
    expect(fixture.record(started).nextSequence).toBe('1');
    expect(fixture.repository.account().audit).toHaveLength(0);
    fixture.repository.failReceipt = false;
    expect((await fixture.authority.execute(A, command)).snapshot.nextSequence).toBe('2');
  });

  it('preserves adjacent sequences above JavaScript safe integers and rejects numeric wire sequences', async () => {
    const fixture = setup();
    let response = await fixture.start();
    const stored = fixture.record(response);
    fixture.repository
      .account()
      .runs.set(stored.state.runId, { ...stored, nextSequence: '9007199254740992' });
    response = {
      ...response,
      snapshot: { ...response.snapshot, nextSequence: '9007199254740992' },
    };
    const command = fixture.request(response, { type: 'resume' });
    const result = await fixture.authority.execute(A, command);
    expect(result.snapshot.nextSequence).toBe('9007199254740993');
    await expect(
      fixture.authority.execute(A, {
        ...command,
        idempotencyKey: fixture.newId(),
        sequence: 9007199254740992,
      }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
  });
});

describe('device leases and server clock recovery', () => {
  it('requires explicit takeover, rotates capabilities and fences an old device immediately', async () => {
    const fixture = setup();
    const started = await fixture.start();
    const resumed = await fixture.execute(started, { type: 'resume' });
    await expect(
      fixture.authority.recover(B, {
        runId: started.snapshot.runId,
        idempotencyKey: fixture.newId(),
        takeover: false,
      }),
    ).rejects.toMatchObject({ code: 'takeover-required' });
    const recovery = {
      runId: started.snapshot.runId,
      idempotencyKey: fixture.newId(),
      takeover: true,
    };
    const taken = await fixture.authority.recover(B, recovery);
    expect(taken.lease.generation).toBe('2');
    expect(taken.lease.token).not.toBe(started.lease.token);
    expect(taken.snapshot.paused).toBe(true);
    expect(await fixture.authority.recover(B, recovery)).toEqual(taken);
    await expect(fixture.execute(resumed, { type: 'end' })).rejects.toMatchObject({
      code: 'lease-lost',
    });
    expect((await fixture.execute(taken, { type: 'resume' }, B)).snapshot.nextSequence).toBe('3');
  });

  it('advances only server-issued active windows, pauses offline, and preserves checkpoints on expiry', async () => {
    const fixture = setup({ heartbeatWindowMs: 1000 });
    let response = await fixture.start();
    await expect(fixture.execute(response, { type: 'heartbeat' })).rejects.toMatchObject({
      code: 'run-paused',
    });
    response = await fixture.execute(response, { type: 'resume' });
    fixture.advance(250);
    response = await fixture.execute(response, { type: 'heartbeat' });
    expect(response.snapshot.activeTimeMs).toBe(250);
    fixture.advance(250);
    response = await fixture.execute(response, { type: 'pause' });
    expect(response.snapshot.activeTimeMs).toBe(500);
    fixture.advance(100_000);
    await expect(fixture.execute(response, { type: 'resume' })).rejects.toMatchObject({
      code: 'lease-expired',
    });
    response = await fixture.authority.recover(A, {
      runId: response.snapshot.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    expect(response.snapshot.activeTimeMs).toBe(500);
    response = await fixture.execute(response, { type: 'resume' });
    fixture.advance(5000);
    await expect(fixture.execute(response, { type: 'heartbeat' })).rejects.toMatchObject({
      code: 'recovery-required',
    });
    response = await fixture.authority.recover(A, {
      runId: response.snapshot.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    expect(response.snapshot.activeTimeMs).toBe(1500);
    expect(response.snapshot.lastClearedRow).toBe('0');
    expect(response.snapshot.sp).toBe(300);
  });

  it('preserves current mystery consumption and due effects through interruption without reroll', async () => {
    const fixture = setup({ heartbeatWindowMs: 1000 });
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    const stored = fixture.record(response);
    const state: RunState = {
      ...stored.state,
      current: { ...stored.state.current, mysteryOutcome: 'drain_5s' },
      effects: [{ kind: 'drain_5s', startedAt: 0, expiresAt: 5000, nextTickAt: 500 }],
    };
    fixture.repository.account().runs.set(state.runId, { ...stored, state });
    fixture.advance(100_000);
    response = await fixture.authority.recover(A, {
      runId: state.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    const recovered = fixture.record(response);
    expect(response.snapshot.activeTimeMs).toBe(1000);
    expect(response.snapshot.sp).toBe(296);
    expect(response.snapshot.current.mysteryOutcome).toBe('drain_5s');
    expect(recovered.state.stream).toEqual(state.stream);
    expect(recovered.state.mysteryRng).toEqual(state.mysteryRng);
    expect(recovered.state.effects[0].nextTickAt).toBe(1500);
  });

  it('commits due drain death before an input and never grants progress from that input', async () => {
    const fixture = setup();
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    const stored = fixture.record(response);
    fixture.repository.account().runs.set(stored.state.runId, {
      ...stored,
      state: {
        ...stored.state,
        sp: 2,
        effects: [{ kind: 'drain_5s', startedAt: 0, expiresAt: 5000, nextTickAt: 500 }],
      },
    });
    fixture.advance(500);
    response = await fixture.execute(response, { type: 'choose', row: '1', life: 0, side: 'left' });
    expect(response.accepted).toBe(false);
    expect(response.snapshot.status).toBe('dead');
    expect(response.snapshot.sp).toBe(0);
    expect(response.snapshot.lastClearedRow).toBe('0');
    expect(response.snapshot.death?.cause).toBe('drain');
    expect(response.snapshot.nextSequence).toBe('3');
  });

  it('checks choice cadence against the server clock and preserves state on rapid input', async () => {
    const fixture = setup();
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    response = await fixture.choose(response);
    const stored = fixture.record(response);
    await expect(
      fixture.execute(response, {
        type: 'choose',
        row: '2',
        life: 0,
        side: getCurrentRow(stored.state).safeSide,
      }),
    ).rejects.toMatchObject({ code: 'action-too-fast' });
    expect(fixture.record(response)).toEqual(stored);
  });
});

describe('endless progress and finalization boundary', () => {
  it('crosses 350 and repeated generator boundaries with bounded checkpoint and recovery', async () => {
    const fixture = setup();
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    for (let row = 1; row <= 600; row += 1) {
      response = await fixture.choose(response);
      expect(response.accepted).toBe(true);
      if (row === 350) expect(response.snapshot.status).toBe('playing');
    }
    const stored = fixture.record(response);
    expect(response.snapshot.lastClearedRow).toBe('600');
    expect(response.snapshot.currentRow).toBe('601');
    expect(stored.state.rows.length).toBeLessThanOrEqual(10);
    expect(stored.state.resolutions.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(stored).length).toBeLessThan(6000);
    const recovery = await fixture.authority.recover(A, {
      runId: stored.state.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    expect(recovery.snapshot.lastClearedRow).toBe('600');
    expect(fixture.record(recovery).state.stream).toEqual(stored.state.stream);
    expect(fixture.record(recovery).state.rows).toEqual(stored.state.rows);
    expect(recovery.snapshot.region).toEqual(response.snapshot.region);
    expect(recovery.snapshot.history.length).toBeLessThanOrEqual(2);
  }, 15_000);

  it('sorts no counters through Number when progressing above the safe integer boundary', async () => {
    const fixture = setup();
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    const stored = fixture.record(response);
    const offset = 9007199254740992n;
    const shift = (value: string) => (BigInt(value) + offset).toString();
    const state: RunState = {
      ...stored.state,
      lastClearedRow: shift('0'),
      currentRow: shift('1'),
      bufferOffset: shift(stored.state.bufferOffset),
      rows: stored.state.rows.map((row) => ({ ...row, index: shift(row.index) })),
      stream: {
        ...stored.state.stream,
        nextIndex: shift(stored.state.stream.nextIndex),
        nextMysteryIndex: shift(stored.state.stream.nextMysteryIndex),
      },
    };
    fixture.repository.account().runs.set(state.runId, { ...stored, state });
    response = { ...response, snapshot: rankedSnapshot({ ...stored, state }) };
    response = await fixture.choose(response);
    expect(response.snapshot.lastClearedRow).toBe('9007199254740993');
    expect(response.snapshot.currentRow).toBe('9007199254740994');
    expect(fixture.record(response).state.rows.length).toBeLessThanOrEqual(10);
  });

  it('never publishes or ends a pending reward, and finishing prevents a second end or more progress', async () => {
    const fixture = setup();
    let response = await fixture.start();
    response = await fixture.execute(response, { type: 'resume' });
    const stored = fixture.record(response);
    const death = {
      id: 'death-1',
      sequence: 1,
      fatalRow: '1',
      cause: 'wrong_tile' as const,
      activeTimeMs: 0,
      observedAt: 1_000_000,
    };
    const state: RunState = {
      ...stored.state,
      status: 'dead',
      sp: 0,
      death,
      deaths: 1,
      pendingReward: { deathId: death.id, ordinal: 1, intentId: 'intent-1' },
    };
    fixture.repository.account().runs.set(state.runId, { ...stored, state });
    response = await fixture.execute(response, { type: 'end' });
    expect(response.accepted).toBe(false);
    expect(response.reason).toBe('reward-pending');
    expect(response.snapshot.status).toBe('dead');
    const pending = fixture.record(response);
    fixture.repository
      .account()
      .runs.set(state.runId, { ...pending, state: { ...pending.state, pendingReward: null } });
    response = await fixture.execute(response, { type: 'end' });
    expect(response.snapshot.status).toBe('finished');
    expect(response.snapshot.revivesToReachScore).toBe(0);
    await expect(fixture.execute(response, { type: 'end' })).rejects.toMatchObject({
      code: 'run-finished',
    });
    const finished = fixture.record(response);
    const terminalRecovery = await fixture.authority.recover(A, {
      runId: response.snapshot.runId,
      idempotencyKey: fixture.newId(),
      takeover: false,
    });
    expect(terminalRecovery.snapshot.status).toBe('finished');
    expect(fixture.record(response)).toEqual(finished);
    const next = await fixture.start();
    expect(next.snapshot.runId).not.toBe(response.snapshot.runId);
    expect(next.snapshot.lastClearedRow).toBe('0');
  });

  it('returns fixed, non-sensitive errors', () => {
    const error = new RankedError('lease-lost');
    expect(error.message).toBe('lease-lost');
    expect(error.name).toBe('RankedError');
  });
});
