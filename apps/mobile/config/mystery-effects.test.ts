import { mysteryFeedbackFromEvents } from '../src/mystery-feedback';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getCurrentRow,
  getRuleset,
  PACT_KINDS,
  PACT_RULESET_VERSION,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { PactKind, RunState } from '@crystal-path-infinity/game-core';
import { createMysteryLabRun } from '../src/mystery-lab-model';
import { effectCopy } from '../src/mystery.messages';
import {
  EffectGlyph,
  MysteryEffects,
  MysteryFeedbackView,
  PactPanel,
} from '../src/mystery-effects';
import { parseRankedReply } from '../src/ranked/ranked-client';
import {
  readPracticeCheckpoint,
  readPracticePersonalBest,
  recordPracticePersonalBest,
  writePracticeCheckpoint,
} from '../src/practice-save';

function pactAction(state: RunState, option: 'accept' | 'decline') {
  return transitionRun(
    state,
    { type: 'pact', option, row: state.currentRow, life: 0 },
    { activeTimeMs: state.activeTimeMs, achievedAt: state.lastObservedAt, rng: PRACTICE_RNG },
  );
}
function wire(state: RunState) {
  return {
    accepted: true,
    reason: null,
    lease: { token: '00000000-0000-4000-8000-000000000022', generation: '1', expiresAt: 60_000 },
    snapshot: {
      runId: '00000000-0000-4000-8000-000000000021',
      rulesetVersion: state.rulesetVersion,
      status: state.status,
      region: { countryCode: 'BG', continent: 'EU', mappingVersion: 'regions-v1' },
      nextSequence: '1',
      lastClearedRow: state.lastClearedRow,
      currentRow: state.currentRow,
      sp: state.sp,
      hints: state.hints,
      activeTimeMs: state.activeTimeMs,
      achievedAt: 0,
      paused: false,
      current: { ...state.current, hasMystery: true },
      history: [],
      effects: state.effects,
      pact: state.pact,
      death: null,
      revivesGranted: 0,
      revivesApplied: 0,
      revivesToReachScore: 0,
      rewardPending: false,
    },
  };
}

describe('mystery feedback, practice chamber and public contracts', () => {
  it.each(getRuleset(PACT_RULESET_VERSION).mysteryTable.map((entry) => entry.kind))(
    'the %s chamber opens that real result',
    (kind) => {
      const result = createMysteryLabRun(kind);
      expect(result.state.current.mysteryOutcome).toBe(kind);
      expect(result.state.currentRow).toBe('26');
      expect(result.state.rulesetVersion).toBe(PACT_RULESET_VERSION);
      const html = renderToStaticMarkup(createElement(EffectGlyph, { kind }));
      expect(html).toContain(`data-effect="${kind}"`);
      expect(html).toContain('aria-hidden="true"');
      expect(effectCopy('bg', kind).detail.length).toBeGreaterThan(30);
      expect(effectCopy('en', kind).detail.length).toBeGreaterThan(30);
      expect(effectCopy('bg', kind).title).not.toBe(effectCopy('en', kind).title);
    },
  );

  it('shows Twisted fate as a blessing and makes the repeated-healing rule readable', () => {
    const state = createMysteryLabRun('inversion_5s').state;
    const html = renderToStaticMarkup(
      createElement(MysteryEffects, { effects: state.effects, activeTimeMs: 0 }),
    );
    expect(html).toContain('is-positive');
    expect(html).toContain('Blessing');
    expect(html).toContain('every wrong tile heals');
    expect(html).toContain('5.0s');
  });

  it('restarting a chamber changes the unknown route and exchange roll', () => {
    const runs = Array.from(
      { length: 20 },
      (_, index) => createMysteryLabRun('soul_exchange', 100, 91025 + index).state,
    );
    expect(new Set(runs.map((state) => state.mysteryRng.state)).size).toBeGreaterThan(10);
    const rolls = runs.map(
      (state) =>
        transitionRun(
          state,
          { type: 'pact', row: state.currentRow, life: 0, option: 'hint' },
          { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
        ).state.sp,
    );
    expect(rolls).toContain(140);
    expect(rolls).toContain(70);
  });

  it('reports the whole 40-SP oracle hit rather than just its extra penalty', () => {
    const accepted = pactAction(createMysteryLabRun('false_oracle').state, 'accept').state;
    const safe = getCurrentRow(accepted).safeSide;
    const result = transitionRun(
      accepted,
      {
        type: 'choose',
        side: safe === 'left' ? 'right' : 'left',
        row: accepted.currentRow,
        life: 0,
      },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    );
    expect(result.state.sp).toBe(60);
    const feedback = mysteryFeedbackFromEvents(result.events, result.state);
    expect(feedback?.spDelta).toBe(-40);
    const html = renderToStaticMarkup(createElement(MysteryFeedbackView, { feedback }));
    expect(html).toContain('40');
    expect(html).toContain('is-dangerous');
  });

  it('animates only the actual regeneration received at the SP cap', () => {
    const initial = { ...createMysteryLabRun('regen_5s').state, sp: 399 };
    const first = transitionRun(
      initial,
      { type: 'tick' },
      { activeTimeMs: 500, achievedAt: 500, rng: PRACTICE_RNG },
    );
    expect(mysteryFeedbackFromEvents(first.events, first.state)?.spDelta).toBe(1);
    const next = transitionRun(
      first.state,
      { type: 'tick' },
      { activeTimeMs: 1000, achievedAt: 1000, rng: PRACTICE_RNG },
    );
    expect(mysteryFeedbackFromEvents(next.events, next.state)).toBeNull();
  });

  it('explains the oracle as uncertain, disables impossible acceptance and needs a hint for the soul trade', () => {
    const oracle = createMysteryLabRun('false_oracle').state;
    const html = renderToStaticMarkup(
      createElement(PactPanel, {
        pact: oracle.pact,
        hints: 2,
        revealed: true,
        disabled: false,
        onChoose: () => {},
      }),
    );
    expect(html).toContain('70%');
    expect(html).toMatch(/disabled="" data-pact-option="accept"/);
    expect(html).toContain('This row is already revealed');
    const soul = createMysteryLabRun('soul_exchange').state;
    const soulHtml = renderToStaticMarkup(
      createElement(PactPanel, {
        pact: soul.pact,
        hints: 0,
        revealed: false,
        disabled: false,
        onChoose: () => {},
      }),
    );
    expect(soulHtml).toMatch(/disabled="" data-pact-option="hint"/);
  });

  it.each(PACT_KINDS)(
    'strictly decodes public %s and rejects private fields and impossible banks',
    (kind: PactKind) => {
      const state = createMysteryLabRun(kind).state;
      const reply = wire(state);
      expect(parseRankedReply(reply)?.snapshot.pact?.kind).toBe(kind);
      expect(
        parseRankedReply({
          ...reply,
          snapshot: { ...reply.snapshot, pact: { ...state.pact, rng: 'private' } },
        }),
      ).toBeNull();
      expect(
        parseRankedReply({ ...reply, snapshot: { ...reply.snapshot, safeSide: 'left' } }),
      ).toBeNull();
      expect(
        parseRankedReply({
          ...reply,
          snapshot: { ...reply.snapshot, pact: { ...state.pact, bank: 99 } },
        }),
      ).toBeNull();
      expect(
        parseRankedReply({
          ...reply,
          snapshot: { ...reply.snapshot, rulesetVersion: 'infinity-v1' },
        }),
      ).toBeNull();
    },
  );

  it('round-trips active and offered pacts through the real atomic practice save', () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      },
      removeItem: (key: string) => {
        records.delete(key);
      },
    };
    for (const kind of PACT_KINDS) {
      let state = createMysteryLabRun(kind).state;
      writePracticeCheckpoint(storage, state);
      const offered = readPracticeCheckpoint(storage);
      expect(offered.status).toBe('ready');
      if (offered.status === 'ready') expect(offered.state).toEqual(state);
      if (kind === 'soul_exchange') continue;
      state = pactAction(state, 'accept').state;
      writePracticeCheckpoint(storage, state);
      const active = readPracticeCheckpoint(storage);
      expect(active.status).toBe('ready');
      if (active.status === 'ready') expect(active.state).toEqual(state);
    }
    recordPracticePersonalBest(storage, '100');
    recordPracticePersonalBest(storage, '30', PACT_RULESET_VERSION);
    expect(readPracticePersonalBest(storage)).toBe('100');
    expect(readPracticePersonalBest(storage, PACT_RULESET_VERSION)).toBe('30');
  });
});
