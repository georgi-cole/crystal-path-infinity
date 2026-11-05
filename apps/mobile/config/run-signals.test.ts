import { describe, expect, it } from 'vitest';
import {
  createRun,
  createPracticeCursor,
  createTimedRunSession,
  getCurrentRow,
  PACED_RULESET_VERSION,
  PRACTICE_RNG,
} from '@crystal-path-infinity/game-core';
import { collectRunSignals, EMPTY_RUN_SIGNALS, liveSignal } from '../src/run-signals';

function fixture() {
  let now = 0;
  const state = createRun(
    {
      runId: 'practice-signals',
      rulesetVersion: PACED_RULESET_VERSION,
      observedAt: 0,
      routeRng: createPracticeCursor(3),
      mysteryRng: createPracticeCursor(7),
    },
    PRACTICE_RNG,
  );
  const session = createTimedRunSession({ ...state, sp: 200 }, PRACTICE_RNG, {
    monotonicNow: () => now,
    observedAt: 0,
  });
  session.releaseRecovery();
  return {
    session,
    at: (time: number) => {
      now = time;
    },
    cross: () =>
      session.bind({ type: 'choose', side: getCurrentRow(session.getState()).safeSide })(),
  };
}
describe('active-time presentation signals', () => {
  it('scans only the hinted row, freezes under pause and clears when the player crosses', () => {
    const f = fixture();
    f.at(1000);
    const result = f.session.bind({ type: 'hint' })();
    const signals = collectRunSignals(EMPTY_RUN_SIGNALS, result);
    expect(signals.hint).toMatchObject({
      row: '1',
      side: result.state.current.revealedSafeSide,
      activeAt: 1000,
    });
    expect(result.state.sp).toBe(200);
    const hold = f.session.hold('user');
    f.at(90000);
    expect(liveSignal(signals.hint, f.session.getState(), 1200)).toBe(signals.hint);
    hold.release();
    const crossed = collectRunSignals(signals, f.cross());
    expect(crossed.hint).toBeNull();
    expect(signals.hint?.row).toBe('1');
    f.session.dispose();
  });
  it('animates an already-settled survival reward and expires it on active time only', () => {
    const f = fixture();
    for (let at = 7000; at < 60000; at += 7000) {
      f.at(at);
      f.cross();
    }
    f.at(60000);
    const award = f.session.tick();
    const signals = collectRunSignals(EMPTY_RUN_SIGNALS, award);
    expect(signals.bonus).toMatchObject({ amount: 5, delta: 5, fromSp: 200, activeAt: 60000 });
    expect(award.state.sp).toBe(205);
    expect(liveSignal(signals.bonus, award.state, 2400)).toBe(signals.bonus);
    expect(collectRunSignals(signals, f.session.tick())).toBe(signals);
    f.at(62400);
    expect(liveSignal(signals.bonus, f.session.tick().state, 2400)).toBeNull();
    expect(f.session.getState().sp).toBe(205);
    f.session.dispose();
  });
});
