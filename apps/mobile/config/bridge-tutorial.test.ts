import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTutorialAction, createTutorialSession } from '../src/bridge-tutorial-model';
import { BridgeTutorial } from '../src/bridge-tutorial';
import {
  readTutorialProgress,
  TUTORIAL_PROGRESS_KEY,
  writeTutorialProgress,
} from '../src/tutorial-progress';
import type { PracticeStorage } from '../src/practice-save';
import { MainMenu } from '../src/main-menu';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';

const noop = () => {};
function tutorialMarkup() {
  return renderToStaticMarkup(
    createElement(BridgeTutorial, {
      onComplete: noop,
      onSkip: noop,
      onStartPractice: noop,
    }),
  );
}

describe('CPI-014 scripted, isolated tutorial', () => {
  it('demonstrates a safe step and a surviving wrong step using the production reducer', () => {
    const first = createTutorialSession();
    expect(first.run.sp).toBe(300);
    expect(first.run.hints).toBe(2);
    expect(first.run.lastClearedRow).toBe('0');

    const safe = applyTutorialAction(first, 'choose-safe');
    expect(safe.step).toBe('wrong');
    expect(safe.run.sp).toBe(300);
    expect(safe.run.lastClearedRow).toBe('1');

    const wrong = applyTutorialAction(safe, 'choose-wrong');
    expect(wrong.step).toBe('hint');
    expect(wrong.run.sp).toBe(295);
    // A nonfatal wrong choice is still a completed row.
    expect(wrong.run.lastClearedRow).toBe('2');
    expect(wrong.run.currentRow).toBe('3');
    expect(wrong.run.status).toBe('playing');
    expect(applyTutorialAction(wrong, 'choose-wrong')).toBe(wrong);
  });

  it('consumes a hint and leaves SP untouched before the hinted safe crossing', () => {
    const second = applyTutorialAction(
      applyTutorialAction(createTutorialSession(), 'choose-safe'),
      'choose-wrong',
    );
    const revealed = applyTutorialAction(second, 'use-hint');
    expect(revealed.step).toBe('hint-revealed');
    expect(revealed.run.hints).toBe(1);
    expect(revealed.run.sp).toBe(295);
    expect(revealed.run.current.revealedSafeSide).toBe('left');
    expect(revealed.run.lastClearedRow).toBe('2');
    const crossed = applyTutorialAction(revealed, 'choose-hinted');
    expect(crossed.run.lastClearedRow).toBe('3');
    expect(crossed.step).toBe('mystery');
  });

  it('makes mystery voluntary and preserves final credited progress', () => {
    const afterHint = applyTutorialAction(
      applyTutorialAction(
        applyTutorialAction(
          applyTutorialAction(createTutorialSession(), 'choose-safe'),
          'choose-wrong',
        ),
        'use-hint',
      ),
      'choose-hinted',
    );
    const skipped = applyTutorialAction(afterHint, 'skip-mystery');
    const tried = applyTutorialAction(afterHint, 'try-mystery');
    expect(skipped.step).toBe('end');
    expect(skipped.mysteryChoice).toBe('skipped');
    expect(skipped.run.sp).toBe(afterHint.run.sp);
    expect(skipped.run.hints).toBe(afterHint.run.hints);
    expect(tried.step).toBe('end');
    expect(tried.mysteryChoice).toBe('tried');
    expect(tried.run.current.mysteryOutcome).not.toBe(null);
    expect(tried.run.lastClearedRow).toBe('3');

    const ended = applyTutorialAction(skipped, 'end-run');
    expect(ended.step).toBe('complete');
    expect(ended.run.status).toBe('finished');
    expect(ended.run.result?.endReason).toBe('user-ended');
    expect(ended.run.result?.lastClearedRow).toBe('3');
    expect(ended.run.result?.fatalRow).toBe(null);
  });

  it('proves a fatal row is not credited and supports explicitly ending the dead run', () => {
    const actions = [
      'choose-safe',
      'choose-wrong',
      'use-hint',
      'choose-hinted',
      'skip-mystery',
      'show-fatal',
      'end-run',
    ] as const;
    const states = actions.reduce(
      (session, action) => applyTutorialAction(session, action),
      createTutorialSession(),
    );
    expect(states.step).toBe('complete');
    expect(states.run.result?.endReason).toBe('death-declined');
    expect(states.run.result?.fatalRow).toBe('4');
    expect(states.run.result?.lastClearedRow).toBe('3');
    expect(states.run.result?.sp).toBe(0);
    expect(applyTutorialAction(states, 'end-run')).toBe(states);
  });

  it('remembers completion separately, without modifying the practice save key', () => {
    const entries = new Map<string, string>();
    const storage: PracticeStorage = {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
      removeItem: (key) => {
        entries.delete(key);
      },
    };
    expect(readTutorialProgress(storage)).toBe('unseen');
    writeTutorialProgress(storage, 'skipped');
    expect(readTutorialProgress(storage)).toBe('skipped');
    writeTutorialProgress(storage, 'completed');
    expect(readTutorialProgress(storage)).toBe('completed');
    expect([...entries.keys()]).toEqual([TUTORIAL_PROGRESS_KEY]);
    expect(readTutorialProgress({ getItem: () => 'invalid' })).toBe('unseen');
  });

  it('offers accessible direct buttons, no covered tap targets or real-run dependencies', () => {
    const html = tutorialMarkup();
    expect(html).toContain('data-tutorial-heading');
    expect(html).toContain('Training bridge');
    expect(html).toContain('Tap LEFT');
    expect(html).toContain('Left glass');
    expect(html).toContain('Right glass');
    expect(html).toContain('Survived wrong steps count');
    expect(html).toContain('Skip tutorial');
    expect(html).toContain('aria-live="polite"');
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

  it('adds entry and replay from the real home, Practice and Settings menus', () => {
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
    const home = renderToStaticMarkup(createElement(MainMenu, { ...options, view: 'home' }));
    const practice = renderToStaticMarkup(
      createElement(MainMenu, { ...options, view: 'practice' }),
    );
    const settings = renderToStaticMarkup(
      createElement(MainMenu, {
        ...options,
        view: 'settings',
        tutorialProgress: 'completed',
      }),
    );
    expect(home).toContain('Learn the bridge');
    expect(practice).toContain('Learn the bridge');
    expect(settings).toContain('Replay tutorial');
  });
});
