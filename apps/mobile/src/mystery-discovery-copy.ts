import type { EffectKind } from '@crystal-path-infinity/game-core';

const summaries: Partial<Record<EffectKind, readonly [string, string]>> = {
  heal_10: ['Получаваш 10 SP веднага.', 'Gain 10 SP immediately.'],
  heal_20: ['Получаваш 20 SP веднага.', 'Gain 20 SP immediately.'],
  hurt_10: ['Губиш 10 SP веднага.', 'Lose 10 SP immediately.'],
  hurt_15: ['Губиш 15 SP веднага.', 'Lose 15 SP immediately.'],
  gain_hint: ['Получаваш още една подсказка.', 'Receive one more hint.'],
  lose_hint: ['Губиш една подсказка, ако имаш.', 'Lose one hint if you have any.'],
  half_life: ['Размени половината си SP за 5 подсказки.', 'Trade half your SP for 5 hints.'],
  marketing: ['Всяка продадена подсказка носи 20 SP.', 'Each hint you sell earns 20 SP.'],
  soul_exchange: [
    'Избери: дай SP за подсказки или подсказка за шанс да спечелиш SP. Има риск.',
    'Choose: give SP for hints, or a hint for a chance to win SP. There is a risk.',
  ],
  borrowed_time: [
    'Вземи 50 SP сега. Върни 65 SP след 3 стъпки.',
    'Borrow 50 SP now. Repay 65 SP after 3 steps.',
  ],
  blood_oath: [
    'Вземи 35 SP сега, но за 3 стъпки счупените плочки отнемат още 15 SP.',
    'Gain 35 SP now, but for 3 steps broken tiles take 15 SP extra.',
  ],
  false_oracle: [
    'Стрелка те насочва за 3 стъпки. Може да греши, а щетите са двойни.',
    'An arrow guides you for 3 steps. It can be wrong, and damage is doubled.',
  ],
  hungry_vault: [
    'Дай 12 SP. Здравите стъпки трупат награда. Прибери я или рискувай за още.',
    'Pay 12 SP. Safe steps build a prize. Collect it or risk a step for more.',
  ],
  shield_5s: [
    'Щитът спира един удар от плочка. Изчезва след употреба или след 5 секунди.',
    'Block one tile hit. The shield disappears after use or after 5 seconds.',
  ],
  lucky_5s: [
    'За 5 секунди: една счупена плочка ти дава 5 SP, вместо да ти взема.',
    'For 5 seconds: one broken tile gives you 5 SP instead of taking SP.',
  ],
  inversion_5s: [
    'За 5 секунди: всяка счупена плочка ти дава 5 SP, вместо да ти взема.',
    'For 5 seconds, every broken tile gives +5 SP instead of taking SP.',
  ],
  fragility_5s: [
    'За 5 секунди: следващата щета от плочка е двойна.',
    'For 5 seconds: double the next tile damage.',
  ],
  regen_3rows: [
    'След всяка от следващите 3 стъпки получаваш 6 SP, ако си останал жив.',
    'For your next 3 steps, gain 6 SP after each step you survive.',
  ],
  bleed_3rows: [
    'След всяка от следващите 3 стъпки губиш 3 SP, дори плочката да е здрава.',
    'Lose 3 SP after each of your next 3 steps, even on safe tiles.',
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
