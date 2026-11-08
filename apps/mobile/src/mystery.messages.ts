import type { EffectKind } from '@crystal-path-infinity/game-core';
import {
  usesBalanceRules,
  usesRiskRules,
  RULESET_VERSION,
  usesRelicRules,
  usesClassicTiles,
  usesBusinessRules,
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
      'No new mystery boxes appear for 30 seconds. You can still use a box or choice that is already there. Then boxes return to their usual 5-row spacing.\n\nThe violet box has two equally likely results: Silence or Surge. You received Silence.',
    positive: false,
  },
  mystery_surge_30s: {
    title: 'The rift · Surge',
    detail:
      'For 30 seconds, a mystery box appears every 3 rows. Then boxes return to their usual 5-row spacing. Rare choices still need a break before they can appear again.\n\nThe violet box has two equally likely results: Silence or Surge. You received Surge.',
    positive: true,
  },
  coyote_10s: {
    title: 'Run Coyote · 10s',
    detail:
      'For 10 seconds, broken tiles cannot take your SP. For example, a tile that would take 5 SP takes nothing.\n\nThis only protects you from tiles. Bleeding, harmful boxes, trade costs, debts and the death clock can still take SP. Healing tiles still heal you. Aegis and Brittle oath wait until Coyote ends.',
    positive: true,
  },
  double_gain_21s: {
    title: 'Double SP · 21s',
    detail:
      'For 21 seconds, SP healing and rewards give twice as much. A +10 SP reward gives +20 SP.\n\nTrades and debts keep their usual amounts. Finding this effect again restarts its timer; the bonus stays double.',
    positive: true,
  },
  double_loss_21s: {
    title: 'Double damage · 21s',
    detail:
      'For 21 seconds, broken tiles, harmful boxes and bleeding take twice as much SP. A hit that would take 5 SP takes 10 SP.\n\nTrades and debts keep their usual amounts. The death clock is unchanged. Finding this effect again restarts its timer; damage stays double.',
    positive: false,
  },
  regen_3rows: {
    title: 'Second breath',
    detail:
      'Finish a row and stay alive to gain 6 SP. This works for your next 3 steps: 18 SP in total.\n\nA safe tile or a broken tile can count. If the tile takes your SP to 0, this effect cannot save you. Waiting does not use it up.',
    positive: true,
  },
  bleed_3rows: {
    title: 'The bleed',
    detail:
      'After each of your next 3 steps, you lose an extra 3 SP: 9 SP in total. Even a safe tile costs you these 3 SP.\n\nIf your SP reaches 0, the crossing ends. Waiting and Aegis do not remove this effect.',
    positive: false,
  },
  half_life: {
    title: 'Half Life',
    detail:
      'Choose whether to give up half your SP for 5 extra hints. Example: with 100 SP and 2 hints, you would have 50 SP and 7 hints after the trade.\n\nThe choice shows exactly how much SP you will keep. You can refuse and lose nothing.',
    positive: false,
  },
  marketing: {
    title: 'Marketing',
    detail:
      'Choose whether to sell hints. Each hint you sell gives you 20 SP. With 100 SP and 3 hints, selling one leaves you with 120 SP and 2 hints.\n\nYou can sell one or all the hints the choice allows. Double SP does not change this price. You can refuse and lose nothing.',
    positive: false,
  },
  heal_10: {
    title: 'Crystal spark',
    detail: 'You gain 10 SP as soon as you open the box. You do not need to do anything else.',
    positive: true,
  },
  heal_20: {
    title: 'Crystal heart',
    detail: 'You gain 20 SP as soon as you open the box. You do not need to do anything else.',
    positive: true,
  },
  gain_hint: {
    title: 'A stolen secret',
    detail:
      'You gain 1 hint. Use the hint button to reveal where it is safe to step on the current row.',
    positive: true,
  },
  shield_5s: {
    title: 'Aegis',
    detail:
      'For up to 5 seconds, the shield blocks one hit from a broken tile. It then shatters and disappears. If no tile hits it, it expires.\n\nIt only blocks tile damage. Bleeding, box losses, debts and the death clock can still take SP.',
    positive: true,
  },
  regen_5s: {
    title: 'Second breath',
    detail:
      'You gain 2 SP at a time, up to 18 SP over 5 seconds. You can see your SP rise with each pulse.',
    positive: true,
  },
  lucky_5s: {
    title: 'Borrowed luck',
    detail:
      'For up to 5 seconds, the next broken tile gives you SP instead of taking it. It gives 10, 15 or 20 SP, depending on the row.\n\nThis works once. The charm then breaks. If you do not use it in time, it expires.',
    positive: true,
  },
  hurt_10: {
    title: 'Crystal bite',
    detail: 'You lose 10 SP as soon as you open the box. If your SP reaches 0, the crossing ends.',
    positive: false,
  },
  hurt_15: {
    title: 'Deep fracture',
    detail: 'You lose 15 SP as soon as you open the box. If your SP reaches 0, the crossing ends.',
    positive: false,
  },
  lose_hint: {
    title: 'A forgotten secret',
    detail: 'The box takes 1 hint. If you have no hints, you lose nothing.',
    positive: false,
  },
  fragility_5s: {
    title: 'Brittle oath',
    detail:
      'For up to 5 seconds, the next broken tile that hurts you takes twice as much SP. A hit that would take 5 SP takes 10 SP.\n\nThis works once, then disappears. A shielded hit does not use it up.',
    positive: false,
  },
  drain_5s: {
    title: 'The bleed',
    detail:
      'You lose 2 SP at a time, up to 18 SP over 5 seconds. Aegis cannot stop this loss. If your SP reaches 0, the crossing ends.',
    positive: false,
  },
  inversion_5s: {
    title: 'Twisted fate',
    detail:
      'For 5 seconds, every broken tile gives you SP instead of taking it: 5, 7 or 10 SP, depending on the row.\n\nThis can work more than once before time runs out. Safe tiles give no extra SP from this effect.',
    positive: true,
  },
  blood_oath: {
    title: 'Blood oath',
    detail:
      'Accept to gain 35 SP now. For your next 3 steps, each broken tile that hurts you takes an extra 15 SP. A usual 5 SP hit would cost 20 SP.\n\nA shielded tile does not take the extra 15 SP. Refusing the deal costs 8 SP.',
    positive: false,
  },
  false_oracle: {
    title: 'The lying oracle',
    detail:
      'Accept to see an arrow for your next 3 steps. It points to the safe tile with a 70% chance each time, so it can be wrong. You cannot use hints during the deal.\n\nA safe step gives 5 SP. A broken tile takes twice its usual SP. Refusing costs 1 hint, or 15 SP if you have no hints.',
    positive: false,
  },
  hungry_vault: {
    title: 'The hungry vault',
    detail:
      'Pay 12 SP to start. One safe step puts 15 SP in the vault. Two safe steps in a row make it 40 SP. Three make it 85 SP, paid out automatically.\n\nAfter the first or second safe step, choose: collect what is in the vault, or risk the next step for more. A broken tile loses the whole prize and takes 10 extra SP. Refusing to start costs 8 SP.',
    positive: false,
  },
  borrowed_time: {
    title: 'Borrowed tomorrow',
    detail:
      'Accept to gain 50 SP now. After your third step, 65 SP is taken back. You need to find more SP before then, or the debt can end your crossing.\n\nAfter your first step, you can repay early for 55 SP. Refusing the loan costs 8 SP.',
    positive: false,
  },
  soul_exchange: {
    title: 'Soul exchange',
    detail:
      'Choose one of two trades.\n\nGive SP: pay 25 SP. There is a 65% chance to gain 2 hints. Otherwise, gain 1 hint and lose another 15 SP.\n\nGive a hint: spend 1 hint. There is a 65% chance to gain 40 SP. Otherwise, lose 30 SP instead.\n\nYou must choose a trade; there is no free refusal. If the first 25 SP payment takes you to 0, you receive no hints.',
    positive: false,
  },
};

const bgEffects: Record<EffectKind, EffectCopy> = {
  mystery_silence_30s: {
    title: 'Разломът · Тишина',
    detail:
      'За 30 секунди не се появяват нови мистериозни кутии. Можеш да използваш кутия или избор, които вече са се появили. После кутиите отново идват през 5 реда.\n\nВиолетовата кутия има два еднакво вероятни резултата: Тишина или Поток. На теб се падна Тишина.',
    positive: false,
  },
  mystery_surge_30s: {
    title: 'Разломът · Поток',
    detail:
      'За 30 секунди се появява мистериозна кутия през 3 реда. После кутиите отново идват през 5 реда. Редките сделки все още имат нужда от почивка, преди да се появят пак.\n\nВиолетовата кутия има два еднакво вероятни резултата: Тишина или Поток. На теб се падна Поток.',
    positive: true,
  },
  coyote_10s: {
    title: 'Run Coyote · 10 сек.',
    detail:
      'За 10 секунди счупените плочки не могат да ти вземат SP. Например плочка, която би ти взела 5 SP, не взема нищо.\n\nТова те пази само от плочките. Кървенето, вредните кутии, сделките, дълговете и death clock все още могат да отнемат SP. Плочките, които дават SP, продължават да ги дават. Щитът и Крехката клетва изчакват Койотът да приключи.',
    positive: true,
  },
  double_gain_21s: {
    title: 'Двойни SP · 21 сек.',
    detail:
      'За 21 секунди лечението и SP наградите дават два пъти повече. Награда от 10 SP става 20 SP.\n\nСделките и дълговете запазват обичайните си суми. Ако намериш ефекта пак, времето започва отначало, а наградите остават двойни.',
    positive: true,
  },
  double_loss_21s: {
    title: 'Двойни щети · 21 сек.',
    detail:
      'За 21 секунди счупените плочки, вредните кутии и кървенето отнемат два пъти повече SP. Удар за 5 SP вече отнема 10 SP.\n\nСделките и дълговете запазват обичайните си суми. Death clock не се променя. Ако намериш ефекта пак, времето започва отначало, а щетите остават двойни.',
    positive: false,
  },
  regen_3rows: {
    title: 'Втори дъх',
    detail:
      'Премини ред и остани жив, за да получиш 6 SP. Това действа за следващите ти 3 стъпки: общо 18 SP.\n\nБроят се и здравите, и счупените плочки. Ако плочката свали SP до 0, този ефект не може да те спаси. Изчакването не го изразходва.',
    positive: true,
  },
  bleed_3rows: {
    title: 'Кървенето',
    detail:
      'След всяка от следващите ти 3 стъпки губиш още 3 SP: общо 9 SP. Дори върху здрава плочка губиш тези 3 SP.\n\nАко SP стигнат 0, опитът приключва. Изчакването и щитът не премахват този ефект.',
    positive: false,
  },
  half_life: {
    title: 'Half Life',
    detail:
      'Избираш дали да дадеш половината си SP за 5 допълнителни подсказки. Пример: ако имаш 100 SP и 2 подсказки, след сделката ще имаш 50 SP и 7 подсказки.\n\nБутонът показва точно колко SP ще запазиш. Можеш да откажеш, без да губиш нищо.',
    positive: false,
  },
  marketing: {
    title: 'Marketing',
    detail:
      'Избираш дали да продадеш подсказки. За всяка продадена подсказка получаваш 20 SP. Ако имаш 100 SP и 3 подсказки, продажбата на една оставя 120 SP и 2 подсказки.\n\nМожеш да продадеш една или всички позволени подсказки. Двойни SP не променя тази цена. Можеш да откажеш, без да губиш нищо.',
    positive: false,
  },
  heal_10: {
    title: 'Кристална искра',
    detail: 'Получаваш 10 SP веднага щом отвориш кутията. Не трябва да правиш нищо друго.',
    positive: true,
  },
  heal_20: {
    title: 'Кристално сърце',
    detail: 'Получаваш 20 SP веднага щом отвориш кутията. Не трябва да правиш нищо друго.',
    positive: true,
  },
  gain_hint: {
    title: 'Открадната тайна',
    detail:
      'Получаваш 1 подсказка. Натисни бутона за подсказка, за да видиш къде е безопасно да стъпиш на текущия ред.',
    positive: true,
  },
  shield_5s: {
    title: 'Егида · Щит',
    detail:
      'Щитът те пази до 5 секунди. Поема един удар от счупена плочка, после се счупва и изчезва. Ако не го използваш, изчезва след тези 5 секунди.\n\nПази само от щети от плочки. Кървенето, вредните кутии, дълговете и death clock все още могат да ти вземат SP.',
    positive: true,
  },
  regen_5s: {
    title: 'Втори дъх',
    detail:
      'Получаваш по 2 SP наведнъж, до общо 18 SP за 5 секунди. Виждаш как точките ти се увеличават при всяко пулсиране.',
    positive: true,
  },
  lucky_5s: {
    title: 'Заемен късмет',
    detail:
      'За следващите 5 секунди първата счупена плочка ти дава SP, вместо да ти взема. Получаваш 10, 15 или 20 SP според реда.\n\nДейства само веднъж. След това талисманът се счупва. Ако не го използваш навреме, изчезва.',
    positive: true,
  },
  hurt_10: {
    title: 'Кристална захапка',
    detail: 'Губиш 10 SP веднага щом отвориш кутията. Ако SP стигнат 0, опитът приключва.',
    positive: false,
  },
  hurt_15: {
    title: 'Дълбока пукнатина',
    detail: 'Губиш 15 SP веднага щом отвориш кутията. Ако SP стигнат 0, опитът приключва.',
    positive: false,
  },
  lose_hint: {
    title: 'Забравена тайна',
    detail: 'Кутията ти взема 1 подсказка. Ако нямаш подсказки, не губиш нищо.',
    positive: false,
  },
  fragility_5s: {
    title: 'Крехка клетва',
    detail:
      'За следващите 5 секунди първата счупена плочка, която те нарани, взема двойно повече SP. Удар за 5 SP става удар за 10 SP.\n\nДейства веднъж, после изчезва. Ако щитът спре удара, ефектът остава за следващата плочка.',
    positive: false,
  },
  drain_5s: {
    title: 'Кървенето',
    detail:
      'Губиш по 2 SP наведнъж, до общо 18 SP за 5 секунди. Щитът не спира тази загуба. Ако SP стигнат 0, опитът приключва.',
    positive: false,
  },
  inversion_5s: {
    title: 'Обърната съдба',
    detail:
      'За 5 секунди всяка счупена плочка ти дава SP, вместо да ти взема: 5, 7 или 10 SP според реда.\n\nМоже да подейства няколко пъти, докато времето изтече. Здравите плочки не дават допълнителни SP от този ефект.',
    positive: true,
  },
  blood_oath: {
    title: 'Кръвна клетва',
    detail:
      'Ако приемеш, получаваш 35 SP веднага. За следващите ти 3 стъпки всяка счупена плочка, която те нарани, взема още 15 SP. Обичаен удар за 5 SP ще ти струва 20 SP.\n\nАко щитът спре удара, не губиш допълнителните 15 SP. Отказът от сделката струва 8 SP.',
    positive: false,
  },
  false_oracle: {
    title: 'Лъжливият оракул',
    detail:
      'Ако приемеш, виждаш стрелка за следващите 3 стъпки. При всяка тя има 70% шанс да сочи здравата плочка, затова може да те подведе. Докато сделката действа, не можеш да използваш подсказки.\n\nЗдрава стъпка дава 5 SP. Счупена плочка взема двойно повече SP от обичайното. Отказът струва 1 подсказка, а ако нямаш — 15 SP.',
    positive: false,
  },
  hungry_vault: {
    title: 'Алчният трезор',
    detail:
      'Плащаш 12 SP, за да започнеш. Една здрава стъпка събира 15 SP в трезора. Две здрави стъпки подред правят 40 SP. Три правят 85 SP, които получаваш автоматично.\n\nСлед първата или втората здрава стъпка избираш: вземи събраното или рискувай за още. Счупена плочка губи цялата награда и ти взема още 10 SP. Отказът да започнеш струва 8 SP.',
    positive: false,
  },
  borrowed_time: {
    title: 'Заем от бъдещето',
    detail:
      'Ако приемеш, получаваш 50 SP веднага. След третата ти стъпка се отнемат 65 SP. Дотогава трябва да намериш още SP, иначе дългът може да сложи край на опита.\n\nСлед първата стъпка можеш да върнеш заема по-рано за 55 SP. Отказът от заема струва 8 SP.',
    positive: false,
  },
  soul_exchange: {
    title: 'Размяна на душа',
    detail:
      'Избираш една от две размени.\n\nДаваш SP: плащаш 25 SP. Имаш 65% шанс да получиш 2 подсказки. Иначе получаваш 1 подсказка, но губиш още 15 SP.\n\nДаваш подсказка: харчиш 1 подсказка. Имаш 65% шанс да получиш 40 SP. Иначе губиш 30 SP.\n\nТрябва да избереш размяна — няма безплатен отказ. Ако първите 25 SP те свалят до 0, не получаваш подсказки.',
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
  if (usesBusinessRules(version) && kind === 'marketing')
    return {
      ...copy,
      detail:
        copy.detail +
        (locale === 'bg'
          ? '\n\nПодсказките от магазина ползват същия лимит от 200 SP за опита като SP резерва. Бутонът показва колко можеш да продадеш. Намерените и подарените подсказки нямат това ограничение.'
          : '\n\nHints from the store share the SP reserve limit of 200 SP per crossing. The choice shows how many you can sell. Found and gifted hints do not have this limit.'),
    };
  if (usesRiskRules(version) && !usesClassicTiles(version) && kind === 'false_oracle')
    return {
      ...copy,
      detail:
        locale === 'bg'
          ? 'Ако приемеш, виждаш стрелка за следващите 3 стъпки. При всяка тя има 70% шанс да сочи по-малко опасната страна. И тази плочка може да се счупи. Докато сделката действа, не можеш да използваш подсказки.\n\nЗдрава стъпка дава 5 SP. Счупена плочка взема двойно повече SP от обичайното. Отказът струва 1 подсказка, а ако нямаш — 15 SP.'
          : 'Accept to see an arrow for your next 3 steps. It points to the less dangerous side with a 70% chance each time. That tile can still break. You cannot use hints during the deal.\n\nA safe step gives 5 SP. A broken tile takes twice its usual SP. Refusing costs 1 hint, or 15 SP if you have no hints.',
    };
  const detail =
    locale === 'bg'
      ? {
          lucky_5s:
            'За следващите 5 секунди първата счупена плочка ти дава 5 SP, вместо да ти вземе 5 SP. Например от 100 SP ставаш със 105 SP.\n\nДейства само веднъж, после талисманът се счупва. Ако не го използваш навреме, изчезва.',
          inversion_5s:
            'За 5 секунди всяка счупена плочка ти дава 5 SP, вместо да ти вземе 5 SP. Например две счупени плочки в това време вдигат 100 SP на 110 SP.\n\nМоже да подейства няколко пъти, докато времето изтече. Здравите плочки не дават допълнителни SP от този ефект. Другите активни ефекти могат да променят резултата.',
        }
      : {
          lucky_5s:
            'For up to 5 seconds, the next broken tile gives you 5 SP instead of taking 5 SP. For example, 100 SP becomes 105 SP.\n\nThis works once, then the charm breaks. If you do not use it in time, it expires.',
          inversion_5s:
            'For 5 seconds, every broken tile gives you 5 SP instead of taking 5 SP. For example, two broken tiles in that time raise 100 SP to 110 SP.\n\nThis can work more than once before time runs out. Safe tiles give no extra SP from this effect. Other active effects can change the result.',
        };
  return { ...copy, detail: detail[kind as keyof typeof detail] ?? copy.detail };
}
export function mysteryText(locale: LocaleCode, key: CopyKey): string {
  return (locale === 'bg' ? bg : en)[key];
}
