import type { CSSProperties } from 'react';
import type { RewardArtwork } from './campaign-reward-presentation';
import { STYLE_REWARD_CELLS } from './campaign-reward-art-model';
import { RegionArt } from './expedition-art';
import torches from './assets/campaign/keeper-torches-reward-v1.webp';

const SEASON_CELLS = { spring: '0% 0%', summer: '100% 0%', autumn: '0% 100%', winter: '100% 100%' };

export function CampaignRewardArt({ art }: { art: RewardArtwork }) {
  if (art.type === 'supply') return <span className="cpi-supply-artwork" data-offer={art.offer} />;
  if (art.type === 'style' && art.id === 'torches') return <img src={torches} alt="" />;
  if (art.type === 'style') {
    const cell = STYLE_REWARD_CELLS[art.id];
    if (!cell) throw new Error('Campaign style has no reward artwork: ' + art.id);
    return (
      <span
        className="cpi-reward-cosmetic-art"
        style={{ '--reward-cell': cell } as CSSProperties}
      />
    );
  }
  if (art.type === 'season' || art.type === 'weather')
    return (
      <span
        className="cpi-reward-season-art"
        data-rainbow={art.type === 'weather'}
        style={
          {
            '--reward-cell': SEASON_CELLS[art.type === 'season' ? art.season : 'spring'],
          } as CSSProperties
        }
      />
    );
  if (art.chapter === 'gate')
    return (
      <span
        className="cpi-reward-cosmetic-art"
        style={{ '--reward-cell': '50% 100%' } as CSSProperties}
      />
    );
  return (
    <span className="cpi-reward-landmark-art">
      <RegionArt chapter={art.chapter} lit />
    </span>
  );
}
