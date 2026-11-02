import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { CrystalButton } from '../src/brand/CrystalButton';
import { CRYSTAL_IDENTITY } from '../src/brand/identity';

function get(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('CPI-011 independent Midnight Prism identity', () => {
  it('keeps the original icon local, vector-only and readable at small sizes', () => {
    const icon = get('../public/assets/brand/icon-concept.svg');
    expect(CRYSTAL_IDENTITY.id).toBe('midnight-prism-v1');
    expect(CRYSTAL_IDENTITY.approvedForNativeExport).toBe(false);
    expect(icon).toContain('viewBox="0 0 512 512"');
    expect(icon).toContain('Crystal Path Infinity icon concept');
    expect(icon).not.toMatch(/<script|<image|<text|https?:\/\/|data:image/i);
    expect(icon).toContain('#79');
  });

  it('renders semantic buttons with real labels, native disabled behavior and variants', () => {
    const primary = renderToStaticMarkup(
      createElement(CrystalButton, { variant: 'primary', disabled: true }, 'Continue practice'),
    );
    expect(primary).toContain('type="button"');
    expect(primary).toContain('disabled=""');
    expect(primary).toContain('cpi-crystal-button--primary');
    expect(primary).toContain('Continue practice');

    const secondary = renderToStaticMarkup(
      createElement(CrystalButton, { variant: 'secondary', type: 'submit', stretch: true }, 'New practice'),
    );
    expect(secondary).toContain('type="submit"');
    expect(secondary).toContain('cpi-crystal-button--stretch');
    expect(secondary).toContain('New practice');
    const css = get('../src/brand/crystal-button.css');
    expect(css).toContain('min-height: 3rem');
    expect(css).toContain(':focus-visible');
    expect(css).toContain(':disabled');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('uses brand components in the real practice menu without inventing navigation', () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('data-testid="app-ready"');
    expect(html).toContain('assets/brand/icon-concept.svg');
    expect(html).toContain('Crystal Path');
    expect(html).toContain('Infinity');
    expect(html).toContain('New practice');
    expect(html).toContain('Offline practice');
    expect(html).not.toContain('Hall of Fame');
    expect(html).not.toContain('VIP unlock');
    expect(html).not.toContain('Season immunity');
  });

  it('tracks original assets, reuse decisions and pending third-party rights accurately', () => {
    const inventory: {
      assets: {
        id: string;
        origin: string;
        sourcePath: string | null;
        rights: string;
        fallback: string;
      }[];
    } = JSON.parse(get('../../../planning/visual-assets.json'));
    const items = inventory.assets;
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.length).toBeGreaterThan(12);
    for (const asset of items) {
      expect(asset.rights).toBeTruthy();
      expect(asset.fallback).toBeTruthy();
      if (asset.origin.includes('source') || asset.origin.includes('copied')) {
        expect(asset.sourcePath).toBeTruthy();
      }
      if (asset.origin === 'copied-source-binary') {
        expect(asset.rights.toLowerCase()).toMatch(/unverified|pending/);
      }
    }
    const manifest: {
      source_commit: string;
      resources: { path: string }[];
    } = JSON.parse(get('../../../planning/reuse-manifest.json'));
    expect(manifest.source_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.resources.map((item) => item.path)).toContain(
      'src/components/GameButton/GameButton.tsx',
    );
    expect(manifest.resources.map((item) => item.path)).toContain(
      'src/screens/HomeHub/HomeHub.tsx',
    );
  });

  it('offers a static menu/HUD concept and keeps splash/native export out of CPI-011', () => {
    const board = get('../../../docs/previews/CPI-011-brand-board.svg');
    expect(board).toContain('MIDNIGHT PRISM');
    expect(board).toContain('ROW 128');
    expect(board).toContain('APP ICON CONCEPT');
    expect(board).toContain('STATIC CONCEPT');
    expect(board).not.toMatch(/<script|<foreignObject|https?:\/\//i);
    const tokens = get('../src/brand/theme.css');
    expect(tokens).toContain('--cpi-glass-cyan');
    expect(tokens).toContain('--cpi-focus');
    expect(get('../src/styles.css')).toMatch(/^@import '.\/brand\/theme\.css';/);
  });
});
