import type { BridgeRow, EffectKind, TileSide } from './types.ts';

export const SEASONS = ['spring', 'summer', 'winter', 'autumn'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_ODDS = { spring: 0.5, summer: 0.55, winter: 0.45, autumn: 0.55 };
export const WEATHER = {
  rain: { name: 'Spring Rain', rows: 6, odds: 0.6 },
  rainbow: { name: 'Spring Rainbow', rows: 3, odds: 0.5 },
  heat: { name: 'Summer Heat Surge', rows: 3, odds: 0.65 },
  shower: { name: 'Summer Shower', rows: 4, odds: 0.6 },
  snow: { name: 'Winter Snow', rows: 6, odds: 0.2925 },
  thaw: { name: 'Winter Sun · Thaw', rows: 3, odds: 0.5 },
  gust: { name: 'Autumn Leaf Gust', rows: 3, odds: 0.55 },
  squall: { name: 'Autumn Squall', rows: 6, odds: 0.65 },
} as const;
export type Weather = keyof typeof WEATHER;
export type RouteCue = 'echo' | 'mirror' | 'prism' | 'gust' | 'crack' | 'beacon' | 'lens';
export interface JourneyMark {
  readonly row: number;
  readonly safe?: TileSide;
  readonly cue?: RouteCue;
  readonly bothBroken?: true;
  readonly encounter?: 'heal_10' | 'marketing' | 'shield_5s';
}
export interface JourneyRoute {
  readonly version: 1;
  readonly season: Season;
  readonly windows?: readonly { readonly start: number; readonly weather: Weather }[];
  readonly marks?: readonly JourneyMark[];
  readonly rotation?: { readonly offset: number; readonly rainbow: boolean };
  readonly reviveSp?: number;
}
export type JourneyCue = { readonly kind: RouteCue; readonly side: TileSide | null };
const alternate = (side: TileSide): TileSide => (side === 'left' ? 'right' : 'left');

export function assertJourneyRoute(route: JourneyRoute): void {
  if (
    route.version !== 1 ||
    !SEASONS.includes(route.season) ||
    (route.windows &&
      (route.windows.length > 32 ||
        route.windows.some(
          (window, index, all) =>
            !Number.isSafeInteger(window.start) ||
            window.start < 1 ||
            !Object.hasOwn(WEATHER, window.weather) ||
            (index > 0 &&
              all[index - 1].start + WEATHER[all[index - 1].weather].rows > window.start),
        ))) ||
    (route.marks &&
      (route.marks.length > 128 ||
        route.marks.some(
          (mark, index, all) =>
            !Number.isSafeInteger(mark.row) ||
            mark.row < 1 ||
            (index > 0 && all[index - 1].row >= mark.row) ||
            (mark.safe !== undefined && !['left', 'right'].includes(mark.safe)) ||
            (mark.bothBroken !== undefined && (mark.bothBroken !== true || !!mark.safe)) ||
            (mark.cue !== undefined &&
              !['echo', 'mirror', 'prism', 'gust', 'crack', 'beacon', 'lens'].includes(mark.cue)) ||
            (mark.encounter !== undefined &&
              !['heal_10', 'marketing', 'shield_5s'].includes(mark.encounter)),
        ))) ||
    (route.rotation &&
      (route.windows ||
        route.marks ||
        !Number.isInteger(route.rotation.offset) ||
        route.rotation.offset < 0 ||
        route.rotation.offset > 5 ||
        typeof route.rotation.rainbow !== 'boolean')) ||
    (route.reviveSp !== undefined &&
      (!Number.isSafeInteger(route.reviveSp) || route.reviveSp < 1 || route.reviveSp > 400))
  )
    throw new RangeError('Invalid local Journey route.');
}

function weatherWindows(route: JourneyRoute, row: bigint) {
  if (!route.rotation)
    return (route.windows ?? []).map(({ start, weather }) => ({ start: BigInt(start), weather }));
  const block = (row - 1n) / 36n;
  const { offset, rainbow } = route.rotation;
  const choices: Record<Season, readonly Weather[]> = {
    spring: ['rain'],
    summer: ['shower', 'heat'],
    winter: ['snow', 'thaw'],
    autumn: ['gust', 'squall'],
  };
  const windows: { start: bigint; weather: Weather }[] = [];
  for (const cycle of [block, block + 1n]) {
    const start = cycle * 36n + 25n;
    const pick = Number((cycle + BigInt(offset)) % 6n);
    const pool = choices[route.season];
    windows.push({ start, weather: pool[pick % pool.length] });
    if (route.season === 'spring' && rainbow && pick % 3 === 2)
      windows.push({ start: start + 8n, weather: 'rainbow' });
  }
  return windows;
}

export function journeyForecast(route: JourneyRoute, row: bigint) {
  const window = weatherWindows(route, row).find(
    ({ start, weather }) => row < start + BigInt(WEATHER[weather].rows),
  );
  if (!window) return null;
  return {
    weather: window.weather,
    startsIn: window.start > row ? window.start - row : 0n,
    rowsLeft:
      window.start +
      BigInt(WEATHER[window.weather].rows) -
      (window.start > row ? window.start : row),
  };
}

export function activeJourneyWeather(route: JourneyRoute, row: bigint): Weather | undefined {
  const forecast = journeyForecast(route, row);
  return forecast?.startsIn === 0n ? forecast.weather : undefined;
}

export function journeyRow(
  route: JourneyRoute,
  row: bigint,
  side: TileSide,
  left: number,
  right: number,
) {
  const forecast = journeyForecast(route, row);
  const weather = forecast?.startsIn === 0n ? forecast.weather : undefined;
  const mark = route.marks?.find((item) => BigInt(item.row) === row);
  const odds = weather ? WEATHER[weather].odds : SEASON_ODDS[route.season];
  const broken = { left: left < odds, right: right < odds };
  if (mark?.bothBroken) broken.left = broken.right = true;
  if (weather === 'rainbow') broken[side] = false;
  if (mark?.safe) {
    broken[mark.safe] = false;
    if (mark.cue) broken[alternate(mark.safe)] = true;
  }
  const safe = !broken[side] ? side : !broken[alternate(side)] ? alternate(side) : null;
  const kind =
    mark?.cue ??
    (weather === 'rainbow'
      ? 'prism'
      : weather === 'heat'
        ? 'mirror'
        : weather === 'gust' && forecast?.rowsLeft === BigInt(WEATHER.gust.rows)
          ? 'gust'
          : null);
  const cue: JourneyCue | undefined = kind
    ? {
        kind,
        side:
          kind === 'mirror' && safe
            ? alternate(safe)
            : kind === 'crack'
              ? null
              : (mark?.safe ?? safe),
      }
    : undefined;
  return { broken, cue, encounter: mark?.encounter };
}

export function journeyExpectedSide(row: Pick<BridgeRow, 'cue'>): TileSide | null {
  const { cue } = row;
  return !cue?.side ? null : cue.kind === 'mirror' ? alternate(cue.side) : cue.side;
}

export function isJourneyEncounter(kind: EffectKind): boolean {
  return kind === 'heal_10' || kind === 'marketing' || kind === 'shield_5s';
}
