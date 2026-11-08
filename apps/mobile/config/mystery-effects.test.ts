import { mysteryFeedbackFromEvents } from '../src/mystery-feedback';
import { runCuesFromEvents } from '../src/mystery-feedback';
import { EffectConsumption, HintCounter } from '../src/resource-feedback';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getCurrentRow,
  getRuleset,
  PACT_KINDS,
  PACT_RULESET_VERSION,
  BALANCE_RULESET_VERSION,
  RISK_RULESET_VERSION,
  DIRECTOR_RULESET_VERSION,
  RELIC_RULESET_VERSION,
  DISCOVERY_RULESET_VERSION,
  usesRelicRules,
  usesMysteryDirectorRules,
  getDeathClock,
  applyMysteryEffect,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { PactKind, PactOption, RunState } from '@crystal-path-infinity/game-core';
import { createMysteryLabRun, prepareMysteryLabStep } from '../src/mystery-lab-model';
import { effectCopy } from '../src/mystery.messages';
import {
  EffectGlyph,
  MysteryEffects,
  MysteryFeedbackView,
  PactPanel,
} from '../src/mystery-effects';
import { parseRankedReply } from '../src/ranked/ranked-client';
import { mysteryChoiceCards } from '../src/mystery-choice-model';
import { THEME_IDS } from '../src/store-catalog';
import { ThemeScope } from '../src/store-provider';
import {
  readPracticeCheckpoint,
  readPracticePersonalBest,
  recordPracticePersonalBest,
  writePracticeCheckpoint,
} from '../src/practice-save';

function pactAction(state: RunState, option: PactOption) {
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
      ...(state.discovery ? { discovery: state.discovery } : {}),
      ...(usesMysteryDirectorRules(state.rulesetVersion)
        ? { mysteryRhythm: state.mysteryDirector!.rhythm, deathClock: getDeathClock(state) }
        : {}),
      death: state.death
        ? { id: state.death.id, fatalRow: state.death.fatalRow, cause: state.death.cause }
        : null,
      revivesGranted: 0,
      revivesApplied: 0,
      revivesToReachScore: 0,
      rewardPending: false,
    },
  };
}

describe('mystery feedback, practice chamber and public contracts', () => {
  it.each(
    [DIRECTOR_RULESET_VERSION, RELIC_RULESET_VERSION, DISCOVERY_RULESET_VERSION].flatMap(
      (version) => getRuleset(version).mysteryTable.map(({ kind }) => ({ version, kind })),
    ),
  )(
    'opens and decodes $version / $kind with its actual clock and public tier',
    ({ kind, version }) => {
      const result = createMysteryLabRun(kind, 100, 91025, version);
      expect(result.state.current.mysteryOutcome).toBe(kind);
      expect(parseRankedReply(wire(result.state))).not.toBeNull();
      if (kind === 'mystery_silence_30s' || kind === 'mystery_surge_30s') {
        for (const locale of ['bg', 'en'] as const) {
          const detail = effectCopy(locale, kind, version).detail;
          expect(detail.includes('5–7')).toBe(usesRelicRules(version));
        }
      }
    },
  );

  it.each([DIRECTOR_RULESET_VERSION, RELIC_RULESET_VERSION, DISCOVERY_RULESET_VERSION])(
    'keeps %s choices compact and refreshes their live price during the death clock',
    (version) => {
      const opened = createMysteryLabRun('half_life', 100, 91025, version).state;
      const waiting = transitionRun(
        opened,
        { type: 'tick' },
        { activeTimeMs: 65000, achievedAt: 65000, rng: PRACTICE_RNG },
      ).state;
      const html = renderToStaticMarkup(
        createElement(PactPanel, {
          pact: waiting.pact,
          hints: waiting.hints,
          sp: waiting.sp,
          revealed: false,
          disabled: false,
          onChoose: () => {},
          rulesetVersion: version,
          activeTimeMs: 65000,
        }),
      );
      expect(waiting.sp).toBe(80);
      expect(html).toContain('cpi-relic-options');
      expect(html).toMatch(/class="cpi-relic-open" src="data:image\/webp;base64,/);
      expect(html).not.toContain('65% ·');
      expect(html.match(/data-pact-option=/g)).toHaveLength(2);
      expect(html).toContain('data-tier="major"');
      expect(html).toContain('Death clock · 5s');
      expect(html).toContain('40 SP');
      const accept = mysteryChoiceCards(waiting.pact!, waiting.sp, waiting.hints, false, false)[0];
      const traded = pactAction(waiting, accept.option);
      expect(traded.state.sp).toBe(40);
      expect(traded.state.hints).toBe(7);
    },
  );

  it('shows exact soul probabilities and avoids duplicate Marketing actions for a single hint', () => {
    const soul = createMysteryLabRun('soul_exchange', 100, 91025, DIRECTOR_RULESET_VERSION).state;
    const offers = mysteryChoiceCards(soul.pact!, 100, 2, false, false);
    expect(offers[0].lines).toEqual(['65% · 75 SP · 4 hints', '35% · 60 SP · 3 hints']);
    expect(offers[1].lines).toEqual(['65% · 140 SP · 1 hint', '35% · 70 SP · 1 hint']);
    const market = createMysteryLabRun('marketing', 100, 91025, DIRECTOR_RULESET_VERSION).state;
    expect(
      mysteryChoiceCards(market.pact!, 100, 1, false, false).map((item) => item.option),
    ).toEqual(['sell_one', 'decline']);
    expect(mysteryChoiceCards(market.pact!, 100, 0, false, false)[0].disabled).toBe(true);
  });

  it('decodes a bounded first discovery and rejects injected fields or an extended reading window', () => {
    const state = createMysteryLabRun('inversion_5s', 100, 91025, DISCOVERY_RULESET_VERSION).state;
    const reply = wire(state);
    expect(parseRankedReply(reply)?.snapshot.discovery?.introduction?.expiresAt).toBe(4000);
    for (const discovery of [
      { ...state.discovery, pressure: 1 },
      { ...state.discovery, introduction: { ...state.discovery!.introduction, expiresAt: 5000 } },
      { ...state.discovery, known: ['half_life'], introduction: state.discovery!.introduction },
    ])
      expect(parseRankedReply({ ...reply, snapshot: { ...reply.snapshot, discovery } })).toBeNull();
  });

  it('decodes rhythm and death clock without leaking cooldowns, and rejects forged grace, tiers and durations', () => {
    const state = createMysteryLabRun('half_life', 100, 91025, DIRECTOR_RULESET_VERSION).state;
    const reply = wire(state);
    expect(parseRankedReply(reply)?.snapshot.deathClock).toEqual({
      warningAt: 60000,
      expiresAt: 70000,
    });
    for (const extra of [
      { mysteryDirector: state.mysteryDirector },
      { deathClock: { warningAt: 60000, expiresAt: 65000 } },
      { deathClock: { warningAt: 61000, expiresAt: 71000 } },
      { current: { ...reply.snapshot.current, mysteryTier: 'treasure' } },
      { pact: { ...state.pact, offeredAt: -1 } },
    ]) {
      expect(parseRankedReply({ ...reply, snapshot: { ...reply.snapshot, ...extra } })).toBeNull();
    }
    const dead = transitionRun(
      state,
      { type: 'tick' },
      { activeTimeMs: 70000, achievedAt: 70000, rng: PRACTICE_RNG },
    ).state;
    expect(parseRankedReply(wire(dead))?.snapshot.death?.cause).toBe('death_clock');
    expect(
      parseRankedReply({
        ...reply,
        snapshot: { ...reply.snapshot, rulesetVersion: RISK_RULESET_VERSION },
      }),
    ).toBeNull();
  });

  it.each([DIRECTOR_RULESET_VERSION, RELIC_RULESET_VERSION, DISCOVERY_RULESET_VERSION])(
    'persists a partially drained %s decision without resetting grace or mixing scores',
    (version) => {
      const opened = createMysteryLabRun('half_life', 100, 91025, version).state;
      const state = transitionRun(
        opened,
        { type: 'tick' },
        { activeTimeMs: 65000, achievedAt: 65000, rng: PRACTICE_RNG },
      ).state;
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
      writePracticeCheckpoint(storage, state);
      const loaded = readPracticeCheckpoint(storage);
      expect(loaded.status).toBe('ready');
      if (loaded.status !== 'ready') return;
      expect(loaded.state.mysteryDirector).toEqual(state.mysteryDirector);
      expect(loaded.state.pact?.offeredAt).toBe(0);
      expect(getDeathClock(loaded.state)).toEqual({ warningAt: 60000, expiresAt: 70000 });
      recordPracticePersonalBest(storage, '77', version);
      expect(readPracticePersonalBest(storage, version)).toBe('77');
      expect(readPracticePersonalBest(storage, RISK_RULESET_VERSION)).toBeNull();
      expect(
        readPracticePersonalBest(
          storage,
          version === DIRECTOR_RULESET_VERSION ? RELIC_RULESET_VERSION : DIRECTOR_RULESET_VERSION,
        ),
      ).toBeNull();
    },
  );

  it.each(getRuleset(RISK_RULESET_VERSION).mysteryTable.map((entry) => entry.kind))(
    'opens and decodes the hidden-risk %s demonstration',
    (kind) => {
      const result = createMysteryLabRun(kind, 100, 91025, RISK_RULESET_VERSION);
      expect(result.state.current.mysteryOutcome).toBe(kind);
      expect(effectCopy('bg', kind, RISK_RULESET_VERSION).detail.length).toBeGreaterThan(0);
      expect(parseRankedReply(wire(result.state))).not.toBeNull();
    },
  );

  it('shows ten seconds of Coyote and distinguishes a blocked tile from healing', () => {
    const state = prepareMysteryLabStep(
      createMysteryLabRun('coyote_10s', 100, 91025, RISK_RULESET_VERSION).state,
    );
    const result = transitionRun(
      state,
      { type: 'choose', side: 'right', row: state.currentRow, life: 0 },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    );
    const feedback = mysteryFeedbackFromEvents(result.events, result.state);
    expect(result.state.sp).toBe(100);
    expect(feedback).toMatchObject({ kind: 'coyote_10s', spDelta: 0, action: 'triggered' });
    const html = renderToStaticMarkup(
      createElement(MysteryFeedbackView, { feedback, rulesetVersion: RISK_RULESET_VERSION }),
    );
    expect(html).toContain('Run Coyote');
    expect(html).toContain('0 SP');
    const badge = renderToStaticMarkup(
      createElement(MysteryEffects, {
        effects: state.effects,
        activeTimeMs: 0,
        rulesetVersion: RISK_RULESET_VERSION,
      }),
    );
    expect(badge).toContain('10.0s');
  });

  it('keeps free no-safe hints public but rejects hidden risk assignments and forged hint flags', () => {
    const state = prepareMysteryLabStep(
      createMysteryLabRun('coyote_10s', 100, 91025, RISK_RULESET_VERSION).state,
      'both-broken',
    );
    const result = transitionRun(
      state,
      { type: 'hint', row: state.currentRow, life: 0 },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    );
    const reply = wire(result.state);
    expect(parseRankedReply(reply)?.snapshot.current.noSafeTile).toBe(true);
    expect(result.state.hints).toBe(2);
    for (const extra of [
      { risk: { lowRiskSide: 'left' } },
      { lowRiskSide: 'left' },
      { broken: { left: true, right: true } },
      { noSafeTile: false },
      { noSafeTile: true, revealedSafeSide: 'left' },
    ]) {
      expect(
        parseRankedReply({
          ...reply,
          snapshot: { ...reply.snapshot, current: { ...reply.snapshot.current, ...extra } },
        }),
      ).toBeNull();
    }
    expect(
      parseRankedReply({
        ...reply,
        snapshot: { ...reply.snapshot, rulesetVersion: BALANCE_RULESET_VERSION },
      }),
    ).toBeNull();
  });

  it('restores v4 route draws and Coyote exactly, keeping v3 personal bests separate', () => {
    const state = createMysteryLabRun('coyote_10s', 5000, 91025, RISK_RULESET_VERSION).state;
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
    writePracticeCheckpoint(storage, state);
    const restored = readPracticeCheckpoint(storage);
    expect(restored.status === 'ready' ? restored.state : null).toEqual(state);
    recordPracticePersonalBest(storage, '20', BALANCE_RULESET_VERSION);
    recordPracticePersonalBest(storage, '30', RISK_RULESET_VERSION);
    expect(readPracticePersonalBest(storage, BALANCE_RULESET_VERSION)).toBe('20');
    expect(readPracticePersonalBest(storage, RISK_RULESET_VERSION)).toBe('30');
  });

  it.each(getRuleset(BALANCE_RULESET_VERSION).mysteryTable.map((entry) => entry.kind))(
    'opens the current-balance %s demonstration',
    (kind) => {
      const result = createMysteryLabRun(kind, 100, 91025, BALANCE_RULESET_VERSION);
      expect(result.state.current.mysteryOutcome).toBe(kind);
      expect(result.state.rulesetVersion).toBe(BALANCE_RULESET_VERSION);
      expect(effectCopy('bg', kind, BALANCE_RULESET_VERSION).detail.length).toBeGreaterThan(0);
      expect(renderToStaticMarkup(createElement(EffectGlyph, { kind }))).toContain('<path');
      expect(parseRankedReply(wire(result.state))).not.toBeNull();
    },
  );

  it('keeps shield consumption independent of simultaneous bleeding and shows the right cause', () => {
    const state = createMysteryLabRun('bleed_3rows', 100, 91025, BALANCE_RULESET_VERSION).state;
    const shield = applyMysteryEffect('shield_5s', 0).addedEffect!;
    const safe = getCurrentRow(state).safeSide;
    const result = transitionRun(
      { ...state, effects: [...state.effects, shield] },
      { type: 'choose', row: state.currentRow, life: 0, side: safe === 'left' ? 'right' : 'left' },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    );
    expect(result.state.sp).toBe(97);
    const cues = runCuesFromEvents(result.events, result.state);
    expect(cues.consumption?.kind).toBe('shield_5s');
    expect(mysteryFeedbackFromEvents(result.events, result.state)?.kind).toBe('bleed_3rows');
    const html = renderToStaticMarkup(createElement(EffectConsumption, { cue: cues.consumption }));
    expect(html).toContain('SHIELD USED');
    expect(html).toContain('0 SP');
  });

  it('never mislabels Second breath healing as Twisted fate', () => {
    const state = createMysteryLabRun('regen_3rows', 100, 91025, BALANCE_RULESET_VERSION).state;
    const safe = getCurrentRow(state).safeSide;
    const result = transitionRun(
      state,
      { type: 'choose', row: state.currentRow, life: 0, side: safe === 'left' ? 'right' : 'left' },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    );
    expect(result.state.sp).toBe(101);
    expect(mysteryFeedbackFromEvents(result.events, result.state)).toMatchObject({
      kind: 'regen_3rows',
      spDelta: 6,
    });
    expect(runCuesFromEvents(result.events, result.state).consumption).toBeUndefined();
  });

  it('flashes actual hint changes for Half Life, Marketing and hint use', () => {
    const half = pactAction(
      createMysteryLabRun('half_life', 100, 91025, BALANCE_RULESET_VERSION).state,
      'accept',
    );
    const gained = runCuesFromEvents(half.events, half.state);
    expect(gained.hints?.delta).toBe(5);
    const html = renderToStaticMarkup(
      createElement(HintCounter, { count: half.state.hints, cue: gained.hints }),
    );
    expect(html).toContain('is-hint-gain');
    expect(html).toContain('+5');
    const market = pactAction(
      createMysteryLabRun('marketing', 100, 91025, BALANCE_RULESET_VERSION).state,
      'sell_one',
    );
    expect(runCuesFromEvents(market.events, market.state).hints?.delta).toBe(-1);
    const hint = transitionRun(
      market.state,
      { type: 'hint', row: market.state.currentRow, life: 0 },
      { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
    );
    expect(runCuesFromEvents(hint.events, hint.state).hints?.delta).toBe(-1);
  });

  it('decodes uncapped SP and row charges but rejects forged durations and extra fields', () => {
    const state = createMysteryLabRun('regen_3rows', 5000, 91025, BALANCE_RULESET_VERSION).state;
    const reply = wire(state);
    expect(parseRankedReply(reply)?.snapshot.sp).toBe(5000);
    const forged = {
      ...reply,
      snapshot: { ...reply.snapshot, effects: [{ ...state.effects[0], rowsLeft: 4 }] },
    };
    expect(parseRankedReply(forged)).toBeNull();
    const timed = createMysteryLabRun(
      'double_gain_21s',
      5000,
      91025,
      BALANCE_RULESET_VERSION,
    ).state;
    expect(parseRankedReply(wire(timed))).not.toBeNull();
    expect(
      parseRankedReply({
        ...wire(timed),
        snapshot: {
          ...wire(timed).snapshot,
          effects: [{ ...timed.effects[0], expiresAt: 22_000 }],
        },
      }),
    ).toBeNull();
    expect(
      parseRankedReply({
        ...reply,
        snapshot: { ...reply.snapshot, rulesetVersion: 'infinity-v1' },
      }),
    ).toBeNull();
  });
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
      expect(effectCopy('bg', kind).detail.length).toBeGreaterThan(0);
      expect(effectCopy('en', kind).detail.length).toBeGreaterThan(0);
      expect(effectCopy('bg', kind).title).not.toBe(effectCopy('en', kind).title);
    },
  );

  it('shows Twisted fate as a blessing and makes the repeated-healing rule readable', () => {
    const state = createMysteryLabRun('inversion_5s').state;
    const html = renderToStaticMarkup(
      createElement(MysteryEffects, { effects: state.effects, activeTimeMs: 0 }),
    );
    expect(html).toContain('is-positive');
    expect(html).toContain('every broken tile gives you SP');
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

  it('opens a choice with the equipped relic artwork for every world', () => {
    const state = createMysteryLabRun('half_life', 100, 91025, RELIC_RULESET_VERSION).state;
    for (const theme of THEME_IDS) {
      const html = renderToStaticMarkup(
        createElement(ThemeScope, {
          theme,
          children: createElement(PactPanel, {
            pact: state.pact,
            hints: state.hints,
            rulesetVersion: state.rulesetVersion,
            revealed: false,
            disabled: false,
            onChoose: () => {},
          }),
        }),
      );
      if (theme === 'obsidian') {
        expect(html).toContain('cpi-mystery-cube is-open');
      } else {
        expect(html).toContain('cpi-world-cache world-' + theme + ' is-open');
        expect(html).not.toContain('cpi-mystery-cube');
      }
    }
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
