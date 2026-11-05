import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeId } from './store-catalog';
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
}: {
  theme: ThemeId;
  background?: boolean;
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
        loading={background ? 'eager' : 'lazy'}
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
        ) : (
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

function CompanionSprite({
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
