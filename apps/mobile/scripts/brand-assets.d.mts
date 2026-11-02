export declare const BRAND_BACKGROUND: string;
export declare function unsafeBrandSvg(svg: string): boolean;
export type BrandMode = 'icon' | 'round' | 'foreground' | 'splash' | 'monochrome';
export interface NativeBrandAsset {
  path: string;
  size: number;
  mode: BrandMode;
  bytes: Buffer;
}
export interface NativeBrandSummary {
  path: string;
  size: number;
  mode: BrandMode;
  bytes: number;
  sha256: string;
}
export declare function renderBrandPng(size: number, mode?: BrandMode): Buffer;
export declare function nativeBrandAssets(platform: 'ios' | 'android'): NativeBrandAsset[];
export declare function syncNativeBrandAssets(
  appRoot: string,
  platform: 'ios' | 'android',
  check?: boolean,
): NativeBrandSummary[];
