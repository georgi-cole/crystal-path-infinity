import { adventurePrice } from './adventure-prices';
import type { GearId, Season, Weather } from '@crystal-path-infinity/game-core';

export const INFINITY_WEATHER_NAMES: Record<Season | 'plain', string> = {
  plain: 'Clear Sky',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export const CLEAR_SKY: Record<Season, string> = {
  spring: 'Flowers are out. The bridge is dry.',
  summer: 'Bright and warm. Watch for strong sunlight.',
  autumn: 'Leaves are falling. Wind may blow across the bridge.',
  winter: 'Cold glass is a little stronger.',
};

export const WEATHER_COPY: Record<Weather, { title: string; remark: string }> = {
  rain: { title: 'Spring Rain', remark: 'Rain makes tiles break more often. Watch your step!' },
  rainbow: { title: 'Rainbow', remark: 'A rainbow shows a safe path. Follow its light.' },
  heat: {
    title: 'Sun Glare',
    remark: 'Strong sunlight can show the wrong tile. Choose the other side.',
  },
  shower: {
    title: 'Summer Shower',
    remark: 'Summer rain makes tiles break more often.',
  },
  snow: {
    title: 'Fresh Snow',
    remark: 'Snow makes tiles stronger. Fewer tiles break.',
  },
  thaw: {
    title: 'Winter Thaw',
    remark: 'The ice is melting. Tiles are less strong.',
  },
  gust: {
    title: 'Leaf Gust',
    remark: 'Wind blows leaves across the bridge. Follow the marked tile.',
  },
  squall: {
    title: 'Thunderstorm',
    remark: 'Thunderstorm! More tiles may break.',
  },
};

export const GEAR_COPY = {
  'trail-scarf': {
    name: 'Trail Scarf',
    price: adventurePrice('gear:trail-scarf'),
    glyph: '❧',
    look: 'A thick knitted scarf with a tiny golden leaf clasp.',
    helps: 'In winter, broken tiles cost 2 fewer SP. During a thaw, they cost 1 fewer SP.',
    caution: 'Rain makes the scarf heavy. In rain or thunderstorms, broken tiles cost 2 extra SP.',
    warning: 'Wet scarf! Broken tiles cost 2 extra SP. Put it away.',
    ready: 'Wrapped up for winter. Save SP on broken tiles.',
  },
  umbrella: {
    name: 'Glasswing Umbrella',
    price: adventurePrice('gear:umbrella'),
    glyph: '☂',
    look: 'A strong little umbrella in your character’s colors.',
    helps: 'In rain, lose 3 fewer SP when a tile breaks.',
    caution: 'In strong wind or a thunderstorm, lose 2 extra SP on broken tiles. Put it away.',
    warning: 'Strong wind! A broken tile costs 2 extra SP with this umbrella.',
    ready: 'Rain protection. Lose 3 fewer SP on a broken tile.',
  },
  sunshades: {
    name: 'Sunshades',
    price: adventurePrice('gear:sunshades'),
    glyph: '◒',
    look: 'Sunglasses shaped for your character.',
    helps: 'In strong sunlight, the light shows the correct tile. Broken tiles cost 2 fewer SP.',
    caution: 'In snow or thunderstorms, broken tiles cost 2 extra SP. Take the glasses off.',
    warning: 'Too dark for sunglasses. Broken tiles cost 2 extra SP.',
    ready: 'Follow the light. Your sunglasses show the correct tile.',
  },
  'sun-balm': {
    name: 'Sun Cream',
    price: adventurePrice('gear:sun-balm'),
    glyph: '☀',
    look: 'Sun cream and a tiny sun-shaped tin.',
    helps:
      'In strong sunlight, broken tiles cost 3 fewer SP. In clear summer weather, safe steps give 1 SP.',
    caution: 'Helps in summer sun. It has no effect in other weather.',
    warning: 'Sun cream has no effect in this weather.',
    ready: 'Sun protection is working.',
  },
  'frost-runners': {
    name: 'Frost Runners',
    price: adventurePrice('gear:frost-runners'),
    glyph: '⌁',
    look: 'Ice skates made for snowy crossings.',
    helps: 'In snow, broken tiles cost 2 fewer SP and safe steps give 1 SP.',
    caution:
      'In rain, wind, melting ice or dry summer weather, broken tiles cost 2 extra SP. Take them off.',
    warning: 'Wrong weather for skates. Broken tiles cost 2 extra SP.',
    ready: 'Snow bonus. Save 2 SP on broken tiles and gain 1 SP on safe steps.',
  },
  'storm-boots': {
    name: 'Storm Boots',
    price: adventurePrice('gear:storm-boots'),
    glyph: '◈',
    look: 'Strong rain boots in your character’s colors.',
    helps:
      'In rain or thunderstorms, broken tiles cost 2 fewer SP. In autumn wind, they cost 1 fewer SP.',
    caution: 'In snow, broken tiles cost 2 extra SP. Take the boots off.',
    warning: 'These boots are bad in snow. Broken tiles cost 2 extra SP.',
    ready: 'The boots reduce SP lost on broken tiles.',
  },
} as const satisfies Record<
  GearId,
  {
    name: string;
    price: string;
    glyph: string;
    look: string;
    helps: string;
    caution: string;
    warning: string;
    ready: string;
  }
>;
