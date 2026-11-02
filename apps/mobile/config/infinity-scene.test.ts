import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createPracticeCursor, createRun, PRACTICE_RNG } from '@crystal-path-infinity/game-core';
import { InfinitySceneView } from '../src/infinity-scene';
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
function markup(modifiers: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
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
      onExit: noop,
      onRestart: noop,
      onRetry: noop,
      settings: DEFAULT_PRACTICE_SETTINGS,
      onSettingsChange: noop,
      ...modifiers,
    }),
  );
}
describe('CPI-008 standalone scene', () => {
  it('bundles the exact original owner-source black-hole PNG, not a CSS approximation', () => {
    const image = readFileSync(new URL('../src/infinity-black-hole-bg.png', import.meta.url));
    expect(image.length).toBe(1_896_459);
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const gitObjectId = createHash('sha1')
      .update(`blob ${image.length}\0`)
      .update(image)
      .digest('hex');
    expect(gitObjectId).toBe('25e9ceb6f98ac43c2bc15354ce8be7b7e7596cd3');
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
    expect(html).toContain('aria-label="Endless crystal bridge"');
    expect(html).not.toMatch(/VIP unlock|Season immunity|Live feed|AI standings|LOH|POS/);
    expect(html).toContain('Not a ranked score');
  });
  it('bounds its rows and disables input during a pause', () => {
    const html = markup({ paused: true });
    expect((html.match(/data-row=/g) || []).length).toBeLessThanOrEqual(5);
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Row 1 left tile"/);
  });
  it('keeps the hint control reachable without duplicating left/right tiles', () => {
    const html = markup();
    expect(html).toContain('cpi-scene-toolbar-actions');
    expect(html).toContain('aria-label="Use hint, 2 remaining"');
    expect(html).toContain('aria-label="Pause game"');
    expect(html).toContain('class="cpi-scene-footer"');
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
    expect(css).toContain("url('./infinity-black-hole-bg.png')");
    const railRules = css.match(
      /\.cps-shell--premium \.cps-board::before,\s*\.cps-shell--premium \.cps-board::after\s*\{([^}]+)\}/,
    );
    expect(railRules?.[1]).toContain('bottom: 56%');
    expect(railRules?.[1]).toContain('pointer-events: none');
    expect(railRules?.[1]).toContain('mask-image: linear-gradient(to bottom');
    expect(railRules?.[1]).toContain('-webkit-mask-image: linear-gradient(to bottom');
  });
});
