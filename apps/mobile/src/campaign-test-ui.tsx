import { useCallback, useEffect, useRef, useState } from 'react';
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
import { CampaignMap } from './campaign-map';
import { campaignTasks, campaignMissedObjective } from './campaign-objectives';
import { CampaignObjectives } from './campaign-objectives-view';
import './campaign-test-ui.css';
import './expedition.css';
import './campaign-map.css';

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
  const [mapExpanded, setMapExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<CampaignMissionId | null>(null);
  const current = nextCampaignMission(progress);
  const index = current ? CAMPAIGN_MISSIONS.indexOf(current) : CAMPAIGN_MISSIONS.length;
  const upcoming = current ? CAMPAIGN_MISSIONS[index + 1] : undefined;
  const cleared = CAMPAIGN_MISSIONS.filter((entry) => progress.cleared.includes(entry.id));
  const selected = CAMPAIGN_MISSIONS.find((entry) => entry.id === selectedId);
  const selectedIndex = selected ? CAMPAIGN_MISSIONS.indexOf(selected) : -1;
  const locked = selected?.id === upcoming?.id && !!upcoming;
  const replay = !!selected && progress.cleared.includes(selected.id);
  const running =
    saved.status === 'ready' &&
    saved.state.status === 'playing' &&
    (!progress.activeMissionSnapshot ||
      !campaignMissedObjective(progress.activeMissionSnapshot, progress, saved.state.currentRow));
  const pending =
    selected && saved.status === 'ready' && progress.activeMissionId === selected.id
      ? campaignMissionSnapshot(progress, selected.id)
      : null;
  const resume =
    pending &&
    saved.status === 'ready' &&
    campaignRunMatches(saved.state, pending) &&
    BigInt(saved.state.lastClearedRow) < BigInt(pending.targetRow) &&
    running &&
    !campaignMissedObjective(pending, progress, saved.state.currentRow);
  const mission = selected ? (resume ? pending : newMissionSnapshot(selected.id, approach)) : null;
  const focused = selected ?? current ?? CAMPAIGN_MISSIONS[CAMPAIGN_MISSIONS.length - 1];
  const chapter = focused.chapter;
  const briefChapter = mission?.chapter ?? chapter;
  const lit = progress.cleared.includes(LANDMARK_CLEARS[briefChapter]);
  const clearedCount = cleared.length;
  const chapterNumber = chapters.indexOf(chapter) + 1;
  const stops = CAMPAIGN_MISSIONS.slice(0, current ? index + 2 : CAMPAIGN_MISSIONS.length);
  const openBriefing = (id: CampaignMissionId) => {
    setApproach('main');
    setMapExpanded(false);
    setSelectedId(id);
  };

  return (
    <section
      className={
        'cpi-expedition cpi-beacon-route' + (mission && !mapExpanded ? ' has-briefing' : '')
      }
      aria-labelledby="cpi-campaign-hub-title"
    >
      <div className="cpi-expedition-map" data-complete={!current}>
        <CampaignMap
          stops={stops}
          focused={focused}
          current={current}
          upcoming={upcoming}
          cleared={progress.cleared}
          onSelect={openBriefing}
          expanded={mapExpanded}
          onToggleExpanded={() => {
            if (!selectedId) setSelectedId(focused.id);
            setMapExpanded((value) => !value);
          }}
        />
        <header className="cpi-map-heading">
          <p className="cpi-adventure-kicker">
            Campaign · Chapter {chapterNumber} of {chapters.length}
          </p>
          <h1 id="cpi-campaign-hub-title" data-menu-heading tabIndex={-1}>
            The Beacon Route
          </h1>
          <p>{CHAPTERS[chapter].name}</p>
        </header>
        <footer className="cpi-map-legend">
          <span>
            <AdventureIcon name="lantern" /> {clearedCount} / {CAMPAIGN_MISSIONS.length} signals lit
          </span>
          <span className="cpi-map-uncharted">
            {!current ? 'Every signal is lit' : 'Swipe to explore'}
          </span>
        </footer>
      </div>

      {mission && selected && !mapExpanded ? (
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
              <CampaignObjectives
                targetRow={mission.targetRow}
                minimumStability={mission.minimumStability}
                tasks={campaignTasks(
                  mission,
                  resume
                    ? progress
                    : {
                        ...progress,
                        hintRows: [],
                        mysteryRows: [],
                        cleanRows: [],
                        shieldRows: [],
                        followedHint: false,
                        soldHint: false,
                        shieldWorked: false,
                      },
                  resume && saved.status === 'ready' ? saved.state.currentRow : '1',
                )}
              />
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
          data-reduced-motion={reducedMotion}
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
