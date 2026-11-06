import { describe, expect, it } from 'vitest';
import type { PresentedRow } from '../src/infinity-presentation';
import type { SceneCinematic } from '../src/scene-cinematics';
import { STEP_TIMING } from '../src/scene-cinematics';
import {
  companionFooting,
  companionLanding,
  companionScale,
  companionStandingSide,
  planCompanionMotion,
} from '../src/world-companion';

const row: PresentedRow = {
  index: '900719925474099312345678',
  label: '900719925474099312345679',
  distance: -1,
  phase: 'past',
  tone: 0,
  hasMystery: false,
  mysteryAvailable: false,
  hint: null,
  chosen: 'left',
  wrong: true,
};
const wrong: SceneCinematic = {
  id: 3,
  phase: 'impact',
  rows: null,
  feedback: { row: row.index, side: 'left', kind: 'wrong' },
  mystery: null,
  fatal: false,
};

describe('companions follow only the resolved crystal path', () => {
  it('jumps off broken glass to the other pane within the existing impact beat', () => {
    const motion = planCompanionMotion(240, 'left', wrong);
    expect(motion.action).toBe('escape');
    expect(motion.side).toBe('right');
    expect(motion.end).toEqual(companionLanding('right'));
    expect(motion.path).toContain(`${companionLanding('left').x - motion.anchor.x}`);
    expect(motion.duration * 1000).toBeLessThan(STEP_TIMING.wrong - STEP_TIMING.contact);
  });

  it('keeps the rescued companion on that intact pane during travel and after resume', () => {
    const standing = companionStandingSide([row]);
    expect(standing).toBe('right');
    const travel = planCompanionMotion(240, standing, { ...wrong, phase: 'travel' });
    expect(travel.anchor).toEqual(companionLanding('right'));
    expect(travel.end).toEqual(companionFooting('right'));
    expect(travel.duration * 1000).toBe(STEP_TIMING.travel);
    const resumed = planCompanionMotion(
      240,
      companionStandingSide(JSON.parse(JSON.stringify([row])) as PresentedRow[]),
    );
    expect(resumed.visible).toBe(true);
    expect(resumed.anchor).toEqual(travel.end);
    expect(resumed.path).toBeNull();
  });

  it('lands on a successful choice and stays there between steps', () => {
    const beat: SceneCinematic = { ...wrong, feedback: { ...wrong.feedback!, kind: 'safe' } };
    const motion = planCompanionMotion(300, 'right', beat);
    expect(motion.action).toBe('hop');
    expect(motion.end).toEqual(companionLanding('left'));
    expect(motion.duration * 1000).toBeLessThan(STEP_TIMING.safe - STEP_TIMING.contact);
    expect(companionStandingSide([{ ...row, wrong: false }])).toBe('left');
  });

  it('does not anticipate a result during contact or consult unresolved rows', () => {
    expect(planCompanionMotion(300, 'right', { ...wrong, phase: 'contact' }).end).toEqual(
      companionFooting('right'),
    );
    expect(
      companionStandingSide([
        { ...row, phase: 'future' },
        { ...row, phase: 'current' },
      ]),
    ).toBe('left');
    expect(companionStandingSide([])).toBe('left');
    expect(planCompanionMotion(300, 'left').end).toEqual(companionFooting('left'));
  });

  it('deploys free safety equipment at zero SP, lifts away and then leaves the ended path', () => {
    const fatal = planCompanionMotion(0, 'left', { ...wrong, phase: 'collapse', fatal: true });
    expect(fatal.action).toBe('rescue');
    expect(fatal.side).toBe('left');
    expect(fatal.end.y).toBeLessThan(companionLanding('left').y);
    expect(fatal.path).not.toContain('1080');
    expect(fatal.duration * 1000).toBeLessThan(STEP_TIMING.death - STEP_TIMING.contact);
    expect(planCompanionMotion(0, 'left').visible).toBe(false);
  });

  it('also rescues when a mystery or the clock exhausts SP without a glass choice', () => {
    for (const mystery of [null, { kind: 'hurt_15' as const, spDelta: -15, hintDelta: 0 }]) {
      const motion = planCompanionMotion(0, 'right', {
        ...wrong,
        phase: 'collapse',
        feedback: null,
        mystery,
        fatal: true,
      });
      expect(motion.anchor).toEqual(companionFooting('right'));
      expect(motion.action).toBe('rescue');
      expect(motion.end.y).toBeLessThan(motion.anchor.y);
    }
  });

  it.each([
    [320, 480],
    [390, 620],
    [768, 700],
    [1440, 560],
  ])('keeps a larger, undistorted companion at %s by %s', (width, height) => {
    const scale = companionScale(width, height);
    const pixelsX = (96 * scale.x * width) / 900;
    const pixelsY = (96 * scale.y * height) / 700;
    expect(pixelsX).toBeCloseTo(pixelsY);
    expect(pixelsX).toBeGreaterThanOrEqual(68);
    expect(pixelsX).toBeLessThanOrEqual(112);
  });
});
