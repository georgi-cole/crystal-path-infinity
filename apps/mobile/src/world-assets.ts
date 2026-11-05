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
} as const satisfies Record<Exclude<ThemeId, 'obsidian'>, object>;

export function worldAsset(path: string): string {
  return import.meta.env.BASE_URL + path;
}
