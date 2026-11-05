import { en } from '../src/i18n/messages';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPracticeCursor, createRun, PRACTICE_RNG } from '@crystal-path-infinity/game-core';
import { ConfirmNewPractice, MainMenu } from '../src/main-menu';
import {
  canResumePractice,
  formatRowLabel,
  historyFlag,
  rankedServiceState,
  viewFromHash,
  viewHash,
} from '../src/menu-navigation';
import {
  DEFAULT_PRACTICE_SETTINGS,
  PRACTICE_SAVE_KEYS,
  readPracticePersonalBest,
} from '../src/practice-save';
import type { PracticeLoad, PracticeStorage } from '../src/practice-save';
import type { MenuView } from '../src/menu-navigation';

const noop = () => {};
const empty: PracticeLoad = { status: 'empty' };
const state = createRun(
  {
    runId: 'practice-menu-fixture',
    routeRng: createPracticeCursor(15),
    mysteryRng: createPracticeCursor(25),
    observedAt: 1000,
  },
  PRACTICE_RNG,
);
const saved: PracticeLoad = { status: 'ready', state, revision: 7 };
function render(view: MenuView = 'home', options: Partial<Parameters<typeof MainMenu>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MainMenu, {
      view,
      saved: empty,
      best: null,
      online: true,
      settings: DEFAULT_PRACTICE_SETTINGS,
      onOpen: noop,
      onBack: noop,
      onResume: noop,
      onNew: noop,
      onSettingsChange: noop,
      onRetryConnection: noop,
      tutorialProgress: 'unseen',
      onTutorialProgress: noop,
      ...options,
    }),
  );
}

describe('CPI-013 standalone menu and route model', () => {
  it('makes Play prominent and separates ranked, offline practice and the three destinations', () => {
    const html = render();
    expect(html).toContain('data-testid="app-ready"');
    expect(html).toContain('Main menu');
    expect(html).toContain('Play');
    expect(html).not.toContain('A journey beyond the ordinary');
    expect(html).not.toContain('Trust your instinct.');
    expect(html).toContain('Practice');
    expect(html).toContain('Rankings');
    expect(html).toContain('Profile');
    expect(html).toContain('aria-label="Open settings"');
    expect(html).toContain('Store');
    expect(html).toContain(en['menu.learn']);
    expect(html).toContain('Personal best · Practice only');
    expect(html).toContain('Not a ranked score');
    expect(html).toContain('Guest');
    expect(html).not.toMatch(/VIP unlock|Store powers|LOH|POS|Season immunity/);
  });

  it('permits offline practice without age or account gating', () => {
    const html = render('practice');
    expect(html).toContain('Practice requires no account');
    expect(html).toContain('age answer or analytics consent');
    expect(html).toContain(en['menu.newPractice']);
    expect(html).toContain(en['menu.learn']);
    expect(html).not.toContain('Resume · Row');
  });

  it('offers exact saved-row resume, never finished-run resume, and explicit replacement', () => {
    const html = render('home', { saved, best: '349' });
    expect(canResumePractice(saved)).toBe(true);
    expect(html).toContain(en['menu.savedPractice'].replace('{row}', '1'));
    expect(html).toContain('Resume');
    expect(html).toContain('New');
    expect(html).toContain('Row 349');
    const finished: PracticeLoad = {
      status: 'ready',
      state: { ...state, status: 'finished' },
      revision: 8,
    };
    expect(canResumePractice(finished)).toBe(false);
    expect(render('home', { saved: finished })).not.toContain('Saved crossing · Row');
  });

  it('does not invent ranked services or data when online/offline', () => {
    expect(rankedServiceState(false)).toBe('offline');
    expect(rankedServiceState(true)).toBe('unconfigured');
    expect(rankedServiceState(true, true, true)).toBe('maintenance');
    expect(rankedServiceState(true, true)).toBe('ready');
    expect(render('play', { online: false })).toContain('You are offline');
    expect(render('play', { online: true })).toContain('Online services not connected');
    expect(render('rankings', { online: false })).toContain('Recheck connection');
    expect(render('rankings', { online: true })).toContain('Rankings not connected yet');
    expect(render('rankings')).not.toMatch(/<table|#1\s+Winner|World #1/);
  });

  it('renders the guest profile and real settings controls', () => {
    expect(render('profile')).toContain('Playing as guest');
    expect(render('profile')).toContain('optional');
    const html = render('settings');
    expect(html).toContain('Music');
    expect(html).toContain('Sound effects');
    expect(html).toContain('Haptic feedback');
    expect(html).toContain('Reduce motion');
    expect(html).toContain(en['menu.openTutorial']);
    expect(html).toContain('type="checkbox"');
  });

  it('previews the requested store categories without fabricated prices or purchase controls', () => {
    const html = render('store');
    for (const key of [
      'store.sp',
      'store.hints',
      'store.noAds',
      'store.bridges',
      'store.backgrounds',
      'store.themes',
    ] as const)
      expect(html).toContain(en[key]);
    expect(html).toContain(en['store.unavailable']);
    expect(html).toContain('role="tablist"');
    expect(html).not.toMatch(/Buy now|Purchase now|\$\d|data-price|aria-valuenow/);
  });

  it('requires a modal to replace a saved run and has a distinct cancel action', () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmNewPractice, { saved, onCancel: noop, onConfirm: noop }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(en['menu.confirmReplace']);
    expect(html).toContain(en['menu.keepSaved']);
    expect(html).toContain(en['menu.startFresh']);
  });

  it('normalizes cold deep links and connects browser/Android Back to the game owner', () => {
    for (const view of [
      'home',
      'play',
      'practice',
      'tutorial',
      'rankings',
      'profile',
      'settings',
      'store',
    ] as const) {
      expect(viewFromHash(viewHash(view))).toBe(view);
    }
    expect(render('tutorial')).toContain(en['guide.footingTitle']);
    expect(viewFromHash('#practice-run')).toBe('practice');
    expect(viewFromHash('#new-practice')).toBe('practice');
    expect(viewFromHash('#unknown-route')).toBe('home');
    expect(viewFromHash('javascript:alert(1)')).toBe('home');
    expect(historyFlag(null, 'cpiNavigation')).toBe(false);
    expect(historyFlag({ cpiNavigation: true }, 'cpiNavigation')).toBe(true);
    expect(historyFlag({ cpiModal: 'true' }, 'cpiModal')).toBe(false);
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("window.addEventListener('popstate'");
    expect(app).toContain("window.addEventListener('hashchange'");
    expect(app).toContain("window.history.pushState({ cpiNavigation: true }, '', '#practice-run')");
    expect(app).toContain('exitRequest={exitRequest}');
    expect(app).toContain('onExitCancelled={cancelGameExit}');
  });

  it('never converts an unbounded local personal best into imprecise JS numbers', () => {
    expect(formatRowLabel('900719925474099312345678')).toBe('900,719,925,474,099,312,345,678');
    expect(formatRowLabel('0')).toBe('0');
    expect(formatRowLabel(null)).toBe('—');
    expect(formatRowLabel('-1')).toBe('—');
    const data = new Map<string, string>();
    const storage: PracticeStorage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
    expect(readPracticePersonalBest(storage)).toBe(null);
    storage.setItem(PRACTICE_SAVE_KEYS.personalBest, '900719925474099312345678');
    expect(readPracticePersonalBest(storage)).toBe('900719925474099312345678');
    storage.setItem(PRACTICE_SAVE_KEYS.personalBest, '1e20');
    expect(readPracticePersonalBest(storage)).toBe(null);
  });

  it('renders the original LED stage and functioning corner utilities', () => {
    const html = render('home');
    expect(html).toContain('cpi-home-scenery');
    expect(html).toContain('cpi-prism-bridge is-preview');
    expect(html).not.toContain('primary_large_normal.svg');
    expect(html).toContain('aria-label="Disable music"');
    expect(html).toContain('aria-label="Disable sound effects"');
    expect(html).toContain('aria-label="Open settings"');
    expect(html).not.toContain('cpi-menu-action-title">Settings<');
    expect((html.match(/cpi-menu-action-title">Store</g) ?? []).length).toBe(1);
    const css = readFileSync(new URL('../src/intro-hub-premium.css', import.meta.url), 'utf8');
    expect(css).toContain('cpi-stage-atmosphere');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('max-height: 690px');
  });

  it('provides safe areas, focus, touch sizing and reduced-motion rules', () => {
    const css = readFileSync(new URL('../src/main-menu.css', import.meta.url), 'utf8');
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('min-height: 2.75rem');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('focus-visible');
  });
});
