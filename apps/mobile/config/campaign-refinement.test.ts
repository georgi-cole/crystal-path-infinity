import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { campaignMissedObjective, campaignTasks } from '../src/campaign-objectives';
import { CampaignObjectives } from '../src/campaign-objectives-view';
import {
  EMPTY_CAMPAIGN_PROGRESS,
  newMissionSnapshot,
  readCampaignSave,
  writeCampaignSave,
} from '../src/campaign-test';
import {
  ATLAS_SIZE,
  ATLAS_SCALE,
  CROSSING_LOCATIONS,
  crossingScrollTarget,
  crossingPath,
} from '../src/campaign-map-layout';
import { PrismBridge } from '../src/prism-bridge';
import { LanguageProvider } from '../src/language-provider';
import type { PresentedRow } from '../src/infinity-presentation';
import { CAMPAIGN_MISSIONS } from '../src/campaign-content';

describe('Campaign objective recovery', () => {
  const mission = newMissionSnapshot('sun-on-the-cliffs');
  it('keeps a marked step recoverable while its row is still current', () => {
    expect(campaignMissedObjective(mission, EMPTY_CAMPAIGN_PROGRESS, '11')).toBeNull();
    expect(campaignMissedObjective(mission, EMPTY_CAMPAIGN_PROGRESS, '12')).toContain('row 11');
    expect(
      campaignMissedObjective(mission, { ...EMPTY_CAMPAIGN_PROGRESS, cleanRows: ['11'] }, '12'),
    ).toBeNull();
  });
  it('stops for a missed required cache, hint, trade or shield, including multi-row missions', () => {
    for (const [id, row] of [
      ['lost-lens', 8],
      ['dry-foothold', 12],
      ['bargain-at-the-mill', 10],
      ['trust-the-shield', 14],
      ['mind-the-melt', 17],
      ['the-night-watch', 18],
      ['special-delivery-dry-ish', 8],
    ] as const) {
      const snapshot = newMissionSnapshot(id);
      expect(
        campaignMissedObjective(snapshot, EMPTY_CAMPAIGN_PROGRESS, String(row)),
        id,
      ).toBeNull();
      expect(
        campaignMissedObjective(snapshot, EMPTY_CAMPAIGN_PROGRESS, String(row + 1)),
        id,
      ).toContain('row ' + row);
    }
  });
  it('accepts completed evidence while leaving later objectives open', () => {
    const snapshot = newMissionSnapshot('mind-the-melt');
    const progress = { ...EMPTY_CAMPAIGN_PROGRESS, hintRows: ['17'], cleanRows: ['17'] };
    expect(campaignMissedObjective(snapshot, progress, '18')).toBeNull();
    const task = campaignTasks(snapshot, progress, '18')[0];
    expect(task.detail).toBe('1 / 2');
    expect(task.rows).toEqual([
      { row: 17, done: true, missed: false },
      { row: 41, done: false, missed: false },
    ]);
    expect(campaignMissedObjective(snapshot, progress, '42')).toContain('row 41');
  });
  it('ends immediately for an exceeded hint allowance but does not predict recoverable Stability loss', () => {
    const snapshot = newMissionSnapshot('save-a-hint');
    expect(
      campaignMissedObjective(snapshot, { ...EMPTY_CAMPAIGN_PROGRESS, hintRows: ['2', '4'] }, '5'),
    ).toContain('2 / 1 spent');
    expect(
      campaignMissedObjective(newMissionSnapshot('first-steps'), EMPTY_CAMPAIGN_PROGRESS, '5'),
    ).toBeNull();
  });
  it('preserves landing-only evaluation for every earlier saved revision', () => {
    for (const contentRevision of ['0.1', '0.2', '0.3', '0.4'] as const)
      expect(
        campaignMissedObjective({ ...mission, contentRevision }, EMPTY_CAMPAIGN_PROGRESS, '50'),
      ).toBeNull();
  });
  it('round trips both new and previous saved snapshots without upgrading started attempts', () => {
    for (const contentRevision of ['0.3', '0.4', '0.5', '0.6'] as const) {
      const snapshot = { ...mission, contentRevision };
      const progress = {
        ...EMPTY_CAMPAIGN_PROGRESS,
        activeMissionId: mission.id,
        activeMissionSnapshot: snapshot,
        cleanRows: ['11'],
      };
      let saved = '';
      writeCampaignSave(
        {
          setItem: (_key, value) => {
            saved = value;
          },
        },
        progress,
        null,
      );
      const read = readCampaignSave({ getItem: () => saved }).progress;
      expect(read.activeMissionSnapshot).toEqual(snapshot);
      expect(read.cleanRows).toEqual(['11']);
    }
  });
  it('presents multiple goals as distinct mission tasks with named target rows', () => {
    const snapshot = newMissionSnapshot('bring-the-dawn-home');
    const tasks = campaignTasks(snapshot, EMPTY_CAMPAIGN_PROGRESS);
    const html = renderToStaticMarkup(
      createElement(CampaignObjectives, {
        name: snapshot.name,
        targetRow: snapshot.targetRow,
        minimumStability: snapshot.minimumStability,
        tasks,
      }),
    );
    expect(tasks.length).toBeGreaterThan(1);
    expect(html).toContain('Crossing objectives');
    expect(html).toContain('<ul');
    expect(html).toContain('Target rows');
    expect(html).not.toContain('checkbox');
  });
});

describe('Campaign atlas geometry', () => {
  it('anchors every connector to the exact marker coordinates', () => {
    expect(CROSSING_LOCATIONS).toHaveLength(CAMPAIGN_MISSIONS.length);
    CROSSING_LOCATIONS.slice(0, -1).forEach(([x, y], index) => {
      const [endX, endY] = CROSSING_LOCATIONS[index + 1];
      expect(crossingPath(index)).toMatch(new RegExp('^M' + x + ' ' + y + ' '));
      expect(crossingPath(index).endsWith(endX + ' ' + endY)).toBe(true);
    });
  });
  it('keeps selected crossings visible at the scene edges and after expanding', () => {
    for (const [width, height] of [
      [390, 240],
      [390, 700],
      [1400, 1800],
    ]) {
      CROSSING_LOCATIONS.forEach(([x, y], index) => {
        const target = crossingScrollTarget(index, width, height);
        expect(target.left).toBeGreaterThanOrEqual(0);
        expect(target.top).toBeGreaterThanOrEqual(0);
        expect(target.left).toBeLessThanOrEqual(
          Math.max(0, ATLAS_SIZE.width * ATLAS_SCALE - width),
        );
        expect(target.top).toBeLessThanOrEqual(
          Math.max(0, ATLAS_SIZE.height * ATLAS_SCALE - height),
        );
        expect(x * ATLAS_SCALE - target.left).toBeGreaterThanOrEqual(0);
        expect(x * ATLAS_SCALE - target.left).toBeLessThanOrEqual(width);
        expect(y * ATLAS_SCALE - target.top).toBeGreaterThanOrEqual(0);
        expect(y * ATLAS_SCALE - target.top).toBeLessThanOrEqual(height);
      });
    }
  });
});

describe('Campaign landing marker', () => {
  const row: PresentedRow = {
    index: '59',
    label: '60',
    distance: 0,
    phase: 'current',
    tone: 0,
    hasMystery: false,
    mysteryAvailable: false,
    hint: null,
    chosen: null,
    wrong: false,
  };
  const render = (landingRow?: number) =>
    renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(PrismBridge, { rows: [row], landingRow, reducedMotion: true }),
      ),
    );
  it('marks both sides of the designated row without revealing an answer', () => {
    const html = render(60);
    expect(html.match(/class="cpi-landing-halo"/g)).toHaveLength(2);
    expect(html).toContain('data-visual-row="59" data-landing-row="true"');
    expect(html).not.toContain('is-hinted');
  });
  it('does not add a finish to Infinity or an unrelated visible row', () => {
    expect(render()).not.toContain('cpi-landing-halo');
    expect(render(100)).not.toContain('cpi-landing-halo');
  });
});
