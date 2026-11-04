export const OPERATION_ENDPOINTS = [
  'ranked_start',
  'ranked_action',
  'ranked_recover',
  'ranked_active',
  'ranked_archive',
  'ranked_saved',
  'profile_read',
  'profile_save',
  'leaderboard_read',
  'reward_intent',
  'reward_ssv',
  'reward_apply',
  'reward_eligibility',
  'reward_status',
  'account_export',
  'account_delete',
  'account_status',
  'name_report',
  'moderation_queue',
  'moderation_review',
  'operations_status',
] as const;
export type OperationEndpoint = (typeof OPERATION_ENDPOINTS)[number];
export const REQUEST_OUTCOMES = [
  'ok',
  'invalid',
  'denied',
  'conflict',
  'limited',
  'unavailable',
  'error',
] as const;
export const REWARD_OUTCOMES = [
  'intent_created',
  'ssv_verified',
  'ssv_pending',
  'grant_applied',
  'no_fill',
  'skipped',
  'load_error',
  'verification_error',
] as const;
const LATENCY_BUCKETS = [50, 100, 150, 250, 400, 600, 1000, 2000, 5000, 15000, 30000];
const DURATION_BUCKETS = [1000, 10000, 60000, 300000, 900000, 3600000, 14400000, 86400000];
const BYTE_BUCKETS = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 262144, 1048576];
const PROGRESS_BUCKETS = [0, 1, 9, 24, 49, 99, 349, 999, 9999, 99999, 999999];
type Dimensions = Readonly<Record<string, string>>;
interface StoredSeries {
  name: string;
  dimensions: Dimensions;
  count: bigint;
  sum: bigint;
  bounds: readonly number[] | null;
  buckets: bigint[];
}
export interface OperationsMetricSeries {
  readonly name: string;
  readonly dimensions: Dimensions;
  readonly count: string;
  /** Progress/audit-row histograms expose buckets only, never exact individual values. */
  readonly sum: string | null;
  /** Exclusive bucket counts, plus one final overflow bucket; no raw samples. */
  readonly bounds: readonly number[] | null;
  readonly buckets: readonly string[];
}
export interface OperationsMetricBatch {
  readonly schemaVersion: 1;
  /** Monotonic cumulative snapshot; receivers must replace/deduplicate, never blindly sum retries. */
  readonly sequence: string;
  readonly recordedEvents: string;
  readonly droppedEvents: string;
  readonly series: readonly OperationsMetricSeries[];
}
export interface OperationsMetricSink {
  write(batch: OperationsMetricBatch, signal: AbortSignal): Promise<void>;
}
export interface OperationsMetricsOptions {
  /** Disabled by default. The host deliberately enables minimal service-health aggregation. */
  readonly enabled?: boolean;
  readonly allowedRulesets?: readonly string[];
  readonly maximumSeries?: number;
  readonly sink?: OperationsMetricSink;
  readonly flushTimeoutMs?: number;
  /** Separate trusted optional-analytics permission; absent/throwing always denies gameplay metrics. */
  readonly authorizeOptionalAnalytics?: (opaquePermit: unknown) => boolean;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}
function count(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return number(value, max) && Number.isSafeInteger(value);
}
function decimal(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1000 && /^(0|[1-9][0-9]*)$/.test(value);
}

/** Bounded aggregate counters/histograms only. No user IDs, queues, raw samples or error text. */
export class OperationsMetrics {
  private readonly options: OperationsMetricsOptions;
  private readonly enabled: boolean;
  private readonly rulesets: Set<string>;
  private readonly maximumSeries: number;
  private readonly values = new Map<string, StoredSeries>();
  private sequence = 0n;
  private recorded = 0n;
  private dropped = 0n;
  private flushing: Promise<boolean> | null = null;
  constructor(options: OperationsMetricsOptions = {}) {
    this.options = options;
    this.enabled = options.enabled === true;
    const rulesets = options.allowedRulesets ?? ['infinity-v1'];
    if (
      rulesets.length < 1 ||
      rulesets.length > 8 ||
      new Set(rulesets).size !== rulesets.length ||
      rulesets.some((value) => !/^[A-Za-z0-9._-]{1,80}$/.test(value))
    )
      throw new TypeError('Invalid metric rulesets');
    this.rulesets = new Set(rulesets);
    this.maximumSeries = options.maximumSeries ?? 256;
    if (!count(this.maximumSeries, 512) || this.maximumSeries < 8)
      throw new TypeError('Invalid metric series bound');
    if (
      options.flushTimeoutMs !== undefined &&
      (!count(options.flushTimeoutMs, 30000) || options.flushTimeoutMs < 1)
    )
      throw new TypeError('Invalid metric flush timeout');
  }
  private ruleset(value: unknown): value is string {
    return typeof value === 'string' && this.rulesets.has(value);
  }
  private sample(
    name: string,
    dimensions: Dimensions,
    value: bigint,
    bounds: readonly number[] | null = null,
  ) {
    const key = JSON.stringify([name, dimensions]);
    let series = this.values.get(key);
    if (!series) {
      if (this.values.size >= this.maximumSeries) {
        this.dropped++;
        return;
      }
      series = {
        name,
        dimensions: { ...dimensions },
        count: 0n,
        sum: 0n,
        bounds,
        buckets: bounds ? bounds.map(() => 0n).concat(0n) : [],
      };
      this.values.set(key, series);
    }
    series.count++;
    if (name !== 'optional_cleared_rows' && name !== 'audit_rows') series.sum += value;
    if (bounds) {
      const bucket = bounds.findIndex((bound) => value <= BigInt(bound));
      series.buckets[bucket < 0 ? bounds.length : bucket]++;
    }
  }
  /** Only operational event schemas are accepted here; extras make the whole event invalid. */
  record(event: unknown): boolean {
    if (!this.enabled) return false;
    try {
      if (!object(event)) return false;
      if (
        event.type === 'request' &&
        exact(event, ['type', 'endpoint', 'outcome', 'durationMs', 'rulesetVersion']) &&
        typeof event.endpoint === 'string' &&
        (OPERATION_ENDPOINTS as readonly string[]).includes(event.endpoint) &&
        typeof event.outcome === 'string' &&
        (REQUEST_OUTCOMES as readonly string[]).includes(event.outcome) &&
        number(event.durationMs, 86400000) &&
        (event.rulesetVersion === null || this.ruleset(event.rulesetVersion))
      ) {
        const tags = {
          endpoint: event.endpoint,
          outcome: event.outcome,
          ruleset: event.rulesetVersion ?? 'none',
        };
        this.sample('requests_total', tags, 1n);
        this.sample(
          'request_duration_ms',
          tags,
          BigInt(Math.ceil(event.durationMs)),
          LATENCY_BUCKETS,
        );
      } else if (
        event.type === 'reward' &&
        exact(event, ['type', 'outcome', 'verificationLatencyMs', 'rulesetVersion']) &&
        typeof event.outcome === 'string' &&
        (REWARD_OUTCOMES as readonly string[]).includes(event.outcome) &&
        number(event.verificationLatencyMs, 604800000) &&
        this.ruleset(event.rulesetVersion)
      ) {
        const tags = { outcome: event.outcome, ruleset: event.rulesetVersion };
        this.sample('reward_outcomes_total', tags, 1n);
        this.sample(
          'reward_verification_duration_ms',
          tags,
          BigInt(Math.ceil(event.verificationLatencyMs)),
          DURATION_BUCKETS,
        );
      } else if (
        event.type === 'resource' &&
        exact(event, [
          'type',
          'rulesetVersion',
          'checkpointBytes',
          'databaseReads',
          'databaseWrites',
          'auditRows',
          'handlerMs',
        ]) &&
        this.ruleset(event.rulesetVersion) &&
        count(event.checkpointBytes, 10485760) &&
        count(event.databaseReads, 1000000) &&
        count(event.databaseWrites, 1000000) &&
        decimal(event.auditRows) &&
        number(event.handlerMs, 86400000)
      ) {
        const tags = { ruleset: event.rulesetVersion };
        this.sample('checkpoint_bytes', tags, BigInt(event.checkpointBytes), BYTE_BUCKETS);
        this.sample('database_reads_total', tags, BigInt(event.databaseReads));
        this.sample('database_writes_total', tags, BigInt(event.databaseWrites));
        this.sample('audit_rows', tags, BigInt(event.auditRows), PROGRESS_BUCKETS);
        this.sample(
          'handler_duration_ms',
          tags,
          BigInt(Math.ceil(event.handlerMs)),
          LATENCY_BUCKETS,
        );
      } else return false;
      this.recorded++;
      this.sequence++;
      return true;
    } catch {
      return false;
    }
  }
  /** Demographic data is never an event field or tag, even after optional consent. */
  recordOptionalGameplay(event: unknown, opaquePermit: unknown): boolean {
    if (!this.enabled) return false;
    try {
      if (
        this.options.authorizeOptionalAnalytics?.(opaquePermit) !== true ||
        !object(event) ||
        !exact(event, [
          'type',
          'rulesetVersion',
          'lastClearedRow',
          'activeTimeMs',
          'adTimeMs',
          'revivesGranted',
          'revivesApplied',
          'revivesToReachScore',
        ]) ||
        event.type !== 'finalized_gameplay' ||
        !this.ruleset(event.rulesetVersion) ||
        !decimal(event.lastClearedRow) ||
        !count(event.activeTimeMs) ||
        !count(event.adTimeMs) ||
        !count(event.revivesGranted, 10) ||
        !count(event.revivesApplied, event.revivesGranted) ||
        !count(event.revivesToReachScore, event.revivesApplied)
      )
        return false;
      const tags = { ruleset: event.rulesetVersion };
      this.sample('optional_finalizations_total', tags, 1n);
      this.sample('optional_cleared_rows', tags, BigInt(event.lastClearedRow), PROGRESS_BUCKETS);
      this.sample(
        'optional_active_duration_ms',
        tags,
        BigInt(event.activeTimeMs),
        DURATION_BUCKETS,
      );
      this.sample('optional_ad_duration_ms', tags, BigInt(event.adTimeMs), DURATION_BUCKETS);
      this.sample(
        'optional_revives_granted',
        tags,
        BigInt(event.revivesGranted),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      );
      this.sample(
        'optional_revives_applied',
        tags,
        BigInt(event.revivesApplied),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      );
      this.sample(
        'optional_revives_to_score',
        tags,
        BigInt(event.revivesToReachScore),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      );
      this.recorded++;
      this.sequence++;
      return true;
    } catch {
      return false;
    }
  }
  snapshot(): OperationsMetricBatch {
    return {
      schemaVersion: 1,
      sequence: this.sequence.toString(),
      recordedEvents: this.recorded.toString(),
      droppedEvents: this.dropped.toString(),
      series: [...this.values.values()].map((series) => ({
        name: series.name,
        dimensions: { ...series.dimensions },
        count: series.count.toString(),
        sum:
          series.name === 'optional_cleared_rows' || series.name === 'audit_rows'
            ? null
            : series.sum.toString(),
        bounds: series.bounds ? [...series.bounds] : null,
        buckets: series.buckets.map(String),
      })),
    };
  }
  /** One bounded in-flight cumulative export. Outages never clear metrics or block business work. */
  flush(): Promise<boolean> {
    if (!this.enabled || !this.options.sink) return Promise.resolve(false);
    if (this.flushing) return this.flushing;
    const sink = this.options.sink;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const writing = Promise.resolve()
      .then(() => sink.write(this.snapshot(), controller.signal))
      .then(
        () => true,
        () => false,
      );
    const pending = (async () => {
      try {
        return await Promise.race([
          writing,
          new Promise<false>((resolve) => {
            timer = setTimeout(() => {
              controller.abort();
              resolve(false);
            }, this.options.flushTimeoutMs ?? 5000);
          }),
        ]);
      } catch {
        return false;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        controller.abort();
      }
    })();
    this.flushing = pending;
    // Keep the slot until the actual sink settles, even if it ignores abort.
    // Repeated timeouts must not accumulate overlapping writes or raw queues.
    void writing.then(() => {
      if (this.flushing === pending) this.flushing = null;
    });
    return pending;
  }
}

/** Request hooks never log bodies, identifiers, headers, raw exceptions or stack traces. */
export async function withOperationMetrics<T>(
  metrics: OperationsMetrics,
  endpoint: OperationEndpoint,
  rulesetVersion: string | null,
  operation: () => Promise<T>,
  now: () => number = () => performance.now(),
): Promise<T> {
  const readClock = () => {
    try {
      const value = now();
      return number(value) ? value : null;
    } catch {
      return null;
    }
  };
  const started = readClock();
  const record = (outcome: string) => {
    const ended = readClock();
    if (started !== null && ended !== null && ended >= started) {
      try {
        metrics.record({
          type: 'request',
          endpoint,
          outcome,
          durationMs: ended - started,
          rulesetVersion,
        });
      } catch {
        // Diagnostics must not replace a committed reply or the original error.
      }
    }
  };
  try {
    const result = await operation();
    const status = result instanceof Response ? result.status : 200;
    record(
      status < 400
        ? 'ok'
        : status === 400
          ? 'invalid'
          : status === 401 || status === 403
            ? 'denied'
            : status === 409
              ? 'conflict'
              : status === 429
                ? 'limited'
                : status === 503
                  ? 'unavailable'
                  : 'error',
    );
    return result;
  } catch (error) {
    record('error');
    throw error;
  }
}

export interface OperationsWindow {
  readonly windowMs: number;
  readonly requests: number;
  readonly serverErrors: number;
  readonly actionSamples: number;
  readonly actionP50Ms: number;
  readonly actionP95Ms: number;
  readonly oldestPendingRewardMs: number;
  readonly checkpointP95Bytes: number;
  /** Measured usage / explicitly configured owner budget; null means not configured. */
  readonly costBudgetFraction: number | null;
  readonly storageBudgetFraction: number | null;
}
export interface OperationsAlert {
  readonly code: string;
  readonly severity: 'warning' | 'critical';
}
/** Proposed thresholds, not measured deployment performance or an automatic ban/kill policy. */
export function evaluateOperationsAlerts(window: OperationsWindow): readonly OperationsAlert[] {
  if (
    !count(window.windowMs) ||
    window.windowMs < 300000 ||
    !count(window.requests) ||
    !count(window.serverErrors, window.requests) ||
    !count(window.actionSamples) ||
    !number(window.actionP50Ms) ||
    !number(window.actionP95Ms) ||
    !number(window.oldestPendingRewardMs) ||
    !number(window.checkpointP95Bytes) ||
    (window.costBudgetFraction !== null && !number(window.costBudgetFraction)) ||
    (window.storageBudgetFraction !== null && !number(window.storageBudgetFraction))
  )
    return [];
  const alerts: OperationsAlert[] = [];
  if (window.requests >= 200 && window.serverErrors / window.requests > 0.01)
    alerts.push({
      code: 'server_error_rate',
      severity: window.serverErrors / window.requests > 0.05 ? 'critical' : 'warning',
    });
  if (window.actionSamples >= 200 && (window.actionP50Ms > 150 || window.actionP95Ms > 250))
    alerts.push({
      code: 'acknowledged_action_latency',
      severity: window.actionP95Ms > 600 ? 'critical' : 'warning',
    });
  if (window.oldestPendingRewardMs > 120000)
    alerts.push({
      code: 'pending_reward_delay',
      severity: window.oldestPendingRewardMs > 600000 ? 'critical' : 'warning',
    });
  if (window.checkpointP95Bytes > 16384)
    alerts.push({ code: 'checkpoint_growth', severity: 'warning' });
  if (window.costBudgetFraction === null || window.storageBudgetFraction === null)
    alerts.push({ code: 'budget_not_configured', severity: 'warning' });
  for (const [code, fraction] of [
    ['cost_budget', window.costBudgetFraction],
    ['storage_budget', window.storageBudgetFraction],
  ] as const)
    if (fraction !== null && fraction >= 0.8)
      alerts.push({ code, severity: fraction >= 1 ? 'critical' : 'warning' });
  return alerts;
}
