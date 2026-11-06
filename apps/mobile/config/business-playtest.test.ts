import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  assertRunState,
  BUSINESS_STORE_RULESET_VERSION,
  CLASSIC_STORE_RULESET_VERSION,
  createPracticeCursor,
  createRun,
  getCurrentRow,
  marketingSale,
  offerPact,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import {
  writePracticeCheckpoint,
  readPracticeCheckpoint,
  recordPracticePersonalBest,
  readPracticePersonalBest,
} from '../src/practice-save';
import { createTestStore } from '../src/test-store';
import { localizeNumber, localizeInteger } from '../src/i18n';
import { PactPanel } from '../src/mystery-effects';
import { RunReserves } from '../src/run-reserves';
import { StoreVault } from '../src/store-vault';

class Storage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
function fresh() {
  return createRun(
    {
      runId: 'practice-business-ui',
      rulesetVersion: BUSINESS_STORE_RULESET_VERSION,
      routeRng: createPracticeCursor(42),
      mysteryRng: createPracticeCursor(43),
      observedAt: 0,
    },
    PRACTICE_RNG,
  );
}

describe('business playtest presentation and recovery', () => {
  it('preserves half-point SP in both checkpoint stores and isolates the new best', () => {
    const storage = new Storage();
    const state = transitionRun(
      fresh(),
      { type: 'tick' },
      { rng: PRACTICE_RNG, activeTimeMs: 6000, achievedAt: 6000 },
    ).state;
    expect(state.sp).toBe(299.5);
    writePracticeCheckpoint(storage, state);
    expect(readPracticeCheckpoint(storage)).toMatchObject({ status: 'ready', state });
    const store = createTestStore(storage);
    store.saveRun(state);
    expect(createTestStore(storage).snapshot().checkpoint).toEqual(state);
    recordPracticePersonalBest(storage, '12', BUSINESS_STORE_RULESET_VERSION);
    expect(readPracticePersonalBest(storage, CLASSIC_STORE_RULESET_VERSION)).toBeNull();
    expect(readPracticePersonalBest(storage, BUSINESS_STORE_RULESET_VERSION)).toBe('12');
    expect(localizeNumber(299.5, 'en')).toBe('299.5');
    expect(localizeNumber(299.5, 'bg')).toBe('299,5');
    expect(localizeInteger('9007199254740993', 'en')).toBe('9,007,199,254,740,993');
  });
  it('shows only the SP conversion actually available from Marketing', () => {
    const initial = fresh();
    const state = {
      ...initial,
      hints: 22,
      current: { ...initial.current, mysteryOutcome: 'marketing' as const },
      pact: { ...offerPact('marketing'), offeredAt: 0 },
      storeTest: {
        ...initial.storeTest!,
        paidHints: 20,
        hintsSpent: 20,
        sequence: 20,
        assisted: true,
      },
    };
    assertRunState(state, PRACTICE_RNG);
    const html = renderToStaticMarkup(
      createElement(PactPanel, {
        pact: state.pact,
        hints: 22,
        sp: 300,
        marketingHints: marketingSale(state).count,
        revealed: false,
        disabled: false,
        onChoose: () => {},
        rulesetVersion: state.rulesetVersion,
      }),
    );
    expect(html).toContain('Sell 12 hints');
    expect(html).toContain('+240 SP');
    expect(html).not.toContain('+440 SP');
    expect(html).toContain('Keep the rest for the bridge');
    const traded = transitionRun(
      state,
      { type: 'pact', option: 'sell_all', row: state.currentRow, life: 0 },
      { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 0 },
    ).state;
    const storage = new Storage();
    writePracticeCheckpoint(storage, traded);
    expect(readPracticeCheckpoint(storage)).toMatchObject({
      status: 'ready',
      state: { storeTest: { paidHints: 10, convertedHintSp: 200, reserveSpent: 200 } },
    });
    const store = createTestStore(storage);
    store.saveRun(traded);
    expect(createTestStore(storage).snapshot().checkpoint).toEqual(traded);
  });
  it('starts the resource shelf with small credit packs and keeps larger packs behind a choice', () => {
    const html = renderToStaticMarkup(createElement(StoreVault, { initialFilter: 'essentials' }));
    expect(html).toContain('A good place to start');
    expect(html).toContain('More packs');
    expect(html).toContain('3 continuation credits');
    expect(html).toContain('5 continuation credits');
    expect(html).not.toContain('25 continuation credits');
    expect(html).not.toContain('10 continuation credits');
  });
  it('offers credits without an ad from the first death even with an empty wallet', () => {
    const initial = { ...fresh(), sp: 1 };
    const side = getCurrentRow(initial).safeSide === 'left' ? 'right' : 'left';
    const dead = transitionRun(
      initial,
      { type: 'choose', side, row: '1', life: 0 },
      { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 0 },
    ).state;
    const html = renderToStaticMarkup(
      createElement(RunReserves, {
        state: dead,
        busy: false,
        message: '',
        onUse: () => Promise.resolve(true),
        onOpenStore: () => {},
      }),
    );
    expect(html).toContain('Get credits · skip the ad');
    expect(html).toContain('200 SP');
  });
});
