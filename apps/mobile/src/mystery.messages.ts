import type { EffectKind } from '@crystal-path-infinity/game-core';
import type { LocaleCode } from './i18n';

interface EffectCopy {
  title: string;
  detail: string;
  positive: boolean;
}

const enEffects: Record<EffectKind, EffectCopy> = {
  heal_10: {
    title: 'Crystal spark',
    detail: 'Restore 10 SP immediately. Maximum stability: 400.',
    positive: true,
  },
  heal_20: {
    title: 'Crystal heart',
    detail: 'Restore 20 SP immediately. Maximum stability: 400.',
    positive: true,
  },
  gain_hint: {
    title: 'A stolen secret',
    detail: 'Gain one hint. Spend it to reveal a current row for certain.',
    positive: true,
  },
  shield_5s: {
    title: 'Aegis',
    detail:
      'For 5 seconds: block the next wrong-tile damage, then shatter. Does not stop bleeding, vault fees or debt.',
    positive: true,
  },
  regen_5s: {
    title: 'Second breath',
    detail:
      'For 5 seconds: nine pulses of +2 SP, up to +18. Rising sparks mean healing; the numbers show the SP actually restored.',
    positive: true,
  },
  lucky_5s: {
    title: 'Borrowed luck',
    detail:
      'For 5 seconds: the next wrong tile heals +10 / +15 / +20 instead of hurting, then the charm breaks.',
    positive: true,
  },
  hurt_10: {
    title: 'Crystal bite',
    detail: 'Lose 10 SP immediately. Can be fatal.',
    positive: false,
  },
  hurt_15: {
    title: 'Deep fracture',
    detail: 'Lose 15 SP immediately. Can be fatal.',
    positive: false,
  },
  lose_hint: {
    title: 'A forgotten secret',
    detail: 'Lose one hint. Nothing is taken if you have none.',
    positive: false,
  },
  fragility_5s: {
    title: 'Brittle oath',
    detail:
      'For 5 seconds: your next damaging wrong tile hits twice as hard, then the curse breaks.',
    positive: false,
  },
  drain_5s: {
    title: 'The bleed',
    detail:
      'For 5 seconds: nine pulses of −2 SP, up to −18. Falling drops drain real SP and can kill. Aegis cannot stop this.',
    positive: false,
  },
  inversion_5s: {
    title: 'Twisted fate',
    detail:
      'For 5 seconds: every wrong tile heals +5 / +7 / +10 instead of hurting. The turning arrows mean repeated healing, not a curse.',
    positive: true,
  },
  blood_oath: {
    title: 'Blood oath',
    detail:
      'Take +35 SP now. For 3 rows, each wrong tile that still damages you takes another 15 SP. Refusing costs 8 SP.',
    positive: false,
  },
  false_oracle: {
    title: 'The lying oracle',
    detail:
      'For 3 rows, an omen is correct 70% of the time. Correct tiles grant +5 SP; wrong-tile damage doubles. Hints are sealed. Silence it: lose one hint, or 15 SP if you have none.',
    positive: false,
  },
  hungry_vault: {
    title: 'The hungry vault',
    detail:
      'Stake 12 SP. Consecutive correct tiles build a bank: 15 → 40 → 85 SP. Cash out after any success, or risk the next row. One wrong tile destroys the bank and takes 10 SP beyond tile damage. Refusing costs 8 SP.',
    positive: false,
  },
  borrowed_time: {
    title: 'Borrowed tomorrow',
    detail:
      'Take +50 SP now. After 3 rows, repay 65 SP, even if it kills you. After the first row you may settle early for 55 SP. Refusing costs 8 SP. Healing above 400 is lost; the debt is not reduced.',
    positive: false,
  },
  soul_exchange: {
    title: 'Soul exchange',
    detail:
      'Offer SP: pay 25, then 65% for 2 hints; otherwise 1 hint and another −15 SP. Offer a hint: spend 1, then 65% for +40 SP or 35% for −30 SP. A fatal SP payment grants no prize.',
    positive: false,
  },
};

const bgEffects: Record<EffectKind, EffectCopy> = {
  heal_10: {
    title: 'Кристална искра',
    detail: 'Възстановява 10 SP веднага. Максимална стабилност: 400.',
    positive: true,
  },
  heal_20: {
    title: 'Кристално сърце',
    detail: 'Възстановява 20 SP веднага. Максимална стабилност: 400.',
    positive: true,
  },
  gain_hint: {
    title: 'Открадната тайна',
    detail: 'Получаваш една подсказка. Използвай я, за да разкриеш със сигурност текущия ред.',
    positive: true,
  },
  shield_5s: {
    title: 'Егида · Щит',
    detail:
      'За 5 секунди: спира щетата от следващата грешна плочка, след което се пръсва. Не спира кървенето, таксата на трезора или дълга.',
    positive: true,
  },
  regen_5s: {
    title: 'Втори дъх',
    detail:
      'За 5 секунди: девет пулса по +2 SP, общо до +18. Издигащите се искри означават лечение; числата показват реално възстановените SP.',
    positive: true,
  },
  lucky_5s: {
    title: 'Заемен късмет',
    detail:
      'За 5 секунди: следващата грешна плочка лекува с +10 / +15 / +20 вместо да наранява. После талисманът се счупва.',
    positive: true,
  },
  hurt_10: {
    title: 'Кристална захапка',
    detail: 'Губиш 10 SP веднага. Може да е смъртоносно.',
    positive: false,
  },
  hurt_15: {
    title: 'Дълбока пукнатина',
    detail: 'Губиш 15 SP веднага. Може да е смъртоносно.',
    positive: false,
  },
  lose_hint: {
    title: 'Забравена тайна',
    detail: 'Губиш една подсказка. Ако нямаш, не губиш нищо.',
    positive: false,
  },
  fragility_5s: {
    title: 'Крехка клетва',
    detail:
      'За 5 секунди: следващата грешна плочка, която те наранява, удря двойно. После проклятието се пречупва.',
    positive: false,
  },
  drain_5s: {
    title: 'Кървенето',
    detail:
      'За 5 секунди: девет пулса по −2 SP, общо до −18. Падащите капки отнемат реални SP и могат да убият. Щитът не ги спира.',
    positive: false,
  },
  inversion_5s: {
    title: 'Обърната съдба',
    detail:
      'За 5 секунди: всяка грешна плочка лекува с +5 / +7 / +10 вместо да наранява. Въртящите се стрелки означават многократно лечение, не проклятие.',
    positive: true,
  },
  blood_oath: {
    title: 'Кръвна клетва',
    detail:
      'Вземи +35 SP сега. За 3 реда всяка грешна плочка, която те наранява, отнема още 15 SP. Отказът струва 8 SP.',
    positive: false,
  },
  false_oracle: {
    title: 'Лъжливият оракул',
    detail:
      'За 3 реда предзнаменованието е вярно в 70% от случаите. Правилните плочки дават +5 SP; щетата от грешните е двойна. Подсказките са запечатани. Заглуши го: губиш една подсказка, или 15 SP, ако нямаш.',
    positive: false,
  },
  hungry_vault: {
    title: 'Алчният трезор',
    detail:
      'Заложи 12 SP. Последователни правилни плочки трупат награда: 15 → 40 → 85 SP. Прибери я след успех или рискувай следващия ред. Една грешна плочка унищожава наградата и отнема още 10 SP върху щетата. Отказът струва 8 SP.',
    positive: false,
  },
  borrowed_time: {
    title: 'Заем от бъдещето',
    detail:
      'Вземи +50 SP сега. След 3 реда връщаш 65 SP, дори това да те убие. След първия ред можеш да погасиш рано за 55 SP. Отказът струва 8 SP. Лечението над 400 се губи; дългът остава.',
    positive: false,
  },
  soul_exchange: {
    title: 'Размяна на душа',
    detail:
      'Дай SP: плащаш 25, после 65% за 2 подсказки; иначе 1 подсказка и още −15 SP. Дай подсказка: харчиш 1, после 65% за +40 SP или 35% за −30 SP. Смъртоносно плащане на SP не носи награда.',
    positive: false,
  },
};

const en = {
  effects: 'Active forces',
  beneficial: 'Blessing',
  dangerous: 'Danger',
  rules: 'What does it do?',
  contract: 'A price must be chosen',
  frozen: 'Existing effect timers are held while you decide.',
  rows: 'rows left',
  bank: 'SP in the vault',
  omen: 'Fallible omen · 70%',
  left: 'LEFT',
  right: 'RIGHT',
  accept: 'Bind the oath',
  decline: 'Break the seal · −8 SP',
  bloodAccept: '+35 SP · accept the blood debt',
  oracleAccept: 'Listen · 70% truth, double danger',
  oracleDecline: 'Silence · −1 hint / −15 SP',
  oracleKnown: 'This row is already revealed. The oracle will not bargain.',
  vaultAccept: 'Stake 12 SP · open the vault',
  borrowAccept: 'Borrow 50 SP · owe 65',
  spOffer: 'Offer SP · −25 to −40 SP',
  hintOffer: 'Offer a hint · +40 or −30 SP',
  cashout: 'Take {bank} SP',
  settle: 'Settle now · −55 SP',
  hintsSealed: 'Hints sealed for this pact',
  lethal: 'A payment or loss can kill you. Read the price before choosing.',
  priority: 'Wrong-tile priority: shield → borrowed luck → twisted fate → brittle oath.',
  accepted: 'The pact is bound',
  declined: 'The price of refusal is paid',
  won: 'The exchange favoured you',
  lost: 'The price is taken',
  banked: 'The vault pays out',
  paid: 'The debt is collected',
  expired: 'The pact releases you',
  triggered: 'The effect intervenes',
  pulse: 'A real SP pulse',
  lab: 'Mystery chamber',
  labIntro:
    'Try all 17 mysteries. Each room uses the real game rules; omens can lie and choices can kill.',
  labNote: 'A separate practice room. Your paused run is kept intact.',
  back: 'Back to my run',
  reset: 'Reset this mystery',
  starting: 'Starting SP',
  hints: 'Hints',
  stepLeft: 'Step left',
  stepRight: 'Step right',
  hint: 'Use a hint',
  died: 'The chamber claimed you.',
  choose: 'Choose a mystery to enter its chamber.',
  classic: 'Original mysteries',
  pacts: 'Five forbidden pacts',
  close: 'Close',
};
type CopyKey = keyof typeof en;
const bg: Record<CopyKey, string> = {
  effects: 'Активни сили',
  beneficial: 'Благословия',
  dangerous: 'Опасност',
  rules: 'Как действа?',
  contract: 'Цената трябва да бъде избрана',
  frozen: 'Таймерите на наличните ефекти са спрени, докато решаваш.',
  rows: 'оставащи реда',
  bank: 'SP в трезора',
  omen: 'Несигурно знамение · 70%',
  left: 'ЛЯВО',
  right: 'ДЯСНО',
  accept: 'Сключи клетвата',
  decline: 'Счупи печата · −8 SP',
  bloodAccept: '+35 SP · приеми кръвния дълг',
  oracleAccept: 'Чуй го · 70% истина, двойна опасност',
  oracleDecline: 'Заглуши · −1 подсказка / −15 SP',
  oracleKnown: 'Този ред вече е разкрит. Оракулът отказва сделката.',
  vaultAccept: 'Заложи 12 SP · отвори трезора',
  borrowAccept: 'Вземи 50 SP · дължиш 65',
  spOffer: 'Дай SP · −25 до −40 SP',
  hintOffer: 'Дай подсказка · +40 или −30 SP',
  cashout: 'Прибери {bank} SP',
  settle: 'Погаси сега · −55 SP',
  hintsSealed: 'Подсказките са запечатани за този пакт',
  lethal: 'Плащането или загубата могат да те убият. Прочети цената, преди да избереш.',
  priority: 'При грешка: щит → заемен късмет → обърната съдба → крехка клетва.',
  accepted: 'Пактът е сключен',
  declined: 'Цената на отказа е платена',
  won: 'Размяната е в твоя полза',
  lost: 'Цената е взета',
  banked: 'Трезорът изплаща наградата',
  paid: 'Дългът е събран',
  expired: 'Пактът те освобождава',
  triggered: 'Ефектът се намесва',
  pulse: 'Реален пулс на SP',
  lab: 'Стая на мистериите',
  labIntro:
    'Изпробвай всичките 17 мистерии. Всяка стая използва истинските правила; знаменията могат да лъжат, а изборите да убият.',
  labNote: 'Отделна тренировъчна стая. Паузираният ти опит се запазва.',
  back: 'Назад към моя опит',
  reset: 'Повтори тази мистерия',
  starting: 'Начални SP',
  hints: 'Подсказки',
  stepLeft: 'Стъпка вляво',
  stepRight: 'Стъпка вдясно',
  hint: 'Използвай подсказка',
  died: 'Стаята те погълна.',
  choose: 'Избери мистерия, за да влезеш в нейната стая.',
  classic: 'Познатите мистерии',
  pacts: 'Пет забранени пакта',
  close: 'Затвори',
};

export function effectCopy(locale: LocaleCode, kind: EffectKind): EffectCopy {
  return (locale === 'bg' ? bgEffects : enEffects)[kind];
}
export function mysteryText(locale: LocaleCode, key: CopyKey): string {
  return (locale === 'bg' ? bg : en)[key];
}
