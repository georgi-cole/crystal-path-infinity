import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrismBridge } from '../src/prism-bridge';
import { advancesOneRow, bridgePane, projectBridgePoint } from '../src/bridge-geometry';
import type { PresentedRow } from '../src/infinity-presentation';

describe('projective crystal bridge', () => {
  it('animates only a real adjacent step, with exact indices beyond Number precision', () => {
    expect(advancesOneRow('900719925474099312345678', '900719925474099312345679')).toBe(true);
    expect(advancesOneRow('6', '6')).toBe(false);
    expect(advancesOneRow('6', '8')).toBe(false);
    expect(advancesOneRow('6', '5')).toBe(false);
  });
  it('keeps both sides symmetric around one vanishing point at every depth', () => {
    for (let distance = -1; distance <= 14; distance++) {
      const left = bridgePane(distance, 'left');
      const right = bridgePane(distance, 'right');
      for (let i = 0; i < 4; i++) {
        const mirror = right[[1, 0, 3, 2][i]];
        expect(left[i].x + mirror.x).toBeCloseTo(900);
        expect(left[i].y).toBeCloseTo(mirror.y);
        expect(Number.isFinite(left[i].y)).toBe(true);
      }
      // Each long edge and its rail converge at (450,72).
      for (const x of [-450, -430, -24, 24, 430, 450]) {
        const p = projectBridgePoint(x, 0.45 + distance * 1.15);
        expect((p.x - 450) / (p.y - 72)).toBeCloseTo(x / 628);
      }
    }
  });

  it('leaves separate, adequately sized current choices on a 320px handset', () => {
    const left = bridgePane(0, 'left');
    const right = bridgePane(0, 'right');
    expect(Math.max(...left.map((p) => p.x))).toBeLessThan(Math.min(...right.map((p) => p.x)));
    const width = Math.max(...left.map((p) => p.x)) - Math.min(...left.map((p) => p.x));
    const height = Math.max(...left.map((p) => p.y)) - Math.min(...left.map((p) => p.y));
    expect((width / 900) * 320).toBeGreaterThan(44);
    expect((height / 700) * 336).toBeGreaterThan(44);
    expect(bridgePane(1, 'left')[2].y).toBeLessThan(left[0].y);
  });

  it('makes only the current row actionable and retains exact unbounded row labels', () => {
    const row: PresentedRow = {
      index: '900719925474099312345678',
      label: '900719925474099312345679',
      distance: 0,
      phase: 'current',
      tone: 0,
      hasMystery: false,
      mysteryAvailable: false,
      hint: null,
      chosen: null,
      wrong: false,
    };
    const html = renderToStaticMarkup(
      createElement(PrismBridge, {
        rows: [
          row,
          {
            ...row,
            index: '900719925474099312345679',
            label: '900719925474099312345680',
            distance: 1,
            phase: 'future',
          },
        ],
        interactive: true,
      }),
    );
    expect(html).toContain('Row 900,719,925,474,099,312,345,679 left tile');
    expect(html.match(/disabled=""/g) ?? []).toHaveLength(2);
    expect(html.match(/clip-path:polygon/g) ?? []).toHaveLength(4);
    expect(html).not.toContain('safeSide');
    const paused = renderToStaticMarkup(
      createElement(PrismBridge, { rows: [row], interactive: false }),
    );
    expect(paused.match(/disabled=""/g) ?? []).toHaveLength(2);
  });

  it('keeps the decorative menu preview out of the input and accessibility paths', () => {
    const html = renderToStaticMarkup(createElement(PrismBridge, { preview: true }));
    expect(html).not.toContain('<button');
    expect(html).toContain('aria-hidden="true"');
  });
});
