import { useId } from 'react';
import type { ReactNode } from 'react';
import type { BridgeModel, Chapter } from './campaign-content';
import observatoryArt from './assets/campaign/starfall-observatory.webp?url';
import harbourArt from './assets/campaign/cloudrest-harbour.webp?url';
import playfulAtlas from './assets/campaign/playful-material-atlas.webp?url';
import materialAtlas from './assets/campaign/bridge-material-atlas.webp?url';
import chapterAtlas from './assets/campaign/chapter-atlas.png?url';

const glyphs = {
  compass: (
    <>
      <circle cx="24" cy="24" r="17" />
      <path d="m30 16-4 12-12 4 4-12Z" fill="currentColor" fillOpacity=".28" />
      <path d="M24 3v4m0 34v4M3 24h4m34 0h4" />
    </>
  ),
  lock: (
    <>
      <path d="M16 21v-5a8 8 0 1 1 16 0v5" />
      <rect x="11" y="21" width="26" height="19" rx="5" fill="currentColor" fillOpacity=".19" />
      <path d="M24 28v5" />
    </>
  ),
  lantern: (
    <>
      <path d="m11 16 13-10 13 10M16 16l-3 23h22l-3-23M12 16h24M11 39h26" />
      <path
        d="M24 21c1 5 5 6 5 11a5 5 0 0 1-10 0c0-3 3-7 5-11Z"
        fill="currentColor"
        fillOpacity=".5"
      />
    </>
  ),
  world: (
    <>
      <circle cx="24" cy="24" r="17" />
      <ellipse cx="24" cy="24" rx="8" ry="17" />
      <path d="M7 24h34M11 14h26M11 34h26" />
    </>
  ),
  bridge: (
    <>
      <path d="M5 36h38M8 34V15m32 19V15M8 20q16 17 32 0M15 26v10m9-7v7m9-10v10" />
      <path d="M5 15h6m26 0h6" strokeWidth="3" />
    </>
  ),
  pack: (
    <>
      <path d="M15 17v-4a9 9 0 0 1 18 0v4" />
      <rect x="9" y="15" width="30" height="27" rx="6" fill="currentColor" fillOpacity=".18" />
      <path d="M9 25q15 6 30 0m-20 4h10v6H19z" />
    </>
  ),
  clear: (
    <>
      <circle cx="24" cy="24" r="9" fill="currentColor" fillOpacity=".19" />
      <path d="M24 4v6m0 28v6M4 24h6m28 0h6M9 9l5 5m20 20 5 5M9 39l5-5m20-20 5-5" />
    </>
  ),
  spring: (
    <>
      <path d="M24 40V23m0 11c-11 1-15-4-16-11 8-1 14 2 16 11Zm0-5c8 0 13-4 14-12-9 0-13 5-14 12Z" />
      <path
        d="M24 24c-9-1-12-9-6-14 4-3 9-1 10 2 5-2 9 3 6 8-2 3-6 5-10 4Z"
        fill="currentColor"
        fillOpacity=".23"
      />
    </>
  ),
  summer: (
    <>
      <circle cx="24" cy="23" r="10" fill="currentColor" fillOpacity=".26" />
      <path d="M24 4v5m0 28v5M5 23h5m28 0h5M10 9l4 4m20 20 4 4m0-28-4 4M14 33l-4 4" />
    </>
  ),
  autumn: (
    <>
      <path
        d="M11 36c1-20 8-26 26-27-1 19-7 26-23 27m-6 6 20-20m-9 9-1-9m6 4 7-1"
        fill="currentColor"
        fillOpacity=".16"
      />
    </>
  ),
  winter: (
    <>
      <path d="M24 5v38M8 14l32 20M8 34l32-20m-22-3 6 6 6-6m-12 26 6-6 6 6M10 21l8-2-2-8m16 26-2-8 8-2M10 27l8 2-2 8m16-26-2 8 8 2" />
    </>
  ),
  cycle: (
    <>
      <path d="M10 18a15 15 0 0 1 26-3l4 4m-9 0h9v-9M38 30a15 15 0 0 1-26 3l-4-4m9 0H8v9" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
    </>
  ),
  rain: (
    <>
      <path
        d="M13 30a7 7 0 0 1-1-14 12 12 0 0 1 22-2 8 8 0 0 1 1 16Z"
        fill="currentColor"
        fillOpacity=".2"
      />
      <path d="m15 36-3 6m13-6-3 6m13-6-3 6" />
    </>
  ),
  shower: (
    <>
      <path
        d="M16 15a8 8 0 0 1 14-4m-8-7v4M8 13l4 2m16-11-2 4M13 30a7 7 0 0 1-1-14 12 12 0 0 1 22-2 8 8 0 0 1 1 16Z"
        fill="currentColor"
        fillOpacity=".16"
      />
      <path d="m15 36-3 6m13-6-3 6m13-6-3 6" />
    </>
  ),
  rainbow: (
    <>
      <path d="M7 36a17 17 0 0 1 34 0m-29 0a12 12 0 0 1 24 0m-19 0a7 7 0 0 1 14 0" />
      <path d="M8 41h32" opacity=".55" />
    </>
  ),
  heat: (
    <>
      <circle cx="24" cy="15" r="7" fill="currentColor" fillOpacity=".35" />
      <path d="M24 3v4M9 15h6m18 0h6M12 5l4 4m16 0 4-4M7 29q9-7 17 0t17 0M7 37q9-7 17 0t17 0" />
    </>
  ),
  snow: (
    <>
      <path
        d="M13 27a7 7 0 0 1-1-13 12 12 0 0 1 22-2 8 8 0 0 1 1 15Z"
        fill="currentColor"
        fillOpacity=".2"
      />
      <path d="M24 31v14m-6-11 12 8m-12 0 12-8" />
    </>
  ),
  thaw: (
    <>
      <path d="M7 24h34M12 20a12 12 0 0 1 24 0M24 4v4M7 9l4 4m26 0 4-4" />
      <path
        d="M24 30c-3 4-6 7-6 10a6 6 0 0 0 12 0c0-3-3-6-6-10Z"
        fill="currentColor"
        fillOpacity=".23"
      />
    </>
  ),
  gust: (
    <>
      <path d="M6 16h22c7 0 7-8 1-8m-23 17h30c8 0 8 8 2 8M6 34h16" />
      <path d="M21 34c-1 7-8 8-12 7 0-5 4-8 12-7Z" fill="currentColor" fillOpacity=".4" />
    </>
  ),
  squall: (
    <>
      <path
        d="M13 27a7 7 0 0 1-1-13 12 12 0 0 1 22-2 8 8 0 0 1 1 15Z"
        fill="currentColor"
        fillOpacity=".2"
      />
      <path d="m26 25-9 12h8l-2 8 11-13h-8Z" fill="currentColor" />
    </>
  ),
  umbrella: (
    <>
      <path
        d="M6 24a18 18 0 0 1 36 0c-4-5-8-5-12 0-4-5-8-5-12 0-4-5-8-5-12 0Z"
        fill="currentColor"
        fillOpacity=".24"
      />
      <path d="M24 6v-3m0 19v15a4 4 0 0 0 8 0M18 24c0-9 1-14 6-18m6 18c0-9-1-14-6-18" />
    </>
  ),
  sunshades: (
    <>
      <path
        d="M7 17h13l2 4-2 11H9L5 24Zm34 0H28l-2 4 2 11h11l4-8Z"
        fill="currentColor"
        fillOpacity=".25"
      />
      <path d="M22 22q2-4 4 0M4 18l3 2m37-2-3 2m-31 2 6-2m14 2 6-2" />
    </>
  ),
  balm: (
    <>
      <rect x="10" y="9" width="28" height="29" rx="10" fill="currentColor" fillOpacity=".24" />
      <circle cx="24" cy="23" r="5" />
      <path d="M24 13v3m0 14v3m-10-10h3m14 0h3m-17-7 2 2m10 10 2 2m0-14-2 2m-10 10-2 2" />
    </>
  ),
  runners: (
    <>
      <path d="M11 11h12v9l12 6 5 4v5H8V22Z" fill="currentColor" fillOpacity=".22" />
      <path d="M6 40h34l3-5M12 27h13m-10-8h9" />
      <circle cx="14" cy="36" r="3" />
      <circle cx="25" cy="36" r="3" />
      <circle cx="36" cy="36" r="3" />
    </>
  ),
  boots: (
    <>
      <path d="M11 7h14v17l12 4 5 5v7H8l-2-7 5-11Z" fill="currentColor" fillOpacity=".24" />
      <path d="M9 32h31M13 39v4m8-4v4m8-4v4m8-4v4M12 12h12v6H12Z" />
    </>
  ),
  stability: (
    <>
      <path d="M15 6h18v6l-3 3v4l7 8v13H11V27l7-8v-4l-3-3Z" fill="currentColor" fillOpacity=".16" />
      <path d="M12 28q7-4 12 0t12 0M24 24v10m-5-5h10" />
    </>
  ),
  hint: (
    <>
      <path
        d="M24 5c3 11 8 16 19 19-11 3-16 8-19 19-3-11-8-16-19-19 11-3 16-8 19-19Z"
        fill="currentColor"
        fillOpacity=".2"
      />
      <path d="m24 17 7 7-7 7-7-7Z" />
    </>
  ),
  continue: (
    <>
      <path d="M10 19a15 15 0 1 1 0 13m0-13V9m0 10h11" />
      <path d="m25 15-8 12h7l-1 8 9-13h-7Z" fill="currentColor" fillOpacity=".35" />
    </>
  ),
  shield: (
    <>
      <path
        d="M24 5c-6 4-11 5-16 7v11c0 9 5 15 16 21 11-6 16-12 16-21V12c-5-2-10-3-16-7Z"
        fill="currentColor"
        fillOpacity=".19"
      />
      <path d="m17 24 5 5 10-11" />
    </>
  ),
  check: <path d="m12 24 8 8 16-17" strokeWidth="4" />,
} satisfies Record<string, ReactNode>;
export type ExpeditionIcon = keyof typeof glyphs;

export function AdventureIcon({ name, className }: { name: ExpeditionIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}

export function RegionArt({ chapter, lit = false }: { chapter: Chapter; lit?: boolean }) {
  return (
    <div className="cpi-region-art" data-chapter={chapter} data-lit={lit} aria-hidden="true">
      <img
        alt=""
        draggable={false}
        src={
          chapter === 'observatory'
            ? observatoryArt
            : chapter === 'harbour'
              ? harbourArt
              : chapter === 'lighthouse'
                ? import.meta.env.BASE_URL + 'assets/campaign/lighthouse-coast.png'
                : chapterAtlas
        }
      />
    </div>
  );
}

export function BridgeInsignia({ model }: { model: BridgeModel }) {
  const id = useId().replaceAll(':', '');
  const colors = {
    original: ['#acb5bd', '#282831', '#101116'],
    trestle: ['#efd0a5', '#a56e42', '#55351e'],
    frost: ['#e0ffff', '#87daed', '#356c9c'],
    lily: ['#d5eda4', '#7ab946', '#316145'],
    jelly: ['#ffe2f4', '#e296e3', '#9b4ab4'],
    aurora: ['#ffe4a6', '#365673', '#15253b'],
    prism: ['#dcd8ff', '#47449a', '#131935'],
    cookie: ['#ffe2ad', '#d49950', '#6d4029'],
  }[model];
  const playful = model === 'cookie' || model === 'aurora' || model === 'prism';
  const texture = playful || model === 'trestle' || model === 'frost' || model === 'lily';
  return (
    <svg className="cpi-bridge-insignia" viewBox="0 0 120 88" data-model={model} aria-hidden="true">
      <defs>
        <linearGradient id={id + 'top'} x2=".7" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset=".4" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
        <linearGradient id={id + 'side'} x2="0" y2="1">
          <stop stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
        {texture && (
          <pattern
            id={id + 'texture'}
            width="1"
            height="1"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <image
              href={playful ? playfulAtlas : materialAtlas}
              x={model === 'lily' || model === 'cookie' ? -1 : 0}
              y={model === 'aurora' || model === 'frost' || model === 'lily' ? -1 : 0}
              width="2"
              height="2"
            />
          </pattern>
        )}
      </defs>
      <ellipse cx="61" cy="76" rx="44" ry="9" fill="#050b17" opacity=".45" />
      {model === 'lily' ? (
        <g>
          <ellipse cx="58" cy="64" rx="47" ry="15" fill="#214b4b" />
          <path
            d="M59 50 50 73C29 76 13 66 17 57c4-10 28-16 48-11l5 4 6-10c15-2 31 7 28 16-3 9-23 16-37 13Z"
            fill={'url(#' + id + 'texture)'}
            stroke="#acd08a"
            strokeWidth="1.2"
          />
          <path d="m50 73 10-17m0 0-29 3m29-3 26-8" fill="none" stroke="#b9da84" opacity=".5" />
          <path
            d="M44 24c13-10 36-9 42 0s-7 16-22 15l-4-7-6 6c-14-1-22-7-10-14Z"
            fill={'url(#' + id + 'texture)'}
            stroke="#a5ca83"
          />
        </g>
      ) : (
        <g strokeLinejoin="round">
          <path
            d="m37 26 39-13 25 15-42 16-22-11Z"
            fill={'url(#' + id + 'top)'}
            stroke={colors[0]}
            strokeWidth="1.1"
          />
          <path
            d="M20 43 47 68 103 48v11L47 81 20 56Z"
            fill={'url(#' + id + 'side)'}
            stroke={colors[2]}
            strokeWidth="1"
          />
          <path
            d="M20 43 75 26 103 48 47 68Z"
            fill={'url(#' + id + (texture ? 'texture' : 'top') + ')'}
            stroke={colors[0]}
            strokeWidth="1.4"
          />
          {model === 'trestle' && (
            <path
              d="m32 40 29 23m-14-28 30 23m-14-28 28 23M27 49v7m25 13v6m42-24v5"
              stroke="#422a1c"
              strokeWidth="2"
              opacity=".82"
            />
          )}
          {model === 'frost' && (
            <path
              d="m45 36 12 9-7 11 18 5m-11-16 27-4m-34 15 2 19"
              fill="none"
              stroke="#e9ffff"
              strokeWidth="1.5"
            />
          )}
          {model === 'jelly' && (
            <g fill="#fff0fb" opacity=".82">
              <ellipse cx="43" cy="43" rx="11" ry="3" transform="rotate(-18 43 43)" />
              <circle cx="80" cy="47" r="3" />
              <circle cx="66" cy="51" r="1.6" />
            </g>
          )}
          {model === 'aurora' && (
            <path
              d="M22 43 75 27 101 48 47 67Z M28 44 74 32 94 48 48 61Z M27 58v9m67-11v9"
              fill="none"
              stroke="#e7c27f"
              strokeWidth="2.2"
            />
          )}
          {model === 'prism' && (
            <g stroke="#e9dfff" strokeWidth="1.2">
              <path d="M47 43v10m-5-5h10m23-11v6m-3-3h6" />
              <ellipse cx="74" cy="52" rx="9" ry="3" transform="rotate(-22 74 52)" />
              <circle cx="74" cy="52" r="4" fill="#b491ec" />
            </g>
          )}
          {model === 'cookie' && (
            <g fill="#6d3f28">
              <circle cx="40" cy="46" r="2" />
              <circle cx="62" cy="41" r="1.7" />
              <circle cx="75" cy="49" r="2.2" />
              <path d="m25 54 23 21 49-19v4L48 79 25 58Z" fill="#fff0c3" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
