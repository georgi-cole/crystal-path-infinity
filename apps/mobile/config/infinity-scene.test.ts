import { createMysteryLabRun } from '../src/mystery-lab-model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  tileExperimentVersion,
  getCurrentRow,
  PRACTICE_RNG,
  SCAN_RULESET_VERSION,
  DISCOVERY_RULESET_VERSION,
  transitionRun,
  presentRowPressure,
} from '@crystal-path-infinity/game-core';
import { InfinitySceneView } from '../src/infinity-scene';
import { ThemeContext } from '../src/store-context';
import type { ThemeId } from '../src/store-catalog';
import { en } from '../src/i18n/messages';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const noop = () => {};
function makeState() {
  return createRun(
    {
      runId: 'cpi008-view',
      routeRng: createPracticeCursor(4),
      mysteryRng: createPracticeCursor(9),
      observedAt: 100,
    },
    PRACTICE_RNG,
  );
}
function markup(modifiers: Record<string, unknown> = {}, theme: ThemeId = 'obsidian') {
  return renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: theme },
      createElement(InfinitySceneView, {
        state: makeState(),
        ready: true,
        busy: false,
        paused: false,
        error: null,
        feedback: null,
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
        ...modifiers,
      }),
    ),
  );
}
describe('CPI-008 standalone scene', () => {
  it('bundles source-verified black-hole artwork as high-quality offline WebP', () => {
    const image = readFileSync(new URL('../src/infinity-black-hole-bg.webp', import.meta.url));
    expect(image.length).toBe(201_680);
    expect(image.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(image.subarray(8, 12).toString('ascii')).toBe('WEBP');
    const gitObjectId = createHash('sha1')
      .update('blob ' + image.length + '\0')
      .update(image)
      .digest('hex');
    expect(gitObjectId).toBe('c8c0458f4f26dcc73a2b42d80663221d629c60a7');
  });

  it('renders accessible left/right/hint controls, no season/AI/prize content', () => {
    const html = markup();
    expect(html).toContain('aria-label="Row 1 left tile"');
    expect(html).toContain('aria-label="Row 1 right tile"');
    expect(html).not.toContain('aria-label="Choose left step"');
    expect(html).not.toContain('aria-label="Choose right step"');
    expect(html).not.toContain('class="cps-controls"');
    expect(html).not.toContain('class="cpi-scene-actions"');
    expect(html).toContain('class="visually-hidden" role="status" aria-live="polite"');
    expect(html).toContain('aria-label="Use hint, 2 remaining"');
    expect(html).toContain('aria-label="Crystal bridge"');
    expect(html).not.toMatch(/VIP unlock|Season immunity|Live feed|AI standings|LOH|POS/);
    expect(html).toContain('Local practice');
  });
  it('bounds its rows and disables input during a pause', () => {
    const html = markup({ paused: true });
    expect((html.match(/data-row=/g) || []).length).toBeLessThanOrEqual(5);
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-label="Row 1 left tile"[^>]*disabled=""/);
  });
  it('recovers a row-local scan and held clock without an eye, beam or repeated caption', () => {
    const base = createRun(
      {
        runId: 'practice-scan-view',
        rulesetVersion: SCAN_RULESET_VERSION,
        routeRng: createPracticeCursor(4),
        mysteryRng: createPracticeCursor(9),
        observedAt: 0,
      },
      PRACTICE_RNG,
    );
    const state = transitionRun(
      base,
      { type: 'hint', row: base.currentRow, life: 0 },
      { activeTimeMs: 4000, achievedAt: 4000, rng: PRACTICE_RNG },
    ).state;
    const html = markup({ state });
    expect(presentRowPressure(state)?.paused).toBe(true);
    expect(html).toContain('data-hint-scan="row"');
    expect(html).toContain('cpi-scan-matrix');
    expect(html).toContain('cpi-scan-lock');
    expect(html).toContain('cpi-pressure-clock is-held');
    expect(html).not.toMatch(/cpi-scan-(?:probe|projector|ray)|cpi-hint-projector/);
    expect(html).not.toContain('<span class="cpi-pane-caption">This one holds</span>');
    expect(html).toContain('aria-description="This one holds"');
    const first = markup({ state, hintCaptionRow: state.currentRow });
    expect(first).toContain('<span class="cpi-pane-caption">This one holds</span>');
    const quiet = markup({
      state,
      settings: { ...DEFAULT_PRACTICE_SETTINGS, reducedMotion: true },
    });
    expect(quiet).not.toContain('data-hint-scan="row"');
    expect(quiet).toContain('is-hinted');
  });
  it('keeps the hint control reachable without duplicating left/right tiles', () => {
    const html = markup();
    expect(html).toContain('cpi-scene-toolbar-actions');
    expect(html).toContain('aria-label="Use hint, 2 remaining"');
    expect(html).toContain('aria-label="Pause game"');
    expect(html).toContain('class="cpi-scene-footer"');
  });
  it('keeps a premium, accessible HUD and real 14-segment SP meter', () => {
    const html = markup();
    expect(html).toContain('cpi-hud-header');
    expect(html).toContain('cpi-pause-control');
    expect(html).toContain('aria-label="Pause game"');
    expect(html).toContain('cpi-energy-meter');
    expect(html).toContain('aria-label="Survival points"');
    expect(html).toContain('aria-valuenow="300"');
    expect(html).toContain('cpi-energy-segments');
    expect(html).toContain('cpi-hint-control');
    const css = readFileSync(new URL('../src/infinity-hud-premium.css', import.meta.url), 'utf8');
    expect(css).toContain('grid-template-columns: repeat(14');
    expect(html).toContain('cpi-prism-bridge');
    expect(html).toContain('cpi-bridge-pane');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('applies the optional in-app reduced-motion setting', () => {
    const html = markup({ settings: { ...DEFAULT_PRACTICE_SETTINGS, reducedMotion: true } });
    expect(html).toContain('cpi-reduced-motion');
  });
  it('keeps native safe-area, short viewport and reduced-motion rules', () => {
    const css = readFileSync(new URL('../src/infinity-scene.css', import.meta.url), 'utf8');
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toMatch(/max-height:\s*650px/);
    expect(css).toContain('prefers-reduced-motion');
    expect(markup()).toContain('aria-hidden="true"');
    expect(css).toContain('pointer-events: none');
  });
});

describe('mystery status alongside current bridge visuals', () => {
  it('keeps an active pact, timed effects, pressure and reward readable together', () => {
    const offered = createMysteryLabRun('blood_oath', 320, 91025, DISCOVERY_RULESET_VERSION).state;
    const bound = transitionRun(
      offered,
      { type: 'pact', option: 'accept', row: offered.currentRow, life: offered.revivesApplied },
      { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 0 },
    ).state;
    const pressured = transitionRun(
      bound,
      { type: 'tick' },
      { rng: PRACTICE_RNG, activeTimeMs: 4500, achievedAt: 4500 },
    ).state;
    const html = markup({
      state: {
        ...pressured,
        effects: [
          ...createMysteryLabRun('double_gain_21s', 320, 91025, DISCOVERY_RULESET_VERSION).state
            .effects,
          ...createMysteryLabRun('regen_3rows', 320, 91025, DISCOVERY_RULESET_VERSION).state
            .effects,
        ],
      },
      mysteryFeedback: {
        id: 'oath',
        kind: 'blood_oath',
        spDelta: 35,
        hintDelta: 0,
        action: 'accepted',
      },
    });
    const status = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    expect(status).toContain('role="timer"');
    expect(status).toContain('cpi-active-pact');
    expect(status).toContain('cpi-mystery-feedback');
    expect(status).toContain('Double SP');
    expect(status).toContain('Second breath');
    expect(status).not.toContain('is-bound');
    expect(status).not.toContain('<details open');
    expect(html).toContain('cpi-glass-pane');
    expect(html).not.toMatch(/No SP limit|SP has no upper limit|\/ 400/);
  });
  it('keeps cash out and debt settlement available without opening pact details', () => {
    for (const kind of ['hungry_vault', 'borrowed_time'] as const) {
      let state = createMysteryLabRun(kind, 100, 91025, DISCOVERY_RULESET_VERSION).state;
      state = transitionRun(
        state,
        { type: 'pact', option: 'accept', row: state.currentRow, life: state.revivesApplied },
        { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 0 },
      ).state;
      state = {
        ...state,
        pact: { ...state.pact!, rowsLeft: 2, bank: kind === 'hungry_vault' ? 15 : 0 },
      };
      const html = markup({ state });
      expect(html).toContain(
        'data-pact-option="' + (kind === 'hungry_vault' ? 'cashout' : 'settle') + '"',
      );
      expect(html.indexOf('data-pact-option')).toBeGreaterThan(html.indexOf('</details>'));
    }
  });
});

it('keeps the hint signal for two known broken tiles on the newer bridge', () => {
  const state = makeState();
  const html = markup({ state: { ...state, current: { ...state.current, noSafeTile: true } } });
  expect(html.match(/cpi-bridge-pane is-cracked/g)).toHaveLength(2);
});
it('keeps Twisted fate visually beneficial during the newer reveal animation', () => {
  const html = markup({
    cinematic: {
      id: 1,
      phase: 'reveal',
      rows: null,
      feedback: null,
      mystery: { kind: 'inversion_5s', spDelta: 0, hintDelta: 0 },
      fatal: false,
    },
  });
  expect(html).toContain('cpi-mystery-release');
  expect(html).not.toContain('cpi-mystery-release is-hostile');
});
describe('complete world presentation', () => {
  it.each(['chaos', 'jelly'] as const)(
    '%s carries the real mystery and effect into matching props',
    (theme) => {
      const base = makeState();
      const state = {
        ...base,
        effects: [{ kind: 'shield_5s' as const, expiresAt: base.activeTimeMs + 2500 }],
      };
      const html = markup(
        {
          state,
          cinematic: {
            id: 4,
            phase: 'reveal',
            rows: null,
            feedback: null,
            fatal: false,
            mystery: { kind: 'shield_5s', spDelta: 0, hintDelta: 0 },
          },
        },
        theme,
      );
      expect(html).toContain(`cpi-world-cache world-${theme} is-open`);
      expect(html).toContain(`cpi-world-power world-${theme}`);
      expect(html).toContain(en['game.effectShield']);
      expect(html).toContain('2.5s');
      expect(html).toContain('data-companion-action="stand"');
      expect(html).toContain('cpi-avatar-shield');
      expect(html).toContain('aria-label="Row 1 left tile"');
      expect(html).not.toContain('safeSide');
    },
  );
  it.each(['chaos', 'jelly'] as const)(
    '%s frames a themed pause and keeps the result honest',
    (theme) => {
      const paused = markup({ paused: true }, theme);
      expect(paused).toContain('cpi-world-outcome-hero world-' + theme);
      expect(paused).toContain('cpi-pause-foothold');
      expect(paused).not.toContain('cpi-result-score');
      const base = makeState();
      const dead = transitionRun(
        { ...base, sp: 10 },
        {
          type: 'choose',
          row: base.currentRow,
          life: 0,
          side: getCurrentRow(base).safeSide === 'left' ? 'right' : 'left',
        },
        { activeTimeMs: 0, achievedAt: 100, rng: PRACTICE_RNG },
      ).state;
      expect(dead.sp).toBe(0);
      const html = markup({ state: dead }, theme);
      expect(html).toContain('cpi-world-outcome-hero');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain(en['game.rowsCleared']);
      expect(html).toContain('cpi-result-score');
      expect(html).not.toContain('cpi-world-path-companion');
      expect(html).not.toContain(en['game.bestNew']);
    },
  );
});

it('keeps trial and assisted labels visible when test odds are active', () => {
  const state = createRun(
    {
      runId: 'practice-mode-labels',
      rulesetVersion: tileExperimentVersion(60, 1, true),
      observedAt: 0,
      routeRng: createPracticeCursor(10),
      mysteryRng: createPracticeCursor(11),
    },
    PRACTICE_RNG,
  );
  const assisted = transitionRun(
    state,
    { type: 'test-resource', resource: 'hints', amount: 1, sequence: 1 },
    { activeTimeMs: 0, achievedAt: 0, rng: PRACTICE_RNG },
  ).state;
  expect(markup({ state: assisted })).toContain(en['vault.assisted']);
  expect(markup({ state: assisted })).toContain('60% / 1%');
  expect(markup({ state, trial: true })).toContain(en['vault.trial']);
});
