import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createPracticeCursor, createRun, PRACTICE_RNG } from '@crystal-path-infinity/game-core';
import { InfinitySceneView } from '../src/infinity-scene';
import { readFileSync } from 'node:fs';

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
      ...modifiers,
    }),
  );
}
describe('CPI-008 standalone scene', () => {
  it('renders accessible left/right/hint controls, no season/AI/prize content', () => {
    const html = markup();
    expect(html).toContain('aria-label="Choose left step"');
    expect(html).toContain('aria-label="Choose right step"');
    expect(html).toContain('aria-label="Use hint, 2 remaining"');
    expect(html).toContain('aria-label="Endless crystal bridge"');
    expect(html).not.toMatch(/VIP unlock|Season immunity|Live feed|AI standings|LOH|POS/);
    expect(html).toContain('Not a ranked score');
  });
  it('bounds its rows and disables input during a pause', () => {
    const html = markup({ paused: true });
    expect((html.match(/data-row=/g) || []).length).toBeLessThanOrEqual(5);
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Choose left step"/);
  });
  it('keeps native safe-area, short viewport and reduced-motion rules', () => {
    const css = readFileSync(new URL('../src/infinity-scene.css', import.meta.url), 'utf8');
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('max-height:650px');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).not.toContain("url('./infinity-black-hole-bg.png')");
  });
});
