import type { GearId } from '@crystal-path-infinity/game-core';
import type { ThemeId } from './store-catalog';

/** Each row contains calm, happy and worried fully equipped bodies, not overlays. */
export const EQUIPPED_SPRITE = {
  cell: 160,
  foot: 156,
  frames: 3,
} as const;

export function equippedCompanionAsset(world: ThemeId, gear: GearId): string {
  return `assets/worlds/equipped/${world}/${gear}-v2.webp`;
}
