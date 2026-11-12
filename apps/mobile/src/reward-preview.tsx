import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CAMPAIGN_MISSIONS, CHAPTERS, LANDMARK_CLEARS } from './campaign-content';
import { newMissionSnapshot } from './campaign-test';
import { CampaignClearCelebration, CLEAR_FILM_MS } from './campaign-celebration';
import { RegionArt } from './expedition-art';
import { THEME_IDS, THEMES } from './store-catalog';
import './styles.css';
import './brand-tokens.css';
import './theme-worlds.css';
import './expedition.css';
import './reward-preview.css';
export function ScreeningRoom() {
  const [index, setIndex] = useState(0);
  const [worldIndex, setWorldIndex] = useState(0);
  const world = THEME_IDS[worldIndex];
  const [take, setTake] = useState(0);
  const [paused, setPaused] = useState(false);
  const [seek, setSeek] = useState<number | null>(null);
  const container = useRef<HTMLElement>(null);
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const animation = container.current
        ?.querySelector('.cpi-clear-film')
        ?.getAnimations({ subtree: true })[0];
      if (animation) setPosition(Math.min(CLEAR_FILM_MS, Number(animation.currentTime ?? 0)));
    }, 100);
    return () => window.clearInterval(timer);
  }, [index, take]);
  const mission = newMissionSnapshot(CAMPAIGN_MISSIONS[index].id);
  const chapterEntries = Object.entries(CHAPTERS);
  const chapterNames = ['Coast', 'Mill', 'Cliffs', 'Frostbank', 'Gate', 'Stars', 'Harbour'];
  const replay = () => {
    setSeek(null);
    setPaused(false);
    setTake((value) => value + 1);
  };
  const select = (next: number) => {
    setIndex(next);
    replay();
  };
  return (
    <main className="cpi-screening-room" ref={container}>
      <header>
        <span>CRYSTAL PATH · SCREENING ROOM</span>
        <p>
          30 missions · No progress saved ·{' '}
          <button
            className="cpi-screening-character"
            onClick={() => {
              setWorldIndex((value) => (value + 1) % THEME_IDS.length);
              replay();
            }}
          >
            Character: {THEMES[world].title} ↻
          </button>
        </p>
      </header>
      <nav className="cpi-screening-chapters" aria-label="Campaign chapters">
        {chapterEntries.map(([id, chapter], i) => (
          <button
            key={id}
            title={chapter.name}
            aria-pressed={id === mission.chapter}
            onClick={() => select(CAMPAIGN_MISSIONS.findIndex((entry) => entry.chapter === id))}
          >
            {chapterNames[i]}
          </button>
        ))}
      </nav>
      <nav aria-label="Mission animations">
        {CAMPAIGN_MISSIONS.map(
          (entry, i) =>
            entry.chapter === mission.chapter && (
              <button key={entry.id} aria-pressed={i === index} onClick={() => select(i)}>
                <small>{String(i + 1).padStart(2, '0')}</small>
                <span>{entry.name}</span>
              </button>
            ),
        )}
      </nav>
      <section className="cpi-screening-stage" aria-label="Mission reward preview">
        <RegionArt
          chapter={mission.chapter}
          lit={mission.id === LANDMARK_CLEARS[mission.chapter]}
        />
        <div className="cpi-screening-veil" />
        <CampaignClearCelebration
          key={index + '-' + take}
          mission={mission}
          world={world}
          paused={paused}
          seekMs={seek}
        />
      </section>
      <footer>
        <div className="cpi-screening-playback">
          <button onClick={replay}>↻ Replay</button>
          <button
            onClick={() => {
              setSeek(null);
              setPaused((value) => !value);
            }}
          >
            {paused ? '▶ Play' : 'Ⅱ Pause'}
          </button>
          <button onClick={() => select((index + 1) % CAMPAIGN_MISSIONS.length)}>
            Next crossing →
          </button>
        </div>
        <div className="cpi-screening-cues" aria-label="Jump to scene">
          {[
            ['Reveal', 1500],
            ['Hold reward', 2600],
            ['Collect', 4000],
            ['Saved', 4800],
            ['Vortex', 5700],
            ['Escape', 6400],
          ].map(([name, time]) => (
            <button
              key={name}
              onClick={() => {
                setPaused(true);
                setSeek(Number(time));
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="cpi-screening-scrub">
          Scrub the scene
          <input
            aria-label="Animation position"
            type="range"
            min="0"
            max={CLEAR_FILM_MS}
            step="20"
            value={position}
            onChange={(event) => {
              setPaused(true);
              setSeek(Number(event.target.value));
            }}
          />
        </label>
      </footer>
    </main>
  );
}
if (import.meta.env.MODE === 'campaign-qa' || import.meta.env.MODE === 'development') {
  createRoot(document.getElementById('root')!).render(<ScreeningRoom />);
} else {
  document.body.textContent = 'The screening room is available in a local preview build.';
}
