import { DISCOVERY_RULESET_VERSION, getRuleset } from '@crystal-path-infinity/game-core';
import type { EffectKind, RunState } from '@crystal-path-infinity/game-core';
import type { PracticeStorage } from './practice-save';

export const MYSTERY_JOURNAL_KEY = 'cpi.practice.mysteries.v1';
const kinds = getRuleset(DISCOVERY_RULESET_VERSION).mysteryTable.map(({ kind }) => kind);
export function discoveredKinds(values: readonly unknown[]): EffectKind[] {
  return [
    ...new Set(
      values.filter(
        (kind): kind is EffectKind =>
          typeof kind === 'string' && kinds.includes(kind as EffectKind),
      ),
    ),
  ];
}
export function discoveriesFromRun(state: RunState): EffectKind[] {
  if (!state.runId.startsWith('practice-') || /^practice-(lab|tutorial)/.test(state.runId))
    return [];
  return discoveredKinds([
    ...(state.discovery?.known ?? []),
    ...(state.mysteryDirector?.history.map(({ kind }) => kind) ?? []),
    ...state.resolutions.map(({ mysteryOutcome }) => mysteryOutcome),
    state.current.mysteryOutcome,
  ]);
}
export function readMysteryJournal(storage: Pick<PracticeStorage, 'getItem'>): EffectKind[] {
  try {
    const raw = storage.getItem(MYSTERY_JOURNAL_KEY);
    if (!raw || raw.length > 4096) return [];
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1 ||
      !('kinds' in value) ||
      !Array.isArray(value.kinds) ||
      value.kinds.length > kinds.length
    )
      return [];
    return discoveredKinds(value.kinds);
  } catch {
    return [];
  }
}
/** Called only for the real practice owner. Demonstrations cannot unlock journal entries. */
export function rememberMysteries(storage: PracticeStorage, state: RunState): EffectKind[] {
  const previous = readMysteryJournal(storage);
  const next = discoveredKinds([...previous, ...discoveriesFromRun(state)]);
  if (next.length !== previous.length)
    storage.setItem(MYSTERY_JOURNAL_KEY, JSON.stringify({ version: 1, kinds: next }));
  return next;
}
