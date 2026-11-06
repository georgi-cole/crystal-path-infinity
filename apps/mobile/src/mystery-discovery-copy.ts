import type { EffectKind } from '@crystal-path-infinity/game-core';

const summaries: Partial<Record<EffectKind, readonly [string, string]>> = {
  heal_10: ['Възстановява 10 SP веднага.', 'Restore 10 SP immediately.'],
  heal_20: ['Възстановява 20 SP веднага.', 'Restore 20 SP immediately.'],
  hurt_10: ['Губиш 10 SP веднага.', 'Lose 10 SP immediately.'],
  hurt_15: ['Губиш 15 SP веднага.', 'Lose 15 SP immediately.'],
  gain_hint: ['Получаваш още една подсказка.', 'Receive one more hint.'],
  lose_hint: ['Губиш една подсказка, ако имаш.', 'Lose one hint if you have any.'],
  half_life: ['Размени половината си SP за 5 подсказки.', 'Trade half your SP for 5 hints.'],
  marketing: ['Всяка продадена подсказка носи 20 SP.', 'Each hint you sell earns 20 SP.'],
  soul_exchange: [
    'Жертвай SP или подсказка за несигурна награда.',
    'Sacrifice SP or a hint for an uncertain reward.',
  ],
  borrowed_time: [
    'Вземи 50 SP сега. Върни 65 SP след 3 стъпки.',
    'Borrow 50 SP now. Repay 65 SP after 3 steps.',
  ],
  blood_oath: [
    'Вземи 35 SP. За 3 реда ударът струва още 15 SP.',
    'Gain 35 SP. For 3 rows, each hit costs 15 SP extra.',
  ],
  false_oracle: [
    'Видение за 3 реда: 70% вярно, двойна щета.',
    'A 3-row vision: 70% reliable, double damage.',
  ],
  hungry_vault: [
    'Заложи 12 SP. Прибери натрупаното преди счупване.',
    'Stake 12 SP. Collect your winnings before a tile breaks.',
  ],
  shield_5s: [
    'За 5 секунди: щитът поема следващата счупена плочка.',
    'For 5 seconds: block the next broken tile.',
  ],
  lucky_5s: [
    'За 5 секунди: следващата счупена плочка те лекува с 5 SP.',
    'For 5 seconds: the next broken tile heals 5 SP.',
  ],
  inversion_5s: [
    'За 5 секунди: всяка счупена плочка дава +5 SP.',
    'For 5 seconds: every broken tile gives +5 SP.',
  ],
  fragility_5s: [
    'За 5 секунди: следващата щета от плочка е двойна.',
    'For 5 seconds: double the next tile damage.',
  ],
  regen_3rows: [
    'Следващите 3 стъпки: +6 SP след всяка оцеляна стъпка.',
    'Next 3 steps: recover 6 SP after each surviving step.',
  ],
  bleed_3rows: [
    'Следващите 3 стъпки: губиш още 3 SP след всяка. Може да те убие.',
    'Next 3 steps: lose another 3 SP after each. Can be fatal.',
  ],
  double_gain_21s: [
    'За 21 секунди: получените бонус SP са двойни. Сделките запазват цените си.',
    'For 21 seconds: double SP bonuses. Trade prices stay fixed.',
  ],
  double_loss_21s: [
    'За 21 секунди: щетите от плочки и ефекти са двойни.',
    'For 21 seconds: double damage from tiles and effects.',
  ],
  coyote_10s: [
    'За 10 секунди: плочките не отнемат SP. Другите загуби остават.',
    'For 10 seconds: tiles take no SP. Other losses still apply.',
  ],
  mystery_silence_30s: [
    'За 30 секунди: няма нови mystery кутии.',
    'For 30 seconds: no new mystery boxes.',
  ],
  mystery_surge_30s: [
    'За 30 секунди: mystery кутия през 3 реда.',
    'For 30 seconds: a mystery box every 3 rows.',
  ],
};
export function mysteryDiscoverySummary(kind: EffectKind, bg: boolean): string | null {
  return summaries[kind]?.[bg ? 0 : 1] ?? null;
}
