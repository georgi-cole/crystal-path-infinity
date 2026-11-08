// CPI-012. No image SDK, network, external fonts, or native build-tool dependency.
// Pixel exports are deterministic renditions of the original Midnight Prism SVG
// geometry (apps/mobile/public/brand). SVG remains the editable design master.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

export const BRAND_BACKGROUND = '#000000';

/** Reject active/external SVG resources, without rejecting the standard XML namespace. */
export function unsafeBrandSvg(svg) {
  return (
    /<!DOCTYPE|<!ENTITY/i.test(svg) ||
    /<(?:script|image|foreignObject)\b/i.test(svg) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(svg) ||
    /url\(\s*["']?\s*(?:https?:|data:|javascript:)/i.test(svg)
  );
}

const IMAGE_SIZES = Object.freeze({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 });
const ICE = [130, 223, 241];
const IRIS = [172, 154, 255];
const WHITE = [236, 253, 255];
const OUTER = [
  [128, 18],
  [206, 95],
  [186, 177],
  [128, 238],
  [70, 177],
  [50, 95],
];
const LEFT = [
  [128, 18],
  [50, 95],
  [70, 177],
  [128, 238],
  [118, 137],
  [96, 100],
];
const RIGHT = [
  [128, 18],
  [206, 95],
  [186, 177],
  [128, 238],
  [138, 137],
  [160, 100],
];
const LEFT_FACE = [
  [50, 95],
  [96, 100],
  [118, 137],
  [70, 177],
];
const RIGHT_FACE = [
  [206, 95],
  [160, 100],
  [138, 137],
  [186, 177],
];
const CORRIDOR = [
  [128, 53],
  [164, 111],
  [128, 208],
  [92, 111],
];
const RUNGS = [
  [111, 148, 145],
  [104, 168, 152],
  [97, 187, 159],
];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function inside(x, y, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      hit = !hit;
    }
  }
  return hit;
}
function blend(from, to, fraction) {
  const t = Math.max(0, Math.min(1, fraction));
  return from.map((value, i) => value * (1 - t) + to[i] * t);
}
function segmentDistance(x, y, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - ax - t * vx, y - ay - t * vy);
}
function outlineDistance(x, y, polygon) {
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    distance = Math.min(distance, segmentDistance(x, y, a[0], a[1], b[0], b[1]));
  }
  return distance;
}
function over(pixel, color, coverage) {
  const opacity = Math.max(0, Math.min(1, coverage));
  if (opacity === 0) return pixel;
  const sourceAlpha = opacity;
  const destAlpha = pixel[3];
  const resultAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (resultAlpha < 1e-6) return [0, 0, 0, 0];
  return [
    (color[0] * sourceAlpha + pixel[0] * destAlpha * (1 - sourceAlpha)) / resultAlpha,
    (color[1] * sourceAlpha + pixel[1] * destAlpha * (1 - sourceAlpha)) / resultAlpha,
    (color[2] * sourceAlpha + pixel[2] * destAlpha * (1 - sourceAlpha)) / resultAlpha,
    resultAlpha,
  ];
}
function backgroundAt(x, y) {
  const distance = Math.hypot(x - 256, y - 186) / 335;
  const color =
    distance < 0.58
      ? blend([23, 51, 78], [10, 20, 42], distance / 0.58)
      : blend([10, 20, 42], [5, 9, 22], (distance - 0.58) / 0.42);
  return [...color, 1];
}
/** A single sampling path ensures all native densities share the same artwork. */
function sample(x, y, mode) {
  const withBackground = mode === 'icon' || mode === 'round';
  const monochrome = mode === 'monochrome';
  const scale = withBackground ? 1.5 : mode === 'foreground' ? 1.28 : 1.15;
  const mx = 128 + (x - 256) / scale;
  const my = 128 + (y - 256) / scale;
  let pixel = withBackground ? backgroundAt(x, y) : [0, 0, 0, 0];
  if (mode === 'round' && Math.hypot(x - 256, y - 256) > 255) return [0, 0, 0, 0];
  if (withBackground) {
    for (const radius of [153, 187]) {
      const ring = Math.max(0, 1.0 - Math.abs(Math.hypot(x - 256, y - 256) - radius));
      pixel = over(pixel, ICE, ring * 0.11);
    }
  }
  if (monochrome) {
    if (inside(mx, my, OUTER) && !inside(mx, my, CORRIDOR)) pixel = over(pixel, WHITE, 1);
    for (const [start, row, end] of RUNGS) {
      if (segmentDistance(mx, my, start, row, end, row) < 1.8) {
        pixel = over(pixel, WHITE, 1);
      }
    }
    return pixel;
  }
  if (inside(mx, my, LEFT))
    pixel = over(pixel, blend(WHITE, ICE, Math.max(0, my - 18) / 230), 0.97);
  if (inside(mx, my, RIGHT))
    pixel = over(pixel, blend(IRIS, [40, 73, 157], Math.max(0, my - 18) / 230), 0.98);
  if (inside(mx, my, LEFT_FACE)) pixel = over(pixel, [208, 247, 255], 0.26);
  if (inside(mx, my, RIGHT_FACE)) pixel = over(pixel, [200, 198, 255], 0.27);
  if (inside(mx, my, CORRIDOR)) {
    pixel = over(pixel, blend([19, 47, 77], [3, 9, 24], (my - 53) / 155), 1);
  }
  if (outlineDistance(mx, my, OUTER) < 0.95) pixel = over(pixel, WHITE, 0.6);
  if (outlineDistance(mx, my, CORRIDOR) < 0.85) pixel = over(pixel, ICE, 0.7);
  for (const [start, row, end] of RUNGS) {
    if (segmentDistance(mx, my, start, row, end, row) < 1.5) {
      pixel = over(pixel, WHITE, 0.9);
    }
  }
  return pixel;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4);
  const tail = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  tail.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([length, type, bytes, tail]);
}
export function renderBrandPng(size, mode = 'icon') {
  assert.ok(Number.isInteger(size) && size >= 48 && size <= 1024);
  assert.ok(['icon', 'round', 'foreground', 'splash', 'monochrome'].includes(mode));
  const scanline = Buffer.alloc(size * (1 + size * 4));
  const samples = size <= 192 ? [0.25, 0.75] : [0.5];
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x += 1) {
      let rgba = [0, 0, 0, 0];
      for (const offsetY of samples) {
        for (const offsetX of samples) {
          const color = sample(((x + offsetX) * 512) / size, ((y + offsetY) * 512) / size, mode);
          const weight = 1 / (samples.length * samples.length);
          rgba[0] += color[0] * color[3] * weight;
          rgba[1] += color[1] * color[3] * weight;
          rgba[2] += color[2] * color[3] * weight;
          rgba[3] += color[3] * weight;
        }
      }
      const at = row + 1 + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        scanline[at + channel] = Math.round(rgba[3] > 0 ? rgba[channel] / rgba[3] : 0);
      }
      scanline[at + 3] = Math.round(rgba[3] * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8-bit
  header[9] = 6; // RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanline, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function asset(path, size, mode) {
  return { path, size, mode, bytes: renderBrandPng(size, mode) };
}
function androidAssetList() {
  const assets = [];
  for (const [density, factor] of Object.entries(IMAGE_SIZES)) {
    const base = 'android/app/src/main/res/mipmap-' + density;
    const size = Math.round(48 * factor);
    assets.push(asset(base + '/ic_launcher.png', size, 'icon'));
    assets.push(asset(base + '/ic_launcher_round.png', size, 'round'));
    assets.push(
      asset(base + '/ic_launcher_foreground.png', Math.round(108 * factor), 'foreground'),
    );
  }
  assets.push(asset('android/app/src/main/res/drawable-nodpi/cpi_splash_logo.png', 256, 'splash'));
  return assets;
}
function iosAssetList() {
  const base = 'ios/App/App/Assets.xcassets/';
  return [
    asset(base + 'AppIcon.appiconset/AppIcon-512@2x.png', 1024, 'icon'),
    asset(base + 'CpiLaunchMark.imageset/CpiLaunchMark.png', 160, 'splash'),
    asset(base + 'CpiLaunchMark.imageset/CpiLaunchMark@2x.png', 320, 'splash'),
    asset(base + 'CpiLaunchMark.imageset/CpiLaunchMark@3x.png', 480, 'splash'),
  ];
}
export function nativeBrandAssets(platform) {
  assert.ok(platform === 'ios' || platform === 'android', 'Unsupported native brand target');
  return platform === 'ios' ? iosAssetList() : androidAssetList();
}
export function syncNativeBrandAssets(appRoot, platform, check = false) {
  const original = readFileSync(join(appRoot, 'public/brand/prism-mark.svg'), 'utf8');
  const icon = readFileSync(join(appRoot, 'public/brand/app-icon-preview.svg'), 'utf8');
  assert.ok(original.includes('viewBox="0 0 256 256"'));
  assert.ok(icon.includes('viewBox="0 0 512 512"'));
  assert.ok(!unsafeBrandSvg(original + icon), 'Brand SVG must not load external resources');
  const assets = nativeBrandAssets(platform);
  const summary = [];
  for (const { path, size, mode, bytes } of assets) {
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
