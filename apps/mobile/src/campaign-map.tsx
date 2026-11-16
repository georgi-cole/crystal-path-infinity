import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CAMPAIGN_MISSIONS, CHAPTERS, LANDMARK_CLEARS } from './campaign-content';
import type { CampaignMission, CampaignMissionId } from './campaign-content';
import { AdventureIcon, RegionArt } from './expedition-art';
import {
  ATLAS_SIZE,
  ATLAS_ZOOM,
  CROSSING_LOCATIONS,
  boundMapCamera,
  crossingPath,
  zoomMapAt,
} from './campaign-map-layout';
import type { MapCamera } from './campaign-map-layout';
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
  const cameraRef = useRef<MapCamera>({ x: 0, y: 0, zoom: ATLAS_ZOOM.initial });
  const [camera, setCamera] = useState<MapCamera>({ x: 0, y: 0, zoom: ATLAS_ZOOM.initial });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const moveCamera = useCallback((next: MapCamera) => {
    const element = viewport.current;
    if (!element) return;
    cameraRef.current = boundMapCamera(next, element.clientWidth, element.clientHeight);
    setCamera(cameraRef.current);
  }, []);
  const center = useCallback(
    (id: CampaignMissionId, resetZoom = false) => {
      const element = viewport.current;
      if (!element) return;
      const [x, y] = CROSSING_LOCATIONS[CAMPAIGN_MISSIONS.findIndex((entry) => entry.id === id)];
      const zoom = resetZoom ? ATLAS_ZOOM.initial : cameraRef.current.zoom;
      moveCamera({
        x: element.clientWidth / 2 - x * zoom,
        y: element.clientHeight / 2 - y * zoom,
        zoom,
      });
    },
    [moveCamera],
  );
  useLayoutEffect(() => {
    center(focused.id);
    const observer = new ResizeObserver(() => center(focused.id));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [focused.id, center]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const previous = cameraRef.current;
      const rect = element.getBoundingClientRect();
      moveCamera(
        event.ctrlKey || event.metaKey
          ? zoomMapAt(
              previous,
              previous.zoom * Math.exp(-event.deltaY * 0.008),
              event.clientX - rect.left,
              event.clientY - rect.top,
            )
          : { ...previous, x: previous.x - event.deltaX, y: previous.y - event.deltaY },
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [moveCamera]);
  const zoom = (delta: number) => {
    const element = viewport.current;
    if (element)
      moveCamera(
        zoomMapAt(
          cameraRef.current,
          cameraRef.current.zoom + delta,
          element.clientWidth / 2,
          element.clientHeight / 2,
        ),
      );
  };
  return (
    <div className="cpi-atlas">
      <div
        className="cpi-atlas-viewport"
        ref={viewport}
        role="region"
        aria-label="Campaign map. Drag to explore, pinch or use the zoom controls. Arrow keys select crossings."
        tabIndex={0}
        data-dragging={dragging}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          if (!pointers.current.size) dragged.current = false;
          else dragged.current = true;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }}
        onPointerMove={(event) => {
          const old = pointers.current.get(event.pointerId);
          if (!old) return;
          const next = { x: event.clientX, y: event.clientY };
          const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
          if (!dragged.current && !other && Math.hypot(next.x - old.x, next.y - old.y) < 5) return;
          dragged.current = true;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          const previous = cameraRef.current;
          if (other) {
            const distance = Math.hypot(old.x - other.x, old.y - other.y);
            const rect = event.currentTarget.getBoundingClientRect();
            const middleX = (old.x + other.x) / 2 - rect.left;
            const middleY = (old.y + other.y) / 2 - rect.top;
            const updated = zoomMapAt(
              previous,
              (previous.zoom * Math.hypot(next.x - other.x, next.y - other.y)) /
                Math.max(1, distance),
              middleX,
              middleY,
            );
            moveCamera({
              ...updated,
              x: updated.x + (next.x - old.x) / 2,
              y: updated.y + (next.y - old.y) / 2,
            });
          } else
            moveCamera({
              ...previous,
              x: previous.x + next.x - old.x,
              y: previous.y + next.y - old.y,
            });
          pointers.current.set(event.pointerId, next);
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (!pointers.current.size) setDragging(false);
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          if (!pointers.current.size) setDragging(false);
        }}
        onLostPointerCapture={(event) => pointers.current.delete(event.pointerId)}
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
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoom(0.15);
          } else if (event.key === '-') {
            event.preventDefault();
            zoom(-0.15);
          } else if (event.key === 'Home') {
            event.preventDefault();
            center((current ?? focused).id, true);
          }
        }}
      >
        <div
          className="cpi-atlas-world"
          style={{
            width: ATLAS_SIZE.width,
            height: ATLAS_SIZE.height,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
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
                    'cpi-map-pin ' + (complete ? 'is-cleared' : active ? 'is-next' : 'is-upcoming')
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
      <div className="cpi-atlas-controls" role="group" aria-label="Map controls">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={camera.zoom <= ATLAS_ZOOM.min}
          onClick={() => zoom(-0.15)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={camera.zoom >= ATLAS_ZOOM.max}
          onClick={() => zoom(0.15)}
        >
          +
        </button>
        <button
          type="button"
          aria-label={expanded ? 'Show crossing details' : 'Expand map'}
          title={expanded ? 'Show crossing details' : 'Expand map'}
          onClick={onToggleExpanded}
        >
          <AdventureIcon name="world" />
        </button>
        <button
          type="button"
          className="cpi-atlas-locate"
          onClick={() => {
            center((current ?? focused).id, true);
            onSelect((current ?? focused).id);
          }}
        >
          <AdventureIcon name="compass" />
          Current crossing
        </button>
      </div>
    </div>
  );
}
