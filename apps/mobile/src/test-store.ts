import {
  assertRunState,
  PRACTICE_RNG,
  usesStoreTestRules,
  STORE_TEST_RULESET_VERSION,
} from '@crystal-path-infinity/game-core';
import type { RunState, TransitionResult } from '@crystal-path-infinity/game-core';
import type { PracticeLoad, PracticeStorage } from './practice-save';
import { STORE_KEY, storeProduct, THEME_IDS } from './store-catalog';
import type { ThemeId } from './store-catalog';

export interface TestStoreSnapshot {
  readonly version: 1;
  readonly mode: 'test';
  readonly revision: number;
  readonly sp: number;
  readonly credits: number;
  readonly hints: number;
  readonly owned: readonly ThemeId[];
  readonly equipped: ThemeId;
  readonly pending: { readonly id: string; readonly productId: string } | null;
  readonly lastReceipt: string | null;
  readonly checkpoint: RunState | null;
  readonly assistedBest: string | null;
  readonly assistedBestByRules?: Readonly<Record<string, string>>;
}
export const EMPTY_TEST_STORE: TestStoreSnapshot = Object.freeze({
  version: 1,
  mode: 'test',
  revision: 0,
  sp: 0,
  credits: 0,
  hints: 0,
  owned: ['obsidian'] as readonly ThemeId[],
  equipped: 'obsidian',
  pending: null,
  lastReceipt: null,
  checkpoint: null,
  assistedBest: null,
});

/** The wallet checkpoint is authoritative; reset must invalidate the menu's old cached Resume. */
export function selectTestPractice(
  snapshot: TestStoreSnapshot,
  fallback: PracticeLoad,
): PracticeLoad {
  if (snapshot.checkpoint)
    return { status: 'ready', state: snapshot.checkpoint, revision: snapshot.revision };
  return fallback.status === 'ready' && usesStoreTestRules(fallback.state.rulesetVersion)
    ? { status: 'empty' }
    : fallback;
}
const BALANCE_LIMIT = 1_000_000_000;
function counter(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= BALANCE_LIMIT
  );
}
function validate(value: TestStoreSnapshot): void {
  if (
    !value ||
    value.version !== 1 ||
    value.mode !== 'test' ||
    ![value.revision, value.sp, value.hints, value.credits].every(counter) ||
    !Array.isArray(value.owned) ||
    !value.owned.includes('obsidian') ||
    value.owned.some((id: unknown) => !THEME_IDS.some((theme) => theme === id)) ||
    new Set(value.owned).size !== value.owned.length ||
    !value.owned.includes(value.equipped) ||
    (value.lastReceipt !== null &&
      (typeof value.lastReceipt !== 'string' || value.lastReceipt.length > 100)) ||
    (value.assistedBest !== null &&
      (typeof value.assistedBest !== 'string' ||
        !/^(0|[1-9][0-9]{0,999})$/.test(value.assistedBest)))
  )
    throw new Error('Test wallet is damaged. Reset test data to start again.');
  if (
    value.assistedBestByRules !== undefined &&
    (value.assistedBestByRules === null ||
      typeof value.assistedBestByRules !== 'object' ||
      Array.isArray(value.assistedBestByRules) ||
      Object.keys(value.assistedBestByRules).length > 256 ||
      Object.entries(value.assistedBestByRules).some(
        ([version, row]) =>
          !usesStoreTestRules(version) ||
          typeof row !== 'string' ||
          !/^(0|[1-9][0-9]{0,999})$/.test(row),
      ))
  )
    throw new Error('Invalid versioned test result.');
  if (value.pending !== null) {
    if (
      !value.pending ||
      typeof value.pending.id !== 'string' ||
      !value.pending.id ||
      value.pending.id.length > 100
    )
      throw new Error('Invalid pending test purchase.');
    storeProduct(value.pending.productId);
  }
  if (value.checkpoint !== null) {
    assertRunState(value.checkpoint, PRACTICE_RNG);
    if (
      !usesStoreTestRules(value.checkpoint.rulesetVersion) ||
      !value.checkpoint.runId.startsWith('practice-')
    )
      throw new Error('Test wallet cannot hold a ranked or historical run.');
  }
}
function load(storage: PracticeStorage): TestStoreSnapshot {
  const raw = storage.getItem(STORE_KEY);
  if (raw === null) return EMPTY_TEST_STORE;
  if (raw.length > 100_000) throw new Error('Test wallet exceeds its storage budget.');
  const value = JSON.parse(raw) as TestStoreSnapshot;
  validate(value);
  return value;
}

/** Device-local simulator only. There is intentionally no payment or ranked network transport. */
export function createTestStore(storage: PracticeStorage) {
  let snapshot = EMPTY_TEST_STORE;
  let error: string | null = null;
  try {
    snapshot = load(storage);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Test storage unavailable.';
  }
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of listeners) listener();
  }
  function commit(change: (current: TestStoreSnapshot) => TestStoreSnapshot) {
    if (error) throw new Error(error);
    const current = load(storage);
    const next = change(current);
    if (next === current) {
      snapshot = current;
      return;
    }
    const updated = { ...next, revision: current.revision + 1 };
    validate(updated);
    // A single atomic localStorage record owns both the debit and the resulting run.
    // A crash cannot leave a charged wallet with an older gameplay checkpoint.
    storage.setItem(STORE_KEY, JSON.stringify(updated));
    snapshot = updated;
    notify();
  }
  const store = {
    snapshot: () => snapshot,
    error: () => error,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reload() {
      try {
        snapshot = load(storage);
        error = null;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Test storage unavailable.';
      }
      notify();
    },
    beginPurchase(productId: string, id: string) {
      const product = storeProduct(productId);
      if (!id || id.length > 100) throw new Error('Invalid test receipt.');
      commit((current) => {
        if (current.pending) throw new Error('Finish or cancel the pending test purchase first.');
        if (current.lastReceipt === id) throw new Error('This test receipt has already been used.');
        if (product.theme && current.owned.includes(product.theme))
          throw new Error('You already own this theme.');
        return { ...current, pending: { id, productId } };
      });
    },
    completePurchase(id: string) {
      commit((current) => {
        if (current.lastReceipt === id) return current;
        if (!current.pending || current.pending.id !== id)
          throw new Error('This test purchase is no longer pending.');
        const product = storeProduct(current.pending.productId);
        return {
          ...current,
          pending: null,
          lastReceipt: id,
          sp: current.sp + (product.kind === 'sp' ? product.quantity : 0),
          credits: current.credits + (product.kind === 'credit' ? product.quantity : 0),
          hints: current.hints + (product.kind === 'hints' ? product.quantity : 0),
          owned:
            product.theme && !current.owned.includes(product.theme)
              ? [...current.owned, product.theme]
              : current.owned,
        };
      });
    },
    cancelPurchase(id: string) {
      commit((current) => (current.pending?.id === id ? { ...current, pending: null } : current));
    },
    equip(theme: ThemeId) {
      commit((current) => {
        if (!current.owned.includes(theme))
          throw new Error('Unlock this theme in the test store first.');
        return { ...current, equipped: theme };
      });
    },
    saveRun(state: RunState) {
      assertRunState(state, PRACTICE_RNG);
      if (!usesStoreTestRules(state.rulesetVersion)) throw new Error('Not a test economy run.');
      commit((current) => {
        const old = current.checkpoint;
        if (
          old?.runId === state.runId &&
          ((old.storeTest?.sequence ?? 0) > (state.storeTest?.sequence ?? 0) ||
            old.activeTimeMs > state.activeTimeMs ||
            old.revivesApplied > state.revivesApplied ||
            old.status === 'finished')
        )
          return current;
        return old === state ? current : { ...current, checkpoint: state };
      });
    },
    clearRun() {
      commit((current) => ({ ...current, checkpoint: null }));
    },
    commitResource(this: void, result: TransitionResult, previous: RunState) {
      const event = result.events.find((item) => item.type === 'test-resource-used');
      if (!result.accepted || !event || !previous.storeTest || !result.state.storeTest)
        throw new Error('No accepted test resource to commit.');
      assertRunState(result.state, PRACTICE_RNG);
      commit((current) => {
        if (
          current.checkpoint?.runId !== previous.runId ||
          current.checkpoint.storeTest?.sequence !== previous.storeTest?.sequence
        )
          throw new Error(
            'The saved run changed. Return to the menu and resume it before spending.',
          );
        const sp = event.resource === 'sp' ? event.amount : 0;
        const credits = event.resource === 'credit' ? 1 : 0;
        const hints = event.resource === 'hints' ? 1 : 0;
        if (current.sp < sp || current.credits < credits || current.hints < hints)
          throw new Error('There is not enough in your test wallet.');
        return {
          ...current,
          sp: current.sp - sp,
          credits: current.credits - credits,
          hints: current.hints - hints,
          checkpoint: result.state,
        };
      });
    },
    assistedBest(version = STORE_TEST_RULESET_VERSION): string | null {
      return version === STORE_TEST_RULESET_VERSION
        ? snapshot.assistedBest
        : (snapshot.assistedBestByRules?.[version] ?? null);
    },
    recordAssistedBest(row: string, version = STORE_TEST_RULESET_VERSION) {
      if (!usesStoreTestRules(version)) throw new Error('Not a test ruleset.');
      if (!/^(0|[1-9][0-9]{0,999})$/.test(row)) throw new Error('Invalid result.');
      let improved = false;
      commit((current) => {
        const previous =
          version === STORE_TEST_RULESET_VERSION
            ? current.assistedBest
            : (current.assistedBestByRules?.[version] ?? null);
        if (previous !== null && BigInt(previous) >= BigInt(row)) return current;
        improved = true;
        return version === STORE_TEST_RULESET_VERSION
          ? { ...current, assistedBest: row }
          : { ...current, assistedBestByRules: { ...current.assistedBestByRules, [version]: row } };
      });
      return improved;
    },
    reset() {
      storage.removeItem(STORE_KEY);
      snapshot = EMPTY_TEST_STORE;
      error = null;
      notify();
    },
  };
  return store;
}
export type TestStore = ReturnType<typeof createTestStore>;
