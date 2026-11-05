import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getRowBandDamage,
  presentRowPressure,
  assertRunState,
  PRACTICE_RNG,
} from '@crystal-path-infinity/game-core';
import { applyTutorialAction, createTutorialSession } from '../src/bridge-tutorial-model';
import type { TutorialAction, TutorialSession } from '../src/bridge-tutorial-model';
import { BridgeTutorial } from '../src/bridge-tutorial';
import { GUIDE_PACING, GUIDE_RULES } from '../src/crystal-guide-contract';
import {
  readTutorialProgress,
  TUTORIAL_PROGRESS_KEY,
  writeTutorialProgress,
} from '../src/tutorial-progress';
import { MainMenu } from '../src/main-menu';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';
import { en } from '../src/i18n/messages';

const noop = () => {};
const actions: readonly TutorialAction[] = [
  'choose-safe',
  'choose-wrong',
  'use-hint',
  'choose-hinted',
  'escape-pressure',
];
function through(count: number): TutorialSession {
  return actions.slice(0, count).reduce(applyTutorialAction, createTutorialSession());
}
describe('CPI-014 crystal rehearsal', () => {
  it('teaches a safe choice and survived fracture using live practice resources and damage', () => {
    const first = createTutorialSession();
    expect(first.run.rulesetVersion).toBe(GUIDE_RULES.version);
    expect(first.run.sp).toBe(GUIDE_RULES.startingSp);
    expect(first.run.hints).toBe(GUIDE_RULES.startingHints);
    const safe = through(1);
    expect(safe.step).toBe('wrong');
    expect(safe.run.lastClearedRow).toBe('1');
    expect(safe.run.sp).toBe(first.run.sp);
    const wrong = through(2);
    expect(wrong.step).toBe('hint');
    expect(wrong.run.lastClearedRow).toBe('2');
    expect(wrong.run.sp).toBe(first.run.sp - getRowBandDamage(safe.run.currentRow));
    expect(wrong.lastTransition?.events).toContainEqual(
      expect.objectContaining({ type: 'choice-resolved', wrong: true }),
    );
  });
  it('reveals only the unresolved crystal and retains SP while consuming a hint', () => {
    const before = through(2),
      hinted = through(3);
    expect(hinted.step).toBe('hint-revealed');
    expect(hinted.run.hints).toBe(before.run.hints - 1);
    expect(hinted.run.sp).toBe(before.run.sp);
    expect(hinted.run.current.revealedSafeSide).toBe('left');
    expect(hinted.run.lastClearedRow).toBe(before.run.lastClearedRow);
    expect(applyTutorialAction(hinted, 'use-hint')).toBe(hinted);
  });
  it('demonstrates the current Death Clock policy without putting reading time on a real clock', () => {
    const pursued = through(4);
    expect(pursued.step).toBe('pressure');
    expect(pursued.run.activeTimeMs).toBe(GUIDE_PACING.grace);
    expect(presentRowPressure(pursued.run)).toMatchObject({
      active: true,
      remainingMs: GUIDE_PACING.countdown,
    });
    const escaped = through(5);
    expect(escaped.step).toBe('mystery');
    expect(escaped.run.status).toBe('playing');
    expect(presentRowPressure(escaped.run)?.active).toBe(false);
    expect(escaped.run.lastClearedRow).toBe('4');
    assertRunState(escaped.run, PRACTICE_RNG);
  });
  it('makes curiosity optional and resolves the actual core mystery without publishing a result', () => {
    const before = through(5),
      opened = applyTutorialAction(before, 'try-mystery');
    expect(opened.step).toBe('mystery-opened');
    expect(opened.run.current.mysteryOutcome).not.toBeNull();
    expect(opened.run.lastClearedRow).toBe(before.run.lastClearedRow);
    expect(opened.lastTransition?.events.some((event) => event.type === 'mystery-resolved')).toBe(
      true,
    );
    const done = applyTutorialAction(opened, 'end-run');
    expect(done.step).toBe('complete');
    expect(done.run.result?.lastClearedRow).toBe(before.run.lastClearedRow);
    const skipped = applyTutorialAction(before, 'skip-mystery');
    expect(skipped.step).toBe('complete');
    expect(skipped.mysteryChoice).toBe('skipped');
    expect(skipped.run.sp).toBe(before.run.sp);
    expect(skipped.run.current.mysteryOutcome).toBeNull();
    expect(applyTutorialAction(done, 'end-run')).toBe(done);
  });
  it('rejects stale and out-of-order lesson input without any new core transition', () => {
    for (const action of ['use-hint', 'escape-pressure', 'try-mystery', 'end-run'] as const) {
      const initial = createTutorialSession();
      expect(applyTutorialAction(initial, action)).toBe(initial);
    }
  });
  it('remembers completion in its separate key', () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    expect(readTutorialProgress(storage)).toBe('unseen');
    writeTutorialProgress(storage, 'skipped');
    expect(readTutorialProgress(storage)).toBe('skipped');
    writeTutorialProgress(storage, 'completed');
    expect(readTutorialProgress(storage)).toBe('completed');
    expect([...entries.keys()]).toEqual([TUTORIAL_PROGRESS_KEY]);
  });
  it('renders the real crystal bridge, one short lesson and accessible progress rather than flat mock tiles', () => {
    const html = renderToStaticMarkup(
      createElement(BridgeTutorial, { onComplete: noop, onSkip: noop, onStartPractice: noop }),
    );
    expect(html).toContain('data-tutorial-heading');
    expect(html).toContain('cpi-prism-bridge');
    expect(html).toContain(en['guide.footingBody']);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain(en['guide.skip']);
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toMatch(
      /Left glass|Right glass|>Locked<|>\?<|cpi-tutorial-pane|no finish line|grant quota/i,
    );
    const model = readFileSync(new URL('../src/bridge-tutorial-model.ts', import.meta.url), 'utf8');
    expect(model).toContain('transitionRun');
    expect(model).not.toMatch(
      /writePracticeCheckpoint|recordPracticePersonalBest|createPracticeRuntime|rewardedAd/,
    );
    const css = readFileSync(new URL('../src/bridge-tutorial.css', import.meta.url), 'utf8');
    expect(css).toContain('focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('min-height: 2.75rem');
  });
  it('connects the renamed entry from Home, Practice and Settings', () => {
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
    expect(renderToStaticMarkup(createElement(MainMenu, { ...options, view: 'home' }))).toContain(
      en['menu.learn'],
    );
    expect(
      renderToStaticMarkup(createElement(MainMenu, { ...options, view: 'practice' })),
    ).toContain(en['menu.learn']);
    expect(
      renderToStaticMarkup(
        createElement(MainMenu, { ...options, view: 'settings', tutorialProgress: 'completed' }),
      ),
    ).toContain(en['menu.replay']);
  });
});
