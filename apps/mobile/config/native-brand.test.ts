import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_BACKGROUND, nativeBrandAssets, renderBrandPng } from '../scripts/brand-assets.mjs';

const root = new URL('../', import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), 'utf8');

function unpackPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  expect(bytes[24]).toBe(8);
  expect(bytes[25]).toBe(6);
  const compressed: Buffer[] = [];
  for (let cursor = 8; cursor < bytes.length; ) {
    const length = bytes.readUInt32BE(cursor);
    const type = bytes.toString('ascii', cursor + 4, cursor + 8);
    if (type === 'IDAT') compressed.push(bytes.subarray(cursor + 8, cursor + 8 + length));
    cursor += 12 + length;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  expect(raw.length).toBe(height * (width * 4 + 1));
  expect(raw[0]).toBe(0);
  const alpha = (x: number, y: number) => raw[y * (1 + width * 4) + 1 + x * 4 + 3];
  return { width, height, alpha };
}

describe('CPI-012 deterministic native icon exports', () => {
  it('renders a valid, opaque 1024-unit-style icon without a third-party rasterizer', () => {
    const icon = renderBrandPng(64, 'icon');
    expect(renderBrandPng(64, 'icon')).toEqual(icon);
    const png = unpackPng(icon);
    expect(png.width).toBe(64);
    expect(png.height).toBe(64);
    expect(png.alpha(0, 0)).toBe(255);
    expect(png.alpha(32, 32)).toBe(255);
  });

  it('keeps adaptive/splash foregrounds transparent outside a centered safe mark', () => {
    for (const mode of ['foreground', 'splash', 'monochrome'] as const) {
      const png = unpackPng(renderBrandPng(64, mode));
      expect(png.alpha(0, 0)).toBe(0);
      expect(png.alpha(32, 8)).toBe(0);
      expect(png.alpha(25, 32)).toBeGreaterThan(0);
    }
  });

  it('generates the complete Android density and iOS asset catalog', () => {
    const android = nativeBrandAssets('android');
    expect(android).toHaveLength(16);
    for (const [density, scale] of [
      ['mdpi', 1],
      ['hdpi', 1.5],
      ['xhdpi', 2],
      ['xxhdpi', 3],
      ['xxxhdpi', 4],
    ] as const) {
      const base = 'android/app/src/main/res/mipmap-' + density;
      expect(android.find((asset) => asset.path === base + '/ic_launcher.png')?.size).toBe(
        Math.round(48 * scale),
      );
      expect(android.find((asset) => asset.path === base + '/ic_launcher_foreground.png')?.size).toBe(
        Math.round(108 * scale),
      );
      expect(android.find((asset) => asset.path === base + '/ic_launcher_round.png')).toBeDefined();
    }
    const ios = nativeBrandAssets('ios');
    expect(ios.map((item) => item.size)).toEqual([1024, 160, 320, 480]);
    expect(ios[0]?.path).toContain('AppIcon-512@2x.png');
    expect(new Set([...android, ...ios].map((item) => item.path)).size).toBe(20);
  });

  it('uses platform icon/background launch mechanisms, not season aliases', () => {
    const template = source('native-templates/android/cpi_adaptive_icon.xml');
    const themed = source('native-templates/android/cpi_monochrome.xml');
    const ios = source('native-templates/ios/LaunchScreen.storyboard');
    const generator = source('scripts/generate-native.mjs');
    const cap = source('capacitor.config.ts');
    const html = source('index.html');
    expect(BRAND_BACKGROUND).toBe('#060a18');
    expect(template).toContain('<adaptive-icon');
    expect(template).toContain('<monochrome');
    expect(themed).toContain('android:viewportWidth="256"');
    expect(ios).toContain('image="CpiLaunchMark"');
    expect(ios).toContain('launchScreen="YES"');
    expect(ios).not.toContain('systemBackgroundColor');
    expect(generator).toContain('windowSplashScreenAnimatedIcon');
    expect(generator).toContain('@drawable/cpi_splash_logo');
    expect(generator).toContain("syncNativeBrandAssets(appRoot, 'android')");
    expect(generator).toContain("syncNativeBrandAssets(appRoot, 'ios')");
    expect(generator).toContain('syncNativeBrandAssets(appRoot, platform, true)');
    expect(cap).toContain("'#060a18'");
    expect(html).toContain('background: #060a18;');
    expect(generator).not.toMatch(/cpi_launch_placeholder|The Big Eye|story-icon/);
  });

  it('keeps the OS splash and independent bounded in-app bootstrap distinct', () => {
    const app = source('src/App.tsx');
    const startup = source('src/startup-bootstrap.ts');
    const palette = source('src/brand-tokens.css');
    expect(app).toContain("bootPhase !== 'ready'");
    expect(app).toContain('Retry startup');
    expect(app).toContain('Play offline');
    expect(app).toContain('Offline practice');
    expect(startup).toContain('BOOT_TIMEOUT_MS = 1500');
    expect(startup).not.toMatch(/fetch\(|admob|analytics|setInterval/);
    expect(palette).toContain('background: var(--cpi-night)');
    expect(palette).toContain('env(safe-area-inset-top');
    expect(source('src/styles.css')).toContain('prefers-reduced-motion');
  });
});
