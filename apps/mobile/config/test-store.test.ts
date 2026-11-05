import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  assertRunState,
  createPracticeCursor,
  createRun,
  createRunSession,
  createTimedRunSession,
  getCurrentRow,
  getReviveSp,
  PRACTICE_RNG,
  SCAN_RULESET_VERSION,
  STORE_TEST_RULESET_VERSION,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { RunState, TestResource } from '@crystal-path-infinity/game-core';
import { createTestStore } from '../src/test-store';
import { STORE_KEY, STORE_PRODUCTS } from '../src/store-catalog';
import { ThemeArtwork } from '../src/theme-art';
import { RunReserves } from '../src/run-reserves';
import {
  DEFAULT_PRACTICE_SETTINGS,
  PRACTICE_SAVE_KEYS,
  readPracticePersonalBest,
} from '../src/practice-save';
import { InfinitySceneView } from '../src/infinity-scene';
import { presentRunOutcome } from '../src/run-outcome';
import { canResumePractice } from '../src/menu-navigation';
import { statSync, readFileSync } from 'node:fs';

class Storage {
  data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw Error('Storage full');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
function initial(version = STORE_TEST_RULESET_VERSION) {
  return createRun(
    {
      runId: 'practice-store-test',
      rulesetVersion: version,
      observedAt: 0,
      routeRng: createPracticeCursor(4),
      mysteryRng: createPracticeCursor(9),
    },
    PRACTICE_RNG,
  );
}
function apply(state: RunState, resource: TestResource, amount = 1) {
  return transitionRun(
    state,
    { type: 'test-resource', resource, amount, sequence: (state.storeTest?.sequence ?? 0) + 1 },
    { activeTimeMs: state.activeTimeMs, achievedAt: state.lastObservedAt, rng: PRACTICE_RNG },
  );
}
function die(state: RunState) {
  return transitionRun(
    state,
    { type: 'tick' },
    {
      activeTimeMs: state.activeTimeMs + 8000,
      achievedAt: state.lastObservedAt + 8000,
      rng: PRACTICE_RNG,
    },
  ).state;
}
function purchase(store: ReturnType<typeof createTestStore>, product: string, id = product) {
  store.beginPurchase(product, id);
  store.completePurchase(id);
}

describe('test-store economy and persistence', () => {
  it('grants nothing for pending, cancelled or failed checkouts and never double-grants a receipt', () => {
    const storage = new Storage();
    const store = createTestStore(storage);
    store.beginPurchase('test.sp.10000', 'pending');
    expect(store.snapshot().sp).toBe(0);
    const recovered = createTestStore(storage);
    expect(recovered.snapshot().pending?.id).toBe('pending');
    recovered.cancelPurchase('pending');
    expect(() => recovered.completePurchase('pending')).toThrow();
    expect(recovered.snapshot().sp).toBe(0);
    purchase(recovered, 'test.sp.10000', 'approved');
    recovered.completePurchase('approved');
    expect(recovered.snapshot().sp).toBe(10000);
    expect(createTestStore(storage).snapshot().sp).toBe(10000);
    expect(() => recovered.beginPurchase('test.sp.10000', 'approved')).toThrow();
  });
  it('allows equipping only owned themes and preserves ownership/equipping on reload', () => {
    const storage = new Storage();
    const store = createTestStore(storage);
    expect(() => store.equip('jelly')).toThrow();
    purchase(store, 'test.theme.jelly');
    store.equip('jelly');
    const recovered = createTestStore(storage);
    expect(recovered.snapshot().equipped).toBe('jelly');
    expect(() => recovered.beginPurchase('test.theme.jelly', 'again')).toThrow();
    recovered.equip('obsidian');
    expect(recovered.snapshot().credits).toBe(0);
  });
  it('commits reserve debits and the advanced checkpoint together and refuses stale/replayed state', () => {
    const storage = new Storage();
    const store = createTestStore(storage);
    purchase(store, 'test.sp.10000');
    const state = initial();
    store.saveRun(state);
    const result = apply(state, 'sp', 100);
    store.commitResource(result, state);
    const recovered = createTestStore(storage);
    expect(recovered.snapshot()).toMatchObject({
      sp: 9900,
      checkpoint: { sp: 400, storeTest: { reserveSpent: 100, assisted: true } },
    });
    expect(() => recovered.commitResource(result, state)).toThrow(/saved run changed/);
    recovered.saveRun(state);
    expect(recovered.snapshot().checkpoint?.sp).toBe(400);
    expect(recovered.snapshot().sp).toBe(9900);
  });
  it('does not mutate the owned session or wallet when a durable debit fails, and allows a safe retry', () => {
    const storage = new Storage();
    const store = createTestStore(storage);
    purchase(store, 'test.credits.3');
    const state = die(initial());
    store.saveRun(state);
    const session = createRunSession(state, PRACTICE_RNG);
    const bound = session.bind(
      { type: 'test-resource', resource: 'credit', amount: 1, sequence: 1 },
      store.commitResource,
    );
    const time = { activeTimeMs: state.activeTimeMs, achievedAt: state.lastObservedAt };
    storage.failWrites = true;
    expect(() => bound(time)).toThrow('Storage full');
    expect(session.getState()).toBe(state);
    expect(store.snapshot().credits).toBe(3);
    storage.failWrites = false;
    expect(bound(time).accepted).toBe(true);
    expect(bound(time).accepted).toBe(false);
    expect(store.snapshot().credits).toBe(2);
    expect(createTestStore(storage).snapshot().checkpoint?.revivesApplied).toBe(1);
  });
  it('cannot spend a nonexistent balance or mix test resources with historical rules', () => {
    const store = createTestStore(new Storage());
    const state = initial();
    store.saveRun(state);
    expect(() => store.commitResource(apply(state, 'sp', 100), state)).toThrow(/not enough/);
    expect(store.snapshot().checkpoint?.sp).toBe(300);
    expect(apply(initial(SCAN_RULESET_VERSION), 'sp', 100).reason).toBe('test-only');
    expect(() => store.saveRun(initial(SCAN_RULESET_VERSION))).toThrow();
  });
  it('rejects damaged storage without silently deleting balances and resets only test data', () => {
    const storage = new Storage();
    storage.setItem(STORE_KEY, '{broken');
    storage.setItem(PRACTICE_SAVE_KEYS.personalBest, '450');
    const store = createTestStore(storage);
    expect(store.error()).toBeTruthy();
    expect(() => store.beginPurchase('test.credits.3', 'id')).toThrow();
    expect(storage.getItem(STORE_KEY)).toBe('{broken');
    store.reset();
    expect(store.error()).toBe(null);
    expect(readPracticePersonalBest(storage)).toBe('450');
  });
  it('keeps an assisted record separate and never changes the classic record on theme purchases', () => {
    const storage = new Storage();
    storage.setItem(PRACTICE_SAVE_KEYS.personalBest, '100');
    const store = createTestStore(storage);
    purchase(store, 'test.theme.chaos');
    store.equip('chaos');
    expect(store.recordAssistedBest('200')).toBe(true);
    expect(store.recordAssistedBest('150')).toBe(false);
    expect(readPracticePersonalBest(storage)).toBe('100');
    expect(createTestStore(storage).snapshot().assistedBest).toBe('200');
  });
});

describe('versioned local resource rules', () => {
  it('preserves the active cap and cumulative refill budget, counts partial refills exactly, and rejects dead refills', () => {
    let state = initial();
    state = apply(state, 'sp', 100).state;
    expect(state.sp).toBe(400);
    expect(apply(state, 'sp', 1).reason).toBe('resource-limit');
    state = { ...state, sp: 360 };
    expect(apply(state, 'sp', 100).accepted).toBe(false);
    state = apply(state, 'sp', 40).state;
    expect(state.storeTest?.reserveSpent).toBe(140);
    state = apply({ ...state, sp: 300 }, 'sp', 60).state;
    expect(state.storeTest?.reserveSpent).toBe(200);
    expect(apply(state, 'sp', 1).reason).toBe('resource-limit');
    expect(apply(die(state), 'sp', 1).reason).toBe('not-playing');
  });
  it('keeps the ten ad slots and permits five additional credit continuations, ending at death sixteen', () => {
    let state = initial();
    for (let ordinal = 1; ordinal <= 15; ordinal++) {
      state = die(state);
      expect(state.status).toBe('dead');
      expect(presentRunOutcome(state).offer?.ordinal).toBe(ordinal);
      expect(canResumePractice({ status: 'ready', state, revision: 1 })).toBe(true);
      if (ordinal > 10) expect(apply(state, 'ad').reason).toBe('revive-limit');
      const revived = apply(state, ordinal <= 10 ? 'ad' : 'credit');
      expect(revived.accepted).toBe(true);
      state = revived.state;
      expect(state.sp).toBe(ordinal <= 5 ? 200 : 150);
      expect(state.storeTest?.assisted).toBe(ordinal > 10);
      assertRunState(state, PRACTICE_RNG);
    }
    expect(state.storeTest).toMatchObject({ adContinues: 10, creditContinues: 5 });
    state = die(state);
    expect(state.status).toBe('finished');
    expect(state.result?.storeTest?.creditContinues).toBe(5);
    expect(apply(state, 'credit').reason).toBe('finished');
    expect(() => getReviveSp(11)).toThrow();
    expect(() => getReviveSp(16, STORE_TEST_RULESET_VERSION)).toThrow();
  });
  it('uses an early credit as one of the ten standard slots, without adding a second free slot', () => {
    let state = initial();
    for (let i = 0; i < 10; i++) state = apply(die(state), i === 0 ? 'credit' : 'ad').state;
    expect(state.storeTest).toMatchObject({ adContinues: 9, creditContinues: 1, assisted: true });
    expect(apply(die(state), 'ad').accepted).toBe(false);
  });
  it('preserves the route and RNG when adding SP or a hint, and does not reset row pressure', () => {
    const state = initial();
    const enriched = apply(apply(state, 'sp', 100).state, 'hints').state;
    expect(enriched.rows).toBe(state.rows);
    expect(enriched.mysteryRng).toBe(state.mysteryRng);
    expect(enriched.pacing).toEqual(state.pacing);
    expect(enriched.hints).toBe(3);
    expect(getCurrentRow(enriched)).toEqual(getCurrentRow(state));
  });
  it('can refill while paused without consuming paused time or bypassing the game clock', () => {
    let time = 0;
    const state = initial();
    const session = createTimedRunSession(state, PRACTICE_RNG, {
      monotonicNow: () => time,
      observedAt: 0,
    });
    session.releaseRecovery();
    time = 1000;
    const pause = session.hold('user');
    time = 50000;
    const refill = session.bind({
      type: 'test-resource',
      resource: 'sp',
      amount: 100,
      sequence: 1,
    })();
    expect(refill.accepted).toBe(true);
    expect(refill.state.activeTimeMs).toBe(1000);
    pause.release();
    time += 6999;
    expect(session.tick().state.status).toBe('playing');
    time++;
    expect(session.tick().state.death?.cause).toBe('idle');
  });
});

describe('test-store presentation and assets', () => {
  it('provides every requested resource denomination and two original complete worlds', () => {
    expect(STORE_PRODUCTS.filter((p) => p.kind === 'sp').map((p) => p.quantity)).toEqual([
      100, 500, 1000, 2500, 5000, 10000,
    ]);
    expect(STORE_PRODUCTS.filter((p) => p.kind === 'credit').map((p) => p.quantity)).toEqual([
      3, 10, 25,
    ]);
    for (const theme of ['chaos', 'jelly'] as const) {
      const html = renderToStaticMarkup(createElement(ThemeArtwork, { theme }));
      expect(html).toContain('world-' + theme);
      for (const cue of ['loop', 'step', 'record', 'ended']) {
        const asset = new URL(`../public/assets/themes/${theme}-${cue}.wav`, import.meta.url);
        expect(statSync(asset).size).toBeGreaterThan(1000);
        expect(readFileSync(asset).subarray(0, 4).toString()).toBe('RIFF');
      }
    }
  });
  it('labels a resource-assisted scene and offers simulator recovery without claiming live ads', () => {
    const state = die(apply(initial(), 'sp', 100).state);
    const panel = createElement(RunReserves, {
      state,
      busy: false,
      onUse: () => Promise.resolve(true),
      message: '',
    });
    const noop = () => {};
    const html = renderToStaticMarkup(
      createElement(InfinitySceneView, {
        state,
        resourcePanel: panel,
        feedback: null,
        ready: true,
        busy: false,
        paused: false,
        error: null,
        onChoose: noop,
        onHint: noop,
        onMystery: noop,
        onPause: noop,
        onEnd: noop,
        onRequestEnd: noop,
        onCancelEnd: noop,
        confirmEnd: false,
        onExit: noop,
        onViewRankings: noop,
        personalBest: null,
        newPersonalBest: false,
        onRestart: noop,
        onRetry: noop,
        settings: DEFAULT_PRACTICE_SETTINGS,
        onSettingsChange: noop,
      }),
    );
    expect(html).toContain('Assisted · Local practice');
    expect(html).toContain('Simulate rewarded ad');
    expect(html).toContain('Test store · No real charges');
    expect(html).not.toContain('Watch ad');
  });
});
