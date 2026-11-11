/** Store-registered permanent grants. Unknown keys never become wallet entitlements. */
export const ADVENTURE_UNLOCKS = [
  'unlock.no_clock',
  'unlock.all_seasons',
  'bridge.bounce',
  'bridge.cookie',
  'style.cosmic_kit',
  'gear.umbrella',
  'gear.sunshades',
  'gear.sun_balm',
  'gear.frost_runners',
  'gear.storm_boots',
  'gear.trail_scarf',
] as const;

export function isAdventureUnlock(value: unknown): value is (typeof ADVENTURE_UNLOCKS)[number] {
  return typeof value === 'string' && ADVENTURE_UNLOCKS.some((key) => key === value);
}

/** SQL identifiers are selected here, never interpolated from a client or stored row. */
export function commerceResourceColumn(kind: unknown) {
  switch (kind) {
    case 'sp':
      return 'sp';
    case 'hints':
      return 'hints';
    case 'credit':
      return 'credits';
    case 'shields':
      return 'shields';
    case 'season_changes':
      return 'season_changes';
    default:
      throw new Error('Unknown commerce resource');
  }
}

export function isConsumableProduct(kind: string) {
  return kind !== 'theme' && kind !== 'unlock';
}
