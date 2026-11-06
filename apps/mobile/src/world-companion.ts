import type { TileSide } from '@crystal-path-infinity/game-core';
import { bridgePane } from './bridge-geometry';
import type { PresentedRow } from './infinity-presentation';
import type { SceneCinematic } from './scene-cinematics';

export type CompanionPoint = { x: number; y: number };
export const oppositePane = (side: TileSide): TileSide => (side === 'left' ? 'right' : 'left');

/** Only resolved history is consulted. A broken choice's other pane is now public. */
export function companionStandingSide(rows: readonly PresentedRow[]): TileSide {
  const past = rows.find((row) => row.phase === 'past');
  if (!past?.chosen) return 'left';
  return past.wrong ? oppositePane(past.chosen) : past.chosen;
}

export function companionLanding(side: TileSide): CompanionPoint {
  return bridgePane(0, side).reduce(
    (sum, point) => ({
      x: sum.x + point.x / 4,
      y: sum.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  );
}

export function companionFooting(side: TileSide): CompanionPoint {
  return { x: side === 'left' ? 225 : 675, y: 664 };
}

export function companionScale(width: number, height: number) {
  const pixels = Math.min(112, Math.max(68, width * 0.2));
  return { x: (pixels * 900) / (width * 96), y: (pixels * 700) / (height * 96) };
}

export interface CompanionMotion {
  readonly visible: boolean;
  readonly action: 'stand' | 'hop' | 'escape' | 'travel' | 'rescue';
  readonly anchor: CompanionPoint;
  readonly end: CompanionPoint;
  readonly path: string | null;
  readonly duration: number;
  readonly side: TileSide;
}

/** Presentation only; the outcome and SP have already settled in the game core. */
export function planCompanionMotion(
  sp: number,
  standingSide: TileSide,
  cinematic?: SceneCinematic | null,
): CompanionMotion {
  const rest = companionFooting(standingSide);
  const base: CompanionMotion = {
    visible: sp > 0 || !!cinematic,
    action: 'stand',
    anchor: rest,
    end: rest,
    path: null,
    duration: 0,
    side: standingSide,
  };
  const feedback = cinematic?.feedback;
  if (cinematic?.phase === 'contact') return base;
  if (cinematic?.phase === 'collapse' || (sp <= 0 && !!cinematic)) {
    const target = feedback ? companionLanding(feedback.side) : rest;
    const dx = target.x - rest.x,
      dy = target.y - rest.y;
    return {
      ...base,
      action: 'rescue',
      end: { x: target.x, y: 150 },
      duration: 1.15,
      path: `M0 0Q${dx * 0.5} ${dy - 55} ${dx} ${dy - 30}Q${dx + 35} ${dy - 130} ${dx} ${150 - rest.y}`,
    };
  }
  if (!feedback) return base;
  const side = feedback.kind === 'wrong' ? oppositePane(feedback.side) : feedback.side;
  const destination = companionLanding(side);
  if (cinematic?.phase === 'travel') {
    const end = companionFooting(side);
    return {
      ...base,
      action: 'travel',
      anchor: destination,
      end,
      duration: 0.46,
      side,
      path: `M0 0L${end.x - destination.x} ${end.y - destination.y}`,
    };
  }
  if (cinematic?.phase !== 'impact') return base;
  const hit = companionLanding(feedback.side);
  const hx = hit.x - rest.x,
    hy = hit.y - rest.y;
  const dx = destination.x - rest.x,
    dy = destination.y - rest.y;
  if (feedback.kind === 'wrong')
    return {
      ...base,
      action: 'escape',
      end: destination,
      duration: 0.62,
      side,
      path: `M0 0Q${hx * 0.5} ${hy - 42} ${hx} ${hy}Q${(hx + dx) / 2} ${dy - 48} ${dx} ${dy}`,
    };
  return {
    ...base,
    action: 'hop',
    end: destination,
    duration: 0.29,
    side,
    path: `M0 0Q${dx * 0.5} ${dy - 42} ${dx} ${dy}`,
  };
}
