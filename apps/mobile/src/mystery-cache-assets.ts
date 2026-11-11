import type { ThemeId } from './store-catalog';

export const CACHE_ART = { width: 100, height: 112, frames: 2 } as const;
export const mysteryCacheAsset = (theme: ThemeId) => `assets/worlds/caches/${theme}-v1.webp`;
