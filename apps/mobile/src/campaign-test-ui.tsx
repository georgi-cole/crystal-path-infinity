import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CAMPAIGN_MISSIONS, CHAPTERS, LANDMARK_CLEARS, STYLES } from './campaign-content';
import type { BridgeSlot, StyleId } from './campaign-content';
import {
  campaignMissionSnapshot,
  campaignRunMatches,
  newMissionSnapshot,
  nextCampaignMission,
} from './campaign-test';
import type {
  CampaignApproach,
  CampaignMissionId,
  CampaignMissionSnapshot,
  CampaignProgress,
} from './campaign-test';
import { AdventureIcon, RegionArt } from './expedition-art';
import { CampaignClearCelebration } from './campaign-celebration';
import { missionRewardItems } from './campaign-reward-presentation';
import type { ThemeId } from './store-catalog';
import type { PracticeLoad } from './practice-save';
import archipelago from './assets/campaign/beacon-archipelago.png?url';
import './campaign-test-ui.css';
import './expedition.css';

const chapters = Object.keys(CHAPTERS);

export function CampaignMissionHub({
  progress,
  saved,
  onStartMission,
}: {
  progress: CampaignProgress;
  saved: PracticeLoad;
  onStartMission: (id: CampaignMissionId, approach?: CampaignApproach) => void;
}) {
  const [approach, setApproach] = useState<CampaignApproach>('main');
  const [selectedId, setSelectedId] = useState<CampaignMissionId | null>(null);
  const route = useRef<HTMLDivElement>(null);
  const swiping = useRef(false);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = nextCampaignMission(progress);
  const index = current ? CAMPAIGN_MISSIONS.indexOf(current) : CAMPAIGN_MISSIONS.length;
  const upcoming = current ? CAMPAIGN_MISSIONS[index + 1] : undefined;
  const cleared = CAMPAIGN_MISSIONS.filter((entry) => progress.cleared.includes(entry.id));
  const selected = CAMPAIGN_MISSIONS.find((entry) => entry.id === selectedId);
  const selectedIndex = selected ? CAMPAIGN_MISSIONS.indexOf(selected) : -1;
  const locked = selected?.id === upcoming?.id && !!upcoming;
  const replay = !!selected && progress.cleared.includes(selected.id);
  const running = saved.status === 'ready' && saved.state.status === 'playing';
  const pending =
    selected && saved.status === 'ready' && progress.activeMissionId === selected.id
      ? campaignMissionSnapshot(progress, selected.id)
      : null;
  const resume =
    pending &&
    saved.status === 'ready' &&
    campaignRunMatches(saved.state, pending) &&
    BigInt(saved.state.lastClearedRow) < BigInt(pending.targetRow) &&
    running;
  const mission = selected ? (resume ? pending : newMissionSnapshot(selected.id, approach)) : null;
  const focused = selected ?? current ?? CAMPAIGN_MISSIONS[CAMPAIGN_MISSIONS.length - 1];
  const chapter = focused.chapter;
  const briefChapter = mission?.chapter ?? chapter;
  const lit = progress.cleared.includes(LANDMARK_CLEARS[briefChapter]);
  const clearedCount = cleared.length;
  const chapterNumber = chapters.indexOf(chapter) + 1;
  const stops = CAMPAIGN_MISSIONS.slice(0, current ? index + 2 : CAMPAIGN_MISSIONS.length);
  const openBriefing = (id: CampaignMissionId) => {
    swiping.current = false;
    setApproach('main');
    setSelectedId(id);
  };

  useLayoutEffect(() => {
    const viewport = route.current;
    if (!viewport) return;
    const center = (animate = false) => {
      const stop = viewport.querySelector<HTMLElement>('[data-focused="true"]');
      if (!stop) return;
      swiping.current = false;
      viewport.scrollTo({
        left: stop.offsetLeft + stop.offsetWidth / 2 - viewport.clientWidth / 2,
        behavior:
          animate &&
          !viewport.closest('.cpi-reduced-motion') &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'auto',
      });
    };
    center(!!selectedId);
    let width = viewport.clientWidth;
    const resize = new ResizeObserver(() => {
      if (viewport.clientWidth === width) return;
      width = viewport.clientWidth;
      center();
    });
    resize.observe(viewport);
    return () => resize.disconnect();
  }, [focused.id, selectedId]);
  useEffect(() => () => clearTimeout(swipeTimer.current), []);

  return (
    <section
      className={'cpi-expedition cpi-beacon-route' + (mission ? ' has-briefing' : '')}
      aria-labelledby="cpi-campaign-hub-title"
    >
      <div className="cpi-expedition-map" data-complete={!current}>
        <img className="cpi-expedition-map-art" src={archipelago} alt="" draggable={false} />
        <div className="cpi-expedition-map-fog" aria-hidden="true" />
        <header className="cpi-map-heading">
          <p className="cpi-adventure-kicker">
            Campaign · Chapter {chapterNumber} of {chapters.length}
          </p>
          <h1 id="cpi-campaign-hub-title" data-menu-heading tabIndex={-1}>
            The Beacon Route
          </h1>
          <p>{CHAPTERS[chapter].name}</p>
        </header>
        <div
          className="cpi-map-crossings"
          ref={route}
          role="region"
          aria-label="Crossings. Swipe to explore or use the left and right arrow keys."
          tabIndex={0}
          onPointerDown={() => {
            swiping.current = true;
          }}
          onWheel={() => {
            swiping.current = true;
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const offset = event.key === 'ArrowLeft' ? -1 : 1;
            const stop = stops[CAMPAIGN_MISSIONS.indexOf(focused) + offset];
            if (stop) openBriefing(stop.id);
          }}
          onScroll={(event) => {
            if (!swiping.current) return;
            const viewport = event.currentTarget;
            clearTimeout(swipeTimer.current);
            swipeTimer.current = setTimeout(() => {
              if (!swiping.current) return;
              const center = viewport.scrollLeft + viewport.clientWidth / 2;
              const pins = [...viewport.querySelectorAll<HTMLElement>('.cpi-map-stop')];
              const closest = pins.reduce(
                (best, pin) =>
                  Math.abs(pin.offsetLeft + pin.offsetWidth / 2 - center) <
                  Math.abs(best.offsetLeft + best.offsetWidth / 2 - center)
                    ? pin
                    : best,
                pins[0],
              );
              const stop = stops[pins.indexOf(closest)];
              if (stop) openBriefing(stop.id);
            }, 140);
          }}
        >
          <div className="cpi-map-stops">
            {stops.map((entry, i) => {
              const completed = progress.cleared.includes(entry.id);
              const active = current?.id === entry.id;
              const next = upcoming?.id === entry.id;
              return (
                <div className="cpi-map-stop" key={entry.id} data-focused={focused.id === entry.id}>
                  <button
                    type="button"
                    className={
                      'cpi-map-pin ' +
                      (completed
                        ? 'is-cleared'
                        : active
                          ? 'is-next'
                          : next
                            ? 'is-upcoming'
                            : 'is-unexplored')
                    }
                    aria-label={
                      entry.name +
                      (completed
                        ? ' · Cleared'
                        : active
                          ? ' · Current crossing'
                          : ' · Upcoming crossing')
                    }
                    aria-pressed={selectedId === entry.id}
                    aria-current={active ? 'step' : undefined}
                    onClick={() => openBriefing(entry.id)}
                  >
                    <AdventureIcon
                      name={completed ? 'check' : active ? 'lantern' : next ? 'compass' : 'lock'}
                    />
                  </button>
                  <span className="cpi-map-stop-label">
                    {active
                      ? 'Current'
                      : next
                        ? 'Up next'
                        : 'Crossing ' + String(i + 1).padStart(2, '0')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <footer className="cpi-map-legend">
          <span>
            <AdventureIcon name="lantern" /> {clearedCount} / {CAMPAIGN_MISSIONS.length} signals lit
          </span>
          <span className="cpi-map-uncharted">
            {!current ? 'Every signal is lit' : 'Swipe to explore'}
          </span>
        </footer>
      </div>

      {mission && selected ? (
        <article className="cpi-crossing-brief" aria-labelledby="cpi-brief-title">
          <div className="cpi-brief-landscape">
            <RegionArt chapter={briefChapter} lit={lit} />
            <span className="cpi-brief-chapter">
              <AdventureIcon name={mission.season} /> {CHAPTERS[briefChapter].name}
            </span>
          </div>
          <div className="cpi-brief-content">
            <div
              className="cpi-brief-scroll"
              role="region"
              aria-label="Mission details"
              tabIndex={0}
            >
              <p className="cpi-adventure-kicker">
                Crossing {String(selectedIndex + 1).padStart(2, '0')}
                {replay ? ' · Cleared' : ''}
              </p>
              <h2 id="cpi-brief-title" aria-live="polite">
                {selected.name}
              </h2>
              <p className="cpi-brief-story">{mission.objective}</p>
              {selected.alternate && !resume && !locked && (
                <div className="cpi-field-chips" aria-label="Choose approach">
                  <button
                    type="button"
                    aria-pressed={approach === 'main'}
                    onClick={() => setApproach('main')}
                  >
                    <AdventureIcon name="squall" />
                    Squall road
                  </button>
                  <button
                    type="button"
                    aria-pressed={approach === 'ridge'}
                    onClick={() => setApproach('ridge')}
                  >
                    <AdventureIcon name="compass" />
                    Echo ridge
                  </button>
                </div>
              )}
              <div className="cpi-brief-facts">
                <div>
                  <AdventureIcon name="compass" />
                  <span>
                    <small>Landing</small>
                    <strong>Row {mission.targetRow}</strong>
                  </span>
                </div>
                {mission.minimumStability > 0 && (
                  <div>
                    <AdventureIcon name="stability" />
                    <span>
                      <small>Finish with</small>
                      <strong>{mission.minimumStability}+ Stability</strong>
                    </span>
                  </div>
                )}
              </div>
              <p className="cpi-brief-kit">
                <AdventureIcon name="pack" />
                <span>
                  Mission kit{' '}
                  <strong>
                    {mission.startingSp} Stability · {mission.startingHints} hints
                  </strong>
                </span>
              </p>
              <div className="cpi-brief-reward">
                <AdventureIcon name="hint" />
                <span>
                  <small>{replay ? 'First clear reward · collected' : 'First clear reward'}</small>
                  <strong>{mission.reward}</strong>
                </span>
              </div>
            </div>
            <div className="cpi-brief-actions">
              <button
                className="cpi-adventure-button"
                type="button"
                disabled={locked || (running && progress.activeMissionId !== mission.id)}
                onClick={() => onStartMission(mission.id, resume ? undefined : mission.approach)}
              >
                {locked
                  ? 'Clear the current crossing first'
                  : resume
                    ? running
                      ? 'Resume crossing'
                      : 'View last crossing'
                    : pending
                      ? 'Retry crossing'
                      : replay
                        ? 'Replay crossing'
                        : 'Begin crossing'}{' '}
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <small className="cpi-adventure-footnote">
              {replay
                ? 'Replay for Mastery. Rewards are earned once.'
                : 'Store supplies are saved for Infinity.'}
            </small>
          </div>
        </article>
      ) : !current ? (
        <article className="cpi-route-restored">
          <RegionArt chapter="harbour" lit />
          <div>
            <p className="cpi-adventure-kicker">Dawnkeeper</p>
            <h2>The Harbour lights are home</h2>
            <p>Every signal is lit. Revisit a crossing for Mastery.</p>
          </div>
        </article>
      ) : null}
    </section>
  );
}

export function CampaignMissionResult({
  mission,
  cleared,
  goalReached,
  firstClear,
  failureReason,
  stability,
  mastery,
  warning,
  world,
  reducedMotion,
  onContinue,
  onCelebrationComplete,
  onRetry,
  onRevive,
  onEquip,
}: {
  mission: CampaignMissionSnapshot;
  cleared: boolean;
  goalReached: boolean;
  firstClear: boolean;
  failureReason: string | null;
  stability: number;
  mastery: boolean;
  warning?: string | null;
  world: ThemeId;
  reducedMotion: boolean;
  onContinue: () => void;
  onCelebrationComplete?: () => void;
  onRetry: () => void;
  onRevive?: () => void;
  onEquip?: (slot: BridgeSlot, item: StyleId) => void;
}) {
  const [equipped, setEquipped] = useState(false);
  const result = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(
    () =>
      !cleared || reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (arrived) {
      result.current?.focus();
      if (cleared) onCelebrationComplete?.();
    }
  }, [arrived, cleared, onCelebrationComplete]);
  const routeComplete = mission.id === 'bring-the-dawn-home';
  const landmark = LANDMARK_CLEARS[mission.chapter] === mission.id;
  const style = mission.grant.style;
  const rewardItems = cleared && firstClear ? missionRewardItems(mission) : [];
  const showingResult = arrived;
  const finishCelebration = useCallback(() => setArrived(true), []);
  const name = CAMPAIGN_MISSIONS.find((entry) => entry.id === mission.id)?.name ?? mission.name;
  const story = cleared
    ? firstClear
      ? routeComplete
        ? 'Every signal on the route is lit.'
        : mission.id === 'light-the-far-gate'
          ? 'The Far Gate is open. Follow the stars to the Observatory beyond.'
          : 'Follow the next light on the map.'
      : 'You lit this signal again.'
    : (failureReason ??
      (onRevive
        ? 'Get back up on the same row and keep your progress.'
        : 'Retry this crossing and use what you learned.'));
  return (
    <main
      className="cpi-crossing-result"
      data-cleared={cleared}
      data-portal={!showingResult}
      aria-labelledby="cpi-campaign-result-title"
    >
      <RegionArt chapter={mission.chapter} lit={cleared && landmark} />
      {!showingResult ? (
        <CampaignClearCelebration
          mission={mission}
          world={world}
          portalOnly={!firstClear}
          onComplete={finishCelebration}
        />
      ) : (
        <div
          className="cpi-crossing-result-card"
          ref={result}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cpi-campaign-result-title"
          tabIndex={-1}
        >
          <span className="cpi-result-medal">
            <AdventureIcon name={cleared ? 'lantern' : 'compass'} />
          </span>
          <p className="cpi-adventure-kicker">
            {cleared
              ? landmark
                ? CHAPTERS[mission.chapter].restored
                : 'Signal lit'
              : goalReached
                ? 'Landing reached'
                : 'Crossing ended'}
          </p>
          <h1 id="cpi-campaign-result-title">{name}</h1>
          <p>{story}</p>
          {mastery && (
            <span className="cpi-result-mastery">
              <AdventureIcon name="hint" /> Mastery earned
            </span>
          )}
          <div className="cpi-result-reading">
            <span>{goalReached ? 'Stability at the landing' : 'Stability'}</span>
            <strong>
              {stability}
              {mission.minimumStability > 0 && (
                <small> / {mission.minimumStability} required</small>
              )}
            </strong>
          </div>
          {cleared && firstClear && (
            <div className="cpi-brief-reward">
              <AdventureIcon name={rewardItems[0]?.icon ?? 'hint'} />
              <span>
                <small>Reward unsealed</small>
                <strong>
                  {rewardItems.map((item) => item.label).join(' · ') || mission.reward}
                </strong>
              </span>
              {style && onEquip && (
                <button
                  className="cpi-adventure-button is-quiet"
                  type="button"
                  disabled={equipped}
                  onClick={() => {
                    onEquip(STYLES[style].slot, style);
                    setEquipped(true);
                  }}
                >
                  {equipped ? 'Equipped' : 'Equip'}
                </button>
              )}
            </div>
          )}
          {warning && <p role="alert">{warning}</p>}
          <div className="cpi-brief-actions">
            {cleared ? (
              <button className="cpi-adventure-button" type="button" onClick={onContinue}>
                {routeComplete ? 'Return to the map' : 'Reveal the next signal'}
              </button>
            ) : (
              <>
                {onRevive && (
                  <button className="cpi-adventure-button" type="button" onClick={onRevive}>
                    Use 1 continue · +{Math.ceil(mission.startingSp / 2)} Stability
                  </button>
                )}
                <button
                  className={'cpi-adventure-button' + (onRevive ? ' is-quiet' : '')}
                  type="button"
                  onClick={onRetry}
                >
                  Retry free
                </button>
                <button
                  className="cpi-adventure-button is-quiet"
                  type="button"
                  onClick={onContinue}
                >
                  Back to the map
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
