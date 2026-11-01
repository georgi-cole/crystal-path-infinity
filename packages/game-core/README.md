# Crystal Path Infinity — чисто игрово ядро

`@crystal-path-infinity/game-core` е независимо TypeScript ядро за един играч. CPI-005 извлича правилата и преходите; пакетът няма React, DOM, SDK, storage, backend или AI зависимости. Това още не е играем мобилен екран или проверена ranked услуга.

Основа: [`shatteredLogic.ts` и component handlers](https://github.com/georgi-cole/bbmobilenew-source/tree/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered) от фиксирания source commit `6ace929a60410e728928aa51eaf80ba9b5cf2262`, с приетите промени от [CPI-001](../../docs/decisions/CPI-001-product-contract.md). Оригиналът в The Big Eye не е редактиран.

## Публичен API

```ts
import {
  createPracticeCursor,
  createRun,
  PRACTICE_RNG,
  transitionRun,
} from '@crystal-path-infinity/game-core';

const initial = createRun(
  {
    runId: 'practice-example',
    routeRng: createPracticeCursor('12345'),
    mysteryRng: createPracticeCursor('98765'),
    observedAt: 0,
  },
  PRACTICE_RNG,
);

const outcome = transitionRun(
  initial,
  { type: 'choose', row: initial.currentRow, life: initial.revivesApplied, side: 'left' },
  { activeTimeMs: 420, achievedAt: 420, rng: PRACTICE_RNG },
);
// initial не се променя. outcome съдържа нов state, events, accepted и reason.
```

`createRun` започва с 300 SP и две подсказки. `transitionRun` приема един вход и връща ново състояние и домейн събития. `getRunResult` връща `null`, докато опитът не е окончателен. Няма `death` команда, с която клиент да зададе щети: смъртта е резултат от wrong tile, mystery или drain.

| Команда | Условие / резултат |
| --- | --- |
| `choose`, `hint`, `mystery` | Изискват текущия еднобазиран `row` и `life = revivesApplied`. Стар callback от предишен живот не действа върху повторения след revive ред. |
| `tick` | Урежда ефектите до подаденото активно време. Няма наказание за бездействие без активен drain. |
| `end` | Приключва опита. Pending reward блокира край; за наличен, неприложен grant трябва изрично `forfeitGrantedReward: true`. |
| `mark-reward-pending` | Запазва минимален маркер `deathId + ordinal + intentId`; блокира втори маркер и финализиране. |
| `clear-reward-pending` | Доверено потвърждение от адаптера, че същият intent не е спечелил награда. Не е timeout. |
| `grant-revive` | Доверено разрешение с `deathId + ordinal + grantId`; при pending маркер изисква съвпадащ `intentId`. Увеличава само `revivesGranted`. |
| `apply-revive` | Прилага същия grant веднъж, увеличава `revivesApplied`, задава SP и изчиства временните ефекти. |

`RunState` е **частно авторитетно състояние**. То съдържа бъдещи безопасни страни и възстановими RNG cursors. `getCurrentRow` също разкрива безопасната страна и служи на авторитетната логика и тестовете. Тези обекти не трябва да се изпращат като ranked отговор към клиент. Безопасните клиентски projections, автентикацията, action ledger, SSV, темпото на действията и единственият активен lease се реализират в следващи задачи.

Наличието на `grantId` не доказва гледана реклама. Core приема, че съответният доверен адаптер вече е проверил разрешението; практика не получава право да публикува официален резултат. Маркерът за pending награда не е пълна рекламна state machine, provider reconciliation или retention система.

## Време и подреждане

Подават се два независими часовника: `activeTimeMs` и `achievedAt` — последният е timestamp на наблюдаващия авторитет, в цели милисекунди. Core не чете системния часовник. Двата трябва да са неотрицателни safe integers и да не се връщат назад; невалидни, дробни, безкрайни или вече неточно представени стойности предизвикват `RangeError`.

`achievedAt` на резултата се записва само при нов завършен ред. Ad grant, възстановяване или смърт без нов ред не го променят. Core не може да установи дали часовникът идва от истински сървър; това е отговорност на бъдещия ranked адаптер.

Детерминистичният договор за временните ефекти е:

- Всеки regen/drain instance започва да дава съответно **+2/−2 SP след 500 ms** активно време и през 500 ms след това. Няма незабавен pulse.
- Tick се изпълнява само **строго преди** expiry на 5000 ms: девет pulses за непрекъснат ефект, общо ±18 SP преди ограниченията на SP или смърт. Това е изрично техническо правило за standalone; оригиналният React interval се рестартира при промени в state и не доказва стабилен реален график.
- Едновременните pulses се сумират преди единственото ограничаване до 0–400 SP и проверката за смърт. Два противоположни ефекта в един момент не причиняват временна междинна смърт.
- При равен timestamp първо се отстраняват изтеклите ефекти, после се уреждат дължимите pulses и накрая входът. Ако drain убие преди командата, тя не се изпълнява. Clock state спира на фаталния pulse.
- Голям скок във времето обработва само оставащите pulses/expiry на максимум два ефекта. Не се изпълнява цикъл през всяка изминала милисекунда или през целия idle период.

Обикновените movement и mystery reveal анимации изразходват активно време; адаптерът продължава да подава tick по време на тях. Потвърдена пауза, death/ad/verification/recovery не изразходват активно време. Няма скрито извличане на wall-time разликата. При `dead` core изисква `activeTimeMs` да остане замразен, докато `achievedAt` може да напредва. Сървърният lease и паузата при native lifecycle са отделна интеграционна работа.

## Маршрут, памет и save/resume

Редовете нямат финална дистанция. Базовите щети са 10 на редове 1–10, 15 на 11–25 и постоянни 20 от 26 нататък. Ред 350 води към 351, без победен статус. Само преживян избор увеличава `lastClearedRow`; фаталният ред остава текущ и не носи резултат. Mystery не добавя ред.

`BridgeRow.index`, `bufferOffset` и stream cursors са нулево базирани; `currentRow`, `lastClearedRow` и `fatalRow` са видими номера на редове. Всички са канонични десетични **низове**. Изчисленията използват `BigInt` вътрешно, без JSON `BigInt` стойности. Следователно прогресът остава точен над 2³² и `Number.MAX_SAFE_INTEGER`. `compareDecimal` сравнява тези стойности числово; лексикографското сравнение на низове е неправилно.

`createRowStream` и `takeRows` пазят RNG, следващия абсолютен индекс и следващата mystery позиция. Първата mystery е на source index 3–6 — видим ред 4–7; следващите интервали са 3–6 реда. Cadence продължава след 350. Batch от 0–256 реда има фиксиран ред на RNG извикванията; разбиването му на по-малки части не променя последователността.

Run buffer по подразбиране пази осем реда от текущия напред и два предходни. `ahead + history` не може да надхвърля 256. Старите rows и resolutions се освобождават, а текущите разкрития и mystery outcome се пазят отделно. След смърт/revive същият ред запазва знанията и консумираната mystery награда. Познатата безопасна страна не се „забравя“ след визуалния source hint highlight; бъдещият renderer може отделно да управлява анимацията.

Маршрутът и mystery наградите имат **отделни RNG cursors**, за да не зависи наградата от предварително заредения брой редове. RNG адаптерът е чиста функция `next(cursor) → { value, cursor }`; проверяват се `[0,1)`, algorithm ID и точно едно увеличаване на десетичния `draws`. `PRACTICE_RNG` е възпроизводим, **некриптографски** SplitMix64 за практика и fixtures. Не е подходящо доказателство за ranked сигурност; скрит seed сам по себе си не осигурява проверена игра. Бъдещият сървър трябва да подаде подходящ RNG адаптер и да защити целия протокол.

Състоянието е обикновено JSON-serializable дърво с readonly TypeScript полета; преходите не мутират входния граф. При доверено checkpoint декодиране същото състояние и същият RNG adapter продължават точно потока. `assertRunState` проверява основни вътрешни инварианти на типизирано състояние; не замества схема за недоверен JSON, проверка на ownership или достоверност на checkpoint. Непознати schema/ruleset/RNG версии се отхвърлят, без автоматичен reroll.

Броят записи е ограничен, но десетичното представяне на абсолютните числа естествено расте с броя цифри. Активните timestamps и hints използват safe-integer представяне; при изчерпване операцията отказва с грешка, без тихо закръгляне, reset, скрит finish или измислен gameplay cap. Storage retention и историческият audit ledger не са част от този пакет.

## Смърт и продължавания

Състоянията са `playing`, `dead`, `finished`; UI анимациите показват вече решените събития. Grant и restore се обвързват с уникален death ID и пореден номер. До десет receipt записа пазят приложените разрешения, така че закъснял повторен grant/restore не задава SP повторно дори след следващи ходове. За бъдещи gameplay заявки още са необходими авторитетни sequence/idempotency правила.

Продължавания **1–5 задават 200 SP**, **6–10 задават 150 SP**. Десетото възстановява, следващата смърт финализира. Hints, mystery outcome, разкрита информация и маршрутът се запазват; всички временни ефекти се изчистват. Няма rollback към по-стар checkpoint.

`revivesGranted` резервира квотата, `revivesApplied` брои възстановяванията, а `revivesToReachScore` се записва само при нов преживян ред. Окончателният `RunResult` пази тези числа отделно, плюс `lastClearedRow`, `fatalRow`, `deathCause` и `endReason`. Окончателен опит не се отваря повторно. Core резултатът сам по себе си не е официално leaderboard доказателство.

## Проверки

От repository root:

```sh
npm run typecheck --workspace @crystal-path-infinity/game-core
npm test --workspace @crystal-path-infinity/game-core
```

Source baseline fixtures и тестовете за преходи/поток са в `test/`. Те разграничават историческите правила от приетите standalone промени и проверяват serialization, ефекти, големи индекси, bounded buffers и revive инварианти. Mobile gameplay интеграцията, native timing и повторен UI callback остават в последващите задачи.
