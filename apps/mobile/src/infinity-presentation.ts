import type { ActiveEffect, RunState, TileSide } from '@crystal-path-infinity/game-core';

/** Renderer-safe shape. In particular, future tiles never contain safeSide. */
export interface PresentedRow {
  readonly index: string;
  readonly label: string;
  readonly distance: number;
  readonly tone: 0 | 1 | 2;
  readonly phase: 'past' | 'current' | 'future';
  readonly hasMystery: boolean;
  readonly mysteryAvailable: boolean;
  readonly hint: TileSide | null;
  readonly chosen: TileSide | null;
  readonly wrong: boolean;
}
export interface PresentedEffect {
  readonly kind: ActiveEffect['kind'];
  readonly name: string;
  readonly positive: boolean;
  readonly remainingMs: number;
  readonly percent: number;
}
export interface PresentedScene {
  readonly rows: readonly PresentedRow[];
  readonly effects: readonly PresentedEffect[];
  readonly currentRow: string;
  readonly cleared: string;
  readonly sp: number;
  readonly hints: number;
  readonly status: RunState['status'];
}

const effectLabels: Record<ActiveEffect['kind'], string> = {
  shield_5s: 'Shield',
  regen_5s: 'Regeneration',
  lucky_5s: 'Lucky step',
  fragility_5s: 'Fragility',
  drain_5s: 'SP drain',
  inversion_5s: 'Inversion',
};
const good = new Set<ActiveEffect['kind']>(['shield_5s', 'regen_5s', 'lucky_5s', 'inversion_5s']);
export const MAX_PRESENTED_ROWS = 5;

/**
 * Bounded absolute-index projection: one resolved row, current row, three ahead.
 * Never convert a row number to a JS Number; decimal indices may exceed 2^53.
 * Future rows intentionally reveal no safe answer, not even in data props.
 */
export function presentInfinityScene(state: RunState): PresentedScene {
  const current = BigInt(state.lastClearedRow);
  const resolved = new Map(state.resolutions.map((r) => [r.index, r]));
  const rows: PresentedRow[] = [];
  for (const row of state.rows) {
    const offset = BigInt(row.index) - current;
    if (offset < -1n || offset > 3n) continue;
    const phase = offset < 0n ? 'past' : offset === 0n ? 'current' : 'future';
    const decision =
      phase === 'past'
        ? resolved.get(row.index)?.lastChoice
        : phase === 'current'
          ? state.current.lastChoice
          : null;
    const available =
      phase === 'current' &&
      row.hasMystery &&
      state.current.mysteryOutcome === null &&
      state.status === 'playing';
    rows.push({
      index: row.index,
      label: (BigInt(row.index) + 1n).toString(),
      distance: Number(offset),
      tone: Number(BigInt(row.index) % 3n) as 0 | 1 | 2,
      phase,
      hasMystery: row.hasMystery,
      mysteryAvailable: available,
      hint: phase === 'current' ? state.current.revealedSafeSide : null,
      chosen: decision?.side ?? null,
      wrong: decision?.wrong ?? false,
    });
  }
  if (rows.length > MAX_PRESENTED_ROWS) throw new RangeError('Unbounded visual row window.');
  return {
    rows,
    effects: state.effects.map((effect) => {
      const remainingMs = Math.max(0, effect.expiresAt - state.activeTimeMs);
      return {
        kind: effect.kind,
        name: effectLabels[effect.kind],
        positive: good.has(effect.kind),
        remainingMs,
        percent: Math.min(100, Math.round((remainingMs / 5000) * 100)),
      };
    }),
    currentRow: state.currentRow,
    cleared: state.lastClearedRow,
    sp: state.sp,
    hints: state.hints,
    status: state.status,
  };
}
