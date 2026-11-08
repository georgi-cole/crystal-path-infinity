import { getReviveSp, getMaxRevives } from '@crystal-path-infinity/game-core';
import type { DeathCause, RunState } from '@crystal-path-infinity/game-core';
import { formatRowLabel } from './menu-navigation';
import { en } from './i18n/messages';

export type RunDisplayPhase =
  'playing' | 'dead' | 'verification-pending' | 'grant-ready' | 'finished';

export interface ReviveOffer {
  readonly ordinal: number;
  readonly restoreSp: number;
  readonly grantsRemaining: number;
}

export interface RunDisplay {
  readonly phase: RunDisplayPhase;
  readonly clearedRows: string;
  readonly currentRow: string;
  readonly fatalRow: string | null;
  readonly deathReason: string | null;
  readonly appliedContinues: number;
  readonly grantedContinues: number;
  readonly grantsRemaining: number;
  readonly offer: ReviveOffer | null;
  readonly canEnd: boolean;
  readonly canViewRankings: boolean;
  readonly forfeitsGrant: boolean;
  readonly localResult: boolean;
  readonly activeTime: string;
}

export const deathLabels: Record<DeathCause, string> = {
  wrong_tile: en['game.deathWrong'],
  mystery: en['game.deathMystery'],
  drain: en['game.deathDrain'],
  idle: en['game.deathIdle'],
  death_clock: en['game.deathIdle'],
};

export function formatActiveDuration(activeTimeMs: number): string {
  const seconds = Math.floor(Math.max(0, activeTimeMs) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? [hours, minutes, remaining].map((part) => String(part).padStart(2, '0')).join(':')
    : [minutes, remaining].map((part) => String(part).padStart(2, '0')).join(':');
}

/**
 * A pure view projection of the canonical run. Never infer ad availability
 * from quota and never create a client-side ranked verification/submit result.
 */
export function presentRunOutcome(state: RunState): RunDisplay {
  const pending = state.pendingReward !== null;
  const finished = state.status === 'finished' && state.result !== null && !pending;
  const earnedButUnused = state.reviveReceipts.some((receipt) => receipt.status === 'granted');
  const maxRevives = getMaxRevives(state.rulesetVersion);
  const grantsRemaining = maxRevives - state.revivesGranted;
  const nextOrdinal = state.revivesApplied + 1;
  const hasOffer =
    state.status === 'dead' &&
    !pending &&
    !earnedButUnused &&
    grantsRemaining > 0 &&
    nextOrdinal <= maxRevives;
  const phase: RunDisplayPhase = pending
    ? 'verification-pending'
    : finished
      ? 'finished'
      : state.status === 'dead'
        ? earnedButUnused
          ? 'grant-ready'
          : 'dead'
        : 'playing';
  const deathCause = finished ? state.result?.deathCause : state.death?.cause;
  const fatalRow = finished ? (state.result?.fatalRow ?? null) : (state.death?.fatalRow ?? null);
  const clearedRows = finished && state.result ? state.result.lastClearedRow : state.lastClearedRow;
  return {
    phase,
    clearedRows: formatRowLabel(clearedRows),
    currentRow: formatRowLabel(state.currentRow),
    fatalRow: fatalRow === null ? null : formatRowLabel(fatalRow),
    deathReason: deathCause === null || deathCause === undefined ? null : deathLabels[deathCause],
    appliedContinues: state.revivesApplied,
    grantedContinues: state.revivesGranted,
    grantsRemaining,
    offer: hasOffer
      ? {
          ordinal: nextOrdinal,
          restoreSp: getReviveSp(nextOrdinal, state.rulesetVersion),
          grantsRemaining,
        }
      : null,
    canEnd: !pending && (state.status === 'playing' || state.status === 'dead'),
    canViewRankings: finished,
    forfeitsGrant: earnedButUnused,
    // Offline practice has only a local checkpoint / personal-best key.
    // A future verified submission belongs to the ranked server adapter.
    localResult: finished,
    activeTime: formatActiveDuration(state.result?.activeTimeMs ?? state.activeTimeMs),
  };
}
