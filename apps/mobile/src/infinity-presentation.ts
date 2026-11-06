import type {
  ActiveEffect,
  RunState,
  TileSide,
  MysteryTier,
} from '@crystal-path-infinity/game-core';

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
  readonly noSafeTile?: true;
  readonly mysteryTier?: MysteryTier;
}
export interface PresentedEffect {
  readonly kind: ActiveEffect['kind'];
  readonly name: string;
  readonly positive: boolean;
  readonly remainingMs: number;
  readonly percent: number;
  readonly remainingRows?: number;
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
  coyote_10s: 'Run Coyote',
  shield_5s: 'Shield',
  regen_5s: 'Regeneration',
  lucky_5s: 'Lucky step',
  fragility_5s: 'Fragility',
  drain_5s: 'SP drain',
  inversion_5s: 'Inversion',
  double_gain_21s: 'Double SP',
  double_loss_21s: 'Double damage',
  regen_3rows: 'Second breath',
  bleed_3rows: 'The bleed',
};
const good = new Set<ActiveEffect['kind']>([
  'coyote_10s',
  'shield_5s',
  'regen_5s',
  'lucky_5s',
  'inversion_5s',
  'double_gain_21s',
  'regen_3rows',
]);
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
      ...(phase === 'current' && state.current.noSafeTile ? { noSafeTile: true as const } : {}),
      ...(phase === 'current' && state.current.mysteryTier
        ? { mysteryTier: state.current.mysteryTier }
        : {}),
    });
  }
  if (rows.length > MAX_PRESENTED_ROWS) throw new RangeError('Unbounded visual row window.');
  return {
    rows,
    effects: state.effects.map((effect) => {
      const remainingMs =
        effect.expiresAt === null ? 0 : Math.max(0, effect.expiresAt - state.activeTimeMs);
      return {
        kind: effect.kind,
        name: effectLabels[effect.kind],
        positive: good.has(effect.kind),
        remainingMs,
        percent:
          effect.expiresAt === null
            ? (effect.rowsLeft / 3) * 100
            : Math.min(
                100,
                Math.round((remainingMs / (effect.expiresAt - effect.startedAt)) * 100),
              ),
        ...(effect.expiresAt === null ? { remainingRows: effect.rowsLeft } : {}),
      };
    }),
    currentRow: state.currentRow,
    cleared: state.lastClearedRow,
    sp: state.sp,
    hints: state.hints,
    status: state.status,
  };
}
