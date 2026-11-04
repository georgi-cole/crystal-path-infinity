import { describe, expect, it, vi } from 'vitest';
import {
  OperationsMetrics,
  evaluateOperationsAlerts,
  withOperationMetrics,
} from '../src/operations-metrics.ts';
const event = () => ({
  type: 'request',
  endpoint: 'ranked_action',
  outcome: 'ok',
  durationMs: 152.2,
  rulesetVersion: 'infinity-v1',
});
const gameplay = () => ({
  type: 'finalized_gameplay',
  rulesetVersion: 'infinity-v1',
  lastClearedRow: '350',
  activeTimeMs: 60000,
  adTimeMs: 15000,
  revivesGranted: 6,
  revivesApplied: 6,
  revivesToReachScore: 5,
});
describe('minimal operational metrics', () => {
  it('is disabled by default and optional analytics is separately denied by default', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const disabled = new OperationsMetrics({
      sink: { write },
      authorizeOptionalAnalytics: () => true,
    });
    expect(disabled.record(event())).toBe(false);
    expect(disabled.recordOptionalGameplay(gameplay(), {})).toBe(false);
    expect(await disabled.flush()).toBe(false);
    expect(write).not.toHaveBeenCalled();
    const operational = new OperationsMetrics({ enabled: true });
    expect(operational.recordOptionalGameplay(gameplay(), { authorized: true, age: 25 })).toBe(
      false,
    );
    expect(operational.snapshot().series).toEqual([]);
  });
  it('keeps fixed aggregate series as request history grows, with exact cumulative counters', () => {
    const metrics = new OperationsMetrics({ enabled: true });
    for (let i = 0; i < 20000; i++) expect(metrics.record(event())).toBe(true);
    const batch = metrics.snapshot();
    expect(batch.series).toHaveLength(2);
    expect(batch.recordedEvents).toBe('20000');
    expect(batch.series.find((s) => s.name === 'requests_total')).toMatchObject({
      count: '20000',
      sum: '20000',
    });
    const histogram = batch.series.find((s) => s.name === 'request_duration_ms')!;
    expect(histogram.buckets[3]).toBe('20000');
    expect(histogram.sum).toBe('3060000');
    expect(JSON.stringify(batch)).not.toContain('152.2');
  });
  it('rejects unallowlisted text, identities, credentials, age/context and arbitrary cardinality', () => {
    const metrics = new OperationsMetrics({ enabled: true, maximumSeries: 8 });
    for (const added of [
      { email: 'private@example.invalid' },
      { token: 'SECRET' },
      { age: 25 },
      { analyticsAgeBand: 'under_13' },
      { privacyContext: 'child' },
      { userId: 'private-id' },
      { url: 'https://private?otp=123456' },
      { message: 'free user text' },
    ])
      expect(metrics.record({ ...event(), ...added })).toBe(false);
    expect(metrics.record({ ...event(), endpoint: 'user:private-id' })).toBe(false);
    expect(metrics.record({ ...event(), rulesetVersion: 'random-user-rule' })).toBe(false);
    expect(
      metrics.record({
        get type() {
          throw new Error('private getter');
        },
      }),
    ).toBe(false);
    for (const endpoint of [
      'ranked_start',
      'ranked_action',
      'ranked_recover',
      'profile_read',
      'profile_save',
      'leaderboard_read',
    ])
      metrics.record({ ...event(), endpoint });
    expect(metrics.snapshot().series.length).toBeLessThanOrEqual(8);
    expect(BigInt(metrics.snapshot().droppedEvents)).toBeGreaterThan(0n);
    expect(JSON.stringify(metrics.snapshot())).not.toMatch(
      /private|SECRET|123456|AgeBand|privacyContext|userId/,
    );
  });
  it('accepts gameplay aggregates only under a fresh trusted optional permit, without exact progress or demographic data', () => {
    const permit = { email: 'never-export@example.invalid', privacyContext: 'child' };
    let allowed = true;
    const metrics = new OperationsMetrics({
      enabled: true,
      authorizeOptionalAnalytics: (value) => allowed && value === permit,
    });
    expect(metrics.recordOptionalGameplay(gameplay(), {})).toBe(false);
    expect(metrics.recordOptionalGameplay({ ...gameplay(), age: 12 }, permit)).toBe(false);
    const huge = '9'.repeat(1000);
    expect(metrics.recordOptionalGameplay({ ...gameplay(), lastClearedRow: huge }, permit)).toBe(
      true,
    );
    const snapshot = metrics.snapshot();
    expect(snapshot.series.find((s) => s.name === 'optional_cleared_rows')).toMatchObject({
      count: '1',
      sum: null,
    });
    expect(JSON.stringify(snapshot)).not.toContain(huge);
    expect(JSON.stringify(snapshot)).not.toMatch(/never-export|privacyContext|child|AgeBand/);
    allowed = false;
    expect(metrics.recordOptionalGameplay(gameplay(), permit)).toBe(false);
    expect(metrics.snapshot().recordedEvents).toBe('1');
  });
  it('measures resources and reward outcomes without retaining per-run history or no-fill identifiers', () => {
    const metrics = new OperationsMetrics({ enabled: true });
    expect(
      metrics.record({
        type: 'resource',
        rulesetVersion: 'infinity-v1',
        checkpointBytes: 5900,
        databaseReads: 3,
        databaseWrites: 2,
        auditRows: '10000',
        handlerMs: 10.5,
      }),
    ).toBe(true);
    expect(
      metrics.record({
        type: 'reward',
        outcome: 'no_fill',
        verificationLatencyMs: 0,
        rulesetVersion: 'infinity-v1',
      }),
    ).toBe(true);
    expect(metrics.snapshot().series.find((s) => s.name === 'database_reads_total')?.sum).toBe('3');
    expect(metrics.snapshot().series.find((s) => s.name === 'audit_rows')?.sum).toBeNull();
    expect(
      metrics.record({
        type: 'reward',
        outcome: 'invented-provider-payload',
        verificationLatencyMs: 1,
        rulesetVersion: 'infinity-v1',
      }),
    ).toBe(false);
  });
  it('deduplicates concurrent flushes, bounds outages, preserves counters and permits a cumulative retry', async () => {
    let release!: () => void;
    const write = vi
      .fn<(batch: unknown, signal: AbortSignal) => Promise<void>>()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    const metrics = new OperationsMetrics({ enabled: true, sink: { write }, flushTimeoutMs: 1 });
    metrics.record(event());
    const pending = metrics.flush();
    expect(metrics.flush()).toBe(pending);
    expect(await pending).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][1].aborted).toBe(true);
    expect(metrics.snapshot().recordedEvents).toBe('1');
    for (let i = 0; i < 20; i++) expect(await metrics.flush()).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    write.mockResolvedValue(undefined);
    expect(await metrics.flush()).toBe(true);
    expect(metrics.snapshot().recordedEvents).toBe('1');
  });
  it('preserves successful responses and original errors even when diagnostics or its clock fail', async () => {
    const metrics = new OperationsMetrics({ enabled: true });
    const body = 'private@example.invalid OTP123456';
    const result = await withOperationMetrics(
      metrics,
      'profile_save',
      null,
      () => Promise.resolve(new Response(body)),
      () => {
        throw new Error(body);
      },
    );
    expect(await result.text()).toBe(body);
    expect(metrics.snapshot().recordedEvents).toBe('0');
    let now = 0;
    const error = new Error(body);
    await expect(
      withOperationMetrics(
        metrics,
        'ranked_action',
        'infinity-v1',
        () => Promise.reject(error),
        () => (now += 10),
      ),
    ).rejects.toBe(error);
    expect(
      metrics.snapshot().series.find((s) => s.name === 'requests_total')?.dimensions.outcome,
    ).toBe('error');
    expect(JSON.stringify(metrics.snapshot())).not.toContain(body);
  });
  it('preserves a committed response and original failure when diagnostics throw', async () => {
    const metrics = new OperationsMetrics({ enabled: true });
    vi.spyOn(metrics, 'record').mockImplementation(() => {
      throw new Error('diagnostic failure');
    });
    const response = new Response('committed');
    expect(
      await withOperationMetrics(metrics, 'reward_apply', 'infinity-v1', () =>
        Promise.resolve(response),
      ),
    ).toBe(response);
    const original = new Error('operation failed');
    await expect(
      withOperationMetrics(metrics, 'reward_apply', 'infinity-v1', () => Promise.reject(original)),
    ).rejects.toBe(original);
  });
  it('uses explicit proposed latency/reward/error/budget alerts without changing game state', () => {
    const healthy = {
      windowMs: 300000,
      requests: 200,
      serverErrors: 0,
      actionSamples: 200,
      actionP50Ms: 150,
      actionP95Ms: 250,
      oldestPendingRewardMs: 120000,
      checkpointP95Bytes: 16384,
      costBudgetFraction: 0.79,
      storageBudgetFraction: 0.79,
    };
    expect(evaluateOperationsAlerts(healthy)).toEqual([]);
    expect(
      evaluateOperationsAlerts({
        ...healthy,
        serverErrors: 11,
        actionP95Ms: 601,
        oldestPendingRewardMs: 600001,
        costBudgetFraction: 1,
        storageBudgetFraction: 0.8,
        checkpointP95Bytes: 16385,
      }),
    ).toEqual(
      expect.arrayContaining([
        { code: 'server_error_rate', severity: 'critical' },
        { code: 'acknowledged_action_latency', severity: 'critical' },
        { code: 'pending_reward_delay', severity: 'critical' },
        { code: 'cost_budget', severity: 'critical' },
        { code: 'storage_budget', severity: 'warning' },
        { code: 'checkpoint_growth', severity: 'warning' },
      ]),
    );
    expect(evaluateOperationsAlerts({ ...healthy, costBudgetFraction: null })).toContainEqual({
      code: 'budget_not_configured',
      severity: 'warning',
    });
    expect(
      evaluateOperationsAlerts({
        ...healthy,
        requests: 1,
        serverErrors: 1,
        actionSamples: 1,
        actionP95Ms: 2000,
      }),
    ).toEqual([]);
  });
});
