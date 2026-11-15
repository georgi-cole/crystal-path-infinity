import type { RunState } from '@crystal-path-infinity/game-core';
import type { AccountSessionOwner } from '../account/session-owner';
import type { PracticeStorage } from '../practice-save';
import { parseInfinityScore } from '@crystal-path-infinity/game-core';
import type { InfinityScore } from '@crystal-path-infinity/game-core';
export { LOCAL_INFINITY_BOARD, parseInfinityScore } from '@crystal-path-infinity/game-core';
export type { InfinityScore } from '@crystal-path-infinity/game-core';
export interface ScoreSyncState {
  readonly phase: 'idle' | 'queued' | 'uploading' | 'synced' | 'error';
  readonly pending: InfinityScore | null;
}
export interface LocalScoreClient {
  /** A freshly loaded public profile binds uploads to the current session. */
  bindOwner(publicId: string): void;
  currentOwner(): string | null;
  record(state: RunState, owner: string | null, newRun: boolean): void;
  snapshot(): ScoreSyncState;
  subscribe(observer: () => void): () => void;
  setOnline(online: boolean): void;
  flush(): Promise<void>;
  dispose(): void;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT = 'cpi.infinity.scores.v1.';
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function better(next: InfinityScore, old: InfinityScore | null) {
  return (
    !old ||
    BigInt(next.rows) > BigInt(old.rows) ||
    (next.rows === old.rows && next.revives < old.revives)
  );
}

/** Device gameplay never awaits this queue. Only finished Infinity summaries leave it.
 * These are client-reported scores, separate from the old verified-run authority. */
export function createLocalScoreClient(options: {
  baseUrl: string;
  session: Pick<
    AccountSessionOwner,
    'accountScope' | 'snapshot' | 'subscribeAccountScope' | 'withAccountRequest'
  >;
  storage: PracticeStorage;
  fetcher?: typeof fetch;
  newId?: () => string;
}): LocalScoreClient | null {
  let url: URL;
  try {
    url = new URL(options.baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
  } catch {
    return null;
  }
  const endpoint = url.href.replace(/\/$/, '') + '/infinity/score';
  const observers = new Set<() => void>();
  const read = (key: string): unknown => {
    try {
      const raw = options.storage.getItem(ROOT + key);
      return raw && raw.length <= 30_000 ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  };
  const savedOwner = read('owner');
  let owner = typeof savedOwner === 'string' && UUID.test(savedOwner) ? savedOwner : null;
  let ownerScope: object | null = null;
  let online = true;
  let disposed = false;
  let flight: Promise<void> | null = null;
  let request: AbortController | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let state: ScoreSyncState = { phase: 'idle', pending: null };
  const write = (key: string, value: unknown) =>
    options.storage.setItem(ROOT + key, JSON.stringify(value));
  const pending = (id: string) => parseInfinityScore(read('pending.' + id));
  const emit = (phase: ScoreSyncState['phase']) => {
    state = Object.freeze({ phase, pending: owner ? pending(owner) : null });
    for (const observer of observers) {
      try {
        observer();
      } catch {
        /* A view observer cannot interrupt local gameplay. */
      }
    }
  };
  const currentOwner = () =>
    ['guest', 'connecting', 'signing_out', 'blocked', 'revocation_unconfirmed'].includes(
      options.session.snapshot().phase,
    )
      ? null
      : owner;
  const accountChanged = () => {
    if (ownerScope !== options.session.accountScope()) {
      ownerScope = null;
      request?.abort();
    }
    if (!currentOwner()) {
      owner = null;
      try {
        options.storage.removeItem(ROOT + 'owner');
      } catch {
        /* Local play remains available. */
      }
    }
    emit(owner && pending(owner) ? 'queued' : 'idle');
  };
  const unsubscribe = options.session.subscribeAccountScope(accountChanged);
  const client: LocalScoreClient = {
    bindOwner(id) {
      const scope = options.session.accountScope();
      if (!scope || !UUID.test(id) || disposed) return;
      if (owner !== id || ownerScope !== scope) request?.abort();
      owner = id;
      ownerScope = scope;
      try {
        write('owner', id);
      } catch {
        /* An upload can still use this live binding. */
      }
      emit(pending(id) ? 'queued' : 'idle');
      void client.flush();
    },
    currentOwner,
    record(run, id, newRun) {
      if (
        disposed ||
        !run.runId.startsWith('practice-') ||
        (run.runId.startsWith('practice-campaign-') &&
          !run.runId.startsWith('practice-campaign-infinity-'))
      )
        return;
      try {
        const raw = read('runs');
        const bindings = object(raw) ? raw : {};
        let binding = bindings[run.runId];
        if (!object(binding)) {
          if (
            !newRun ||
            !id ||
            !UUID.test(id) ||
            run.status !== 'playing' ||
            run.lastClearedRow !== '0'
          )
            return;
          binding = { owner: id, id: (options.newId ?? (() => crypto.randomUUID()))() };
          const entries = Object.entries(bindings).slice(-31);
          write('runs', Object.fromEntries([...entries, [run.runId, binding]]));
        }
        if (
          !object(binding) ||
          typeof binding.owner !== 'string' ||
          !UUID.test(binding.owner) ||
          run.status !== 'finished' ||
          !run.result ||
          run.pendingReward
        )
          return;
        const result = parseInfinityScore({
          schemaVersion: 1,
          runId: binding.id,
          rows: run.result.lastClearedRow,
          revives: run.result.revivesToReachScore,
          activeTimeMs: run.result.activeTimeMs,
        });
        if (!result) return;
        const best = parseInfinityScore(read('best.' + binding.owner));
        if (!better(result, best)) return;
        // Commit the outbox before its best marker: interruption can retry the same ID.
        write('pending.' + binding.owner, result);
        write('best.' + binding.owner, result);
        if (binding.owner === owner) {
          emit('queued');
          void client.flush();
        }
      } catch {
        emit('error'); /* Saving/sync errors never hold the game clock or controls. */
      }
    },
    snapshot: () => state,
    subscribe(observer) {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
    setOnline(value) {
      online = value;
      if (value) void client.flush();
      else request?.abort();
    },
    async flush() {
      if (flight) return flight;
      const id = owner,
        scope = ownerScope;
      if (disposed || !online || !id || !scope || scope !== options.session.accountScope()) return;
      const score = pending(id);
      if (!score) return;
      const controller = new AbortController();
      request = controller;
      emit('uploading');
      const work = (async () => {
        try {
          await options.session.withAccountRequest(async (lease) => {
            if (owner !== id || ownerScope !== scope || scope !== options.session.accountScope())
              throw new Error('Account changed');
            const response = await (options.fetcher ?? fetch)(endpoint, {
              method: 'POST',
              headers: {
                authorization: 'Bearer ' + lease.accessToken,
                'content-type': 'application/json',
              },
              body: JSON.stringify(score),
              signal: AbortSignal.any([
                lease.signal,
                controller.signal,
                AbortSignal.timeout(12_000),
              ]),
              credentials: 'omit',
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
            });
            const text = await response.text();
            const reply: unknown = text.length <= 1024 ? (JSON.parse(text) as unknown) : null;
            if (
              !response.ok ||
              !object(reply) ||
              reply.status !== 'saved' ||
              reply.runId !== score.runId
            )
              throw new Error('Score not acknowledged');
          });
          if (
            disposed ||
            controller.signal.aborted ||
            owner !== id ||
            ownerScope !== scope ||
            scope !== options.session.accountScope()
          )
            return;
          if (pending(id)?.runId === score.runId)
            options.storage.removeItem(ROOT + 'pending.' + id);
          emit(pending(id) ? 'queued' : 'synced');
        } catch {
          if (!disposed && owner === id && ownerScope === scope) {
            emit('queued');
            if (!retry)
              retry = setTimeout(() => {
                retry = null;
                void client.flush();
              }, 30_000);
          }
        }
      })();
      flight = work;
      try {
        await work;
      } finally {
        if (flight === work) {
          flight = null;
          request = null;
        }
        if (!disposed && state.phase === 'queued' && !retry) void client.flush();
      }
    },
    dispose() {
      disposed = true;
      request?.abort();
      if (retry) clearTimeout(retry);
      unsubscribe();
      observers.clear();
    },
  };
  return client;
}
