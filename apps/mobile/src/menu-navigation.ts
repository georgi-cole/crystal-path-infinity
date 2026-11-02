import type { PracticeLoad } from './practice-save';

/** Navigation only. Ranked authority, auth and practice runtime remain separate. */
export const MENU_VIEWS = [
  'home',
  'play',
  'practice',
  'rankings',
  'profile',
  'settings',
] as const;

export type MenuView = (typeof MENU_VIEWS)[number];
export type RankedService = 'unconfigured' | 'offline' | 'maintenance' | 'ready';

export function viewFromHash(hash: string): MenuView {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value === 'practice-run' || value === 'new-practice') return 'practice';
  return MENU_VIEWS.find((view) => view === value) ?? 'home';
}

export function viewHash(view: MenuView): string {
  return '#' + view;
}

/** Only an unfinished, validated local checkpoint is resumable. */
export function canResumePractice(load: PracticeLoad): boolean {
  return load.status === 'ready' && load.state.status !== 'finished';
}

/** Never translate a local checkpoint into an official leaderboard score. */
export function formatRowLabel(value: string | null): string {
  if (value === null || value.length > 1000 || !/^(0|[1-9][0-9]*)$/.test(value)) {
    return '—';
  }
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Configuration is not inferred from navigator.onLine; no backend yet. */
export function rankedServiceState(
  connected: boolean,
  configured = false,
  maintenance = false,
): RankedService {
  if (!connected) return 'offline';
  if (maintenance) return 'maintenance';
  return configured ? 'ready' : 'unconfigured';
}

/** History.state is untrusted across browser restores and deep links. */
export function historyFlag(value: unknown, flag: 'cpiModal' | 'cpiNavigation'): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    flag in value &&
    (value as Record<string, unknown>)[flag] === true
  );
}
