import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { ProbeError } from './ssv.ts';

export type Mode = 'synthetic' | 'native';
export type Platform = 'web' | 'android' | 'ios';
export type Side = 'left' | 'right';
export const RULESET = 'cpi-002-fixture-200x5-150x5-v1';
export const TEST_AD_UNITS = {
  android: 'ca-app-pub-3940256099942544/5224354917',
  ios: 'ca-app-pub-3940256099942544/1712485313',
} as const;
export function restoreSp(reviveNumber: number) {
  if (!Number.isInteger(reviveNumber) || reviveNumber < 1 || reviveNumber > 10) throw new ProbeError(409, 'revive_limit');
  return reviveNumber <= 5 ? 200 : 150;
}
type Intent = {
  intentId: string; runId: string; deathSequence: number; reviveNumber: number; restoreSp: number;
  ssvCustomData: string; ssvUserId: string; adUnitId: string | null; createdAt: number;
  status: 'pending' | 'granted' | 'applied'; transactionId?: string;
};
type Step = { sequence: number; row: number; side: Side; correct: boolean; survived: boolean };
type Run = {
  runId: string; tokenHash: Buffer; mode: Mode; platform: Platform; createdAt: number; ssvUserId: string;
  sp: number; lastClearedRow: number; safeSide: Side; sequence: number; deathSequence: number;
  status: 'playing' | 'dead' | 'finished'; revivesGranted: number; revivesApplied: number;
  verifiedSsvGrants: number; intent?: Intent; lastStep?: Step;
  actions: Map<string, { fingerprint: string; step: Step }>;
};
function hash(token: string) { return createHash('sha256').update(token).digest(); }
function stringField(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new ProbeError(400, 'invalid_field');
  return value;
}
export class ProbeStore {
  private runs = new Map<string, Run>();
  private intents = new Map<string, Intent>();
  private transactions = new Map<string, string>();
  private chooseSide: () => Side;
  private maxRuns: number;
  private maxActions: number;
  constructor(options: { chooseSide?: () => Side; maxRuns?: number; maxActions?: number } = {}) {
    this.chooseSide = options.chooseSide ?? (() => randomInt(2) ? 'left' : 'right');
    this.maxRuns = options.maxRuns ?? 20; this.maxActions = options.maxActions ?? 1000;
  }
  create(mode: unknown, platform: unknown) {
    if (mode !== 'synthetic' && mode !== 'native') throw new ProbeError(400, 'invalid_mode');
    if (platform !== 'web' && platform !== 'android' && platform !== 'ios') throw new ProbeError(400, 'invalid_platform');
    if (mode === 'native' && platform === 'web') throw new ProbeError(400, 'native_requires_device_platform');
    if (this.runs.size >= this.maxRuns) throw new ProbeError(429, 'lab_run_limit_restart_required');
    const token = randomBytes(32).toString('base64url');
    const run: Run = { runId: randomUUID(), tokenHash: hash(token), mode, platform, createdAt: Date.now(),
      ssvUserId: randomBytes(24).toString('base64url'), sp: 300, lastClearedRow: 0, safeSide: this.chooseSide(),
      sequence: 0, deathSequence: 0, status: 'playing', revivesGranted: 0, revivesApplied: 0,
      verifiedSsvGrants: 0, actions: new Map() };
    this.runs.set(run.runId, run);
    return { runId: run.runId, token, state: this.publicState(run) };
  }
  private requireRun(runId: string, token: string) {
    const run = this.runs.get(runId);
    if (!run || !timingSafeEqual(run.tokenHash, hash(token))) throw new ProbeError(401, 'invalid_run_credentials');
    return run;
  }
  private publicIntent(intent: Intent) {
    return { intentId: intent.intentId, reviveNumber: intent.reviveNumber, restoreSp: intent.restoreSp,
      ssvCustomData: intent.ssvCustomData, ssvUserId: intent.ssvUserId, adUnitId: intent.adUnitId,
      rulesetVersion: RULESET, status: intent.status, official: false as const };
  }
  private publicState(run: Run) {
    return { runId: run.runId, mode: run.mode, platform: run.platform, official: false as const,
      evidence: run.mode === 'synthetic' ? 'synthetic' : 'native-test-ssv',
      rulesetVersion: RULESET, sp: run.sp, maxSp: 400, lastClearedRow: run.lastClearedRow,
      currentRow: run.lastClearedRow + 1, nextSequence: run.sequence + 1, status: run.status,
      deathSequence: run.deathSequence, revivesGranted: run.revivesGranted, revivesApplied: run.revivesApplied,
      verifiedSsvGrants: run.verifiedSsvGrants, lastStep: run.lastStep ?? null,
      intent: run.intent ? this.publicIntent(run.intent) : null };
  }
  get(runId: string, token: string) { return this.publicState(this.requireRun(runId, token)); }
  step(runId: string, token: string, input: Record<string, unknown>) {
    const run = this.requireRun(runId, token);
    const key = stringField(input.idempotencyKey);
    if (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 1 ||
        (input.side !== 'left' && input.side !== 'right')) throw new ProbeError(400, 'invalid_step');
    const fingerprint = JSON.stringify([input.sequence, input.side]);
    const previous = run.actions.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ProbeError(409, 'idempotency_conflict');
      return { state: this.publicState(run), step: previous.step, duplicate: true };
    }
    if (input.sequence !== run.sequence + 1) throw new ProbeError(409, 'sequence_conflict');
    if (run.status !== 'playing') throw new ProbeError(409, 'run_not_playing');
    if (run.actions.size >= this.maxActions) throw new ProbeError(429, 'lab_action_limit_restart_required');
    const correct = input.side === run.safeSide;
    if (!correct) run.sp = Math.max(0, run.sp - 20);
    const step: Step = { sequence: input.sequence as number, row: run.lastClearedRow + 1,
      side: input.side, correct, survived: run.sp > 0 };
    run.sequence++;
    if (step.survived) { run.lastClearedRow++; run.safeSide = this.chooseSide(); }
    else this.markDeath(run);
    run.lastStep = step; run.actions.set(key, { fingerprint, step });
    return { state: this.publicState(run), step, duplicate: false };
  }
  private markDeath(run: Run) {
    run.sp = 0; run.deathSequence++;
    run.status = run.revivesApplied === 10 ? 'finished' : 'dead';
  }
  death(runId: string, token: string) {
    const run = this.requireRun(runId, token);
    if (run.status === 'playing') this.markDeath(run);
    return this.publicState(run);
  }
  intent(runId: string, token: string) {
    const run = this.requireRun(runId, token);
    if (run.status !== 'dead') throw new ProbeError(409, 'run_not_dead');
    if (run.intent?.deathSequence === run.deathSequence) return this.publicIntent(run.intent);
    if (run.revivesGranted !== run.revivesApplied || run.revivesGranted >= 10) throw new ProbeError(409, 'revive_limit');
    const intentId = randomBytes(24).toString('base64url');
    const intent: Intent = { intentId, runId, deathSequence: run.deathSequence,
      reviveNumber: run.revivesApplied + 1, restoreSp: restoreSp(run.revivesApplied + 1),
      ssvCustomData: intentId, ssvUserId: run.ssvUserId, createdAt: Date.now(), status: 'pending',
      adUnitId: run.platform === 'web' ? null : TEST_AD_UNITS[run.platform] };
    run.intent = intent; this.intents.set(intentId, intent);
    return this.publicIntent(intent);
  }
  private grant(run: Run, intent: Intent, transactionId: string, native: boolean) {
    const prior = this.transactions.get(transactionId);
    if (prior) {
      if (prior !== intent.intentId) throw new ProbeError(409, 'transaction_conflict');
      return { state: this.publicState(run), duplicate: true };
    }
    if (intent.transactionId || intent.status !== 'pending') throw new ProbeError(409, 'intent_already_granted');
    if (run.status !== 'dead' || run.intent !== intent || intent.deathSequence !== run.deathSequence ||
        run.revivesGranted >= 10 || intent.reviveNumber !== run.revivesApplied + 1) throw new ProbeError(409, 'invalid_reward_state');
    // Synchronous mutation: no await between checks and this volatile ledger commit.
    intent.status = 'granted'; intent.transactionId = transactionId;
    this.transactions.set(transactionId, intent.intentId); run.revivesGranted++;
    if (native) run.verifiedSsvGrants++;
    return { state: this.publicState(run), duplicate: false };
  }
  syntheticGrant(runId: string, token: string, value: unknown) {
    const run = this.requireRun(runId, token);
    if (run.mode !== 'synthetic') throw new ProbeError(403, 'synthetic_grant_forbidden');
    const intent = this.intents.get(stringField(value));
    if (!intent || intent.runId !== runId) throw new ProbeError(403, 'invalid_intent');
    return this.grant(run, intent, `synthetic:${intent.intentId}`, false);
  }
  // Call ONLY with fields returned by verifyGoogleSsv; not exposed as a JSON grant API.
  acceptVerifiedSsv(fields: Record<string, string>) {
    const intent = this.intents.get(fields.custom_data ?? '');
    const run = intent ? this.runs.get(intent.runId) : undefined;
    if (!intent || !run || run.mode !== 'native' || !intent.adUnitId) throw new ProbeError(403, 'ssv_intent_mismatch');
    const unitSuffix = intent.adUnitId.split('/')[1];
    const stamp = Number(fields.timestamp);
    if (fields.user_id !== intent.ssvUserId ||
        (fields.ad_unit !== intent.adUnitId && fields.ad_unit !== unitSuffix) ||
        !/^\d+$/.test(fields.timestamp ?? '') || !Number.isSafeInteger(stamp) ||
        stamp < intent.createdAt - 300_000 || stamp > Date.now() + 300_000 ||
        // Google documents hex IDs, but no minimum length. Preserve exact case.
        !/^[a-fA-F0-9]{1,256}$/.test(fields.transaction_id ?? '') ||
        !/^[1-9]\d{0,8}$/.test(fields.reward_amount ?? '') ||
        !fields.reward_item || fields.reward_item.length > 128 || !/^\d+$/.test(fields.ad_network ?? '')) {
      throw new ProbeError(403, 'ssv_fields_mismatch');
    }
    // Provider reward_amount is NOT SP. SP always comes from our immutable intent.
    return this.grant(run, intent, fields.transaction_id!, true);
  }
  restore(runId: string, token: string, value: unknown) {
    const run = this.requireRun(runId, token);
    const intent = this.intents.get(stringField(value));
    if (!intent || intent.runId !== runId) throw new ProbeError(403, 'invalid_intent');
    if (intent.status === 'applied') return { state: this.publicState(run), duplicate: true };
    if (intent.status !== 'granted' || run.intent !== intent || run.status !== 'dead' ||
        intent.reviveNumber !== run.revivesApplied + 1) throw new ProbeError(409, 'grant_required');
    run.sp = intent.restoreSp; run.revivesApplied++; intent.status = 'applied'; run.status = 'playing';
    return { state: this.publicState(run), duplicate: false };
  }
  metrics() {
    return { runs: this.runs.size, maxRuns: this.maxRuns, intents: this.intents.size,
      transactions: this.transactions.size, retainedActions: [...this.runs.values()].reduce((n,r) => n+r.actions.size,0),
      retainedActionJsonBytes: [...this.runs.values()].reduce((n,r) => n+Buffer.byteLength(JSON.stringify([...r.actions])),0),
      maxActionsPerRun: this.maxActions, publicCheckpointJsonBytes: [...this.runs.values()].reduce((n,r) => n+Buffer.byteLength(JSON.stringify(this.publicState(r))),0),
      storage: 'volatile-memory; JSON byte proxy only; no database or cloud cost measured', official: false };
  }
}
