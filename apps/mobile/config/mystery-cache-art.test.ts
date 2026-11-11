import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { THEME_IDS } from '../src/store-catalog';
import { RenderedMysteryCache } from '../src/mystery-cache-art';
import { mysteryCacheAsset, CACHE_ART } from '../src/mystery-cache-assets';

describe('World mystery-cache artwork contract', () => {
  for (const theme of THEME_IDS) {
    it(`ships a transparent closed/open pair for ${theme}`, () => {
      const bytes = readFileSync(new URL(`../public/${mysteryCacheAsset(theme)}`, import.meta.url));
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 16)).toBe('WEBPVP8X');
      expect(bytes[20] & 0x10).toBe(0x10);
      const width = bytes.readUIntLE(24, 3) + 1;
      const height = bytes.readUIntLE(27, 3) + 1;
      expect(width * CACHE_ART.height).toBe(height * CACHE_ART.width * CACHE_ART.frames);
      expect(height).toBeGreaterThanOrEqual(CACHE_ART.height * 2);
      const closed = renderToStaticMarkup(createElement(RenderedMysteryCache, { theme }));
      const open = renderToStaticMarkup(createElement(RenderedMysteryCache, { theme, open: true }));
      expect(closed).toContain(mysteryCacheAsset(theme));
      expect(open).toContain(mysteryCacheAsset(theme));
      expect(open).toContain('is-open');
      expect(closed).not.toContain('is-open');
      expect(closed).toContain('aria-hidden="true"');
    });
  }
});
