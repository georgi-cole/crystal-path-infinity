import type { ThemeId } from './store-catalog';

/** One portable world template: plate, three-pose companion, materials and local audio. */
export const WORLD_ASSETS = {
  chaos: {
    environment: 'assets/worlds/chaos/environment-v1.webp',
    companion: 'assets/worlds/chaos/companion-reactions-v1.webp',
    companionName: 'Pip',
    material: 'copper',
  },
  jelly: {
    environment: 'assets/worlds/jelly/environment-v1.webp',
    companion: 'assets/worlds/jelly/companion-reactions-v1.webp',
    companionName: 'Lumi',
    material: 'opal',
  },
  wilds: {
    environment: 'assets/worlds/wilds/environment-v2.webp',
    companion: 'assets/worlds/wilds/companion-reactions-v2.webp',
    companionName: 'Rocko',
    material: 'jade',
  },
  league: {
    environment: 'assets/worlds/league/environment-v2.webp',
    companion: 'assets/worlds/league/companion-reactions-v2.webp',
    companionName: 'Dash',
    material: 'enamel',
  },
  puppy: {
    environment: 'assets/worlds/puppy/environment-v2.webp',
    companion: 'assets/worlds/puppy/companion-reactions-v2.webp',
    companionName: 'Ruff',
    material: 'enamel',
  },
  kitten: {
    environment: 'assets/worlds/kitten/environment-v2.webp',
    companion: 'assets/worlds/kitten/companion-reactions-v2.webp',
    companionName: 'Mimi',
    material: 'moonstone',
  },
} as const satisfies Record<Exclude<ThemeId, 'obsidian'>, object>;

export function worldAsset(path: string): string {
  return import.meta.env.BASE_URL + path;
}
