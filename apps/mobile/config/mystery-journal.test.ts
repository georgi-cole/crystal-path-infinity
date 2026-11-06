import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createRun,
  createPracticeCursor,
  DISCOVERY_RULESET_VERSION,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import { createMysteryLabRun } from '../src/mystery-lab-model';
import { DiscoveryIntroduction } from '../src/mystery-introduction';
import { MysteryJournal } from '../src/mystery-discovery';
import {
  discoveriesFromRun,
  MYSTERY_JOURNAL_KEY,
  readMysteryJournal,
  rememberMysteries,
} from '../src/mystery-journal-model';
import { readPracticeCheckpoint, writePracticeCheckpoint } from '../src/practice-save';
import { MysteryLab } from '../src/mystery-lab';

function storage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}
const found = () => ({
  ...createMysteryLabRun('inversion_5s', 100, 91025, DISCOVERY_RULESET_VERSION).state,
  runId: 'practice-real-discovery',
});

describe('personal mystery discoveries', () => {
  it('keeps real discoveries across runs and seeds a new run without a repeat introduction', () => {
    const local = storage();
    const state = found();
    rememberMysteries(local, state);
    expect(readMysteryJournal(local)).toEqual(['inversion_5s']);
    rememberMysteries(local, state);
    expect(local.entries.get(MYSTERY_JOURNAL_KEY)).toBe(
      JSON.stringify({ version: 1, kinds: ['inversion_5s'] }),
    );
    const next = createRun(
      {
        runId: 'practice-next',
        rulesetVersion: DISCOVERY_RULESET_VERSION,
        discoveredMysteries: readMysteryJournal(local),
        routeRng: createPracticeCursor(33),
        mysteryRng: createPracticeCursor(99),
        observedAt: 0,
      },
      PRACTICE_RNG,
    );
    expect(next.discovery!.known).toEqual(['inversion_5s']);
    expect(next.discovery!.introduction).toBeNull();
  });

  it('cannot unlock anything from the test chamber or tutorial, and never infers rewards from future boxes', () => {
    const local = storage();
    const demo = createMysteryLabRun('half_life', 100, 91025, DISCOVERY_RULESET_VERSION).state;
    expect(rememberMysteries(local, demo)).toEqual([]);
    expect(discoveriesFromRun({ ...demo, runId: 'practice-tutorial-demo' })).toEqual([]);
    const unopened = createRun(
      {
        runId: 'practice-unopened',
        rulesetVersion: DISCOVERY_RULESET_VERSION,
        routeRng: createPracticeCursor(1),
        mysteryRng: createPracticeCursor(2),
        observedAt: 0,
      },
      PRACTICE_RNG,
    );
    expect(rememberMysteries(local, unopened)).toEqual([]);
    expect(local.entries.size).toBe(0);
  });

  it('restores only the remaining reading window, independently of journal storage', () => {
    const local = storage(),
      state = found();
    const waiting = transitionRun(
      state,
      { type: 'tick' },
      { activeTimeMs: 2500, achievedAt: 2500, rng: PRACTICE_RNG },
    ).state;
    writePracticeCheckpoint(local, waiting);
    const loaded = readPracticeCheckpoint(local);
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;
    expect(loaded.state.discovery!.introduction!.expiresAt - loaded.state.activeTimeMs).toBe(1500);
    const continued = transitionRun(
      loaded.state,
      { type: 'tick' },
      { activeTimeMs: 4000, achievedAt: 4000, rng: PRACTICE_RNG },
    ).state;
    expect(continued.effects[0].expiresAt! - continued.activeTimeMs).toBe(5000);
    expect(continued.discovery!.introduction).toBeNull();
  });

  it('shows a short, non-modal introduction with a four-second countdown', () => {
    const state = found();
    const html = renderToStaticMarkup(
      createElement(DiscoveryIntroduction, {
        discovery: state.discovery,
        activeTimeMs: 0,
        rulesetVersion: DISCOVERY_RULESET_VERSION,
      }),
    );
    expect(html).toContain('every broken tile gives +5 SP');
    expect(html).toContain('Step when you are ready');
    expect(html).toContain('4s');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('<button');
  });

  it('renders only discovered mysteries, with no silhouettes, locked count or hidden future names', () => {
    const empty = renderToStaticMarkup(createElement(MysteryJournal, { known: [] }));
    expect(empty).toContain('Your first discovery');
    expect(empty).not.toContain('Half Life');
    const html = renderToStaticMarkup(createElement(MysteryJournal, { known: ['inversion_5s'] }));
    expect(html).toContain('Twisted fate');
    expect(html).toContain('Try Twisted fate');
    expect(html).not.toContain('Half Life');
    expect(html).not.toContain('Marketing');
  });

  it('retains the full test chamber but restricts a journal demonstration to discovered kinds', () => {
    const full = renderToStaticMarkup(
      createElement(MysteryLab, { onClose: () => {}, reducedMotion: true }),
    );
    expect(full).toContain('Half Life');
    expect(full).toContain('Marketing');
    const restricted = renderToStaticMarkup(
      createElement(MysteryLab, {
        onClose: () => {},
        reducedMotion: true,
        initialKind: 'inversion_5s',
        availableKinds: ['inversion_5s'],
      }),
    );
    expect(restricted).toContain('Twisted fate');
    expect(restricted).not.toContain('Half Life');
    expect(restricted).not.toContain('Marketing');
  });

  it('treats unavailable or malformed optional storage as an empty journal', () => {
    expect(
      readMysteryJournal({
        getItem: () => {
          throw new Error('storage blocked');
        },
      }),
    ).toEqual([]);
    const local = storage();
    for (const value of [
      '{',
      JSON.stringify({ version: 2, kinds: ['half_life'] }),
      'x'.repeat(5000),
    ]) {
      local.entries.set(MYSTERY_JOURNAL_KEY, value);
      expect(readMysteryJournal(local)).toEqual([]);
    }
    local.entries.set(
      MYSTERY_JOURNAL_KEY,
      JSON.stringify({ version: 1, kinds: ['inversion_5s', 'unknown', 'inversion_5s'] }),
    );
    expect(readMysteryJournal(local)).toEqual(['inversion_5s']);
  });
});
