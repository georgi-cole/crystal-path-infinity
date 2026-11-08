import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as AppProfile from '../src/app-profile';
vi.mock('../src/app-profile', async (importOriginal) => ({
  ...(await importOriginal<typeof AppProfile>()),
  QA_TOOLS_ENABLED: false,
  SIMULATED_STORE_ENABLED: false,
}));
import { profilePracticeStorage } from '../src/app-profile';
import { StoreVault } from '../src/store-vault';
import { TestStoreProvider } from '../src/store-provider';
import { BalanceTuner } from '../src/balance-tuner';
import { MysteryJournal } from '../src/mystery-discovery';
import { RunReserves } from '../src/run-reserves';
import {
  BUSINESS_STORE_RULESET_VERSION,
  createRun,
  createPracticeCursor,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import { MainMenu } from '../src/main-menu';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';
import { PrivacyAccountSupport } from '../src/locale-settings';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../src/support-contact';
import {
  brandLaunchFrame,
  BRAND_LAUNCH_MS,
  BRAND_CODONS,
  complementCodon,
} from '../src/brand-launch-model';

describe('player presentation and QA isolation', () => {
  it('cannot create simulated purchases or expose QA tools in the player provider', () => {
    const html = renderToStaticMarkup(
      createElement(
        TestStoreProvider,
        null,
        createElement(StoreVault, { initialFilter: 'essentials' }),
      ),
    );
    expect(html).toContain('Purchases are unavailable right now');
    const worlds = renderToStaticMarkup(createElement(StoreVault));
    expect(worlds).toContain('class="is-primary">Explore</button>');
    for (const text of [
      'Test store',
      'Preview store',
      'Test purchase',
      'Approve test purchase',
      'Reset test store',
      'Simulate failure',
    ])
      expect(html).not.toContain(text);
    expect(renderToStaticMarkup(createElement(BalanceTuner))).toBe('');
    const journal = renderToStaticMarkup(createElement(MysteryJournal, { known: ['shield_5s'] }));
    expect(journal).toContain('Aegis');
    expect(journal).not.toContain('Try it');
    const run = createRun(
      {
        runId: 'practice-player-guard',
        rulesetVersion: BUSINESS_STORE_RULESET_VERSION,
        observedAt: 0,
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
      },
      PRACTICE_RNG,
    );
    const dead = transitionRun(
      run,
      { type: 'tick' },
      { rng: PRACTICE_RNG, activeTimeMs: 13_000, achievedAt: 13_000 },
    ).state;
    expect(dead.status).toBe('dead');
    expect(
      renderToStaticMarkup(
        createElement(RunReserves, {
          state: dead,
          busy: false,
          onUse: () => Promise.resolve(false),
          message: '',
        }),
      ),
    ).toBe('');
  });
  it('keeps player saves, records and discoveries separate without deleting QA data', () => {
    const map = new Map<string, string>(),
      storage = {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
        removeItem: (key: string) => {
          map.delete(key);
        },
      };
    const qa = profilePracticeStorage(storage, 'qa'),
      player = profilePracticeStorage(storage, 'player');
    qa.setItem('checkpoint', 'qa-run');
    expect(player.getItem('checkpoint')).toBeNull();
    player.setItem('checkpoint', 'player-run');
    expect(qa.getItem('checkpoint')).toBe('qa-run');
    player.removeItem('checkpoint');
    expect(qa.getItem('checkpoint')).toBe('qa-run');
  });
  it('keeps discoveries inside the guide and provides the owner-approved support contact', () => {
    const noop = () => {};
    const options = {
      saved: { status: 'empty' as const },
      best: null,
      online: false,
      settings: DEFAULT_PRACTICE_SETTINGS,
      onOpen: noop,
      onBack: noop,
      onResume: noop,
      onNew: noop,
      onSettingsChange: noop,
      onRetryConnection: noop,
      tutorialProgress: 'unseen' as const,
      onTutorialProgress: noop,
    };
    const render = (view: 'home' | 'tutorial' | 'settings') =>
      renderToStaticMarkup(createElement(MainMenu, { ...options, view }));
    expect(render('home')).not.toContain('Discoveries');
    expect(render('settings')).not.toContain('Discoveries');
    expect(render('tutorial')).toContain('Discoveries');
    const help = renderToStaticMarkup(createElement(PrivacyAccountSupport));
    expect(help).toContain(SUPPORT_EMAIL);
    expect(help).toContain(SUPPORT_MAILTO);
    expect(help).toContain('https://georgi-cole.github.io/crystal-path-infinity/privacy.html');
    expect(help).toContain('https://georgi-cole.github.io/crystal-path-infinity/support.html');
    expect(help).not.toContain('Submit ticket');
  });
});

describe('bounded Kolequant DNA to INFINITY title signature', () => {
  it('uses three seconds and converges the codons into a word before the home handoff', () => {
    expect(BRAND_LAUNCH_MS).toBe(3000);
    expect(brandLaunchFrame(0).phase).toBe('dna');
    const code = brandLaunchFrame(1000);
    expect(code.phase).toBe('codons');
    expect(code.codons.some((c) => c.opacity > 0)).toBe(true);
    expect(brandLaunchFrame(2200).titleOpacity).toBe(1);
    expect(brandLaunchFrame(2400).codons.every((c) => c.opacity === 0)).toBe(true);
    expect(brandLaunchFrame(3000)).toMatchObject({ phase: 'handoff', travel: 1, exit: 1 });
    for (const time of [-1, 0, 650, 1600, 2350, 3000, 4000])
      expect(
        brandLaunchFrame(time).codons.every(
          (c) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.opacity >= 0 && c.opacity <= 1,
        ),
      ).toBe(true);
    for (const codon of BRAND_CODONS) expect(complementCodon(complementCodon(codon))).toBe(codon);
  });
});
