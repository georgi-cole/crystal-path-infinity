# Crystal Path Infinity — чисто игрово ядро

`@crystal-path-infinity/game-core` е независимо TypeScript ядро за един играч. CPI-005 извлича правилата и преходите, а CPI-006 добавя собственик на текущото състояние и на callback-ите за вход. Пакетът няма React, DOM, SDK, storage, backend или AI зависимости. Това още не е играем мобилен екран или проверена ranked услуга.

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

## Сесия и живот на callback-ите

`createRunSession(initialState, rng)` държи последното състояние в един JavaScript контекст. Pure API `transitionRun` остава наличен; сесията е приложният собственик, който не позволява две доставяния да използват един и същ стар state. Правилата остават `infinity-v1`, а `RunState.schemaVersion` остава 1. CPI-006 не въвежда нова SP аритметика или промяна в баланса.

```ts
import { createRunSession, PRACTICE_RNG } from '@crystal-path-infinity/game-core';

// initial е създаденото по-горе състояние или доверен възстановен checkpoint.
const session = createRunSession(initial, PRACTICE_RNG);

// Създаваме callback-а, когато показваме действието за текущия ред.
const chooseLeft = session.bind({ type: 'choose', side: 'left' });
const outcome = chooseLeft({ activeTimeMs: 420, achievedAt: 420 });
const latest = session.getState(); // outcome.state вече е записан, дори при отказ с ефекти.

// При премахване на този собственик запазваме последния checkpoint.
const checkpoint = session.dispose();
// dispose не приключва опита. При възстановяване използваме нов собственик:
const recovered = createRunSession(checkpoint, PRACTICE_RNG);
```

Числата за времето в примера са само за новия `initial` от първия пример. За възстановен checkpoint хостът подава валидното натрупано активно време и текущия timestamp; сесията не чете или поправя часовника.

| API | Поведение |
| --- | --- |
| `getState()` | Последното readonly `RunState`, достъпно и след disposal. Съдържа частните данни на ядрото и не е ranked response. |
| `bind(command)` | Връща `BoundRunCommand`, който получава само `{ activeTimeMs, achievedAt }`. RNG е подаден при създаването на сесията. |
| `dispose()` | Обезсилва всички callback-и на този собственик и връща checkpoint. Не изпраща `end`, `death` или финален резултат. |

`SessionCommand` не приема `row` и `life` за `choose`, `hint` и `mystery`: те се запомнят при `bind`. Всички callback-и принадлежат на конкретната сесия и запомнят текущите life/status. Игровите действия запомнят и реда. `end` също е обвързан с реда и с отделна control-phase идентичност. След нов прогрес, смърт или revive старото потвърждение за край не може да приключи новото състояние; показваме ново потвърждение.

Всеки callback освен `tick` доставя най-много един върнат core преход. След това повторение е `command-consumed`, освен ако по-ранната проверка вече го отчете като disposed/finished. Това важи и за core отказ: той може да съдържа дължими ефекти. `tick` е многократен и **не е обвързан с ред** — продължава да работи след движение, hint или mystery в същия живот. След смърт/revive старият tick callback е невалиден.

Преди проверката на часовниците сесията проверява последователно `session-disposed`, `finished`, `command-consumed` и `stale-command`. Такива доставяния връщат текущия state и празни events, без да обработват време. Закъснял callback със стар timestamp не може да предизвика clock грешка след обезсилване. Валидните доставяния запазват нормалните core проверки; при хвърлена грешка state и еднократният callback остават непроменени за коректен повторен опит.

Сесията **винаги записва върнатия state**, включително при `accepted: false`. Например фатален дължим drain преди hint връща `died-before-command`; сесията вече е `dead`, а подсказката не е изхарчена. Върнатите events се обработват веднъж. Няма вътрешен растящ event log, таймери или subscribers.

За `end` control-phase идентичността се сменя при death/status, pending reward, grant или apply промяна. Стар callback остава невалиден и при цикъл pending → clear, дори status/row/life да се върнат до предишните стойности. Нов grant изисква ново изрично потвърждение за отказ от него. Core правилата за pending и `forfeitGrantedReward` продължават да важат; bound callback не доказва рекламна награда.

`dispose` не изчиства pending награда и не превръща recoverable checkpoint във финален резултат. Нов или възстановен run получава нова сесия; при смяна на собственик обезсилваме старата. Не сериализираме сесията, функциите или control-phase идентичността — сериализира се `RunState`. Няма автоматичен in-place replace и стар callback не може да бъде пренасочен към новата сесия.

Сесията трябва да живее през обикновените rerender-и; показваните действия получават нови bindings според текущия snapshot. Реалното React mount/unmount и development StrictMode поведение ще се свържат и проверят с renderer-а в CPI-008; тук няма непроверен hook пример. Native clock/lifecycle остава CPI-007, а durable persistence — CPI-009. Авторитетът за SDK/SSV награди има собствен подходящ живот: премахването на view не означава неуспешен reward и не отменя pending проверката. Контролерът не заменя server concurrency, leases или request ledger.

Подробности и приемателен обхват: [CPI-006](../../docs/decisions/CPI-006-death-progress.md).

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

Source baseline fixtures и тестовете за преходи/поток са в `test/`. Те разграничават историческите правила от приетите standalone промени и проверяват serialization, ефекти, големи индекси, bounded buffers и revive инварианти. CPI-006 добавя сесийния контролер за повторени, закъснели и обезсилени callback-и; реалната му интеграция с мобилния renderer, React lifecycle и native timing остава в CPI-007/CPI-008. Точните изпълнени проверки, ревизия и ограничения се записват в issue/PR.
