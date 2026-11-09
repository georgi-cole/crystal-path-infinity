export declare const BRAND_BACKGROUND: string;
export type BrandMode = 'icon' | 'round' | 'foreground';
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
export declare function nativeBrandAssets(
  platform: 'ios' | 'android',
  appRoot?: string,
): NativeBrandAsset[];
export declare function syncNativeBrandAssets(
  appRoot: string,
  platform: 'ios' | 'android',
  check?: boolean,
): NativeBrandSummary[];
