import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_BACKGROUND, nativeBrandAssets } from '../scripts/brand-assets.mjs';

const root = new URL('../', import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('CPI-012 native icon exports', () => {
  it('uses the reviewed icon at every launcher density and in the iOS app icon slot', () => {
    const android = nativeBrandAssets('android');
    expect(android).toHaveLength(15);
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
      expect(
        android.find((asset) => asset.path === base + '/ic_launcher_foreground.png')?.size,
      ).toBe(Math.round(108 * scale));
      expect(android.find((asset) => asset.path === base + '/ic_launcher_round.png')).toBeDefined();
    }
    const ios = nativeBrandAssets('ios');
    expect(ios).toHaveLength(1);
    const iconPath = 'AppIcon.appiconset/AppIcon-512@2x.png';
    expect(ios[0]).toMatchObject({
      path: 'ios/App/App/Assets.xcassets/' + iconPath,
      size: 1024,
    });
    const reviewed = readFileSync(new URL('brand-assets/native/ios/' + iconPath, root));
    expect(ios[0]?.bytes.equals(reviewed)).toBe(true);
    expect(ios[0]?.bytes[25]).toBe(2);
    expect(new Set([...android, ...ios].map((item) => item.path)).size).toBe(16);
  });

  it('keeps the system starting screen black before the Kolequant intro', () => {
    const template = source('native-templates/android/cpi_adaptive_icon.xml');
    const themed = source('native-templates/android/cpi_monochrome.xml');
    const ios = source('native-templates/ios/LaunchScreen.storyboard');
    const generator = source('scripts/generate-native.mjs');
    const cap = source('capacitor.config.ts');
    const html = source('index.html');
    const brandLaunch = source('src/brand-launch.css');
    expect(BRAND_BACKGROUND).toBe('#000000');
    expect(template).toContain('<adaptive-icon');
    expect(template).toContain('android:inset="16%"');
    expect(template).toContain('<monochrome');
    expect(themed).toContain('android:viewportWidth="256"');
    expect(ios).not.toContain('<imageView');
    expect(ios).toContain('launchScreen="YES"');
    expect(ios).toContain('red="0" green="0" blue="0"');
    expect(ios).not.toContain('systemBackgroundColor');
    expect(generator).toContain(
      '<item name="windowSplashScreenAnimatedIcon">@android:color/transparent</item>',
    );
    expect(generator).toContain("syncNativeBrandAssets(appRoot, 'android')");
    expect(generator).toContain("syncNativeBrandAssets(appRoot, 'ios')");
    expect(generator).toContain('syncNativeBrandAssets(appRoot, platform, true)');
    expect(cap).toContain("'#000000'");
    expect(html).toContain('background: #000000;');
    expect(html).toContain('content="#000000"');
    expect(brandLaunch).toContain('background: #000000;');
    expect(generator).not.toMatch(/@drawable\/cpi_launch_placeholder|The Big Eye|story-icon/);
  });

  it('keeps the OS splash and independent bounded in-app bootstrap distinct', () => {
    const app = source('src/App.tsx');
    const menu = source('src/main-menu.tsx');
    const startup = source('src/startup-bootstrap.ts');
    const palette = source('src/brand-tokens.css');
    expect(app).toContain("bootPhase !== 'ready'");
    expect(app).toContain("t('app.retryStart')");
    expect(app).toContain("t('app.playOffline')");
    expect(app).toContain('<MainMenu');
    expect(menu).toContain("t('menu.footerOffline')");
    expect(startup).toContain('BOOT_TIMEOUT_MS = 1500');
    expect(startup).not.toMatch(/\b(?:fetch|setInterval|trackEvent|requestAds)\s*\(/);
    expect(palette).toContain('background: var(--cpi-night)');
    expect(palette).toContain('env(safe-area-inset-top');
    expect(source('src/styles.css')).toContain('prefers-reduced-motion');
  });
});
