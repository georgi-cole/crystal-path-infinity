import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRAND_BACKGROUND = '#000000';
const appDirectory = fileURLToPath(new URL('../', import.meta.url));
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const nativeDirectories = {
  android: 'android/app/src/main/res/',
  ios: 'ios/App/App/Assets.xcassets/',
};

function asset(appRoot, platform, relativePath, size, mode) {
  const bytes = readFileSync(join(appRoot, 'brand-assets/native', platform, relativePath));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', relativePath);
  assert.equal(bytes.readUInt32BE(16), size, 'Unexpected icon width: ' + relativePath);
  assert.equal(bytes.readUInt32BE(20), size, 'Unexpected icon height: ' + relativePath);
  if (platform === 'ios') assert.equal(bytes[25], 2, 'iOS app icon must be RGB without alpha');
  return { path: nativeDirectories[platform] + relativePath, size, mode, bytes };
}

export function nativeBrandAssets(platform, appRoot = appDirectory) {
  assert.ok(platform === 'ios' || platform === 'android', 'Unsupported native brand target');
  if (platform === 'ios') {
    return [asset(appRoot, platform, 'AppIcon.appiconset/AppIcon-512@2x.png', 1024, 'icon')];
  }
  return Object.entries(densities).flatMap(([density, scale]) => {
    const base = 'mipmap-' + density;
    const size = Math.round(48 * scale);
    return [
      asset(appRoot, platform, base + '/ic_launcher.png', size, 'icon'),
      asset(appRoot, platform, base + '/ic_launcher_round.png', size, 'round'),
      asset(
        appRoot,
        platform,
        base + '/ic_launcher_foreground.png',
        Math.round(108 * scale),
        'foreground',
      ),
    ];
  });
}

export function syncNativeBrandAssets(appRoot, platform, check = false) {
  const summary = [];
  for (const { path, size, mode, bytes } of nativeBrandAssets(platform, appRoot)) {
    const dest = join(appRoot, path);
    if (check) {
      assert.ok(existsSync(dest), 'Missing native icon: ' + path);
      assert.ok(readFileSync(dest).equals(bytes), 'Native icon differs from source: ' + path);
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes);
    }
    summary.push({
      path,
      size,
      mode,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return summary;
}
