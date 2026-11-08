import { en } from '../src/i18n/messages';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPracticeCursor,
  createRun,
  createTimedRunSession,
  getCurrentRow,
  getReviveSp,
  PRACTICE_RNG,
  PACED_RULESET_VERSION,
  transitionRun,
} from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import { InfinitySceneView } from '../src/infinity-scene';
import { formatActiveDuration, presentRunOutcome } from '../src/run-outcome';
import { DEFAULT_PRACTICE_SETTINGS } from '../src/practice-save';

const noop = () => {};
function initial(rulesetVersion?: string) {
  return createRun(
    {
      runId: 'practice-run-ui',
      rulesetVersion,
      routeRng: createPracticeCursor(100),
      mysteryRng: createPracticeCursor(200),
      observedAt: 1000,
    },
    PRACTICE_RNG,
  );
}
const time = { rng: PRACTICE_RNG, activeTimeMs: 0, achievedAt: 1000 };

function died(cause: 'wrong_tile' | 'mystery' | 'drain' = 'wrong_tile'): RunState {
  const starter = initial();
  const wrong = getCurrentRow(starter).safeSide === 'left' ? 'right' : 'left';
  const dead = transitionRun(
    { ...starter, sp: 10 },
    {
      type: 'choose',
      row: '1',
      life: 0,
      side: wrong,
    },
    time,
  ).state;
  expect(dead.status).toBe('dead');
  if (cause === 'wrong_tile') return dead;
  return {
    ...dead,
    death: dead.death === null ? null : { ...dead.death, cause },
  };
}
function markup(
  state: RunState = initial(),
  props: Partial<Parameters<typeof InfinitySceneView>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(InfinitySceneView, {
      state,
      feedback: null,
      ready: true,
      busy: false,
      paused: false,
      error: null,
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
      ...props,
    }),
  );
}

describe('CPI-015 HUD and result state contract', () => {
  it('gives idle death its own copy and holds its card behind the bridge collapse', () => {
    const dead = transitionRun(
      initial(PACED_RULESET_VERSION),
      { type: 'tick' },
      {
        rng: PRACTICE_RNG,
        activeTimeMs: 8_000,
        achievedAt: 9_000,
      },
    ).state;
    expect(dead.death?.cause).toBe('idle');
    expect(presentRunOutcome(dead).deathReason).toBe(en['game.deathIdle']);
    const collapse = markup(dead, {
      paused: true,
      cinematic: {
        id: 1,
        phase: 'collapse',
        rows: null,
        feedback: null,
        mystery: null,
        fatal: true,
      },
    });
    expect(collapse).toContain('is-collapsing');
    expect(collapse).not.toContain('role="dialog"');
    const result = markup(dead);
    expect(result).toContain(en['game.deathIdle']);
    expect(result).toContain('role="dialog"');
    expect(result).not.toContain('Save and leave');
  });
  it('keeps confirmed grants, applied revives and quota separate in pause details', () => {
    const live = presentRunOutcome(initial());
    expect(live.appliedContinues).toBe(0);
    expect(live.grantedContinues).toBe(0);
    expect(live.grantsRemaining).toBe(10);
    expect(live.offer).toBe(null);
    expect(live.canEnd).toBe(true);
    const html = markup(initial(), { paused: true });
    expect(html).toContain(en['game.cleared']);
    expect(html).toContain('Continues used');
    expect(html).toContain('Grants earned');
    expect(html).toContain('Grant quota left');
    expect(html).toContain('End run');
    expect(html).toContain('aria-label="Survival points"');
    expect(html).not.toContain(en['game.complete']);
    expect(html).not.toContain('Victory');
  });

  it('keeps a survived wrong row credited but fatal wrong row uncredited', () => {
    const dead = died();
    const view = presentRunOutcome(dead);
    expect(view.phase).toBe('dead');
    expect(view.clearedRows).toBe('0');
    expect(view.currentRow).toBe('1');
    expect(view.fatalRow).toBe('1');
    expect(view.deathReason).toBe(en['game.deathWrong']);
    const html = markup(dead);
    expect(html).toContain(en['game.deathTitle']);
    expect(html).toContain(en['game.fatalNotCounted'].replace('{row}', '1'));
    expect(html).toContain(en['game.bargainTitle'].replace('{sp}', '200'));
    expect(html).toContain(en['game.bargainBody']);
    expect(html).toContain(en['game.bargainSleeping']);
    expect(html).not.toContain('reward grants remain');
    expect(html).not.toContain('it does not add points');
    expect(html).not.toContain(en['game.complete']);
    expect(html).not.toContain('Rankings (not live)');
    expect(html).toMatch(/aria-label="Row 1 left tile"[^>]*disabled=""/);
  });

  it('uses the same terminal death UI for mystery and drain causes', () => {
    for (const cause of ['mystery', 'drain'] as const) {
      const state = died(cause);
      expect(presentRunOutcome(state).deathReason).toBe(
        en[cause === 'mystery' ? 'game.deathMystery' : 'game.deathDrain'],
      );
      expect(markup(state)).toContain(en['game.deathTitle']);
    }
  });

  it('keeps the exact 200/150 SP offer schedule and grants quota apart from uses', () => {
    const dead = died();
    const phase5 = { ...dead, revivesGranted: 4, revivesApplied: 4 };
    const fifth = presentRunOutcome(phase5);
    expect(fifth.offer).toEqual({ ordinal: 5, restoreSp: 200, grantsRemaining: 6 });
    // A no-fill or ad error has no accepted grant, so the state and offer stay.
    expect(presentRunOutcome(phase5).offer).toEqual(fifth.offer);
    const sixth = presentRunOutcome({ ...dead, revivesGranted: 5, revivesApplied: 5 });
    expect(sixth.offer).toEqual({ ordinal: 6, restoreSp: 150, grantsRemaining: 5 });
    expect(getReviveSp(10)).toBe(150);
    const tenth = presentRunOutcome({ ...dead, revivesGranted: 9, revivesApplied: 9 });
    expect(tenth.offer).toEqual({ ordinal: 10, restoreSp: 150, grantsRemaining: 1 });
    const exhausted = presentRunOutcome({ ...dead, revivesGranted: 10, revivesApplied: 10 });
    expect(exhausted.offer).toBe(null);
    expect(exhausted.grantsRemaining).toBe(0);
  });

  it('never calls a pending reward a final result or offers a second ad', () => {
    const dead = died();
    const pending: RunState = {
      ...dead,
      pendingReward: { deathId: dead.death!.id, ordinal: 1, intentId: 'pending-intent' },
    };
    const view = presentRunOutcome(pending);
    expect(view.phase).toBe('verification-pending');
    expect(view.offer).toBe(null);
    expect(view.canEnd).toBe(false);
    expect(view.canViewRankings).toBe(false);
    const html = markup(pending);
    expect(html).toContain(en['game.pendingTitle']);
    expect(html).toContain('Save and leave · Pending');
    expect(html).not.toContain(en['game.confirmEnd']);
    expect(html).not.toContain(en['game.nextRun']);
    expect(html).not.toContain(en['game.complete']);
  });

  it('treats a granted-but-unapplied continue as earned, not available for another ad', () => {
    const dead = died();
    const grant = transitionRun(
      dead,
      {
        type: 'grant-revive',
        deathId: dead.death!.id,
        ordinal: 1,
        grantId: 'earned-1',
      },
      time,
    );
    expect(grant.accepted).toBe(true);
    const view = presentRunOutcome(grant.state);
    expect(view.phase).toBe('grant-ready');
    expect(view.appliedContinues).toBe(0);
    expect(view.grantedContinues).toBe(1);
    expect(view.grantsRemaining).toBe(9);
    expect(view.offer).toBe(null);
    expect(view.forfeitsGrant).toBe(true);
    expect(markup(grant.state, { confirmEnd: true })).toContain('End and forfeit grant');
  });

  it('allows explicit End run while alive and frozen under a user pause lease', () => {
    let clock = 1000;
    const session = createTimedRunSession(initial(), PRACTICE_RNG, {
      monotonicNow: () => clock,
      observationNow: () => clock,
    });
    session.releaseRecovery();
    clock += 1000;
    const hold = session.hold('user');
    expect(hold.result.state.activeTimeMs).toBe(1000);
    clock += 60_000;
    const end = session.bind({ type: 'end', forfeitGrantedReward: true })();
    expect(end.accepted).toBe(true);
    expect(end.state.status).toBe('finished');
    expect(end.state.result?.endReason).toBe('user-ended');
    expect(end.state.result?.activeTimeMs).toBe(1000);
    expect(end.state.result?.fatalRow).toBe(null);
    expect(session.bind({ type: 'end' })().accepted).toBe(false);
    expect(session.getState().result).toEqual(end.state.result);
    hold.release();
    session.dispose();
  });

  it('presents a terminal local-only result, record and both next destinations', () => {
    const end = transitionRun(initial(), { type: 'end' }, time);
    expect(end.accepted).toBe(true);
    const view = presentRunOutcome(end.state);
    expect(view.phase).toBe('finished');
    expect(view.canEnd).toBe(false);
    expect(view.canViewRankings).toBe(true);
    expect(view.localResult).toBe(true);
    const html = markup(end.state, { personalBest: '348', newPersonalBest: true });
    expect(html).toContain('OFFLINE PRACTICE · NOT VERIFIED');
    expect(html).toContain(en['game.rowsCleared']);
    expect(html).toContain(en['game.bestNew']);
    expect(html).toContain('348');
    expect(html).toContain(en['game.nextRun']);
    expect(html).toContain('Rankings (not live)');
    expect(html).toContain('Return to menu');
    expect(html).not.toContain('Victory');
  });

  it('preserves unbounded row precision and does not finish at Row 350', () => {
    let state = initial();
    for (let row = 1; row <= 350; row += 1) {
      const result = transitionRun(
        state,
        {
          type: 'choose',
          row: state.currentRow,
          life: state.revivesApplied,
          side: getCurrentRow(state).safeSide,
        },
        time,
      );
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state.status).toBe('playing');
    expect(state.lastClearedRow).toBe('350');
    expect(state.currentRow).toBe('351');
    expect(presentRunOutcome(state).clearedRows).toBe('350');
    expect(presentRunOutcome(state).phase).toBe('playing');
    const huge = {
      ...state,
      lastClearedRow: '900719925474099312345678',
      currentRow: '900719925474099312345679',
    };
    expect(presentRunOutcome(huge).clearedRows).toBe('900,719,925,474,099,312,345,678');
  });

  it('does not end on pause/close and makes the two actions explicit in UI', () => {
    let clock = 1000;
    const session = createTimedRunSession(initial(), PRACTICE_RNG, {
      monotonicNow: () => clock,
      observationNow: () => clock,
    });
    session.releaseRecovery();
    clock += 500;
    session.hold('user');
    const snapshot = session.dispose();
    expect(snapshot.status).toBe('playing');
    expect(snapshot.result).toBe(null);
    const paused = markup(initial(), { paused: true });
    expect(paused).toContain(en['game.pausedExplanation']);
    expect(paused).toContain('Save and leave');
    expect(paused).toContain('End run');
    expect(paused).toContain('inert=""');
    const confirm = markup(initial(), { paused: true, confirmEnd: true });
    expect(confirm).toContain(en['game.confirmTitle']);
    expect(confirm).toContain(en['game.confirmEnd']);
    expect(confirm).toContain(en['game.keepAttempt']);
    const css = readFileSync(new URL('../src/run-outcome.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.cpi-run-outcome \.cpi-overlay-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(
      /\.cpi-run-outcome :is\(\.cpi-result-actions, \.cpi-result-navigation\)\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });

  it('puts Resume first and adds the Test tools row only for the QA actions', () => {
    const player = markup(initial(), { paused: true, onMysteryJournal: () => {} });
    expect(player.indexOf(en['general.resume'] + '</button>')).toBeLessThan(
      player.indexOf(en['guide.journalTab'] + '</span>'),
    );
    expect(player).toContain(en['game.backToPause']);
    expect(player).not.toContain(en['game.pauseTestTools']);
    expect(player).not.toContain('Mystery chamber');
    const qa = markup(initial(), { paused: true, onMysteryLab: () => {} });
    expect(qa).toContain(en['game.pauseTestTools']);
    expect(qa).toMatch(/class="cpi-pause-test-tools" hidden=""><button[^>]*>.*Mystery chamber/);
  });

  it('keeps signed native gates and app navigation unchanged', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("onViewRankings={() => closePractice('rankings')}");
    const scene = readFileSync(new URL('../src/infinity-scene.tsx', import.meta.url), 'utf8');
    expect(scene).toContain("paused && command.type !== 'end'");
    expect(scene).toContain("runtime.hold('recovery')");
    expect(scene).toContain('restartLock.current');
    const css = readFileSync(new URL('../src/run-outcome.css', import.meta.url), 'utf8');
    expect(css).toContain('max-height: calc(100dvh -');
    expect(css).toContain('prefers-reduced-motion');
    const controls = readFileSync(new URL('../src/main-menu.css', import.meta.url), 'utf8');
    expect(controls).toContain('min-height: 3rem');
  });

  it('renders active time without wall-clock background inflation', () => {
    expect(formatActiveDuration(999)).toBe('00:00');
    expect(formatActiveDuration(61_000)).toBe('01:01');
    expect(formatActiveDuration(3_661_000)).toBe('01:01:01');
  });
});
