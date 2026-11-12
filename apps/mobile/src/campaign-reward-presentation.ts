import { STYLES, CHAPTERS, LANDMARK_CLEARS } from './campaign-content';
import { seasonUnlockedByMission } from './campaign-test';
import type { CampaignMissionSnapshot } from './campaign-test';
import type { ExpeditionIcon } from './expedition-art';
import type { StyleId, Chapter } from './campaign-content';
import type { Season } from '@crystal-path-infinity/game-core';

export type RewardArtwork =
  | {
      type: 'supply';
      offer: 'sp-pack' | 'hint-pack' | 'continue-pack' | 'shield-pack' | 'season-change-pack';
    }
  | { type: 'style'; id: StyleId }
  | { type: 'season'; season: Season }
  | { type: 'weather'; weather: 'rainbow' }
  | { type: 'landmark'; chapter: Chapter };
export interface MissionRewardItem {
  label: string;
  icon: ExpeditionIcon;
  art: RewardArtwork;
}

export function missionRewardItems(mission: CampaignMissionSnapshot): MissionRewardItem[] {
  const items: MissionRewardItem[] = [];
  const add = (label: string, icon: ExpeditionIcon, art: RewardArtwork) =>
    items.push({ label, icon, art });
  const grant = mission.grant;
  const styles = Object.entries(STYLES).filter(([, item]) => item.unlock === mission.id);
  for (const [id, item] of styles) {
    const icon: ExpeditionIcon =
      item.slot === 'lighting' ? 'lantern' : item.slot === 'trail' ? 'hint' : 'bridge';
    add(item.name, icon, { type: 'style', id: id as StyleId });
  }
  if (grant.style && styles.length === 0) {
    const item = STYLES[grant.style];
    add(
      item.name,
      item.slot === 'lighting' ? 'lantern' : item.slot === 'trail' ? 'hint' : 'bridge',
      { type: 'style', id: grant.style },
    );
  }

  if (grant.sp)
    add('+' + grant.sp + ' reserve SP', 'stability', { type: 'supply', offer: 'sp-pack' });
  if (grant.hints)
    add('+' + grant.hints + (grant.hints === 1 ? ' reserve hint' : ' reserve hints'), 'hint', {
      type: 'supply',
      offer: 'hint-pack',
    });
  if (grant.continues)
    add('+' + grant.continues + (grant.continues === 1 ? ' Continue' : ' Continues'), 'continue', {
      type: 'supply',
      offer: 'continue-pack',
    });
  if (grant.shields)
    add(
      '+' + grant.shields + (grant.shields === 1 ? ' reserve shield' : ' reserve shields'),
      'shield',
      { type: 'supply', offer: 'shield-pack' },
    );
  if (grant.seasonChanges)
    add(
      '+' +
        grant.seasonChanges +
        (grant.seasonChanges === 1 ? ' Season Change' : ' Season Changes'),
      'cycle',
      { type: 'supply', offer: 'season-change-pack' },
    );

  const season = seasonUnlockedByMission(mission.id);
  if (season) {
    const icon: ExpeditionIcon = season;
    const seasonReward: Record<typeof season, string> = {
      spring: 'Spring Rain in Infinity',
      summer: 'Summer and Heat Surges in Infinity',
      autumn: 'Autumn and Leaf Gusts in Infinity',
      winter: 'Winter and Snow in Infinity',
    };
    add(seasonReward[season], icon, { type: 'season', season });
  }
  if (mission.id === 'the-first-rainbow')
    add('Rainbow weather in Infinity', 'rainbow', { type: 'weather', weather: 'rainbow' });
  if (LANDMARK_CLEARS[mission.chapter] === mission.id)
    add(CHAPTERS[mission.chapter].restored, 'lantern', {
      type: 'landmark',
      chapter: mission.chapter,
    });
  return items;
}
