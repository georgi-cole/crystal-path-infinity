import { adventurePrice } from './adventure-prices';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GEAR_IDS, journeyGearEffect } from '@crystal-path-infinity/game-core';
import type { GearId, Season, Weather } from '@crystal-path-infinity/game-core';
import { BRIDGE_MODELS, bridgeModel, STYLES, STYLE_OFFERS } from './campaign-content';
import type { BridgeModel, BridgeStyle, StyleOffer } from './campaign-content';
import {
  EXTRA_SUPPLY_OFFERS,
  gearOffer,
  ownsCampaignGear,
  ownsStyle,
  selectedInfinitySeason,
  unlockedSeasons,
  isRepeatableSupply,
  supplyPackFits,
} from './campaign-test';
import type { CampaignOffer, CampaignProgress } from './campaign-test';
import { AdventureIcon, BridgeInsignia } from './expedition-art';
import type { ExpeditionIcon } from './expedition-art';
import { GEAR_COPY, WEATHER_COPY } from './journey-copy';
import { CompanionSeasonGear, JourneyAtmosphere } from './journey-atmosphere';
import { INFINITY_WEATHER_NAMES } from './journey-copy';
import { BackButton } from './back-button';
import { useLanguage } from './language-context';
import { PrismBridge } from './prism-bridge';
import { BlackMetalShowcase } from './black-metal-showcase';
import type { PresentedRow } from './infinity-presentation';
import { StageAtmosphere } from './stage-atmosphere';
import type { ThemeId } from './store-catalog';
import { ThemeScope } from './store-provider';
import { CompanionSprite, ThemeArtwork } from './theme-art';
import { WorldPathCompanion } from './world-effects';
import { WORLD_KITS, WORLD_ORDER } from './world-kits';
import './expedition.css';

export type ExpeditionDepartment = 'worlds' | 'bridges' | 'gear' | 'supplies';
type StoreActions = {
  onWorld: (world: ThemeId) => void;
  onBridge: (style: BridgeStyle) => void;
  onGear: (gear: GearId | null) => void;
  onClaim: (offer: CampaignOffer) => void;
};
const departments: readonly [ExpeditionDepartment, string, ExpeditionIcon][] = [
  ['worlds', 'Worlds', 'world'],
  ['bridges', 'Bridges', 'bridge'],
  ['gear', 'Gear', 'umbrella'],
  ['supplies', 'Supplies', 'pack'],
];
const worlds: readonly ThemeId[] = ['obsidian', ...WORLD_ORDER];
const previewRows: readonly PresentedRow[] = [-1, 0, 1, 2, 3].map((distance, i) => ({
  index: String(i),
  label: String(i + 1),
  distance,
  phase: distance < 0 ? 'past' : distance === 0 ? 'current' : 'future',
  tone: (i % 3) as 0 | 1 | 2,
  hasMystery: false,
  mysteryAvailable: false,
  hint: null,
  chosen: distance < 0 ? 'left' : null,
  wrong: false,
}));
const gearArt: Record<GearId, ExpeditionIcon> = {
  umbrella: 'umbrella',
  sunshades: 'sunshades',
  'sun-balm': 'balm',
  'frost-runners': 'runners',
  'storm-boots': 'boots',
  'trail-scarf': 'autumn',
};
const skies: Record<Season, readonly Weather[]> = {
  spring: ['rain', 'rainbow'],
  summer: ['heat', 'shower'],
  winter: ['snow', 'thaw'],
  autumn: ['gust', 'squall'],
};
const gearSky = {
  umbrella: ['spring', 'rain'],
  sunshades: ['summer', 'heat'],
  'sun-balm': ['summer', undefined],
  'frost-runners': ['winter', 'snow'],
  'storm-boots': ['autumn', 'squall'],
  'trail-scarf': ['winter', 'snow'],
} as const satisfies Record<GearId, readonly [Season, Weather | undefined]>;
const worldStories: Record<ThemeId, string> = {
  obsidian: 'One little light started this whole adventure. Where will yours go?',
  wilds: 'Collects lucky pebbles. Gives every single one a name.',
  league: 'Thinks every problem can be solved with one more flip.',
  puppy: 'Delivers lost buttons, secret letters and very important sticks.',
  kitten: 'Walks quietly. Plans dramatically. Always lands with style.',
  chaos: 'Repairs tiny things with enormous confidence. Usually has a spare bolt.',
  jelly: 'Hums when happy. Wobbles when very happy. Impossible to stay grumpy around.',
};

function Portrait({ world }: { world: ThemeId }) {
  return (
    <span className="cpi-market-portrait" data-portrait={world} aria-hidden="true">
      {world === 'obsidian' ? (
        <AdventureIcon name="hint" />
      ) : (
        <CompanionSprite theme={world} reaction="calm" />
      )}
    </span>
  );
}

function WorldCollection({
  progress,
  onWorld,
  reducedMotion,
}: {
  progress: CampaignProgress;
  onWorld: StoreActions['onWorld'];
  reducedMotion: boolean;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(() => worlds.indexOf(progress.world));
  const [reaction, setReaction] = useState<'signature' | 'joy' | 'idle'>('signature');
  const [brightPose, setBrightPose] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);
  const first = useRef(selected);
  const settling = useRef<number | undefined>(undefined);
  const sky = selectedInfinitySeason(progress);
  const season = sky === 'plain' ? undefined : sky;

  useLayoutEffect(() => {
    const rail = carousel.current;
    if (rail) rail.scrollLeft = first.current * rail.clientWidth;
  }, []);
  useEffect(() => () => window.clearTimeout(settling.current), []);
  useEffect(() => {
    if (reaction === 'idle' || reducedMotion) return;
    const settle =
      reaction === 'joy' ? window.setTimeout(() => setBrightPose(false), 1280) : undefined;
    const finish = window.setTimeout(
      () => {
        setBrightPose(false);
        setReaction('idle');
      },
      reaction === 'joy' ? 1650 : 1400,
    );
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(finish);
    };
  }, [reaction, selected, reducedMotion]);
  const changeCard = (index: number) => {
    const rail = carousel.current;
    if (!rail) return;
    rail.scrollTo({
      left: index * rail.clientWidth,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  };

  return (
    <section
      className="cpi-market-department cpi-worlds-view"
      aria-label="Worlds"
      data-reduced={reducedMotion}
    >
      <div className="cpi-world-gallery">
        <div
          className="cpi-world-carousel"
          ref={carousel}
          role="region"
          aria-label="World carousel"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            changeCard(selected + (event.key === 'ArrowLeft' ? -1 : 1));
          }}
          onScroll={() => {
            window.clearTimeout(settling.current);
            settling.current = window.setTimeout(() => {
              const rail = carousel.current;
              if (!rail?.clientWidth) return;
              const index = Math.min(
                worlds.length - 1,
                Math.max(0, Math.round(rail.scrollLeft / rail.clientWidth)),
              );
              if (index === selected) return;
              setSelected(index);
              setBrightPose(false);
              setReaction('signature');
            }, 95);
          }}
        >
          {worlds.map((id, index) => {
            const entry = id === 'obsidian' ? undefined : WORLD_KITS[id];
            const active = index === selected;
            return (
              <div
                key={id}
                className="cpi-market-world-scene"
                data-world={id}
                data-season={season}
                aria-hidden={!active}
              >
                {id === 'obsidian' ? (
                  <BlackMetalShowcase still={reducedMotion || !active} />
                ) : (
                  <ThemeArtwork theme={id} companion={false} />
                )}
                {season && <JourneyAtmosphere world={id} season={season} reduced={reducedMotion} />}
                {id !== 'obsidian' && (
                  <div
                    className="cpi-gallery-character"
                    aria-hidden="true"
                    data-active={active}
                    data-motion={active && !reducedMotion ? reaction : undefined}
                  >
                    <span className="cpi-gallery-ground" />
                    <span className="cpi-gallery-cheer" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <div
                      className="cpi-gallery-character-motion"
                      data-motion={
                        active && !reducedMotion && reaction !== 'idle' ? reaction : undefined
                      }
                    >
                      <CompanionSprite
                        theme={id}
                        reaction={active && brightPose && !reducedMotion ? 'happy' : 'calm'}
                      />
                      {season && (
                        <svg viewBox="-48 -96 96 96">
                          <CompanionSeasonGear
                            world={id}
                            season={season}
                            frame={active && brightPose && !reducedMotion ? 1 : 0}
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                )}
                <div className="cpi-market-world-copy">
                  <p className="cpi-adventure-kicker">
                    {season ? INFINITY_WEATHER_NAMES[season] : 'Explore the Worlds'}
                  </p>
                  <h2>{entry ? t(entry.title) : t('vault.obsidian')}</h2>
                  <p>
                    {entry ? t(entry.mood) : 'Polished dark steel and a path of colored light.'}
                  </p>
                  <p className="cpi-world-story">{worldStories[id]}</p>
                  <small className="cpi-world-price">
                    {id === 'obsidian' ? 'Included' : '€2.99 · One-time World unlock'}
                  </small>
                  <button
                    className="cpi-adventure-button"
                    type="button"
                    tabIndex={active ? 0 : -1}
                    disabled={progress.world === id}
                    onClick={() => {
                      onWorld(id);
                      setBrightPose(true);
                      setReaction('joy');
                    }}
                  >
                    {progress.world === id ? 'Current World' : 'Use this World'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <nav className="cpi-world-dots" aria-label="Choose a World">
          {worlds.map((id, index) => (
            <button
              key={id}
              type="button"
              aria-label={id === 'obsidian' ? 'Black Metal' : t(WORLD_KITS[id].title)}
              aria-current={selected === index ? 'true' : undefined}
              onClick={() => changeCard(index)}
            />
          ))}
        </nav>
      </div>
    </section>
  );
}

function WorkshopScene({
  world,
  style,
  gear,
  season,
  weather,
  reducedMotion,
  title,
  breaking = false,
  children,
}: {
  world: ThemeId;
  style: BridgeStyle;
  gear?: GearId;
  season?: Season;
  weather?: Weather;
  reducedMotion: boolean;
  title: string;
  breaking?: boolean;
  children?: ReactNode;
}) {
  return (
    <ThemeScope theme={world}>
      <div
        className="cpi-workshop-scene"
        data-world={world}
        data-model={bridgeModel(style)}
        data-gear-preview={!!gear}
        data-season={season}
      >
        <StageAtmosphere />
        {season && (
          <JourneyAtmosphere
            world={world}
            season={season}
            weather={weather}
            reduced={reducedMotion}
          />
        )}
        <div className="cpi-workshop-deck" aria-hidden="true" inert>
          <PrismBridge
            rows={previewRows}
            bridgeStyle={style}
            season={season}
            weather={weather}
            feedback={breaking ? { row: '1', side: 'left', kind: 'wrong' } : null}
            phase={breaking ? 'impact' : undefined}
            reducedMotion={reducedMotion}
          />
          {world !== 'obsidian' && (
            <WorldPathCompanion
              theme={world}
              bridge={bridgeModel(style)}
              season={season}
              weather={weather}
              gear={gear}
              standingSide="right"
              sp={100}
              effects={[]}
              reaction="calm"
              reduced={reducedMotion}
              paused={false}
              preview
            />
          )}
        </div>
        {children}
        <div className="cpi-workshop-label">
          <AdventureIcon name={gear ? gearArt[gear] : 'bridge'} />
          {title}
        </div>
      </div>
    </ThemeScope>
  );
}

function BridgeWorkshop({
  progress,
  onBridge,
  onClaim,
  reducedMotion,
  onDetail,
}: {
  progress: CampaignProgress;
  onBridge: StoreActions['onBridge'];
  onClaim: StoreActions['onClaim'];
  reducedMotion: boolean;
  onDetail: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<BridgeModel | null>(null);
  const [breaking, setBreaking] = useState(false);
  const [landing, setLanding] = useState(0);
  useEffect(() => {
    if (!breaking) return;
    const timer = window.setTimeout(() => setBreaking(false), 1100);
    return () => window.clearTimeout(timer);
  }, [breaking]);
  const models = Object.keys(BRIDGE_MODELS) as BridgeModel[];
  const open = (model: BridgeModel | null) => {
    setSelected(model);
    setBreaking(false);
    onDetail(model !== null);
  };
  if (!selected)
    return (
      <section
        className="cpi-market-department cpi-store-collection"
        aria-labelledby="cpi-bridges-title"
      >
        <header className="cpi-market-section-head">
          <p className="cpi-adventure-kicker">Made for your next adventure</p>
          <h2 id="cpi-bridges-title" tabIndex={-1}>
            Bridge Styles
          </h2>
          <p>Pick a bridge to step inside.</p>
        </header>
        <div className="cpi-bridge-gallery" aria-label="Bridge designs">
          {models.map((id) => {
            const choice = BRIDGE_MODELS[id];
            const available = Object.values(choice.style).every((item) =>
              ownsStyle(progress, item),
            );
            const offer =
              id === 'aurora'
                ? 'aurora'
                : id === 'prism'
                  ? 'prism-kit'
                  : id === 'cookie'
                    ? 'cookie-bridge'
                    : undefined;
            return (
              <button key={id} type="button" data-model={id} onClick={() => open(id)}>
                <BridgeInsignia model={id} />
                <strong>{choice.name}</strong>
                <small>
                  {available
                    ? 'In your collection'
                    : offer
                      ? STYLE_OFFERS[offer].price
                      : 'Campaign reward'}
                </small>
              </button>
            );
          })}
        </div>
        <EarnedBridgeAccents progress={progress} onBridge={onBridge} />
      </section>
    );
  const info = BRIDGE_MODELS[selected];
  const draft: BridgeStyle = info.style;
  const offer: StyleOffer | undefined =
    selected === 'aurora'
      ? 'aurora'
      : selected === 'prism'
        ? 'prism-kit'
        : selected === 'cookie'
          ? 'cookie-bridge'
          : undefined;
  const owned = Object.values(draft).every((item) => ownsStyle(progress, item));
  const equipped = bridgeModel(progress.style) === selected;
  return (
    <section
      className="cpi-market-department cpi-store-detail cpi-bridge-view"
      aria-labelledby="cpi-bridges-title"
    >
      <header className="cpi-detail-heading">
        <BackButton onBack={() => open(null)} label="All bridges" />
      </header>
      <div className="cpi-bridge-showcase">
        <div className="cpi-bridge-demonstration" key={landing} data-landing={landing > 0}>
          <WorkshopScene
            world={progress.world}
            style={draft}
            reducedMotion={reducedMotion}
            title={info.name}
            breaking={breaking}
          />
        </div>
        <div className="cpi-market-tray cpi-bridge-tray">
          <div>
            <p className="cpi-adventure-kicker">A path with personality</p>
            <h2 id="cpi-bridges-title" tabIndex={-1}>
              {info.name}
            </h2>
            <p>{info.note}</p>
            {!owned && !offer && <small>Earn this bridge in Campaign.</small>}
            {offer && <small>{STYLE_OFFERS[offer].price} · One-time style unlock</small>}
          </div>
          <div className="cpi-market-actions">
            <button
              type="button"
              className="cpi-adventure-button is-quiet"
              disabled={breaking}
              onClick={() => setLanding((n) => n + 1)}
            >
              Try a step
            </button>
            <button
              type="button"
              className="cpi-adventure-button is-quiet"
              disabled={breaking}
              onClick={() => setBreaking(true)}
            >
              Try a break
            </button>
            {owned ? (
              <button
                type="button"
                className="cpi-adventure-button"
                disabled={equipped}
                onClick={() => onBridge(draft)}
              >
                {equipped ? 'Equipped' : 'Equip bridge'}
              </button>
            ) : (
              offer && (
                <button
                  type="button"
                  className="cpi-adventure-button"
                  onClick={() => onClaim(offer)}
                >
                  Add free test style
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EarnedBridgeAccents({
  progress,
  onBridge,
}: {
  progress: CampaignProgress;
  onBridge: StoreActions['onBridge'];
}) {
  const accents = (['torches', 'amber', 'echo', 'comet-trail', 'harbour-lanterns'] as const).filter(
    (id) => ownsStyle(progress, id),
  );
  if (!accents.length) return null;
  return (
    <aside className="cpi-earned-accents" aria-label="Earned bridge details">
      <p className="cpi-adventure-kicker">Earned on your travels</p>
      <div>
        {accents.map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={progress.style[STYLES[id].slot] === id}
            onClick={() => onBridge({ ...progress.style, [STYLES[id].slot]: id })}
          >
            <AdventureIcon name={STYLES[id].slot === 'trail' ? 'hint' : 'lantern'} />
            <span>{STYLES[id].name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function WeatherDial({
  season,
  weather,
  onSeason,
  onWeather,
}: {
  season: Season;
  weather?: Weather;
  onSeason: (season: Season) => void;
  onWeather: (weather?: Weather) => void;
}) {
  return (
    <div className="cpi-weather-console">
      <div
        className="cpi-season-wheel"
        data-season={season}
        role="group"
        aria-label="Preview season"
      >
        <span className="cpi-wheel-center">
          <AdventureIcon name={season} />
          <strong>{INFINITY_WEATHER_NAMES[season]}</strong>
        </span>
        {(['spring', 'summer', 'autumn', 'winter'] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-season={value}
            aria-label={INFINITY_WEATHER_NAMES[value]}
            aria-pressed={season === value}
            onClick={() => onSeason(value)}
          >
            <AdventureIcon name={value} />
          </button>
        ))}
      </div>
      <div className="cpi-weather-medals" role="group" aria-label="Preview weather">
        {([undefined, ...skies[season]] as const).map((value) => (
          <button
            key={value ?? 'clear'}
            type="button"
            data-weather={value ?? 'clear'}
            aria-pressed={weather === value}
            onClick={() => onWeather(value)}
          >
            <span className="cpi-weather-miniature">
              <AdventureIcon name={value ?? 'clear'} />
            </span>
            <strong>{value ? WEATHER_COPY[value].title : 'Clear sky'}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function Outfitters({
  progress,
  onGear,
  onClaim,
  reducedMotion,
  onDetail,
}: {
  progress: CampaignProgress;
  onGear: StoreActions['onGear'];
  onClaim: StoreActions['onClaim'];
  reducedMotion: boolean;
  onDetail: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const [item, setItem] = useState<GearId | null>(null);
  const [world, setWorld] = useState<Exclude<ThemeId, 'obsidian'>>(
    progress.world === 'obsidian' ? 'wilds' : progress.world,
  );
  const [season, setSeason] = useState<Season>('spring');
  const [weather, setWeather] = useState<Weather | undefined>('rain');
  const open = (next: GearId | null) => {
    setItem(next);
    onDetail(next !== null);
    if (next) {
      setSeason(gearSky[next][0]);
      setWeather(gearSky[next][1]);
    }
  };
  if (!item)
    return (
      <section
        className="cpi-market-department cpi-store-collection"
        aria-labelledby="cpi-outfitters-title"
      >
        <header className="cpi-market-section-head">
          <p className="cpi-adventure-kicker">Little helpers, big adventures</p>
          <h2 id="cpi-outfitters-title" tabIndex={-1}>
            Gear
          </h2>
          <p>Choose something to try on.</p>
        </header>
        <div className="cpi-gear-collection" aria-label="Gear to try">
          {GEAR_IDS.map((id) => (
            <button type="button" key={id} data-item={id} onClick={() => open(id)}>
              <span className="cpi-gear-display" data-item={id} aria-hidden="true" />
              <strong>{GEAR_COPY[id].name}</strong>
              <small>
                {ownsCampaignGear(progress, id) ? 'In your collection' : GEAR_COPY[id].price}
              </small>
            </button>
          ))}
        </div>
      </section>
    );
  const copy = GEAR_COPY[item];
  const owned = ownsCampaignGear(progress, item);
  const fit = journeyGearEffect(item, season, weather);
  const helpful = (fit.hitRelief ?? 0) > 0 || !!fit.cleanGain || !!fit.clearGlint;
  const harmful = (fit.hitRelief ?? 0) < 0;
  const benefit = [
    fit.clearGlint ? 'The light now shows the correct tile.' : '',
    fit.hitRelief
      ? `A broken tile costs ${Math.abs(fit.hitRelief)} ${fit.hitRelief > 0 ? 'fewer' : 'extra'} SP.`
      : '',
    fit.cleanGain ? `Safe steps give ${fit.cleanGain} SP.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      className="cpi-market-department cpi-store-detail cpi-gear-view"
      aria-labelledby="cpi-outfitters-title"
    >
      <header className="cpi-detail-heading">
        <BackButton onBack={() => open(null)} label="All gear" />
        <h2 id="cpi-outfitters-title" tabIndex={-1}>
          {copy.name}
        </h2>
      </header>
      <WorkshopScene
        world={world}
        style={progress.style}
        gear={item}
        season={season}
        weather={weather}
        reducedMotion={reducedMotion}
        title={copy.name}
      >
        <button
          className="cpi-try-companion"
          type="button"
          onClick={() =>
            setWorld(WORLD_ORDER[(WORLD_ORDER.indexOf(world) + 1) % WORLD_ORDER.length])
          }
          aria-label="Try the next character"
        >
          <Portrait world={world} />
          <span>
            {t(WORLD_KITS[world].title)} <b>↻</b>
          </span>
        </button>
      </WorkshopScene>
      <WeatherDial
        season={season}
        weather={weather}
        onSeason={(next) => {
          setSeason(next);
          setWeather(undefined);
        }}
        onWeather={setWeather}
      />
      <p
        className="cpi-gear-verdict"
        data-fit={harmful ? 'pack' : helpful ? 'wear' : 'neutral'}
        aria-live="polite"
      >
        <AdventureIcon name={harmful ? 'pack' : helpful ? 'check' : 'compass'} />
        {benefit || 'This item has no effect in this weather.'}
      </p>
      <div className="cpi-market-tray cpi-outfit-details">
        <div>
          <strong className="cpi-gear-price">{copy.price}</strong>
          <small>Keep forever · Wear one item in Infinity</small>
        </div>
        <div className="cpi-market-actions">
          {owned ? (
            <button
              type="button"
              className="cpi-adventure-button"
              disabled={progress.gear === item}
              onClick={() => onGear(item)}
            >
              {progress.gear === item ? 'Packed' : 'Pack for next run'}
            </button>
          ) : (
            <button
              type="button"
              className="cpi-adventure-button"
              onClick={() => onClaim(gearOffer(item))}
            >
              Add free test gear
            </button>
          )}
          {progress.gear && (
            <button
              type="button"
              className="cpi-adventure-button is-quiet"
              onClick={() => onGear(null)}
            >
              Put gear away
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const supplyOffers = {
  'sp-pack': {
    icon: 'stability',
    title: '500 Stability',
    price: adventurePrice('sp-pack'),
    note: 'Add 500 reserve SP for Infinity. Restore 25 SP each time you use it.',
  },
  'hint-pack': {
    icon: 'hint',
    title: '10 Hints',
    price: adventurePrice('hint-pack'),
    note: 'Reveal a safe tile in Infinity. Stored hints join your two starting hints; one is used per reveal.',
  },
  'continue-pack': {
    icon: 'continue',
    title: '3 Continues',
    price: adventurePrice('continue-pack'),
    note: 'Continue your Infinity crossing from the row where you fell, with 150 SP.',
  },
  'shield-pack': {
    icon: 'shield',
    ...EXTRA_SUPPLY_OFFERS['shield-pack'],
    note: 'Load shields in your Kit. Each blocks one broken tile. Unused shields stay in your stock. New crossings support multiple loaded shields.',
  },
  'season-change-pack': {
    icon: 'cycle',
    ...EXTRA_SUPPLY_OFFERS['season-change-pack'],
    note: 'Change the season for your next new Infinity crossing.',
  },
  'all-seasons': {
    icon: 'winter',
    ...EXTRA_SUPPLY_OFFERS['all-seasons'],
    note: 'Discover spring, summer, autumn and winter in Infinity.',
  },
  'clock-free': {
    icon: 'continue',
    ...EXTRA_SUPPLY_OFFERS['clock-free'],
    note: 'Turn off the Infinity death clock forever. Take your time choosing a tile. Broken tiles and Mystery effects can still cost SP.',
  },
} as const satisfies Record<
  string,
  { icon: ExpeditionIcon; title: string; note: string; price?: string }
>;
type SupplyOffer = keyof typeof supplyOffers;

function SupplyArtwork({ offer }: { offer: SupplyOffer }) {
  return <span aria-hidden="true" className="cpi-supply-artwork" data-offer={offer} />;
}

function Supplies({
  progress,
  onClaim,
  onUseSeasonChange,
  onToggleClock,
  onDetail,
}: {
  progress: CampaignProgress;
  onClaim: StoreActions['onClaim'];
  onUseSeasonChange: () => void;
  onToggleClock: () => void;
  onDetail: (open: boolean) => void;
}) {
  const [restock, setRestock] = useState<SupplyOffer | null>(null);
  const openRestock = (offer: SupplyOffer | null) => {
    setRestock(offer);
    onDetail(offer !== null);
  };
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    heading.current?.focus();
  }, [restock]);
  const resources = [
    ['sp-pack', 'Stability', progress.reserveSp],
    ['hint-pack', 'Hints', progress.reserveHints],
    ['continue-pack', 'Continues', progress.continues],
    ['shield-pack', 'Shields', progress.shields],
    ['season-change-pack', 'Season Changes', progress.seasonChanges],
    ['clock-free', 'No Clock', progress.offers.includes('clock-free') ? 1 : 0],
  ] as const satisfies readonly [SupplyOffer, string, number][];
  const seasonCount = unlockedSeasons(progress).length;
  const pack = restock ? supplyOffers[restock] : undefined;
  const added = restock !== null && progress.offers.includes(restock);
  const repeatable = restock !== null && isRepeatableSupply(restock);
  const atLimit = restock !== null && repeatable && !supplyPackFits(progress, restock);
  const locked = restock === 'season-change-pack' && seasonCount < 2;
  const discovered = restock === 'all-seasons' && seasonCount === 4;
  return (
    <section className="cpi-market-department cpi-supplies" aria-labelledby="cpi-supplies-title">
      <header className="cpi-market-section-head">
        <p className="cpi-adventure-kicker">{restock ? 'Wayfarer’s counter' : 'What you carry'}</p>
        <h2 id="cpi-supplies-title" ref={heading} tabIndex={-1}>
          {restock ? 'Restock' : 'Supplies'}
        </h2>
        {!restock && <p>Supplies for Infinity. Campaign missions provide their own kit.</p>}
      </header>
      {restock && pack ? (
        <>
          <BackButton onBack={() => openRestock(null)} label="All supplies" />
          <article className="cpi-restock-feature" data-offer={restock}>
            <div className="cpi-restock-display">
              <SupplyArtwork offer={restock} />
            </div>
            <div className="cpi-restock-feature-copy">
              <p className="cpi-adventure-kicker">Packed for the trail</p>
              <h3>{pack.title}</h3>
              {repeatable && (
                <small className="cpi-restock-balance">
                  {resources.find(([offer]) => offer === restock)?.[2]} stored
                </small>
              )}
              <p>{pack.note}</p>
              {restock === 'clock-free' && (
                <small>
                  Applies to new Infinity crossings, with a separate record. Campaign keeps its
                  mission clock.
                </small>
              )}
              {'price' in pack && (
                <p className="cpi-restock-price">
                  {pack.price} <small>Proposed price</small>
                </p>
              )}
              {locked && (
                <p className="cpi-restock-lock">Available after you discover two seasons.</p>
              )}
              <div className="cpi-market-actions">
                <button
                  type="button"
                  className="cpi-adventure-button"
                  disabled={
                    (added && !repeatable && restock !== 'clock-free') ||
                    locked ||
                    discovered ||
                    atLimit
                  }
                  onClick={() =>
                    restock === 'clock-free' && added ? onToggleClock() : onClaim(restock)
                  }
                >
                  {restock === 'clock-free' && added
                    ? progress.clockFree
                      ? 'Clock off · Turn on'
                      : 'Clock on · Turn off'
                    : atLimit
                      ? 'Fully stocked'
                      : added && repeatable
                        ? 'Add another free test pack'
                        : added
                          ? 'Added to supplies'
                          : locked
                            ? 'Locked'
                            : discovered
                              ? 'Already discovered'
                              : 'Add free test pack'}
                </button>
                {locked && (
                  <button
                    type="button"
                    className="cpi-adventure-button is-quiet"
                    onClick={() => openRestock('all-seasons')}
                  >
                    View all seasons
                  </button>
                )}
              </div>
            </div>
          </article>
          <nav className="cpi-restock-shelf" aria-label="Restock packs">
            {(Object.keys(supplyOffers) as SupplyOffer[]).map((offer) => (
              <button
                key={offer}
                type="button"
                aria-pressed={offer === restock}
                onClick={() => openRestock(offer)}
              >
                <SupplyArtwork offer={offer} />
                <strong>{supplyOffers[offer].title}</strong>
              </button>
            ))}
          </nav>
        </>
      ) : (
        <div className="cpi-supply-chest">
          {resources.map(([offer, label, count]) => (
            <article key={offer} data-supply={supplyOffers[offer].icon}>
              <div className="cpi-supply-medal">
                <SupplyArtwork offer={offer} />
              </div>
              <div className="cpi-supply-title">
                <strong>{label}</strong>
                {offer === 'clock-free' ? (
                  <span
                    className="cpi-supply-ownership"
                    role="img"
                    aria-label={count ? 'Owned' : 'Locked'}
                  >
                    <AdventureIcon name={count ? 'check' : 'lock'} />
                  </span>
                ) : (
                  <span className="cpi-supply-amount">{count}</span>
                )}
              </div>
              <p>
                {offer === 'clock-free'
                  ? 'A permanent boost. Play at your own pace.'
                  : offer === 'sp-pack'
                    ? 'Extra SP for Infinity.'
                    : offer === 'hint-pack'
                      ? 'Show a safe tile.'
                      : offer === 'continue-pack'
                        ? 'Continue after a fall.'
                        : offer === 'shield-pack'
                          ? 'Absorb one broken tile.'
                          : 'Choose a new season.'}
              </p>
              <div className="cpi-supply-actions">
                <button
                  className="cpi-adventure-button is-quiet"
                  type="button"
                  aria-label={
                    offer === 'clock-free'
                      ? 'View permanent clock boost'
                      : 'Add more ' + label.toLowerCase()
                  }
                  onClick={() => openRestock(offer)}
                >
                  {offer === 'clock-free' ? 'View boost' : 'Add more'}
                </button>
                {offer === 'season-change-pack' && seasonCount >= 2 && count > 0 && (
                  <div className="cpi-season-use">
                    <button
                      className="cpi-adventure-button"
                      type="button"
                      onClick={onUseSeasonChange}
                    >
                      Use 1
                    </button>
                    <small aria-live="polite">
                      Next crossing · {INFINITY_WEATHER_NAMES[selectedInfinitySeason(progress)]}
                    </small>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ExpeditionStore({
  progress,
  initial = 'worlds',
  reducedMotion,
  onWorld,
  onBridge,
  onGear,
  onClaim,
  onUseSeasonChange,
  onToggleClock,
}: StoreActions & {
  progress: CampaignProgress;
  initial?: ExpeditionDepartment;
  reducedMotion: boolean;
  onUseSeasonChange: () => void;
  onToggleClock: () => void;
}) {
  const [department, setDepartment] = useState(initial);
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector<HTMLElement>('.cpi-market h2')?.focus({ preventScroll: true });
  }, [detail, department]);
  return (
    <section
      className="cpi-expedition cpi-market"
      data-detail={detail}
      data-department={department}
      aria-label="Wayfarer’s Market"
    >
      <header className="cpi-market-heading">
        <span className="cpi-market-seal" aria-hidden="true">
          <AdventureIcon name="lantern" />
        </span>
        <div>
          <p className="cpi-adventure-kicker">Store</p>
          <h1 id="cpi-market-title" data-menu-heading tabIndex={-1}>
            Wayfarer’s Market
          </h1>
          <p>Find a world and dress for the journey.</p>
        </div>
      </header>
      <nav className="cpi-market-departments" aria-label="Store sections">
        {departments.map(([id, name, icon]) => (
          <button
            key={id}
            type="button"
            aria-pressed={department === id}
            onClick={() => {
              setDepartment(id);
              setDetail(false);
            }}
          >
            <AdventureIcon name={icon} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      {department === 'worlds' && (
        <WorldCollection progress={progress} onWorld={onWorld} reducedMotion={reducedMotion} />
      )}
      {department === 'bridges' && (
        <BridgeWorkshop
          progress={progress}
          onBridge={onBridge}
          onDetail={setDetail}
          onClaim={onClaim}
          reducedMotion={reducedMotion}
        />
      )}
      {department === 'gear' && (
        <Outfitters
          progress={progress}
          onGear={onGear}
          onDetail={setDetail}
          onClaim={onClaim}
          reducedMotion={reducedMotion}
        />
      )}
      {department === 'supplies' && (
        <Supplies
          progress={progress}
          onClaim={onClaim}
          onUseSeasonChange={onUseSeasonChange}
          onToggleClock={onToggleClock}
          onDetail={setDetail}
        />
      )}
      <p className="cpi-adventure-footnote">
        Offline playtest · Test items are free on this device.
      </p>
    </section>
  );
}
