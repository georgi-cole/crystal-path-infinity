import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WORLD_ASSETS } from '../src/world-assets';
import { WORLD_ORDER } from '../src/world-kits';
import { ThemeArtwork } from '../src/theme-art';
import { WorldStepEffect } from '../src/world-effects';
import type { SceneCinematic } from '../src/scene-cinematics';

function image(path: string) {
  const bytes = readFileSync(new URL('../public/' + path, import.meta.url));
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  const extended = bytes.subarray(12, 16).toString() === 'VP8X';
  return {
    size: bytes.length,
    width: extended ? bytes.readUIntLE(24, 3) + 1 : bytes.readUInt16LE(26) & 0x3fff,
    height: extended ? bytes.readUIntLE(27, 3) + 1 : bytes.readUInt16LE(28) & 0x3fff,
    alpha: extended && !!(bytes[20] & 0x10),
  };
}

describe('portable world assets', () => {
  it.each(WORLD_ORDER)('%s world card carries both images without additional requests', (theme) => {
    const html = renderToStaticMarkup(createElement(ThemeArtwork, { theme }));
    expect(html.match(/src="data:image\/webp;base64,/g)).toHaveLength(2);
  });

  it.each(WORLD_ORDER)(
    '%s ships a bounded portrait plate and three transparent reaction frames',
    (theme) => {
      const plate = image(WORLD_ASSETS[theme].environment);
      expect([plate.width, plate.height]).toEqual([1024, 1536]);
      const companion = image(WORLD_ASSETS[theme].companion);
      expect([companion.width, companion.height]).toEqual([1536, 512]);
      expect(companion.alpha).toBe(true);
      expect(plate.size + companion.size).toBeLessThan(500_000);
    },
  );
  it('keeps the six runtime art kits below three megabytes', () => {
    const total = Object.values(WORLD_ASSETS).reduce(
      (sum, world) => sum + image(world.environment).size + image(world.companion).size,
      0,
    );
    expect(total).toBeLessThan(3_000_000);
  });
});

describe('cosmetic feedback boundary', () => {
  const beat: SceneCinematic = {
    id: 1,
    phase: 'impact',
    feedback: { row: '1', side: 'left', kind: 'safe' },
    rows: null,
    mystery: null,
    fatal: false,
  };
  it.each(WORLD_ORDER)('%s emits only a bounded, noninteractive resolved-step effect', (theme) => {
    const html = renderToStaticMarkup(
      createElement(WorldStepEffect, { theme, cinematic: beat, reduced: false }),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<circle /g)).toHaveLength(10);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<animate');
  });
  it('emits no extra effect before impact, on the original world, or with reduced motion', () => {
    for (const props of [
      { theme: 'obsidian' as const, cinematic: beat, reduced: false },
      { theme: 'chaos' as const, cinematic: beat, reduced: true },
      {
        theme: 'jelly' as const,
        cinematic: { ...beat, phase: 'contact' as const },
        reduced: false,
      },
      { theme: 'jelly' as const, cinematic: null, reduced: false },
    ])
      expect(renderToStaticMarkup(createElement(WorldStepEffect, props))).toBe('');
  });
});
