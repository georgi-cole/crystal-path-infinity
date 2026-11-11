import type { Season } from '@crystal-path-infinity/game-core';
import type { Chapter } from './campaign-content';
import type { CampaignProgress } from './campaign-test';
import { unlockedSeasons } from './campaign-test';
import { AdventureIcon, RegionArt } from './expedition-art';
import type { ExpeditionIcon } from './expedition-art';
import { INFINITY_WEATHER_NAMES } from './journey-copy';
import './expedition.css';

const weatherBooks = {
  spring: {
    icon: 'spring',
    region: 'mill',
    note: 'Rain makes tiles break more often. A rainbow can show a safe path.',
  },
  summer: {
    icon: 'summer',
    region: 'tower',
    note: 'Rain weakens tiles. Strong sunlight can show the wrong tile.',
  },
  autumn: {
    icon: 'autumn',
    region: 'gate',
    note: 'Follow the marked tile in wind. More tiles break in thunderstorms.',
  },
  winter: {
    icon: 'winter',
    region: 'frostbank',
    note: 'Snow makes tiles stronger. Melting ice makes them weaker.',
  },
} as const satisfies Record<Season, { icon: ExpeditionIcon; region: Chapter; note: string }>;

export function InfinityWeather({ progress }: { progress: CampaignProgress }) {
  const unlocked = unlockedSeasons(progress);
  const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
  return (
    <section className="cpi-expedition cpi-skybook" aria-labelledby="cpi-skybook-title">
      <header className="cpi-skybook-hero">
        <RegionArt chapter="lighthouse" />
        <div className="cpi-skybook-copy">
          <p className="cpi-adventure-kicker">Field notes</p>
          <h1 id="cpi-skybook-title" data-menu-heading tabIndex={-1}>
            Weather &amp; Seasons
          </h1>
          <p>Signs to watch for on the bridge.</p>
        </div>
      </header>
      <div className="cpi-skybook-picks" aria-label="Discoverable seasons">
        {seasons.map((mode) => {
          const option = weatherBooks[mode];
          const locked = !unlocked.includes(mode);
          return (
            <article key={mode} data-locked={locked} data-sky={mode}>
              <RegionArt chapter={option.region} />
              <span className="cpi-sky-option-icon">
                <AdventureIcon name={option.icon} />
              </span>
              <span className="cpi-sky-option-copy">
                <strong>{INFINITY_WEATHER_NAMES[mode]}</strong>
                <span>
                  {mode === 'spring' && progress.cleared.includes('the-first-rainbow')
                    ? 'Rain makes tiles break more often. A rainbow shows a safe path.'
                    : option.note}
                </span>
                {locked && <small>Discover in Campaign</small>}
              </span>
              {locked ? (
                <AdventureIcon className="cpi-sky-option-state" name="lock" />
              ) : (
                <AdventureIcon className="cpi-sky-option-state" name="check" />
              )}
            </article>
          );
        })}
      </div>
      {unlocked.length < seasons.length && (
        <div className="cpi-skybook-unlocks">
          <p>Light signals in Campaign to discover more seasons.</p>
        </div>
      )}
    </section>
  );
}
