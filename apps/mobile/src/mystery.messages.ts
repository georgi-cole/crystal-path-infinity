import type { EffectKind } from '@crystal-path-infinity/game-core';
import {
  usesBalanceRules,
  usesRiskRules,
  RULESET_VERSION,
  usesRelicRules,
} from '@crystal-path-infinity/game-core';
import type { LocaleCode } from './i18n';

interface EffectCopy {
  title: string;
  detail: string;
  positive: boolean;
}

const enEffects: Record<EffectKind, EffectCopy> = {
  mystery_silence_30s: {
    title: 'The rift · Silence',
    detail:
      'The violet box flips a fair 50/50 coin: 30 seconds without new mystery boxes, or 30 seconds with a box every 3 rows. This time: Silence. The usual 5-row spacing resumes afterwards. Existing choices remain available.',
    positive: false,
  },
  mystery_surge_30s: {
    title: 'The rift · Surge',
    detail:
      'The violet box flips a fair 50/50 coin: 30 seconds without new mystery boxes, or 30 seconds with a box every 3 rows. This time: Surge. Cooldowns still protect rare choices. The usual 5-row spacing resumes afterwards.',
    positive: true,
  },
  coyote_10s: {
    title: 'Run Coyote · 10s',
    detail:
      'For 10 seconds, broken tiles take no SP. Bleeding, mystery losses, pact penalties and debts still apply. Healing wrong steps still work. Aegis and Brittle oath are kept while Coyote protects you.',
    positive: true,
  },
  double_gain_21s: {
    title: 'Double SP · 21s',
    detail:
      'For 21 seconds, SP healing and rewards are doubled. Trade prices and agreed debts stay exact. Duplicate drops refresh the timer; they do not multiply again.',
    positive: true,
  },
  double_loss_21s: {
    title: 'Double damage · 21s',
    detail:
      'For 21 seconds, wrong-tile damage, harmful mysteries and bleeding take twice as much SP. Trade prices and agreed debts stay exact. Duplicate drops refresh the timer.',
    positive: false,
  },
  regen_3rows: {
    title: 'Second breath',
    detail:
      'After each of the next 3 survived rows, recover 6 SP: 18 in total. You must survive the tile first. Waiting does not use charges.',
    positive: true,
  },
  bleed_3rows: {
    title: 'The bleed',
    detail:
      'After each of the next 3 survived tile choices, lose another 3 SP: 9 in total. Even a correct tile can now kill you. Waiting does not remove the curse; Aegis does not stop it.',
    positive: false,
  },
  half_life: {
    title: 'Half Life',
    detail:
      'Sell half your current SP for 5 hints. Example: 100 SP and 2 hints become 50 SP and 7 hints. With an odd SP total, keep the rounded-down half. You may walk away for free.',
    positive: false,
  },
  marketing: {
    title: 'Marketing',
    detail:
      'Sell 1 hint for exactly 20 SP, or sell all your hints at that rate. Example: 100 SP and 3 hints become 120 SP and 2 hints. The price is fixed, even during Double SP. You may walk away for free.',
    positive: false,
  },
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
  mystery_silence_30s: {
    title: 'Разломът · Тишина',
    detail:
      'Виолетовата кутия тегли 50/50: 30 секунди без нови мистерии или 30 секунди с кутия през 3 реда. Този път: Тишина. После се връща обичайният ритъм през 5 реда. Вече появил се избор остава.',
    positive: false,
  },
  mystery_surge_30s: {
    title: 'Разломът · Поток',
    detail:
      'Виолетовата кутия тегли 50/50: 30 секунди без нови мистерии или 30 секунди с кутия през 3 реда. Този път: Поток. Периодите без повторение за редките сделки остават. После ритъмът отново е през 5 реда.',
    positive: true,
  },
  coyote_10s: {
    title: 'Run Coyote · 10 сек.',
    detail:
      'За 10 секунди счупените плочки не отнемат SP. Кървене, вредни мистерии, цени на пактове и дългове продължават. Лечебните грешки още работят. Щитът и Крехката клетва се запазват, докато Койотът те пази.',
    positive: true,
  },
  double_gain_21s: {
    title: 'Двойни SP · 21 сек.',
    detail:
      'За 21 секунди получаваш двойно SP от лечение и награди. Цените на сделките и договорените дългове остават точни. Повторно изтегляне подновява времето, без ново умножение.',
    positive: true,
  },
  double_loss_21s: {
    title: 'Двойни щети · 21 сек.',
    detail:
      'За 21 секунди грешните плочки, вредните мистерии и кървенето отнемат двойно SP. Цените на сделките и договорените дългове остават точни. Повторно изтегляне подновява времето.',
    positive: false,
  },
  regen_3rows: {
    title: 'Втори дъх',
    detail:
      'След всеки от следващите 3 преживени реда възстановяваш 6 SP: общо 18. Първо трябва да оцелееш при стъпката. Изчакването не харчи зарядите.',
    positive: true,
  },
  bleed_3rows: {
    title: 'Кървенето',
    detail:
      'След всеки от следващите 3 преживени избора губиш още 3 SP: общо 9. Дори правилна плочка вече може да те убие. Изчакването не премахва проклятието; щитът не го спира.',
    positive: false,
  },
  half_life: {
    title: 'Half Life',
    detail:
      'Продаваш половината от текущите си SP срещу 5 подсказки. Пример: 100 SP и 2 подсказки стават 50 SP и 7 подсказки. При нечетен брой запазваш закръглената надолу половина. Можеш да откажеш без цена.',
    positive: false,
  },
  marketing: {
    title: 'Marketing',
    detail:
      'Продаваш 1 подсказка за точно 20 SP или всичките по същия курс. Пример: 100 SP и 3 подсказки стават 120 SP и 2 подсказки. Курсът остава фиксиран дори при Двойни SP. Можеш да откажеш без цена.',
    positive: false,
  },
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
  traded: 'The trade is complete',
  walked_away: 'No trade was made',
  expired: 'The pact releases you',
  triggered: 'The effect intervenes',
  pulse: 'A real SP pulse',
  lab: 'Mystery chamber',
  labIntro:
    'Try all {count} mysteries. The clock starts frozen so you can inspect each effect. Run it or advance one second at a time.',
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
  pacts: 'Forbidden pacts and trades',
  close: 'Close',
  walkAway: 'Walk away · no cost',
  halfAccept: 'Keep {sp} SP · receive 5 hints',
  sellOne: 'Sell 1 hint · +20 SP',
  sellAll: 'Sell {hints} hints · +{sp} SP',
  beforeAfter: 'Your resources after the trade',
  noLimit: 'No SP limit',
  demoWrong: 'Demo: step on a broken tile',
  demoSafe: 'Demo: take the safe tile',
  demoOnly: 'Demonstration controls reveal the chosen outcome only inside this test room.',
  pauseDemo: 'Freeze demo time',
  resumeDemo: 'Run demo time',
  advanceTime: '+1 second',
  comparison: 'This step: {before} → {after} SP. Without an effect: {normal} SP.',
  stepGain: '+6 SP after survival',
  stepBleed: '−3 SP after the tile',
  borrowExample:
    'Emergency example: at 5 SP, taking 50 gives you 55 and lets you survive a 5-SP wrong step. You still owe 65; without new resources you will die when collection arrives.',
  soulSpExample:
    'Need hints? Pay 25 SP. 65%: gain 2 hints. 35%: gain 1 hint and pay another 15 SP.',
  soulHintExample: 'Need SP? Spend 1 hint. 65%: gain 40 SP. 35%: lose 30 SP.',
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
  traded: 'Сделката е завършена',
  walked_away: 'Отказа сделката без цена',
  expired: 'Пактът те освобождава',
  triggered: 'Ефектът се намесва',
  pulse: 'Реален пулс на SP',
  lab: 'Стая на мистериите',
  labIntro:
    'Изпробвай всичките {count} мистерии. Времето първо е спряно, за да огледаш ефекта. Пусни го или напредвай секунда по секунда.',
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
  pacts: 'Забранени пактове и сделки',
  close: 'Затвори',
  walkAway: 'Откажи · без цена',
  halfAccept: 'Запази {sp} SP · получи 5 подсказки',
  sellOne: 'Продай 1 подсказка · +20 SP',
  sellAll: 'Продай {hints} подсказки · +{sp} SP',
  beforeAfter: 'Ресурсите ти след сделката',
  noLimit: 'Без таван на SP',
  demoWrong: 'Демо: стъпи върху счупена плочка',
  demoSafe: 'Демо: стъпи върху здрава плочка',
  demoOnly: 'Демонстрационните бутони разкриват резултата само в тази тестова стая.',
  pauseDemo: 'Спри времето в демото',
  resumeDemo: 'Пусни времето в демото',
  advanceTime: '+1 секунда',
  comparison: 'Тази стъпка: {before} → {after} SP. Без ефект: {normal} SP.',
  stepGain: '+6 SP след оцеляване',
  stepBleed: '−3 SP след плочката',
  borrowExample:
    'Авариен пример: при 5 SP вземаш 50, ставаш с 55 и можеш да преживееш грешна стъпка за 5 SP. Все още дължиш 65; без нови ресурси ще умреш при събирането на дълга.',
  soulSpExample:
    'Трябват ти подсказки? Плащаш 25 SP. 65%: получаваш 2 подсказки. 35%: получаваш 1 и плащаш още 15 SP.',
  soulHintExample: 'Трябват ти SP? Харчиш 1 подсказка. 65%: получаваш 40 SP. 35%: губиш 30 SP.',
};

export function effectCopy(
  locale: LocaleCode,
  kind: EffectKind,
  version = RULESET_VERSION,
): EffectCopy {
  const original = (locale === 'bg' ? bgEffects : enEffects)[kind];
  const copy =
    usesRelicRules(version) && (kind === 'mystery_silence_30s' || kind === 'mystery_surge_30s')
      ? {
          ...original,
          detail: original.detail
            .replace('5-row', '5–7-row')
            .replace('през 5 реда', 'през 5–7 реда'),
        }
      : original;
  if (!usesBalanceRules(version)) return copy;
  if (usesRiskRules(version) && kind === 'false_oracle')
    return {
      ...copy,
      detail:
        locale === 'bg'
          ? 'За 3 реда оракулът посочва по-нискорисковата страна в 70% от случаите, а другата в 30%. Това не гарантира здрава плочка. Подсказките са запечатани. Здрава стъпка дава +5 SP; счупена удвоява действителната щета. Отказът струва 1 подсказка или 15 SP.'
          : 'For 3 rows, the oracle points to the lower-risk side 70% of the time and the other side 30%. It cannot guarantee surviving glass. Hints are sealed. A safe step gives +5 SP; a broken tile doubles actual damage. Refusal costs 1 hint or 15 SP.',
    };
  const detail =
    locale === 'bg'
      ? {
          heal_10: 'Възстановява 10 SP веднага. Няма горен лимит на SP.',
          heal_20: 'Възстановява 20 SP веднага. Няма горен лимит на SP.',
          lucky_5s:
            'За 5 секунди: следващата грешна плочка дава +5 SP вместо −5 SP. След това талисманът се пръсва и изчезва. Един заряд.',
          inversion_5s:
            'За 5 секунди: ВСЯКА грешна плочка дава +5 SP вместо −5 SP. Пример: 100 → 105 SP, вместо 100 → 95. Не се изразходва след първата грешка.',
          borrowed_time:
            'Вземи +50 SP сега. След 3 избора връщаш 65 SP. След първия можеш да погасиш за 55 SP. Отказът струва 8 SP. Това е кратък авариен запас; без нови ресурси дългът може да те убие.',
        }
      : {
          heal_10: 'Restore 10 SP immediately. SP has no upper limit.',
          heal_20: 'Restore 20 SP immediately. SP has no upper limit.',
          lucky_5s:
            'For 5 seconds: the NEXT wrong tile gives +5 SP instead of −5 SP. The charm then bursts and disappears. One charge.',
          inversion_5s:
            'For 5 seconds: EVERY wrong tile gives +5 SP instead of −5 SP. Example: 100 → 105 SP rather than 100 → 95. The first wrong step does not consume it.',
          borrowed_time:
            'Take +50 SP now. After 3 choices repay 65 SP. After the first choice you may settle for 55 SP. Refusal costs 8 SP. This is a short emergency reserve; without new resources the debt can kill you.',
        };
  return { ...copy, detail: detail[kind as keyof typeof detail] ?? copy.detail };
}
export function mysteryText(locale: LocaleCode, key: CopyKey): string {
  return (locale === 'bg' ? bg : en)[key];
}
