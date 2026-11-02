import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('CPI-011 Midnight Prism identity', () => {
  it('ships self-contained, compact, word-free offline vectors', () => {
    for (const path of ['public/brand/prism-mark.svg', 'public/brand/app-icon-preview.svg']) {
      const svg = read(path);
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox=');
      expect(svg).toContain('</svg>');
      expect(svg.length).toBeLessThan(10000);
      expect(svg).not.toMatch(/<script|<image|<foreignObject|xlink:href|href=["']https?:/i);
      expect(svg).not.toMatch(/THE BIG EYE|LOH|POS/);
    }
    expect(read('public/brand/prism-mark.svg')).toContain('viewBox="0 0 256 256"');
    expect(read('public/brand/app-icon-preview.svg')).toContain('viewBox="0 0 512 512"');
    expect(read('public/brand/app-icon-preview.svg')).toContain('fill="url(#night)"');
  });

  it('keeps the intro, HUD and web icon consistent without image-embedded copy', () => {
    const app = read('src/App.tsx');
    const scene = read('src/infinity-scene.tsx');
    const html = read('index.html');
    const tokens = read('src/brand-tokens.css');
    expect(app).toContain('brand/prism-mark.svg');
    expect(scene).toContain('brand/prism-mark.svg');
    expect(html).toContain('%BASE_URL%brand/app-icon-preview.svg');
    for (const token of ['--cpi-night', '--cpi-ice', '--cpi-iris', '--cpi-focus', '--cpi-risk']) {
      expect(tokens).toContain(token);
    }
    expect(scene).toContain('aria-label={INFINITY_SCENE_SKIN.title}');
    expect(scene).toContain('Row {presented.currentRow}');
    expect(scene).toContain('{state.sp}');
    expect(scene).not.toMatch(/The Big Eye|season feed|LOH|POS/);
    expect(app).toContain('<span className="brand-name">Crystal Path</span>');
  });

  it('tracks the pinned owner source and unresolved rights for every resource', () => {
    const manifest = JSON.parse(read('../../planning/reuse-manifest.json')) as {
      source_commit: string;
      resources: Array<{
        path: string;
        source_commit?: string;
        source_url: string;
        rights?: string;
        optimization?: string;
      }>;
    };
    const pin = manifest.source_commit;
    expect(pin).toMatch(/^[0-9a-f]{40}$/);
    expect(new Set(manifest.resources.map((x) => x.path)).size).toBe(manifest.resources.length);
    for (const item of manifest.resources) {
      expect(item.source_commit).toBe(pin);
      expect(item.source_url).toContain('/blob/' + pin + '/' + item.path);
      expect(item.rights?.length).toBeGreaterThan(15);
      expect(item.optimization?.length).toBeGreaterThan(10);
    }
    for (const path of [
      'src/components/GameButton/GameButton.tsx',
      'src/components/GameTopChip/GameTopChip.tsx',
      'src/styles/gameDesignSystem.css',
      'src/components/IntroSplash/IntroSplash.tsx',
    ]) {
      expect(manifest.resources.find((x) => x.path === path)).toBeDefined();
    }
    expect(
      manifest.resources.find(
        (x) => x.path === 'public/assets/sounds/minigames/minigame_gb_safe_step.mp3',
      )?.rights,
    ).toMatch(/pending.*licensing/i);
  });
});
