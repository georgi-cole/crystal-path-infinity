import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeId, WorldId } from './store-catalog';
import { getGameplayLifecycle } from './gameplay-lifecycle';
import { WORLD_ASSETS, worldAsset } from './world-assets';

function subscribeMotion(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  const unsubscribe = getGameplayLifecycle().subscribe(listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
    unsubscribe();
  };
}
function motionSuspended() {
  return document.hidden || getGameplayLifecycle().getSnapshot()?.active === false;
}
const serverSuspended = () => true;

/** Fixed decorative slots never read a route, a game clock, or gameplay RNG. */
const MOTES = Array.from({ length: 12 }, (_, i) => ({
  x: i < 6 ? 4 + i * 3 : 81 + (i - 6) * 3,
  y: 17 + ((i * 19) % 72),
  delay: `${-i * 1.7}s`,
  duration: `${15 + (i % 4) * 4}s`,
}));

/** Composited world art: the central focus veil always sits below the live bridge. */
export function ThemeArtwork({
  theme,
  background = false,
  priority = false,
}: {
  theme: ThemeId;
  background?: boolean;
  priority?: boolean;
}) {
  const suspended = useSyncExternalStore(subscribeMotion, motionSuspended, serverSuspended);
  if (theme === 'obsidian') return null;
  const assets = WORLD_ASSETS[theme];
  return (
    <div
      className={
        'cpi-world-art world-' +
        theme +
        (background ? ' is-backdrop' : ' is-poster') +
        (suspended ? ' is-still' : '')
      }
      aria-hidden="true"
    >
      <img
        className="cpi-world-plate"
        src={worldAsset(assets.environment)}
        alt=""
        width="1024"
        height="1536"
        decoding="async"
        loading="eager"
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
      />
      <svg className="cpi-world-near" viewBox="0 0 720 1080" preserveAspectRatio="xMidYMid slice">
        {theme === 'chaos' ? (
          <g fill="none" stroke="#dba15b">
            {[
              [-38, 760, 107],
              [758, 430, 82],
            ].map(([x, y, r]) => (
              <g key={x} className="cpi-world-cog" style={{ transformOrigin: `${x}px ${y}px` }}>
                <circle cx={x} cy={y} r={r} strokeWidth="16" strokeDasharray="11 12" />
                <circle cx={x} cy={y} r={r - 28} strokeWidth="3" />
                <path
                  d={`M${x - r + 28} ${y}h${2 * (r - 28)}m${-(r - 28)} ${-(r - 28)}v${2 * (r - 28)}`}
                  strokeWidth="7"
                />
              </g>
            ))}
            <path
              className="cpi-world-steam"
              d="M38 950c53-60-34-78 6-136s-15-71 18-123M685 645c-45-52 28-81-8-130s15-73-14-115"
              stroke="#b4e8d8"
              strokeWidth="18"
              strokeLinecap="round"
            />
          </g>
        ) : theme === 'jelly' ? (
          <g fill="none" stroke="#b8e9ff">
            {[36, 692].map((x) => (
              <g className="cpi-world-tendrils" key={x}>
                <path d={`M${x} 1100q-27-83 0-151t0-153q-41-67 0-119`} strokeWidth="2" />
                <path d={`M${x + 14} 1100q35-113 0-203t0-177`} strokeWidth="1" />
                <ellipse cx={x} cy="696" rx="29" ry="17" fill="#dcabf7" fillOpacity=".15" />
                <circle cx={x + 18} cy="843" r="10" fill="#acebff" fillOpacity=".1" />
              </g>
            ))}
          </g>
        ) : (
          <WorldEdgeDetails theme={theme} />
        )}
      </svg>
      <div className="cpi-world-haze" />
      {MOTES.map((mote, i) => (
        <i
          className="cpi-world-mote"
          key={i}
          style={{
            left: `${mote.x}%`,
            top: `${mote.y}%`,
            animationDelay: mote.delay,
            animationDuration: mote.duration,
          }}
        />
      ))}
      <div className="cpi-world-focus-veil" />
      {!background && (
        <div className="cpi-world-poster-companion">
          <CompanionSprite theme={theme} reaction="calm" />
        </div>
      )}
    </div>
  );
}

function WorldEdgeDetails({ theme }: { theme: Exclude<WorldId, 'chaos' | 'jelly'> }) {
  return (
    <g className="cpi-world-edge-details" fill="none" stroke="currentColor">
      {theme === 'wilds' ? (
        <>
          <g className="cpi-world-tendrils">
            <path d="m-22 638 62-49 38 43-19 68-58 15-23-77Zm9 10 50-36 17 25-14 42-37 6-16-37Z" />
            <path d="m655 274 49-50 40 47-9 59-46 23-34-79Z" />
            <path d="m24 804 15-31 14 31-14 23-15-23Z" fill="currentColor" fillOpacity=".18" />
          </g>
          <path d="M17 1080 41 891l-21-42m21 42 21-36M707 972l-26-145 22-31" />
        </>
      ) : theme === 'league' ? (
        <>
          <g className="cpi-world-speed-flags">
            <path
              d="m-13 437 90-63-17 49-73 42m-5 11 64-37-14 40-50 26M666 751l70-42-15 45-64 37"
              fill="currentColor"
              fillOpacity=".16"
            />
            <path d="m7 547 37-21m-44 40 37-21m638-334 37-21m-44 40 37-21" strokeWidth="3" />
          </g>
        </>
      ) : theme === 'puppy' ? (
        <>
          <g className="cpi-world-tendrils">
            <path d="M12 268q20 27 65 32m-60-28-5 53 18 10 14-10-4-38m1 1 4 47 17 8 12-12-5-33" />
            <path d="m673 732 27 16 34-10m-55-2-5 45 17 8 15-12-4-27" />
          </g>
          <path d="M-5 924h62l-12-36H8m-1-14h39m642-441h32v31h-32z" strokeWidth="2" />
        </>
      ) : (
        <>
          <g className="cpi-world-tendrils">
            <path d="M31 336v130m15-21c-32-8-40 38-11 45-15-16-8-34 11-45ZM693 760V589m11-17c-25-5-32 30-9 36-12-14-6-26 9-36Z" />
            <path d="m16 554 18 9 17-9m629 249 13 8 14-8" />
          </g>
          <path d="m-10 736 46-38 42 15-25 31M650 934l30-20 53 26" />
        </>
      )}
    </g>
  );
}

export function CompanionSprite({
  theme,
  reaction,
}: {
  theme: Exclude<ThemeId, 'obsidian'>;
  reaction: 'calm' | 'happy' | 'panic';
}) {
  return (
    <span
      className={'cpi-companion-sprite is-' + reaction}
      style={
        {
          '--companion-sheet': `url("${worldAsset(WORLD_ASSETS[theme].companion)}")`,
        } as CSSProperties
      }
    />
  );
}

export function ThemeCompanion({
  theme,
  reaction,
}: {
  theme: ThemeId;
  reaction: 'calm' | 'happy' | 'panic';
}) {
  const suspended = useSyncExternalStore(subscribeMotion, motionSuspended, serverSuspended);
  if (theme === 'obsidian') return null;
  return (
    <div
      className={'cpi-theme-companion is-' + reaction + (suspended ? ' is-still' : '')}
      aria-hidden="true"
    >
      <CompanionSprite theme={theme} reaction={reaction} />
    </div>
  );
}
