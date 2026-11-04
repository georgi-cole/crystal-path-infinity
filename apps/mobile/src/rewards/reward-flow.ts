import { RewardUnavailable } from './reward-client.ts';
import type {
  RewardClient,
  RewardInventory,
  RewardPermit,
  RewardPromise,
  RewardView,
} from './reward-client';

export interface LoadedRewardedAd {
  /** Resolve means show was requested, not that fullscreen has closed. */
  readonly show: (
    input: { customData: string; onEarned: () => void; onClosed: () => void; onError: () => void },
    signal: AbortSignal,
  ) => Promise<void>;
  readonly dispose: () => void;
}
export interface NativeRewardedAdapter {
  readonly available: boolean;
  readonly inventory: RewardInventory | null;
  /** Apply all approved privacy flags BEFORE any SDK initialization or load. */
  readonly initialize: (permit: RewardPermit, signal: AbortSignal) => Promise<void>;
  readonly load: (
    signal: AbortSignal,
  ) => Promise<{ status: 'loaded'; ad: LoadedRewardedAd } | { status: 'no_fill' | 'error' }>;
}
/** No SDK, ad unit or production identifier is invented by this implementation. */
export const UNAVAILABLE_REWARDED_ADAPTER: NativeRewardedAdapter = Object.freeze({
  available: false,
  inventory: null,
  initialize: () => Promise.reject(new RewardUnavailable()),
  load: () => Promise.reject(new RewardUnavailable()),
});
interface Arbiter {
  owner: object | null;
  observers: Set<() => void>;
}
const arbiters = new WeakMap<NativeRewardedAdapter, Arbiter>();
function arbiter(adapter: NativeRewardedAdapter): Arbiter {
  let value = arbiters.get(adapter);
  if (!value) {
    value = { owner: null, observers: new Set() };
    arbiters.set(adapter, value);
  }
  return value;
}
function inventoryKey(value: RewardInventory): string {
  return JSON.stringify([
    value.provider,
    value.platform,
    value.sdkVersion,
    [...value.mediation]
      .sort((a, b) => a.identifier.localeCompare(b.identifier))
      .map((entry) => [entry.identifier, entry.version]),
  ]);
}
export function permitMatchesAdapter(
  permit: RewardPermit,
  adapter: NativeRewardedAdapter,
  now: number,
): boolean {
  return (
    adapter.available &&
    adapter.inventory !== null &&
    permit.prerequisitesSatisfied === true &&
    permit.contextSupported === true &&
    permit.flags.canRequestAds === true &&
    Number.isSafeInteger(now) &&
    permit.expiresAt > now &&
    permit.expiresAt <= now + 300_000 &&
    inventoryKey(permit.inventory) === inventoryKey(adapter.inventory) &&
    (!(permit.context === 'child' || permit.context === 'unknown') ||
      (permit.flags.childDirected &&
        permit.flags.underAgeOfConsent &&
        permit.flags.maxAdContentRating === 'G' &&
        permit.flags.nonPersonalized))
  );
}
export type RewardFlowPhase =
  | 'unavailable'
  | 'offer'
  | 'loading'
  | 'showing'
  | 'earned_pending'
  | 'granted'
  | 'reviving'
  | 'playing'
  | 'final';
export interface RewardFlowState {
  readonly phase: RewardFlowPhase;
  readonly promise: RewardPromise | null;
  readonly revivesGranted: number | null;
  readonly revivesApplied: number | null;
  readonly revivesToReachScore: number | null;
  readonly inputBlocked: boolean;
  readonly fullscreen: boolean;
  readonly waiting: boolean;
  readonly canWatch: boolean;
  readonly canApply: boolean;
  readonly canRetry: boolean;
  readonly canEnd: boolean;
  readonly problem: 'unavailable' | 'privacy_unavailable' | 'no_fill' | 'offline' | null;
}
export interface RewardFlowOptions {
  readonly runId: string;
  readonly client: RewardClient | null;
  readonly adapter?: NativeRewardedAdapter;
  /** Parent binds this to the same gameplay input/clock/audio pause owner. */
  readonly onGateChange: (blocked: boolean) => void;
  /** Refresh the authoritative ranked controller before enabling any gameplay. */
  readonly synchronizeRun: (runId: string) => Promise<boolean>;
  readonly online?: boolean;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly schedule?: (callback: () => void, delayMs: number) => () => void;
}

/** One run/death owner. Client SDK callbacks can only request a server status read. */
export class RewardFlow {
  private readonly options: RewardFlowOptions;
  get runId(): string {
    return this.options.runId;
  }
  private readonly adapter: NativeRewardedAdapter;
  private readonly arbiter: Arbiter;
  private readonly observers = new Set<() => void>();
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => () => void;
  private readonly unsubscribeAccount: () => void;
  private readonly arbiterObserver: () => void;
  private scope: object | null;
  private epoch: object = {};
  private online: boolean;
  private disposed = false;
  private view: RewardView | null = null;
  private phase: RewardFlowPhase = 'unavailable';
  private problem: RewardFlowState['problem'] = null;
  private state: RewardFlowState;
  private busy = false;
  private request: AbortController | null = null;
  private statusFlight: Promise<void> | null = null;
  private statusRequest: AbortController | null = null;
  private ad: LoadedRewardedAd | null = null;
  private permit: RewardPermit | null = null;
  private lease: object | null = null;
  private fullscreen = false;
  private createKey: string | null = null;
  private deadline = 0;
  private stopPoll: (() => void) | null = null;
  private lastGate: boolean | null = null;
  constructor(options: RewardFlowOptions) {
    this.options = options;
    this.adapter = options.adapter ?? UNAVAILABLE_REWARDED_ADAPTER;
    this.arbiter = arbiter(this.adapter);
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ??
      ((callback, delay) => {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      });
    this.scope = options.client?.accountScope() ?? null;
    this.online = options.online ?? true;
    this.state = this.buildState();
    this.arbiterObserver = () => this.emit();
    this.arbiter.observers.add(this.arbiterObserver);
    this.unsubscribeAccount =
      options.client?.subscribeAccountScope(() => this.syncAccount()) ?? (() => {});
    this.emit();
  }
  snapshot(): RewardFlowState {
    this.syncAccount();
    return this.state;
  }
  subscribe(observer: () => void): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }
  private syncAccount(): void {
    const next = this.options.client?.accountScope() ?? null;
    if (next === this.scope) return;
    this.scope = next;
    this.epoch = {};
    this.request?.abort();
    this.request = null;
    this.statusRequest?.abort();
    this.statusRequest = null;
    this.statusFlight = null;
    this.busy = false;
    this.cancelPoll();
    this.view = null;
    this.phase = 'unavailable';
    this.problem = null;
    this.createKey = null;
    if (!this.fullscreen) this.releaseAd();
    this.emit();
  }
  private current(epoch: object): boolean {
    this.syncAccount();
    return !this.disposed && this.scope !== null && epoch === this.epoch;
  }
  private buildState(): RewardFlowState {
    const valid = !this.disposed && this.scope !== null;
    const phase = valid ? this.phase : 'unavailable';
    const value = valid ? this.view : null;
    const blocked = phase !== 'playing' || this.arbiter.owner !== null;
    const promise = value?.offer ?? value?.grant ?? value?.intent ?? null;
    return Object.freeze({
      phase,
      promise: promise
        ? Object.freeze({ ordinal: promise.ordinal, restoreSp: promise.restoreSp })
        : null,
      revivesGranted: value?.revivesGranted ?? null,
      revivesApplied: value?.revivesApplied ?? null,
      revivesToReachScore: value?.revivesToReachScore ?? null,
      inputBlocked: blocked,
      fullscreen: this.fullscreen,
      waiting: this.stopPoll !== null || this.statusFlight !== null,
      canWatch:
        valid &&
        this.online &&
        phase === 'offer' &&
        !!value?.offer &&
        this.adapter.available &&
        !this.busy &&
        !this.statusFlight &&
        !this.arbiter.owner,
      canApply:
        valid &&
        this.online &&
        phase === 'granted' &&
        !this.fullscreen &&
        !this.arbiter.owner &&
        !this.busy &&
        !this.statusFlight,
      canRetry:
        valid &&
        this.online &&
        !this.busy &&
        !this.statusFlight &&
        (phase === 'earned_pending' || phase === 'unavailable' || this.problem !== null),
      canEnd:
        valid &&
        phase === 'offer' &&
        value?.intent === null &&
        value.grant === null &&
        !this.busy &&
        !this.fullscreen,
      problem: this.online ? this.problem : 'offline',
    });
  }
  private emit(): void {
    this.state = this.buildState();
    if (this.lastGate !== this.state.inputBlocked) {
      this.lastGate = this.state.inputBlocked;
      this.options.onGateChange(this.lastGate);
    }
    for (const observer of this.observers) {
      try {
        observer();
      } catch {
        /* Observers cannot grant or resume a run. */
      }
    }
  }
  private acquire(): boolean {
    if (this.arbiter.owner) return false;
    this.lease = {};
    this.arbiter.owner = this.lease;
    for (const observer of this.arbiter.observers) observer();
    return true;
  }
  private releaseAd(): void {
    if (this.fullscreen) return;
    try {
      this.ad?.dispose();
    } catch {
      this.problem = 'unavailable';
    }
    this.ad = null;
    this.permit = null;
    if (this.lease && this.arbiter.owner === this.lease) {
      this.arbiter.owner = null;
      for (const observer of this.arbiter.observers) observer();
    }
    this.lease = null;
  }
  private cancelPoll(): void {
    this.stopPoll?.();
    this.stopPoll = null;
  }
  private poll(): void {
    this.cancelPoll();
    if (
      this.disposed ||
      !this.online ||
      this.view?.status !== 'pending' ||
      this.now() >= this.deadline
    ) {
      this.emit();
      return;
    }
    this.stopPoll = this.schedule(() => {
      this.stopPoll = null;
      void this.recover().finally(() => this.poll());
    }, 1000);
    this.emit();
  }
  private accept(view: RewardView): void {
    const old = this.view;
    if (
      view.runId !== this.options.runId ||
      (old &&
        (view.rulesetVersion !== old.rulesetVersion ||
          view.revivesGranted < old.revivesGranted ||
          view.revivesApplied < old.revivesApplied ||
          view.revivesToReachScore < old.revivesToReachScore ||
          (old.status === 'finished' && view.status !== 'finished') ||
          (old.deathId !== null &&
            view.deathId !== null &&
            old.revivesApplied === view.revivesApplied &&
            old.deathId !== view.deathId)))
    )
      throw new RewardUnavailable();
    this.view = structuredClone(view);
    this.phase =
      view.status === 'offer'
        ? 'offer'
        : view.status === 'pending'
          ? 'earned_pending'
          : view.status === 'granted'
            ? 'granted'
            : view.status === 'finished'
              ? 'final'
              : 'reviving';
    if (view.status !== 'pending') this.cancelPoll();
  }
  async recover(): Promise<void> {
    this.syncAccount();
    if (this.disposed || !this.scope || !this.online || !this.options.client) return;
    if (this.statusFlight) return this.statusFlight;
    const epoch = this.epoch;
    const controller = new AbortController();
    this.statusRequest = controller;
    const work = (async () => {
      try {
        const view = await this.options.client!.status(this.options.runId, controller.signal);
        if (!this.current(epoch)) return;
        this.accept(view);
        this.problem = null;
        if (view.status === 'playing') {
          const synchronized = await this.options.synchronizeRun(this.options.runId);
          if (!this.current(epoch)) return;
          this.phase = synchronized ? 'playing' : 'reviving';
          if (!synchronized) this.problem = 'unavailable';
        }
      } catch {
        if (this.current(epoch)) this.problem = 'unavailable';
      }
    })();
    this.statusFlight = work;
    this.emit();
    try {
      await work;
    } finally {
      if (this.statusFlight === work) {
        this.statusFlight = null;
        this.statusRequest = null;
        this.emit();
      }
    }
  }
  async watch(): Promise<void> {
    this.syncAccount();
    if (!this.state.canWatch || !this.options.client || !this.view?.offer || !this.acquire())
      return;
    this.busy = true;
    this.phase = 'loading';
    this.problem = null;
    const epoch = this.epoch;
    const promise = this.view.offer;
    const controller = new AbortController();
    this.request = controller;
    this.emit();
    try {
      // Another device/owner may have earned a grant since this offer rendered.
      // Refresh before any SDK work and require a new choice if the promise changed.
      const fresh = await this.options.client.status(this.options.runId, controller.signal);
      if (!this.current(epoch)) return;
      this.accept(fresh);
      if (fresh.status !== 'offer') {
        if (fresh.status === 'playing') await this.recover();
        return;
      }
      if (
        !fresh.offer ||
        fresh.offer.ordinal !== promise.ordinal ||
        fresh.offer.restoreSp !== promise.restoreSp
      )
        return;
      this.phase = 'loading';
      const permit = await this.options.client.eligibility(this.options.runId, controller.signal);
      if (!this.current(epoch)) return;
      if (!permit || !permitMatchesAdapter(permit, this.adapter, this.now())) {
        this.problem = 'privacy_unavailable';
        this.phase = 'offer';
        return;
      }
      this.permit = permit;
      await this.adapter.initialize(permit, controller.signal);
      if (
        !this.current(epoch) ||
        controller.signal.aborted ||
        !permitMatchesAdapter(permit, this.adapter, this.now())
      )
        return;
      const loaded = await this.adapter.load(controller.signal);
      if (!this.current(epoch)) {
        if (loaded.status === 'loaded') loaded.ad.dispose();
        return;
      }
      if (loaded.status !== 'loaded') {
        this.problem = loaded.status === 'no_fill' ? 'no_fill' : 'unavailable';
        this.phase = 'offer';
        return;
      }
      this.ad = loaded.ad;
      if (
        controller.signal.aborted ||
        !this.online ||
        !permitMatchesAdapter(permit, this.adapter, this.now())
      )
        throw new RewardUnavailable();
      this.createKey = (this.options.newId ?? (() => crypto.randomUUID()))();
      await this.createAndShow(promise, controller, epoch);
    } catch {
      if (this.current(epoch)) {
        this.problem = 'unavailable';
        this.phase =
          this.view?.status === 'granted'
            ? 'granted'
            : this.createKey || this.view?.status === 'pending'
              ? 'earned_pending'
              : 'offer';
      }
    } finally {
      if (this.current(epoch)) {
        this.busy = false;
        this.request = null;
        if (!this.fullscreen && !this.createKey) this.releaseAd();
        this.emit();
      } else if (!this.fullscreen) this.releaseAd();
    }
  }
  private async createAndShow(
    promise: RewardPromise,
    controller: AbortController,
    epoch: object,
  ): Promise<void> {
    if (!this.options.client || !this.createKey || !this.ad || !this.permit)
      throw new RewardUnavailable();
    if (controller.signal.aborted || !this.online) throw new RewardUnavailable();
    const view = await this.options.client.intent(
      this.options.runId,
      this.createKey,
      controller.signal,
    );
    if (!this.current(epoch)) return;
    this.accept(view);
    if (view.status === 'granted' || view.status === 'playing' || view.status === 'finished') {
      this.createKey = null;
      if (view.status === 'playing') await this.recover();
      return;
    }
    const intent = view.intent;
    if (
      view.status !== 'pending' ||
      !intent ||
      controller.signal.aborted ||
      !this.online ||
      intent.ordinal !== promise.ordinal ||
      intent.restoreSp !== promise.restoreSp ||
      intent.expiresAt <= this.now() ||
      !permitMatchesAdapter(this.permit, this.adapter, this.now())
    )
      throw new RewardUnavailable();
    this.createKey = null;
    this.fullscreen = true;
    this.phase = 'showing';
    this.deadline = this.now() + 15_000;
    this.emit();
    const ad = this.ad;
    await ad.show(
      {
        customData: intent.customData,
        onEarned: () => {
          if (this.current(epoch)) {
            this.phase = this.view?.status === 'granted' ? 'granted' : 'earned_pending';
            this.emit();
            void this.recover().finally(() => this.poll());
          }
        },
        onClosed: () => {
          this.fullscreen = false;
          this.releaseAd();
          if (this.current(epoch)) {
            this.emit();
            void this.recover().finally(() => this.poll());
          }
        },
        onError: () => {
          if (this.current(epoch)) {
            this.problem = 'unavailable';
            this.phase = 'earned_pending';
            this.emit();
            void this.recover().finally(() => this.poll());
          }
        },
      },
      controller.signal,
    );
  }
  async retry(): Promise<void> {
    this.syncAccount();
    if (this.busy || !this.online || !this.scope || this.disposed) return;
    if (this.createKey && this.ad && this.permit && this.view) {
      const promise = this.view.offer ?? this.view.intent;
      if (promise && permitMatchesAdapter(this.permit, this.adapter, this.now())) {
        this.busy = true;
        const epoch = this.epoch;
        const controller = new AbortController();
        this.request = controller;
        this.emit();
        try {
          await this.createAndShow(promise, controller, epoch);
        } catch {
          if (this.current(epoch)) this.problem = 'unavailable';
        } finally {
          if (this.current(epoch)) {
            this.busy = false;
            this.request = null;
            if (!this.fullscreen && !this.createKey) this.releaseAd();
            this.emit();
          }
        }
        return;
      }
      this.releaseAd();
      this.createKey = null;
    }
    await this.recover();
  }
  async apply(): Promise<void> {
    this.syncAccount();
    if (!this.state.canApply || !this.options.client || !this.view?.grant) return;
    const epoch = this.epoch;
    const grant = this.view.grant;
    this.busy = true;
    this.phase = 'reviving';
    this.problem = null;
    this.emit();
    try {
      const applied = await this.options.client.applyGrant(this.options.runId, grant.id);
      if (!this.current(epoch)) return;
      if (applied === false) throw new RewardUnavailable();
      await this.recover();
    } catch {
      if (this.current(epoch)) {
        this.phase = 'granted';
        this.problem = 'unavailable';
      }
    } finally {
      if (this.current(epoch)) {
        this.busy = false;
        this.emit();
      }
    }
  }
  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    if (!online) {
      this.request?.abort();
      this.statusRequest?.abort();
      this.cancelPoll();
    }
    this.emit();
  }
  /** Invoke synchronously on consent/privacy changes, before asking the server.
   * Already earned grants remain owed; only future SDK processing is cancelled.
   */
  invalidateEligibility(): void {
    if (this.disposed) return;
    this.epoch = {};
    this.request?.abort();
    this.statusRequest?.abort();
    this.statusFlight = null;
    this.busy = false;
    this.cancelPoll();
    this.permit = null;
    if (!this.fullscreen) this.releaseAd();
    this.problem = 'privacy_unavailable';
    this.phase =
      this.view?.status === 'granted'
        ? 'granted'
        : this.view?.status === 'pending' || this.createKey
          ? 'earned_pending'
          : this.view?.status === 'playing'
            ? 'playing'
            : this.view?.status === 'finished'
              ? 'final'
              : this.view?.status === 'offer'
                ? 'offer'
                : 'unavailable';
    this.emit();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch = {};
    this.request?.abort();
    this.statusRequest?.abort();
    this.cancelPoll();
    this.unsubscribeAccount();
    this.arbiter.observers.delete(this.arbiterObserver);
    if (!this.fullscreen) this.releaseAd();
    this.view = null;
    this.phase = 'unavailable';
    this.emit();
    this.observers.clear();
  }
}
