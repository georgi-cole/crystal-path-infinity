import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { CAMPAIGN_MISSIONS, CHAPTERS, LANDMARK_CLEARS } from './campaign-content';
import type { CampaignMission, CampaignMissionId } from './campaign-content';
import { AdventureIcon, RegionArt } from './expedition-art';
import {
  ATLAS_SIZE,
  ATLAS_SCALE,
  CROSSING_LOCATIONS,
  crossingPath,
  crossingScrollTarget,
} from './campaign-map-layout';
import archipelago from './assets/campaign/beacon-archipelago.png?url';

export function CampaignMap({
  stops,
  focused,
  current,
  upcoming,
  cleared,
  onSelect,
  expanded,
  onToggleExpanded,
}: {
  stops: readonly CampaignMission[];
  focused: CampaignMission;
  current?: CampaignMission | null;
  upcoming?: CampaignMission;
  cleared: readonly CampaignMissionId[];
  onSelect: (id: CampaignMissionId) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragged = useRef(false);
  const center = useCallback((id: CampaignMissionId) => {
    const element = viewport.current;
    if (!element) return;
    const index = CAMPAIGN_MISSIONS.findIndex((entry) => entry.id === id);
    const target = crossingScrollTarget(index, element.clientWidth, element.clientHeight);
    element.scrollTo({ ...target, behavior: 'instant' });
  }, []);
  useLayoutEffect(() => {
    center(focused.id);
    const observer = new ResizeObserver(() => center(focused.id));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [focused.id, center]);
  useEffect(() => {
    const release = () => {
      mouse.current = null;
      viewport.current?.removeAttribute('data-dragging');
    };
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('blur', release);
    };
  }, []);
  return (
    <div className="cpi-atlas">
      <div
        className="cpi-atlas-viewport"
        ref={viewport}
        role="region"
        aria-label="Campaign map. Swipe to explore. Arrow keys select crossings; Home finds your current crossing."
        tabIndex={0}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          dragged.current = false;
          mouse.current = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
        }}
        onMouseMove={(event) => {
          const start = mouse.current;
          if (!start || !(event.buttons & 1)) return;
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y;
          if (!dragged.current && Math.hypot(dx, dy) < 5) return;
          dragged.current = true;
          event.currentTarget.dataset.dragging = 'true';
          event.currentTarget.scrollTo({ left: start.left - dx, top: start.top - dy });
        }}
        onMouseLeave={() => {
          mouse.current = null;
          viewport.current?.removeAttribute('data-dragging');
        }}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (dragged.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const index =
              CAMPAIGN_MISSIONS.indexOf(focused) +
              (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1);
            if (stops[index]) onSelect(stops[index].id);
          } else if (event.key === 'Home') {
            event.preventDefault();
            center((current ?? focused).id);
          }
        }}
      >
        <div
          className="cpi-atlas-scroll-space"
          style={{ width: ATLAS_SIZE.width * ATLAS_SCALE, height: ATLAS_SIZE.height * ATLAS_SCALE }}
        >
          <div
            className="cpi-atlas-world"
            style={{
              width: ATLAS_SIZE.width,
              height: ATLAS_SIZE.height,
              transform: `scale(${ATLAS_SCALE})`,
            }}
          >
            <img className="cpi-atlas-sea" src={archipelago} draggable={false} alt="" />
            {Object.entries(CHAPTERS).map(([chapter, details]) => {
              const entries = stops.filter((entry) => entry.chapter === chapter);
              if (!entries.length) return null;
              const landmark = CAMPAIGN_MISSIONS.findIndex(
                (entry) => entry.id === LANDMARK_CLEARS[entries[0].chapter],
              );
              const [x, y] = CROSSING_LOCATIONS[landmark];
              return (
                <div
                  key={chapter}
                  className="cpi-atlas-island"
                  style={{ left: x - 145, top: y - 170 }}
                >
                  <RegionArt
                    chapter={entries[0].chapter}
                    lit={cleared.includes(LANDMARK_CLEARS[entries[0].chapter])}
                  />
                  <span>{details.name}</span>
                </div>
              );
            })}
            <svg
              className="cpi-atlas-paths"
              viewBox={`0 0 ${ATLAS_SIZE.width} ${ATLAS_SIZE.height}`}
              aria-hidden="true"
            >
              {stops.slice(0, -1).map((entry, i) => (
                <g key={entry.id} data-lit={cleared.includes(entry.id)}>
                  <path className="cpi-atlas-path-bed" d={crossingPath(i)} />
                  <path className="cpi-atlas-path" d={crossingPath(i)} />
                </g>
              ))}
            </svg>
            {stops.map((entry, i) => {
              const complete = cleared.includes(entry.id);
              const active = current?.id === entry.id;
              const next = upcoming?.id === entry.id;
              const [x, y] = CROSSING_LOCATIONS[i];
              return (
                <div
                  className="cpi-atlas-stop"
                  key={entry.id}
                  data-focused={focused.id === entry.id}
                  style={{ left: x, top: y }}
                >
                  <button
                    type="button"
                    className={
                      'cpi-map-pin ' +
                      (complete ? 'is-cleared' : active ? 'is-next' : 'is-upcoming')
                    }
                    aria-label={
                      entry.name +
                      (complete
                        ? ' · Cleared'
                        : active
                          ? ' · Current crossing'
                          : ' · Upcoming crossing')
                    }
                    aria-pressed={focused.id === entry.id}
                    aria-current={active ? 'step' : undefined}
                    onClick={() => onSelect(entry.id)}
                  >
                    <AdventureIcon name={complete ? 'check' : active ? 'lantern' : 'compass'} />
                  </button>
                  <span>
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
      </div>
      <div className="cpi-atlas-controls" role="group" aria-label="Map controls">
        <button
          type="button"
          aria-label={expanded ? 'Show crossing details' : 'Expand map'}
          title={expanded ? 'Show crossing details' : 'Expand map'}
          onClick={onToggleExpanded}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path
              d={
                expanded
                  ? 'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6'
                  : 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6'
              }
            />
          </svg>
        </button>
        <button
          type="button"
          className="cpi-atlas-locate"
          aria-label="Find current crossing"
          title="Find current crossing"
          onClick={() => {
            center((current ?? focused).id);
            onSelect((current ?? focused).id);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="6.5" />
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
