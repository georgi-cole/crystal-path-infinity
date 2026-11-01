# Backlog — Crystal Path: Infinity Mobile

38 задачи са създадени в GitHub и проверени чрез повторно прочитане на 1 ноември 2026 г. CPI идентификаторите са запазени и са свързани с действителните issues в таблицата и подробните задачи по-долу.

**Статус: CPI-001 е в работа.** Приети са безкрайният standalone режим, всички възрасти, аналитичната цел на възрастовите данни и останалият основен [договор CPI-001](decisions/CPI-001-product-contract.md). **Размерът/графикът на revive SP още се обсъжда**; [проучването](decisions/CPI-001-revive-balance-research.md) записва фиксирани и намаляващи кандидати, без избрано правило; 300 начални SP и таван 400 SP са приети. Останалите задачи остават Backlog. Приетата посока не е отчет за изпълнени gameplay, device или production критерии; CPI-002 започва след приключване на CPI-001.

Текущият статус на задачите в GitHub е водещ. Описанията тук и в `planning/backlog.json` са шаблони за обхват и критерии, не регистър на изпълнението; началните `status:backlog` labels не заменят живия issue статус. Каноничните шаблони следват приетата посока и изрично нерешената revive SP стойност; синхронизацията с remote issue описанията се проследява отделно.

Източникът е фиксиран на `georgi-cole/bbmobilenew-source@6ace929a60410e728928aa51eaf80ba9b5cf2262`. За историческото поведение виж [инспекцията](SOURCE_AUDIT.md), за новия продукт — [плана](PRODUCT_PLAN.md), за реализацията — [архитектурата](ARCHITECTURE.md) и [revive договора](REWARDED_REVIVES.md). Планът за standalone не променя The Big Eye или фиксирания source commit.

## Как четем задачите

- **P0:** блокира основни правила, сигурност или готовност за пускане. **P1:** необходима функция/качество за MVP; не означава незадължителна задача.
- **S / M / L:** относителен размер спрямо останалите задачи. Това не са дни и не е календарно обещание; след spike-а прецизираме размера.
- Зависимостите трябва да са приети преди започване на зависимата реализация. За голяма задача може да има няколко малки PR-а без разширяване на обхвата.
- Done изисква критерии, конкретна проверка и демо/резултат. Нито написан код, нито planning-only CI са достатъчни.

## Етапи

M0–M5 са етапи в плана; създаването на native GitHub milestones предстои.

| Етап | Задачи | Резултат |
| --- | --- | --- |
| M0 — Решения и техническа основа | CPI-001–CPI-004 | Съгласувани правила и аудитория, реален мобилен spike, отделен scaffold и проверим CI. |
| M1 — Самостоятелна игра | CPI-005–CPI-010 | Извлечено ядро и React/CSS сцена, последователни терминални състояния, часовник, практика и звук. |
| M2 — Завършено мобилно преживяване | CPI-011–CPI-016 | Визуална идентичност, икони, splash, меню, tutorial, HUD, резултати и достъпни настройки. |
| M3 — Профили и реални класации | CPI-017–CPI-025 | Възстановими акаунти, защитен backend, сървърни опити и World/Continent/Country Top 100. |
| M4 — До 10 рекламни продължавания | CPI-026–CPI-030 | Consent, native rewarded ads, проверени SSV награди и възстановим revive flow. |
| M5 — Проверка и подготовка за пускане | CPI-031–CPI-038 | Изтриване на акаунт, диагностика, adversarial/device QA, beta, store пакет и release gates. |

## Подреден списък

| ID | Задача | Приоритет | Размер | Зависи от |
| --- | --- | --- | --- | --- |
| [CPI-001](https://github.com/georgi-cole/crystal-path-infinity/issues/1) | Фиксиране на правилата, резултата, аудиторията и възрастовите данни | P0 | M | — |
| [CPI-002](https://github.com/georgi-cole/crystal-path-infinity/issues/2) | Мобилен spike: Capacitor, реклами, SSV, latency и разход на сървъра | P0 | L | CPI-001 |
| [CPI-003](https://github.com/georgi-cole/crystal-path-infinity/issues/3) | Минимален React/TypeScript/Capacitor проект с отделна идентичност | P0 | M | CPI-002 |
| [CPI-004](https://github.com/georgi-cole/crystal-path-infinity/issues/4) | CI за кода и проверими правила за main | P0 | M | CPI-003 |
| [CPI-005](https://github.com/georgi-cole/crystal-path-infinity/issues/5) | Извличане на чистото ядро за един играч | P0 | L | CPI-001, CPI-003, CPI-004 |
| [CPI-006](https://github.com/georgi-cole/crystal-path-infinity/issues/6) | Смърт, безкраен прогрес и единни SP граници | P0 | M | CPI-005 |
| [CPI-007](https://github.com/georgi-cole/crystal-path-infinity/issues/7) | Един игрови часовник и pause/background договор | P0 | L | CPI-006 |
| [CPI-008](https://github.com/georgi-cole/crystal-path-infinity/issues/8) | Извличане на текущата Infinity сцена за мобилен екран | P1 | L | CPI-006, CPI-007 |
| [CPI-009](https://github.com/georgi-cole/crystal-path-infinity/issues/9) | Локална практика и надеждно запазване на незавършен опит | P1 | M | CPI-007, CPI-008 |
| [CPI-010](https://github.com/georgi-cole/crystal-path-infinity/issues/10) | Самостоятелен звук, музика и haptics | P1 | M | CPI-007, CPI-008 |
| [CPI-011](https://github.com/georgi-cole/crystal-path-infinity/issues/11) | Визуална идентичност и проследим набор от ресурси | P1 | M | CPI-001, CPI-008 |
| [CPI-012](https://github.com/georgi-cole/crystal-path-infinity/issues/12) | Икони, native splash и плавен старт на приложението | P1 | M | CPI-003, CPI-011 |
| [CPI-013](https://github.com/georgi-cole/crystal-path-infinity/issues/13) | Начално меню, bootstrap и навигация | P1 | M | CPI-009, CPI-012 |
| [CPI-014](https://github.com/georgi-cole/crystal-path-infinity/issues/14) | Кратък интерактивен tutorial за мост, hints и mystery | P1 | M | CPI-008, CPI-013 |
| [CPI-015](https://github.com/georgi-cole/crystal-path-infinity/issues/15) | HUD, пауза, смърт и резултат на един опит | P1 | L | CPI-006, CPI-007, CPI-013 |
| [CPI-016](https://github.com/georgi-cole/crystal-path-infinity/issues/16) | Настройки, достъпност и български/английски интерфейс | P1 | M | CPI-010, CPI-013, CPI-015 |
| [CPI-017](https://github.com/georgi-cole/crystal-path-infinity/issues/17) | Отделни backend среди, схема и права върху данните | P0 | L | CPI-001, CPI-003, CPI-004 |
| [CPI-018](https://github.com/georgi-cole/crystal-path-infinity/issues/18) | Възстановим акаунт и преминаване от гост към ranked | P0 | L | CPI-017 |
| [CPI-019](https://github.com/georgi-cole/crystal-path-infinity/issues/19) | Профил с username и непублични възрастови данни | P0 | M | CPI-001, CPI-018 |
| [CPI-020](https://github.com/georgi-cole/crystal-path-infinity/issues/20) | Държави, континенти и история на регионалната принадлежност | P0 | M | CPI-017, CPI-019 |
| [CPI-021](https://github.com/georgi-cole/crystal-path-infinity/issues/21) | Сървърно управляван ranked опит със скрит бъдещ маршрут | P0 | L | CPI-005, CPI-006, CPI-007, CPI-017, CPI-019, CPI-020 |
| [CPI-022](https://github.com/georgi-cole/crystal-path-infinity/issues/22) | Възстановяване при загуба на връзка и конкурентни устройства | P0 | L | CPI-009, CPI-021 |
| [CPI-023](https://github.com/georgi-cole/crystal-path-infinity/issues/23) | Проверени лични рекорди и World/Continent/Country read model | P0 | L | CPI-020, CPI-021, CPI-022 |
| [CPI-024](https://github.com/georgi-cole/crystal-path-infinity/issues/24) | Екран Top 100 с лично място и регионални филтри | P1 | M | CPI-013, CPI-019, CPI-023 |
| [CPI-025](https://github.com/georgi-cole/crystal-path-infinity/issues/25) | Докладване на имена и административен контрол на класацията | P1 | M | CPI-019, CPI-023, CPI-024 |
| [CPI-026](https://github.com/georgi-cole/crystal-path-infinity/issues/26) | Consent, възрастова допустимост и privacy настройки за реклами | P0 | L | CPI-001, CPI-018, CPI-019 |
| [CPI-027](https://github.com/georgi-cole/crystal-path-infinity/issues/27) | Самостоятелен native rewarded-ad provider | P0 | M | CPI-002, CPI-026 |
| [CPI-028](https://github.com/georgi-cole/crystal-path-infinity/issues/28) | SSV проверка и атомарен регистър на рекламните награди | P0 | L | CPI-017, CPI-021, CPI-027 |
| [CPI-029](https://github.com/georgi-cole/crystal-path-infinity/issues/29) | Revive state machine с максимум 10 успешни продължавания | P0 | L | CPI-006, CPI-007, CPI-015, CPI-028 |
| [CPI-030](https://github.com/georgi-cole/crystal-path-infinity/issues/30) | Възстановяване и конкурентни ad сценарии от край до край | P0 | L | CPI-022, CPI-029 |
| [CPI-031](https://github.com/georgi-cole/crystal-path-infinity/issues/31) | Изтриване и експорт на акаунт с in-app и web път | P0 | L | CPI-017, CPI-018, CPI-019, CPI-023 |
| [CPI-032](https://github.com/georgi-cole/crystal-path-infinity/issues/32) | Минимална диагностика, gameplay метрики и контрол на разходите | P1 | M | CPI-017, CPI-022, CPI-026, CPI-029, CPI-031 |
| [CPI-033](https://github.com/georgi-cole/crystal-path-infinity/issues/33) | Регресии на правилата и adversarial API проверки | P0 | L | CPI-004, CPI-021, CPI-022, CPI-023, CPI-025, CPI-028, CPI-029, CPI-031 |
| [CPI-034](https://github.com/georgi-cole/crystal-path-infinity/issues/34) | Реални устройства: дълги опити, 10 реклами и performance | P0 | L | CPI-008, CPI-010, CPI-012, CPI-014, CPI-016, CPI-024, CPI-030, CPI-033 |
| [CPI-035](https://github.com/georgi-cole/crystal-path-infinity/issues/35) | Подписани Android и iOS beta пакети | P0 | M | CPI-004, CPI-026, CPI-030, CPI-031, CPI-032, CPI-034 |
| [CPI-036](https://github.com/georgi-cole/crystal-path-infinity/issues/36) | Store пакет: screenshots, описание, възрастова оценка и privacy форми | P1 | M | CPI-011, CPI-012, CPI-016, CPI-024, CPI-025, CPI-031, CPI-034 |
| [CPI-037](https://github.com/georgi-cole/crystal-path-infinity/issues/37) | Поддръжка, оперативни аларми и контрол при проблем | P1 | M | CPI-025, CPI-031, CPI-032, CPI-035 |
| [CPI-038](https://github.com/georgi-cole/crystal-path-infinity/issues/38) | Release readiness и контролирано публично пускане | P0 | M | CPI-035, CPI-036, CPI-037 |

## Граници на MVP

Standalone маршрутът е безкраен, без фиксиран финален ред. Ограничението 350 остава само в The Big Eye. Запазваме React/CSS renderer-а, 300 начални SP, таван 400 SP, 2 hints, mystery основата и damage bands 10/15/20 SP с постоянни 20 SP след ред 25. Няма автоматично нарастваща щета, idle-kill или нов 160-секунден таймер. До 10 валидни награди дават до 10 продължавания; предложението за еднакви 200 SP при всеки restore е още нерешено.

Играта е за всички възрасти. Practice не изисква акаунт, възрастов отговор или analytics разрешение. Доброволните години служат за частна аналитика чрез `analyticsAgeBand` и `ageResponseAt`, с видимо „Пропусни“; privacyContext и приложимите account/ad защити са отделни. Ranked изисква възстановим акаунт според този контекст, а локален резултат не се превръща в официален.

Real-time multiplayer, магазин и ежедневни предизвикателства остават извън тази версия. Дълги опити, SP вариантите, ad time/play time и runtime/storage/cost се проверяват в планираните задачи; няма отчетени playtest резултати. Нови платени акаунти/договори и публично пускане не са извършени с този пакет.

## Подробни задачи

## [CPI-001](https://github.com/georgi-cole/crystal-path-infinity/issues/1) — Фиксиране на правилата, резултата, аудиторията и възрастовите данни

**Етап:** M0 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** няма

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Преди реализацията да има един продуктово съгласуван договор за новата игра, с ясно отделено оставащо решение за revive SP.

### Обхват

Decision record върху SOURCE_AUDIT и приетите уточнения: standalone е безкраен, за всички възрасти, с 300 начални SP, таван 400 SP, 2 hints и текущата mystery основа. Скритият край 350 остава само в The Big Eye; изходният проект не се променя. Възрастта служи за частна аналитика; доброволният отговор е техническата препоръка. Фиксирани 200 SP са сравнителна основа; 200, 180, 160… и вариант с минимален праг се проучват по предложение на Georgi, без избран график.

### Критерии за приемане

- [ ] Записани са приетите endless/all-ages решения, аналитичната цел на възрастта и останалите приети правила; нерешеният размер/график на revive SP е отделен и има изрично решение от Georgi преди зависимата реализация.
- [ ] Договорът различава `lastClearedRow` от фаталния ред и фиксира tie: по-малко `revivesToReachScore`, по-ранен сървърен `achievedAt`, стабилен ID. Tie стойностите се записват при напредък; по-късно revive без нов ред не влошава постигнатия резултат.
- [ ] Записани са 300 начални SP, единен таван 400 SP и restore от авторитетния snapshot при смъртта: позиция `lastClearedRow`, текущи hints, изчистени всички ефекти, запазени mystery консумация/разкрития и без rollback на ресурси. Размерът/графикът на SP се записва отделно след избор; сегашните фиксирани и намаляващи кандидати са хипотези за сравнение, не одобрено правило.
- [ ] Различени са `revivesGranted` за квотата, `revivesApplied` за възстановяванията и `revivesToReachScore` за класацията. Десетата валидна награда дава десето продължаване; следващата смърт е окончателна и няма 11-а награда.
- [ ] Няма финален ред: преживяното преминаване през 350 продължава към 351. Запазени са щетите 10/15/20 SP, включително постоянни 20 SP след ред 25, до отделно измерено решение; не се добавят 160-секунден лимит, автоматично нарастваща щета или таймер за смърт при бездействие.
- [ ] Practice е достъпна за всички възрасти без акаунт, възрастов отговор или analytics разрешение. Доброволни години се преобразуват в частни `analyticsAgeBand` и `ageResponseAt`, с видимо „Пропусни“; точните години не се пазят. Отделният `privacyContext` определя приложимите защити/родителски потоци за акаунт и реклами и не се отключва от analytics отговора.
- [ ] Фиксирани са възстановимият вход за ranked, офлайн practice и историческата country snapshot; cooldown е `30 × 24 часа` след първото ranked заключване на държавата или последната приета промяна. Pending опитът е възстановим и непубликуван, а разрешеният финален резултат е неизменен.
- [ ] Определени са бъдещите проверки за bounded stream/persistence, дълги опити, точност на score и баланс. Чистата SP аритметика се различава от реални playtest измервания; няма твърдение за вече изпълнена игра или device QA.

### Проверка и демонстрация

Преглед с Georgi на fatal row, преминаване 350→351, 10-та награда, пропуснат възрастов въпрос, child/unknown privacy context и смяна на държава. Done изисква записано решение за revive SP и завършен преглед на договора; приета посока не е изпълнен gameplay критерий.

## [CPI-002](https://github.com/georgi-cole/crystal-path-infinity/issues/2) — Мобилен spike: Capacitor, реклами, SSV, latency и разход на сървъра

**Етап:** M0 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-001

### Цел

Да проверим най-рисковите технически предположения преди избор на окончателна конфигурация.

### Обхват

Малка сцена с текущия React/CSS подход и тестова rewarded реклама на реални Android и iPhone. Това е техническо доказателство, не публична игра.

### Критерии за приемане

- [ ] Документирана е работеща комбинация Node, Capacitor, AdMob plugin, Google Mobile Ads/UMP, mediation adapters, Android tools и Xcode/iOS SDK. Проверени са точните приложими Families self-certified SDK версии за child/unknown трафик и privacy възможностите; версиите не са избрани само по latest.
- [ ] Тестова реклама показва reward, dismiss, app background/return и cleanup на двете платформи; проверено е предаването на SSV custom data.
- [ ] Проверени са портретният layout, safe areas, input и звук на по-слаб Android и iPhone; записани са наблюденията и ограниченията.
- [ ] Измерени са round-trip времена за една сървърно проверена стъпка и реакцията при бавна/липсваща връзка; определен е приемлив UX бюджет.
- [ ] Има разчет по измерени заявки на действие/активна минута и по дължина на опита, включително runtime, checkpoint и action-history storage; няма обещание за безплатен backend. Фиксирани са ресурсни бюджети и натоварвания за дълги опити, без продуктов лимит на редовете.

### Проверка и демонстрация

Кратък запис от двете устройства и таблица с точните версии, измервания и go/no-go. Несъвместим SSV bridge или неприемлива latency водят до конкретна корекция на архитектурата.

## [CPI-003](https://github.com/georgi-cole/crystal-path-infinity/issues/3) — Минимален React/TypeScript/Capacitor проект с отделна идентичност

**Етап:** M0 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-002

### Цел

Новата игра да се компилира независимо от The Big Eye.

### Обхват

Малък проект с web development mode и отделни Android/iOS wrappers; окончателни app IDs се фиксират преди store регистрация.

### Критерии за приемане

- [ ] Чист checkout се инсталира с lockfile и стартира документирaно; няма зависимост от целия bbmobilenew-source.
- [ ] Android applicationId, iOS bundle ID, app name и dev/staging/production настройки са отделни от The Big Eye.
- [ ] Няма ненужни Pixi/Three/Remotion, season store, billing или location permissions.
- [ ] Env примерите съдържат placeholders; няма чужди production identifiers, service-role ключове, signing материали или пароли.
- [ ] Web build и native debug build са изпълнени с избраната в CPI-002 конфигурация.

### Проверка и демонстрация

Възпроизводим clean build и отваряне на минималния екран на Android/iOS. Документират се нужните локални инструменти и платформени ограничения.

## [CPI-004](https://github.com/georgi-cole/crystal-path-infinity/issues/4) — CI за кода и проверими правила за main

**Етап:** M0 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-003

### Цел

Всяка следваща задача да има полезна проверка преди вливане.

### Обхват

Заменяме planning-only CI с typecheck, formatting/lint, core tests и web build; добавяме подходящи native checks според наличните runners.

### Критерии за приемане

- [ ] PR проверките работят от чист checkout, без production credentials; workflow token има минимални права.
- [ ] Избрани са устойчиви имена на required checks и реално съществуващите native build jobs; скъпите подписани build-ове са отделени.
- [ ] Main има подходящ branch protection/ruleset само ако планът и правата го поддържат; настройката е прочетена обратно и статусът е честно документиран.
- [ ] Squash merge и изтриване на merged branches са настроени; issue/PR шаблоните сочат CPI ID и приемателните критерии.
- [ ] При неподдържана protection настройка има видим pending item, а не твърдение за защитен branch.

### Проверка и демонстрация

Контролиран PR с реална грешка блокира съответната проверка; след поправката тя минава. Не се добавят фиктивни тестове за зелено CI.

## [CPI-005](https://github.com/georgi-cole/crystal-path-infinity/issues/5) — Извличане на чистото ядро за един играч

**Етап:** M1 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-001, CPI-003, CPI-004

### Цел

Игровите правила да се използват еднакво от practice и проверения server run при безкраен маршрут.

### Обхват

Извличане от shatteredLogic и component handlers в детерминистични state transitions с подадени clock/RNG и versioned rules. Новата игра използва постепенно генериран маршрут; историческият 350-row режим остава непроменен в The Big Eye.

### Критерии за приемане

- [ ] Ядрото не импортира React, Redux, browser API, AI profile, season host или LOH/POS награди; старият ограничен AI simulator не се превръща в безкраен синхронен loop.
- [ ] Запазени са damage bands 10/15/20 SP, постоянни 20 SP след ред 25, 12 mystery weights, 2 начални hints, mystery консумация и ефекти. Началните SP са 300, а общият таван е 400; fixtures сочат изходния commit и изричните standalone промени.
- [ ] Един immutable RunState и събития описват избор, hint, mystery, tick, death, изричен край на опита и разрешено revive; няма hidden finish или отделна категория победители на ред 350.
- [ ] Генерирането е на ограничени batches с абсолютен row index и buffer offset; отработените rows/resolved записи се освобождават. Паметта на активното ядро не расте с всички преминати редове.
- [ ] Сериализируемото състояние включва RNG позицията/състоянието, следващия абсолютен ред, mystery cursor и текущите консумация/разкрития. Mystery cadence продължава отвъд 350; различни batch размери и save/resume дават идентичен поток.
- [ ] RunResult различава `lastClearedRow`, `fatalRow`, причината за край и трите revive брояча според CPI-001; напредъкът не губи числова точност и няма 32-bit wrap.
- [ ] Всеки опит носи rulesetVersion; идентични входове и clock дават идентичен резултат. Не се добавят автоматична ескалация на щетите или смърт при бездействие.

### Проверка и демонстрация

Focused тестове за damage границите 10/11/25/26, effect priority/expiry, mystery cadence през batch граници и 350→351, batch-equivalence след save/resume и освобождаване на старото състояние. Сравнение със запазени baseline fixtures, като historical 350 finish не се приема за standalone очакване.

## [CPI-006](https://github.com/georgi-cole/crystal-path-infinity/issues/6) — Смърт, безкраен прогрес и единни SP граници

**Етап:** M1 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-005

### Цел

Всички причини за смърт и преминаване да имат последователен резултат преди рекламните продължавания.

### Обхват

Единни wrong/mystery/drain death transitions, преживян прогрес без финален ред, SP граници и идемпотентен край на опита.

### Критерии за приемане

- [ ] Wrong, mystery и drain damage до 0 SP създават един death event и спират input. Дължимите ефекти се разрешават преди следващия вход; ако убият играча, входът не се изпълнява.
- [ ] Правилна, shielded wrong, damaging wrong и healing wrong стъпка увеличават `lastClearedRow` точно веднъж само ако са преживени. На ред 350 продължават към 351, без victory/finish събитие.
- [ ] Фаталната стъпка не добавя напредък; при смърт на 350 резултатът е 349 и разрешено revive повтаря същия неразрешен ред със запазената информация.
- [ ] Всички health mutation пътища спазват SP границите 0–400 и 300 начални SP; няма различен heal cap или кратък прозорец за действие при SP 0.
- [ ] Изричното End run и окончателната смърт финализират според CPI-001; pause, recovery и pending SSV не се приемат за финален резултат.
- [ ] Rapid double tap, закъснял callback и unmount не създават втори progress, death или финализиране; преживяна стъпка не се преобръща в историческия 350-row finish.

### Проверка и демонстрация

Focused тестове за drain/mystery/wrong смърт, преживяни и фатални действия на 349/350/351, SP тавана и повторено финализиране. Историческите статични находки и новите standalone очаквания са разграничени; потвърден дефект се отчита само с възпроизводим резултат.

## [CPI-007](https://github.com/georgi-cole/crystal-path-infinity/issues/7) — Един игрови часовник и pause/background договор

**Етап:** M1 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-006

### Цел

Ефектите и прогресът да не се променят случайно при реклама, пауза или заключване на телефона.

### Обхват

Ясен active-time модел, native lifecycle adapter и разделяне на анимационно време от авторитетно gameplay време.

### Критерии за приемане

- [ ] Hints, 5-секундни ефекти и regen/drain използват един игрови clock; няма независими Date.now решения в renderer-а.
- [ ] Pause, death, ad, pending verification, background и recovery замразяват активното време според CPI-001; ordinary animation/изчакване по време на игра го използват. Normal resume пази оставащите ефекти, revive ги изчиства, а app resume не дублира ticks.
- [ ] Дълго OS suspend и промяна на часовника на устройството не създават SP, безкрайни buff-ове или безплатен progress.
- [ ] Моделът поддържа server-owned clock за ranked; клиентско elapsed/time поле не е доказателство за валидно време.
- [ ] Cleanup при напускане прекратява callbacks и звука; няма късно презаписване на друг опит. Не се добавят idle-kill или принудителен move timer; неподвижният играч не получава напредък.

### Проверка и демонстрация

Контролирани clock тестове на границите 0/499/500/5000 ms и device сценарии lock/unlock, app switch и return. В ranked API се интегрира в CPI-021.

## [CPI-008](https://github.com/georgi-cole/crystal-path-infinity/issues/8) — Извличане на текущата Infinity сцена за мобилен екран

**Етап:** M1 · **Приоритет:** P1 · **Размер:** L · **Зависимости:** CPI-006, CPI-007

### Цел

Да запазим разпознаваемото преживяване без тежка промяна на renderer-а.

### Обхват

React/CSS bridge, current premium atmosphere, black-hole background и ограничени ефекти; standalone event interface.

### Критерии за приемане

- [ ] Ляво/дясно, mystery и hint са достъпни с една ръка; safe areas не закриват контролите.
- [ ] Запазени са crack, collapse и step feedback, но няма сезонен prize текст, AI feed, VIP unlock или фиктивни онлайн съперници.
- [ ] Row buffer, resolved-row presentation и DOM прозорецът са ограничени, с коректен absolute-index/buffer-offset mapping. Дълъг опит освобождава старите записи и не трупа nodes/timers; бъдещите декоративни rows не съдържат ranked отговори.
- [ ] Екранът е използваем в тесен портрет и при динамични системни bars; големи row/score стойности и touch targets не се режат. Няма индикатор за достигане на фиксиран последен ред.
- [ ] Няма Pixi/WebGL пренаписване; renderer-ът не получава бъдещи тайни за ranked.

### Проверка и демонстрация

Сравнение с избрани кадри на текущата Infinity визия и интерактивен walkthrough на тесен Android/iPhone viewport. Проверяват се 350→351 и големи синтетични row индекси; performance и long-soak оценката се завършват в CPI-034.

## [CPI-009](https://github.com/georgi-cole/crystal-path-infinity/issues/9) — Локална практика и надеждно запазване на незавършен опит

**Етап:** M1 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-007, CPI-008

### Цел

Играчът да може да опита играта без акаунт и да възстанови прекъсната практика.

### Обхват

Versioned local persistence за practice, настройки и checkpoint; това не е канал за качване на офлайн резултати в Top 100.

### Критерии за приемане

- [ ] Practice работи офлайн за всички възрасти без акаунт, възрастов отговор или analytics разрешение; ясно е обозначена и нейният резултат не се представя като verified ranked.
- [ ] App restart възстановява последния атомарен checkpoint: SP, hints, clock, RNG state/position, mystery cursor, абсолютен ред и ограничен buffer, текущи mystery консумация/разкрития и revive state. Няма reroll, възстановяване на изразходвани ресурси или повторна награда.
- [ ] Активният checkpoint остава с ограничен размер и не сериализира цялата история на безкраен опит. Повреден или несъвместим save има обяснение и безопасен нов опит; не crash-ва bootstrap.
- [ ] Стар save не може да нулира revive count на официален опит; ranked state ще се чете от сървъра.
- [ ] Нов опит и продължаване на стар са различни действия с ясни предупреждения за загуба на незаписан напредък.

### Проверка и демонстрация

Kill/relaunch по време на safe step, mystery, pause и save, включително отвъд 350 и точно на batch граница; corruption/version fixture и сравнение на потока преди/след recovery. Проверка, че practice няма достъп до official score mutation.

## [CPI-010](https://github.com/georgi-cole/crystal-path-infinity/issues/10) — Самостоятелен звук, музика и haptics

**Етап:** M1 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-007, CPI-008

### Цел

Да запазим звуковата атмосфера без зависимост от глобалния SoundManager на The Big Eye.

### Обхват

Избраните four SFX и glass_bridge music, малък audio adapter, haptic feedback и lifecycle.

### Критерии за приемане

- [ ] Преизползваните файлове и права са в reuse manifest; няма целия стар audio catalog.
- [ ] Music и SFX имат отделни настройки; muted състоянието се пази след restart.
- [ ] Реклама, phone interruption и background спират/намаляват звука правилно; return не стартира два music loop-а.
- [ ] Haptics са незадължителни, изключваеми и различими за стъпка, щета и край; липсваща native поддръжка не блокира играта.
- [ ] Сигналът за личен рекорд/край и death cue се изпълняват веднъж и не се наслагват със следващ опит; няма звуково обявяване на победа на ред 350.

### Проверка и демонстрация

Устройствен walkthrough с mute, headphones/silent mode, ad interruption и повторно стартиране; проверка за освобождаване на audio ресурси.

## [CPI-011](https://github.com/georgi-cole/crystal-path-infinity/issues/11) — Визуална идентичност и проследим набор от ресурси

**Етап:** M2 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-001, CPI-008

### Цел

Самостоятелният продукт да има своя марка, като запази познатата Infinity атмосфера.

### Обхват

Wordmark, app-icon концепция, цветове/типография и минимален asset brief; текущата premium визия става базова според продуктовото решение.

### Критерии за приемане

- [ ] Има избран визуален вариант за Crystal Path: Infinity, четим на малък мобилен екран.
- [ ] Фон, кристали, fog/glow и типография са съгласувани с менюто и HUD, без чужди The Big Eye/LOH/POS текстове.
- [ ] За всеки копиран ресурс са записани source path, commit, право за употреба и необходима оптимизация; proprietary правата са запазени.
- [ ] Генеративни изображения, ако се ползват, са само за одобрени липсващи assets; точните UI надписи остават реален текст.
- [ ] Избрани са размери, формат и fallback за фон/икона; native exports се изпълняват в CPI-012.

### Проверка и демонстрация

Преглед на icon preview, menu/HUD пример и asset inventory с Georgi; няма нужда от пълен нов art pack преди приемане на посоката.

## [CPI-012](https://github.com/georgi-cole/crystal-path-infinity/issues/12) — Икони, native splash и плавен старт на приложението

**Етап:** M2 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-003, CPI-011

### Цел

Играта да изглежда самостоятелна още при стартиране и да достига надеждно до менюто.

### Обхват

Android adaptive icon, iOS icon exports, platform launch screen и отделна кратка in-app loading/intro фаза.

### Критерии за приемане

- [ ] Новите икони са четими и правилно изрязани на Android/iOS; няма останали story-icon aliases.
- [ ] Android 12+ splash използва платформения icon/background модел; не се обещава произволен fullscreen OS splash.
- [ ] Native splash и първият React кадър имат съгласуван тъмен фон без бяла светкавица.
- [ ] App bootstrap няма изкуствена дълга пауза; показва retry/offline път при loading failure.
- [ ] Launch screen не блокира потребителя безкрайно за ad, analytics или недостъпна класация.

### Проверка и демонстрация

Cold/warm start, offline start и забавен bootstrap на двете платформи; визуален преглед на всички изисквани icon variants.

## [CPI-013](https://github.com/georgi-cole/crystal-path-infinity/issues/13) — Начално меню, bootstrap и навигация

**Етап:** M2 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-009, CPI-012

### Цел

Играчът бързо да разбира как да започне, да види рекорда си и да стигне до класациите.

### Обхват

Меню с Play, Practice, Rankings, Profile и Settings; възстановяване на незавършен опит и auth/network състояния.

### Критерии за приемане

- [ ] Основният Play бутон е доминиращ; personal best и статусът на акаунта са ясни.
- [ ] За guest ranked действието води към обяснен account/privacy flow, а practice остава достъпна за всички възрасти без акаунт, възрастов отговор или analytics разрешение.
- [ ] Незавършен опит предлага Resume или изрично нов опит; навигацията не стартира дублирана сесия.
- [ ] Android Back, модални екрани и deep-link return имат предвидимо поведение.
- [ ] Loading, offline, maintenance и retry състояния не изглеждат като празно/блокирано меню.

### Проверка и демонстрация

Walkthrough от fresh install до practice и обратно, restart с активен save и навигация с Back. Server/auth части се свързват след съответните backend задачи.

## [CPI-014](https://github.com/georgi-cole/crystal-path-infinity/issues/14) — Кратък интерактивен tutorial за мост, hints и mystery

**Етап:** M2 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-008, CPI-013

### Цел

Нов играч да разбере правилата чрез няколко действия, без дълъг задължителен текст.

### Обхват

Кратък локален учебен маршрут с едно safe/wrong действие, hint и доброволен mystery пример.

### Критерии за приемане

- [ ] Tutorial обяснява SP, преживяната грешка и `lastClearedRow`: фатален ред не се брои, маршрутът няма финален ред, а изричният End run приключва опита.
- [ ] Играчът използва hint и вижда, че mystery е доброволна и може да навреди.
- [ ] Учебните резултати не влизат в класации и не показват production реклами.
- [ ] Може да се прескочи и да се отвори отново от Settings; completion се запазва.
- [ ] Фокусът/инструкциите не покриват текущите touch targets и не разчитат само на цвят.

### Проверка и демонстрация

Наблюдаван първи опит с човек, който не познава минииграта; проверка, че може да обясни SP, hint, mystery и края на опита.

## [CPI-015](https://github.com/georgi-cole/crystal-path-infinity/issues/15) — HUD, пауза, смърт и резултат на един опит

**Етап:** M2 · **Приоритет:** P1 · **Размер:** L · **Зависимости:** CPI-006, CPI-007, CPI-013

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Всяко състояние на безкрайния опит да е разбираемо и да оставя ясен следващ ход.

### Обхват

SP/progress/hints/effect HUD, pause, death offer, изричен End run and submit и резултат/личен рекорд без специален 350-row finish.

### Критерии за приемане

- [ ] HUD показва текущ SP, преминати редове, hints, ефекти и реално приложени продължавания (`revivesApplied`). Наличната рекламна квота се извежда отделно от `revivesGranted`, според CPI-001; големи row/score стойности остават четими.
- [ ] При death input спира и има ясен End run; мястото за доброволния rewarded choice се свързва в CPI-029. При pending SSV действието за запазване/връщане не се представя като окончателно приключване.
- [ ] Резултатът различава преминати редове, `fatalRow` и verified/pending/practice. Pending SSV остава незавършен и непубликуван; не обявява официален рекорд или финален резултат.
- [ ] Pause не начислява време/щета; Resume не дублира анимации или gameplay действия. Затварянето на приложението е save/recovery, а не скрито End run.
- [ ] Играчът може изрично да приключи и подаде последния потвърден резултат и докато е жив; финализирането спазва pending-reward договора. Няма victory екран/сезонна награда на 350; преживян ред 350 продължава към 351.
- [ ] След действителен край Next run и Rankings са достъпни; офертата преди реклама показва окончателно приетата фиксирана revive SP стойност, без да представя предложените 200 SP като вече одобрени.

### Проверка и демонстрация

Демонстрация на End run от жив опит, окончателна mystery/drain/wrong смърт, pause, личен рекорд, pending SSV и продължаване 350→351 в тесен портрет; повторен tap не създава нов опит или резултат два пъти.

## [CPI-016](https://github.com/georgi-cole/crystal-path-infinity/issues/16) — Настройки, достъпност и български/английски интерфейс

**Етап:** M2 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-010, CPI-013, CPI-015

### Цел

Играчът да контролира основните настройки, а важната информация да остава четима и достъпна.

### Обхват

Music/SFX/haptics, reduced motion, език, tutorial, privacy/account/support връзки и accessibility на основните екрани.

### Критерии за приемане

- [ ] BG/EN текстовете са централизирани; няма останал сезонен copy или недефинирани translation keys.
- [ ] Reduced motion ограничава flashes, shake и ambient движение без да скрива резултата от действие.
- [ ] SP danger и tile feedback не разчитат само на цвят; контролите имат имена, подходящ touch target и четим контраст.
- [ ] Системен по-голям текст не отрязва Play, End run, ad choice и критичните privacy действия.
- [ ] Privacy, delete account и support имат постоянни места; действията се активират с реалните услуги, без фалшиво успешни placeholders.

### Проверка и демонстрация

VoiceOver/TalkBack smoke, по-голям текст, reduced motion и двата езика; проверка на всички критични действия в най-тесния поддържан екран.

## [CPI-017](https://github.com/georgi-cole/crystal-path-infinity/issues/17) — Отделни backend среди, схема и права върху данните

**Етап:** M3 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-001, CPI-003, CPI-004

### Цел

Новият продукт да има изолирани данни и достъп според действителната роля на клиента.

### Обхват

Supabase Auth/Postgres/RLS и сървърни endpoints като избрана след spike основа; dev/staging/production конфигурация и migrations.

### Критерии за приемане

- [ ] Схемата разделя public profile fields от доброволните частни `analyticsAgeBand`/`ageResponseAt`, отделния `privacyContext`, consent/приложими родителски записи и auth данни. Точни години не се съхраняват; няма публичен join, който разкрива възрастова група, privacy context или email.
- [ ] Run/action/reward/score таблиците се променят само през оторизирани server операции; клиентът не може директно да задава SP, score или revives.
- [ ] RLS/grants са изрични за всички exposed таблици; read models не заобикалят privacy границите.
- [ ] Production secrets остават на сървъра, не във VITE_ variables, приложенията, git или logs.
- [ ] Migrations, индекси, backup/restore подход и environment разделението са документирани; не се използва старият The Big Eye production project.

### Проверка и демонстрация

Негативни API/RLS тестове: guest, account A и account B не четат/променят чужди private данни; mobile public key не може да записва score. Schema се създава от нулата чрез migrations.

## [CPI-018](https://github.com/georgi-cole/crystal-path-infinity/issues/18) — Възстановим акаунт и преминаване от гост към ranked

**Етап:** M3 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-017

### Цел

Официалните рекорди да принадлежат на възстановим акаунт, като достъпът до практика не изисква регистрация или възрастови данни.

### Обхват

MVP вход с email OTP, session refresh/logout, безопасно native token storage и guest practice upgrade. Account/ranked потокът прилага отделния privacyContext и приложимите родителски/consent стъпки за избраните пазари, без adult-only gate.

### Критерии за приемане

- [ ] Един и същ допустимо създаден акаунт възстановява профила и официалните рекорди на друго устройство.
- [ ] Guest practice е достъпна за всички възрасти без възрастов отговор, акаунт или optional analytics. Входът не преобразува непроверен local score във verified.
- [ ] Преди събиране на account данни са изпълнени приложимите privacy/родителски стъпки според контекста и пазара; child/unknown контекстът запазва защитите. Няма общо правило, че всеки непълнолетен е забранен или винаги изисква един и същ consent flow.
- [ ] OTP expiry, resend rate limit, invalid code, offline, cancelled login и незавършен приложим родителски поток имат ясни състояния; връщането към practice остава възможно.
- [ ] Tokens не се появяват в logs/URLs; избраният native storage и deep-link/auth redirect са изпитани, без изтичане на account existence.
- [ ] Logout/revocation спира чужди cached mutations; account linking не слива автоматично различни хора или непотвърдени резултати. Analytics отговорът не е разрешение за account/ranked обработване.

### Проверка и демонстрация

Регистрация, вход, app restart, изтекла сесия и второ устройство; проверка след logout и child/unknown сценарии с приложимите родителски стъпки. Отказ/пропускане на optional analytics не блокира practice. Социален login остава извън MVP.

## [CPI-019](https://github.com/georgi-cole/crystal-path-infinity/issues/19) — Профил с username и непублични възрастови данни

**Етап:** M3 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-001, CPI-018

### Цел

Да имаме публичен username и доброволна частна възрастова аналитика, отделени от правилата за privacy защита.

### Обхват

Profile onboarding/edit за username, доброволен въпрос за години с „Пропусни“, частни analyticsAgeBand/ageResponseAt и отделен privacyContext според CPI-001. Country selector се завършва в CPI-020; няма възрастов gate за играта.

### Критерии за приемане

- [ ] Username има server-side normalization, ограничение на дължина, reserved names и уникалност/ясен discriminator според договора; UI насочва към псевдоним без лични данни.
- [ ] Въпросът за години е доброволен и обяснява аналитичната цел; „Пропусни“ не блокира practice или действа като отказ за възрастов достъп. Разрешението за optional analytics не е условие за основната игра.
- [ ] При допустим отговор точните години се преобразуват в частни `analyticsAgeBand` и `ageResponseAt`; не се пазят raw age/birthdate в DB, logs, crash или gameplay payload-и. Пропуснат отговор не се заменя с измислена възраст.
- [ ] Границите на аналитичните групи и retention са описани. `ageResponseAt` е време на отговора, не рожден ден; корекция/нов отговор не водят до автоматично измислено остаряване между групите.
- [ ] Отделният `privacyContext` запазва защитен child/unknown режим и приложимите родителски стъпки. Analytics age band, пропускане или корекция не разрешават автоматично ad/online обработване и не отслабват защитите.
- [ ] Публичният профил/класацията не връщат възрастова група, email, birthdate, privacyContext или consent история. Validation errors са ясни и resume onboarding не създава втори акаунт.

### Проверка и демонстрация

Два едновременни опита за едно normalized име; пропусната/празна/невалидна възраст, валидна група, корекция и child/unknown context. Проверка на DB, logs и public payloads за raw age и частни полета; guest practice работи без отговор.

## [CPI-020](https://github.com/georgi-cole/crystal-path-infinity/issues/20) — Държави, континенти и история на регионалната принадлежност

**Етап:** M3 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-017, CPI-019

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Един резултат да има стабилна и разбираема принадлежност към държава и континент.

### Обхват

Деклариран ISO country selector, версия на country-to-continent mapping и snapshot при старт на ranked run.

### Критерии за приемане

- [ ] Europe не е EU; изрично са решени територии и трансконтинентални държави, с versioned mapping и fixtures.
- [ ] Не се иска GPS permission и не се представя декларираната страна като проверено гражданство/местоположение.
- [ ] Държавата се snapshot-ва върху новия опит; смяна на профила не премества стари рекорди в нова държава.
- [ ] Приетият country-change cooldown е `30 × 24 часа` сървърно време след първото ranked заключване на държавата или последната приета промяна. Преди първия ranked опит корекциите са свободни; текущият опит и историческите записи пазят snapshot-ите си.
- [ ] Липсваща/неподдържана страна има определено поведение; не се извежда измислен регион от IP или език.

### Проверка и демонстрация

Fixtures за България→Европа, държава извън ЕС в Европа, територия и сменена страна; same-score run преди/след промяна остава в правилните scopes.

## [CPI-021](https://github.com/georgi-cole/crystal-path-infinity/issues/21) — Сървърно управляван ranked опит със скрит бъдещ маршрут

**Етап:** M3 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-005, CPI-006, CPI-007, CPI-017, CPI-019, CPI-020

### Цел

Top 100 да приема проверен напредък по безкраен маршрут вместо число, изпратено от клиента.

### Обхват

Start/action/hint/mystery/end API, сървърно RNG/clock, постепенно генериране и versioned run state; един активен ranked lease на акаунт.

### Критерии за приемане

- [ ] Бъдещите safeSide стойности, възстановимият seed/RNG state и mystery cursor остават server-private; hint разкрива само разрешената текуща информация.
- [ ] Потокът се генерира на ограничени batches с абсолютен индекс и offset; mysteries продължават отвъд 350 и при сменен batch. Активният state/checkpoint не натрупва целия маршрут или action history.
- [ ] Всяко действие носи run ID, sequence и idempotency key; дубликатите се връщат безопасно, а разместване/чужд run се отхвърля. Броячите и row/score serialization не губят точност или се превъртат през 32-bit.
- [ ] Сървърът проверява input eligibility, SP, hints, mystery консумация, due effects, death/изричен край и темпо; не вярва на client clock или score. Няма terminal check на 350 или idle-kill правило.
- [ ] Промяната на състоянието, RNG/mystery позицията и събитийният запис са атомарни; няма два напредъка от един tap или два активни leases при race. Пълната audit история се пази отделно с retention/storage план.
- [ ] Клиентът показва pending действие без предварителен официален резултат; latency поведението следва CPI-002. Ресурсен/мрежов проблем води до save/recovery, не до измислен finish, reset или безплатен прогрес.
- [ ] RulesetVersion и регионалният snapshot са неизменни за опита; mock/practice или private balance-test събития не са валидни команди за публичния ranked ruleset.

### Проверка и демонстрация

Контролиран run с altered payload, повторен sequence, parallel requests, предсказан seed и forged finalization; продължаване 350→351 и през batch/recovery граници. Проверка на responses за бъдещи отговори и на checkpoint размера при дълга история.

## [CPI-022](https://github.com/georgi-cole/crystal-path-infinity/issues/22) — Възстановяване при загуба на връзка и конкурентни устройства

**Етап:** M3 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-009, CPI-021

### Цел

Честният играч да не губи опита при прекъсване, без recovery да позволява дублиране на прогрес.

### Обхват

Server checkpoint, lease/session ownership, повторно свързване и ясни timeout/resume правила.

### Критерии за приемане

- [ ] Загубата на връзка спира нови ranked действия и показва състояние за възстановяване, не локално продължаващ official run.
- [ ] Повторно изпратена непотвърдена команда връща същия резултат; client checkpoint не презаписва server state.
- [ ] Две устройства не управляват един опит едновременно; takeover/lease expiry е изрично и видимо.
- [ ] App kill, token refresh и сървърен retry възстановяват SP, hints, clock, country, трите revive брояча, RNG/mystery cursor, абсолютен ред и текущи консумация/разкрития без нулиране или reroll. Смъртта се възстановява от авторитетния death snapshot, без rollback на ресурси.
- [ ] Recovery използва ограничен checkpoint и нужния текущ прозорец, не reload/replay на цялата история. Изтекъл/несъвместим опит има безопасно terminal/pending handling според договора; няма вечен spinner или автоматичен край заради дължината на маршрута.

### Проверка и демонстрация

Прекъсване преди request, след server commit преди response и по време на resume; два телефона с един акаунт и повторна offline queue. Дълъг опит отвъд 350 и batch граница запазва точно същия следващ маршрут и bounded recovery обем.

## [CPI-023](https://github.com/georgi-cole/crystal-path-infinity/issues/23) — Проверени лични рекорди и World/Continent/Country read model

**Етап:** M3 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-020, CPI-021, CPI-022

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Всички класации да използват един прозрачен и устойчив критерий.

### Обхват

Finalize/personal best projection, ranking queries, индекси и разумно кеширане за конкретен ruleset.

### Критерии за приемане

- [ ] Приетото подреждане от CPI-001 е `lastClearedRow` низходящо, `revivesToReachScore` възходящо, сървърен `achievedAt` възходящо и стабилен ID. Tie стойностите се записват при напредък; по-късно revive без нов ред не влошава резултата и клиентски timestamp не решава равенство.
- [ ] Един акаунт има максимум един ред във всяка scope/version класация; best selection е атомарен при едновременни финализирания.
- [ ] World избира най-добрия допустим резултат; regional scopes използват snapshot-а на конкретния run, без ретроактивно преместване.
- [ ] Practice, rejected, pending SSV, непроверена награда и несъвместим ruleset не влизат в официалните резултати. Резултат 0 остава личен и не заема място в Top 100.
- [ ] API връща Top 100, own rank и съседни позиции, count и updated-at; има ясни empty/cached състояния. Row/score стойности остават точни между DB, API и UI, сравняват се числово без 32-bit wrap/float rounding и нямат cap или finisher категория на 350.
- [ ] Pending SSV опитът остава възстановим и непубликуван; едва след окончателния край на опита и разрешаването на всички рекламни проверки се публикува един неизменен финален резултат. Късна награда не отваря финализиран резултат и не създава втори leaderboard entry.

### Проверка и демонстрация

Fixtures за равенства, 101+ потребители, няколко runs на човек, смяна на страна, ban/delete, нов ruleset и конкурентен best update; съседни големи score стойности през избрания lossless wire format и numeric sort.

## [CPI-024](https://github.com/georgi-cole/crystal-path-infinity/issues/24) — Екран Top 100 с лично място и регионални филтри

**Етап:** M3 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-013, CPI-019, CPI-023

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Състезанието да е полезно и за играч, който още не е в стоте най-добри.

### Обхват

World, Continent и Country views с бързо превключване и достъп от меню/резултат.

### Критерии за приемане

- [ ] Показани са ранг, username, държавата от snapshot-а на резултата, progress и „Продължавания до този резултат“ (`revivesToReachScore`); няма възраст или login данни.
- [ ] Собственото място и близки позиции са видими и извън Top 100; текущият филтър е недвусмислен.
- [ ] Loading, empty, offline cached, error и pending personal result са различими и имат подходящ retry. Pending SSV е лично непубликувано състояние, без официална позиция за този опит.
- [ ] Обяснението за tie-break и правилата на текущата класация е кратко и достъпно.
- [ ] Промяна на филтъра не размества грешен кеш в друг scope; updates не прескачат неочаквано scroll позицията.

### Проверка и демонстрация

UI demo с Top 3, rank 100, rank 101 и извън първите 1000, големи row/score стойности, без резултат и с празна държава; проверка на реалната API pagination/response и lossless показване.

## [CPI-025](https://github.com/georgi-cole/crystal-path-infinity/issues/25) — Докладване на имена и административен контрол на класацията

**Етап:** M3 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-019, CPI-023, CPI-024

### Цел

Публичната класация да има реален механизъм за неприемливи имена и потвърдени невалидни резултати.

### Обхват

Report flow, ограничена административна роля и audit trail за hide/name reset/disqualification.

### Критерии за приемане

- [ ] Report съдържа минималните данни, причина и rate limit; не показва private профила на докладвания.
- [ ] Административни операции са недостъпни с обикновен mobile user token; критичните промени имат audit trail.
- [ ] Скриване/дисквалификация премахва записа от всички приложими read models и кешове последователно.
- [ ] Грешна административна промяна може да се прегледа/коригира по документиран ред; клиентът не се самообявява за banned/unbanned.
- [ ] Няма автоматичен ban само за висок резултат; suspicious signals изискват определена проверка.

### Проверка и демонстрация

Account A докладва име; само администратор го обработва. Негативен permission test и проверка за съгласувани World/Country резултати след disqualification.

## [CPI-026](https://github.com/georgi-cole/crystal-path-infinity/issues/26) — Consent, възрастова допустимост и privacy настройки за реклами

**Етап:** M4 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-001, CPI-018, CPI-019

### Цел

Рекламното и account обработване да следват отделния privacyContext и приложимите правила, без възрастов gate за основната игра.

### Обхват

UMP/privacy-options flow, child/unknown защитни настройки, приложими родителски стъпки и ATT само ако конфигурацията извършва tracking. Analytics е отделен доброволен избор; всички възрасти са в продуктовия обхват.

### Критерии за приемане

- [ ] PrivacyContext е отделен от `analyticsAgeBand` и пропускането на аналитичния въпрос. Child/unknown контекстът запазва защитните настройки; не се копира adult-only gate и не се приема, че analytics отговорът дава разрешение за реклама.
- [ ] Преди събиране/достъп до данни и ad requests са изпълнени приложимите consent/родителски стъпки за пазар, платформа и контекст. Матрицата не налага еднакво правило за всички непълнолетни и не забранява общо всички реклами за тях.
- [ ] Consent information се обновява по SDK изискванията; canRequestAds и съответните child-directed/under-age-of-consent/content-rating сигнали се прилагат изрично. Инициализацията не заобикаля необходимите предварителни защити.
- [ ] Privacy options са достъпни от Settings, когато са изискуеми; withdrawal/correction обезсилват висящи неподходящи ad requests. Промяна на analytics избора не се използва за отслабване на privacyContext.
- [ ] Изборът за конкретна rewarded реклама, consent/ATT и optional analytics са отделни. Неперсонализиран/ограничен режим не се приема автоматично за освобождаване от приложими consent изисквания.
- [ ] Избраните SDK/mediation версии, content/closeability изисквания и Families self-certified приложимост за детски/unknown трафик са проверени с CPI-002/CPI-027; неподдържан конкретен ad flow е ясно unavailable.
- [ ] Practice остава достъпна без акаунт, възрастов отговор или analytics разрешение; отказ/липса на допустима реклама не блокира нова игра и не създава фиктивен reward.

### Проверка и демонстрация

Android/iOS матрица за child/unknown/друг приложим контекст, consent required/not required, отказ, withdrawal, restart и приложими родителски стъпки. Проверка на действителни SDK payload-и и че никакъв analytics отказ не блокира practice.

## [CPI-027](https://github.com/georgi-cole/crystal-path-infinity/issues/27) — Самостоятелен native rewarded-ad provider

**Етап:** M4 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-002, CPI-026

### Цел

Да имаме една предвидима интеграция за run_revive, без season/VIP зависимости.

### Обхват

Native AdMob adapter със start/load/show/reward/dismiss/error lifecycle, all-ages privacy настройки от CPI-026 и изолиран fake provider за разработка.

### Критерии за приемане

- [ ] Една fullscreen реклама максимум; rapid taps не зареждат/показват две паралелни реклами.
- [ ] Reward, dismiss и error са различни събития; SDK callback order не се предполага еднакъв на всички платформи.
- [ ] Всеки показан ad носи server-issued opaque intent в custom data; username, age и email не се използват като custom payload.
- [ ] Test ads/mock provider работят само в разрешени среди; production ranked endpoint отхвърля simulated grants.
- [ ] No-fill, preload failure, skip и return от ad имат cleanup без висящи listeners; не се изисква неизползван interstitial ID. Затварянето и reward условията са видими и проверени спрямо приложимите child/family ad изисквания.

- [ ] Точните SDK/mediation версии за child/unknown трафик са проверени срещу приложимите Families self-certified изисквания; privacy сигнали, възрастово подходящо съдържание и допустима closeability са изпитани. Provider не започва обработване преди изискуемите consent/родителски стъпки и не изисква optional analytics.

### Проверка и демонстрация

Real test ad на двете платформи плюс fake-provider сценарии за reward-before-dismiss, dismiss-before-late-reward, duplicate callback и init failure.

## [CPI-028](https://github.com/georgi-cole/crystal-path-infinity/issues/28) — SSV проверка и атомарен регистър на рекламните награди

**Етап:** M4 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-017, CPI-021, CPI-027

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Официално продължаване да се печели веднъж от истинска, обвързана с опита награда.

### Обхват

Reward intents, Google SSV callback verification и транзакционен ledger; SSV удостоверява ad reward, не самия gameplay.

### Критерии за приемане

- [ ] Intent е обвързан с account/run/death sequence/revive index, rulesetVersion, предварително обявената фиксирана restore SP стойност и nonce; произволна стойност от клиента не разрешава награда. Стойността се взема от изрично приетия CPI-001 ruleset, а не от все още нерешената препоръка 200 SP.
- [ ] Проверяват се signature/key, очакван ad unit, reward данни, timestamp и уникален transaction ID според официалния протокол.
- [ ] Една транзакция/смърт дава максимум един grant; записът на grant и увеличаването на `revivesGranted` са атомарни, с cap 10 на сървъра. Прилагането му е отделно идемпотентно възстановяване с `revivesApplied`; важи `0 ≤ revivesApplied ≤ revivesGranted ≤ 10`.
- [ ] Повторен, подменен, чужд или неправилно подписан callback не променя state; невалидният timestamp се различава от легитимно забавена награда, която остава възстановима. Ключовете се обновяват безопасно.
- [ ] Закъсняла валидна награда остава възстановима за същия опит; не се прехвърля към произволен нов run и не се губи при app kill.
- [ ] Има redacted audit events и recovery lookup; private данни/подписи/дълги callback URLs не се изсипват в клиентски logs.

### Проверка и демонстрация

Подписани тестови callback fixtures, replay/duplicate/concurrency/altered query, неправилен ad unit и ключова ротация. Тестът потвърждава една grant транзакция, не само HTTP 200.

## [CPI-029](https://github.com/georgi-cole/crystal-path-infinity/issues/29) — Revive state machine с максимум 10 успешни продължавания

**Етап:** M4 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-006, CPI-007, CPI-015, CPI-028

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Да реализираме точно заявения цикъл death → доброволна реклама → продължаване.

### Обхват

Един orchestrator за offer/loading/showing/pending/reviving/playing/final, използван от всички видове death.

### Критерии за приемане

- [ ] При `revivesGranted < 10` и без pending intent или вече предоставен grant за текущата смърт има избор Watch ad/End run; никоя реклама не стартира автоматично. Наличен grant предлага възстановяване, не втора реклама.
- [ ] Десетата потвърдена награда дава десето продължаване; следващият death е окончателен и няма 11-а реклама.
- [ ] Skip без спечелена награда, no-fill, load failure или непотвърден callback не изразходват лимита; UI не обещава потвърдена награда преди server grant.
- [ ] Restore следва приетия договор CPI-001: авторитетният snapshot при смъртта, позиция `lastClearedRow`, запазени текущи hints, mystery консумация и разкрития, изчистени ефекти. SP стойността е еднаква за всички 10 restores; препоръката е 200 SP и още чака решение от Georgi. Реализира се окончателно приетата стойност, показана преди рекламата и фиксирана в intent/ruleset. Няма rollback на ресурси; прилагането на grant и увеличаването на `revivesApplied` са атомарни.
- [ ] Таймерите/звукът са паузирани през ad/pending; input се включва след валиден restore, не преди затваряне на fullscreen ad.
- [ ] Restart на същия run запазва `revivesGranted`, `revivesApplied`, `revivesToReachScore` и статуса на pending grant; само нов run започва с нулеви броячи. Няма специален finish на 350; същият death/restore договор важи на всеки ред и при дълъг опит.

### Проверка и демонстрация

Детерминистичен walkthrough с окончателно приетата фиксирана SP стойност от първата смърт през всичките 10 grants до окончателния край; wrong, mystery и drain death, no-fill между награди, 350→351 и restore без нов ред, който не влошава стария score tie.

## [CPI-030](https://github.com/georgi-cole/crystal-path-infinity/issues/30) — Възстановяване и конкурентни ad сценарии от край до край

**Етап:** M4 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-022, CPI-029

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Реално спечелена награда да не се губи, а прекъсванията да не създават безплатни животи.

### Обхват

Интеграционна матрица mobile SDK ↔ intent/SSV ↔ run recovery ↔ leaderboard finalization.

### Критерии за приемане

- [ ] App kill по време на ad или след reward се възстановява от сървъра; няма reset или двойна награда.
- [ ] Забавено SSV има ограничено чакане с ясно save/retry/resume действие, не безкраен spinner и не фалшиво verified продължаване.
- [ ] При висящ intent оригиналният опит остава възстановим и непубликуван; save/new run не се представят като окончателно приключване. Късна валидна награда остава за същия незавършен опит и не се изхвърля.
- [ ] Едва след окончателния край на опита и разрешаването на всички рекламни проверки се публикува един неизменен финален резултат. Pending опит няма публична projection; retry или късен callback не отварят финализиран резултат и не създават втори leaderboard ред.
- [ ] Две устройства, duplicate callbacks, закъснял privacy change и network retry не надвишават една награда за death или общо 10.
- [ ] Потребителят може да започне нов нормален опит при липсваща реклама; no-fill не се представя като негово нарушение.

### Проверка и демонстрация

Устройствен recording и автоматизиран server test за всяка опасна граница: преди show, след earned, преди close, преди SSV, след grant преди response, след запазване на pending опит и след окончателно приключване на разрешен опит. Повторение в дълъг run отвъд 350 проверява запазения генератор/mystery cursor и фиксирания reward SP.

## [CPI-031](https://github.com/georgi-cole/crystal-path-infinity/issues/31) — Изтриване и експорт на акаунт с in-app и web път

**Етап:** M5 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-017, CPI-018, CPI-019, CPI-023

### Цел

Потребителят да може да упражни контрол над профила и публичните си резултати.

### Обхват

Settings flow за account deletion/export, външен web request route и documented retention/cleanup.

### Критерии за приемане

- [ ] Delete account е откриваемо в приложението и има действителен web resource за заявка; не е само деактивация или неработещ mailto.
- [ ] Изисква се подходяща повторна автентикация/потвърждение; чужд user ID не позволява изтриване.
- [ ] Профилът, частните `analyticsAgeBand`/`ageResponseAt`, отделният privacyContext, приложимите родителски/consent записи, сесиите и leaderboard projections се премахват/обработват според описаната retention политика; кешовете се инвалидизират. Няма raw age архив.
- [ ] Минималните законово/технически оправдани записи, ако се запазват, са описани с цел и срок; не остава скрит публичен рекорд. Оттегляне на optional analytics и приложимият privacy/родителски път са достъпни без принудително създаване на акаунт за guest practice.
- [ ] Експортът съдържа само данните на заявителя и не разкрива server secrets, чужди users или бъдещи маршрути.
- [ ] Pending runs/reward intents имат определено terminal handling при изтриване; app показва реалния статус и не възстановява автоматично изтрития профил.

### Проверка и демонстрация

End-to-end deletion на staging account с run/reward/leaderboard данни, проверка от втори акаунт и web route; повторна заявка е безопасна. Сверка с текущите Apple/Google изисквания преди submission.

## [CPI-032](https://github.com/georgi-cole/crystal-path-infinity/issues/32) — Минимална диагностика, gameplay метрики и контрол на разходите

**Етап:** M5 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-017, CPI-022, CPI-026, CPI-029, CPI-031

### Цел

Да разбираме стабилността, безкрайната прогресия, стойността на продължаванията и разходите чрез минимални допустими данни.

### Обхват

Crash/error telemetry, минимални gameplay/ad events, отделна доброволна възрастова аналитика, privacy разделение и инфраструктурни метрики за дълги опити.

### Критерии за приемане

- [ ] Има event dictionary с цел, полета и retention; не се събират точна локация, точни години, age в gameplay events, email, OTP или свободен личен текст. Частните `analyticsAgeBand`/`ageResponseAt` са отделни от gameplay payload-ите и public данните.
- [ ] Optional analytics следва приложимия privacyContext/consent и избора на потребителя. Пропускане на възраст, отказ, withdrawal или analytics outage не блокират основната игра; child/unknown защитите не се заобикалят.
- [ ] Възрастовата аналитика използва само допустимо предоставени групи и описани частни агрегати; без отговор няма измислена група. Отчетът различава извадката с доброволни данни от всички играчи и не превръща групата в достъп до игра/реклами.
- [ ] Измерват се run starts/finalizations, lastClearedRow distribution без таван 350, активна продължителност, ad time спрямо play time, `revivesGranted`/`revivesApplied`/`revivesToReachScore`, no-fill/skip/error и verification latency.
- [ ] Crash и server logs са redacted; account deletion и analytics withdrawal обработват свързаните данни според CPI-031. Няма чувствителни години или privacy context в публични diagnostics.
- [ ] Оперативният отчет показва заявки на действие/активна минута, latency, runtime, checkpoint размер, растеж/retention на action history и storage/cost аларми при дълги опити с договорени прагове.
- [ ] Частните SP playtest варианти имат отделни ruleset версии и отчетени настройки; резултатите не се смесват в публични rankings или в един балансен отчет без означение.

### Проверка и демонстрация

Проверка на реалните event payload-и, skip/withdrawal/deletion и симулирани errors. Разчетът използва измерени действия, активна игра, ad време и storage, не предполагаем ad revenue или чистата SP аритметика като заместител на playtest.

## [CPI-033](https://github.com/georgi-cole/crystal-path-infinity/issues/33) — Регресии на правилата и adversarial API проверки

**Етап:** M5 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-004, CPI-021, CPI-022, CPI-023, CPI-025, CPI-028, CPI-029, CPI-031

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Да докажем, че основните конкурентни резултати не зависят от честен клиент.

### Обхват

Focused regression suite върху core, auth/RLS, ordered inputs, reward ledger, rankings и deletion.

### Критерии за приемане

- [ ] Покрити са damage boundaries, всички death paths, преживяна/фатална стъпка на 350 и продължаване към 351, max SP 400, 10-revive cap и ruleset isolation; няма standalone final row.
- [ ] Forged score/SP/hints/time/revive и чужд run/account се отхвърлят без странични записи.
- [ ] Replay, concurrent requests, out-of-order actions и duplicate SSV не дават допълнителен progress/reward.
- [ ] Public payloads не издават future answers, secrets, analyticsAgeBand, privacyContext или email; private permissions се тестват с различни роли. Raw age не остава в storage/logs; analytics skip не блокира practice и не отслабва child/unknown защитите.
- [ ] Best-per-player, regional snapshots, bans/deletes и late-grant recovery на непубликуван pending опит остават съгласувани; финализираният резултат е неизменен. При revive без нов ред се запазват `revivesToReachScore` и `achievedAt` на постигнатия резултат.
- [ ] Проверени са generator batch-equivalence, mystery cadence и recovery отвъд 350, bounded row/resolved/checkpoint state и точни score/sequence стойности около 32-bit и JavaScript safe-integer граници чрез избрания lossless формат. Няма wrap, float rounding, reroll или прогрес от бездействие.
- [ ] Suite има assertions върху състоянието и транзакциите, не само успешен HTTP status или implementation snapshots.

### Проверка и демонстрация

CI report с възпроизводими fixtures и тестови accounts. Ограниченията, например bot automation, се описват честно; не се обещава абсолютна защита.

## [CPI-034](https://github.com/georgi-cole/crystal-path-infinity/issues/34) — Реални устройства: дълги опити, 10 реклами и performance

**Етап:** M5 · **Приоритет:** P0 · **Размер:** L · **Зависимости:** CPI-008, CPI-010, CPI-012, CPI-014, CPI-016, CPI-024, CPI-030, CPI-033

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Да проверим цялото безкрайно преживяване и баланса при реални мобилни условия.

### Обхват

Android/iOS device matrix, слаб Android, тесен екран, системни прекъсвания, дълги runs и частни playtests на изрично избрани revive SP варианти.

### Критерии за приемане

- [ ] Опит преминава 350→351 и продължава; long-soak сценарии с изрично записани редове/активна продължителност и опит с 10 rewarded revives преминават без crash, загубен checkpoint, спрели mysteries или дублирана награда.
- [ ] Документирана частна тестова серия сравнява предварително избрани revive SP варианти с една основна променлива. Проучването CPI-001 предлага фиксирани 200 срещу намаляване с 20 до минимум 120 като кандидати, без да ги приема за production правило; 300 остава възможна сравнителна основа. Всеки изпълнен вариант има отделен ruleset, реални тестове и ясно обозначена извадка, без смесване с публичните класации.
- [ ] Балансният отчет съдържа distance distribution, active play time, ad time/play time, `revivesToReachScore`, стойност на продължаванията и no-fill; описва извадката и ограниченията. Чистите SP бюджети не се представят като очаквана дистанция или измерен playtest резултат.
- [ ] Измерени са memory, frame pacing, startup, network latency, runtime и storage/cost спрямо CPI-002 при нарастваща дължина. Row/resolved buffers и active checkpoint остават ограничени; няма растящи timers/DOM/audio leaks след retry/resume.
- [ ] Input/HUD, големи progress числа и ad return са проверени при safe areas, системни bars, lock/unlock, phone interruption, слаб сигнал и recovery през generator batch граница.
- [ ] VoiceOver/TalkBack, по-голям текст и reduced motion остават използваеми; child/unknown privacy и приложимите ad closeability потоци са включени в действителната device матрица.
- [ ] Всеки блокиращ дефект е поправен и повторно проверен; резултатите сочат точен build/ruleset, устройство и реални настройки. Тази проверка подготвя beta review в CPI-038 и не зависи от бъдещите пакети CPI-035.

### Проверка и демонстрация

Матрица с реално изпълнени сценарии, измерени дълги сесии и кратки recordings. Synthetic fast-forward, emulator/browser, механична SP аритметика и физически playtest доказателства са ясно разграничени; не се отчитат неизпълнени тестове.

## [CPI-035](https://github.com/georgi-cole/crystal-path-infinity/issues/35) — Подписани Android и iOS beta пакети

**Етап:** M5 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-004, CPI-026, CPI-030, CPI-031, CPI-032, CPI-034

### Цел

Тестерите да инсталират точно определена версия по нормален мобилен канал.

### Обхват

Android internal/closed testing и iOS TestFlight с отделни app записи, signing и release configuration.

### Критерии за приемане

- [ ] Bundle/application IDs са на новия продукт; не презаписват The Big Eye store listing или installed app.
- [ ] Signing keys/certificates са в подходящ secret store; build logs и artifacts не съдържат private ключове.
- [ ] Beta build използва правилните среди и допустими test ad настройки; няма dev reward bypass към ranked.
- [ ] Version/build numbers са уникални, source commit е записан и crash symbol/mapping uploads са налични според платформата.
- [ ] Акаунт-специфичните Play testing prerequisites са проверени; upload не се представя като production approval.

### Проверка и демонстрация

Инсталация през beta канала на външно тестово устройство, login/run/ad/recovery smoke. Платени регистрации или нови договори се обработват отделно от подготовката.

## [CPI-036](https://github.com/georgi-cole/crystal-path-infinity/issues/36) — Store пакет: screenshots, описание, възрастова оценка и privacy форми

**Етап:** M5 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-011, CPI-012, CPI-016, CPI-024, CPI-025, CPI-031, CPI-034

### Цел

Store представянето да описва реалната версия и действителната обработка на данни.

### Обхват

App icon/screenshots, BG/EN store copy, support/privacy/deletion URLs, age rating, Google Data Safety и Apple disclosures.

### Критерии за приемане

- [ ] Screenshots са от работещ build и показват мост, SP, класации и rewarded choice без непостигнати функции.
- [ ] Описанието показва реално проверения безкраен маршрут без финален ред и доброволни рекламни продължавания до 10 на опит, когато има допустима налична реклама. Не обещава безкраен живот или гарантирана ad наличност.
- [ ] Всички възрасти са отразени честно в target audience и приложимите Families/детски store изисквания; съдържателната age rating се определя по действителния build. Privacy forms покриват доброволната възрастова аналитика, отделния privacyContext, приложимите родителски/consent потоци и точните SDK/mediation версии, включително изискуемата self-certification.
- [ ] Support/privacy/deletion страниците са достъпни и за новата игра; старите location/Big Eye декларации не се копират.
- [ ] Reviewer instructions позволяват проверка на account, ranked и ads flow без лични production credentials.

### Проверка и демонстрация

Сверка между подписания binary, SDK inventory, network behavior и privacy декларациите; визуален преглед на store exports в изискваните формати.

## [CPI-037](https://github.com/georgi-cole/crystal-path-infinity/issues/37) — Поддръжка, оперативни аларми и контрол при проблем

**Етап:** M5 · **Приоритет:** P1 · **Размер:** M · **Зависимости:** CPI-025, CPI-031, CPI-032, CPI-035

### Цел

След пускане да можем да реагираме на повредена класация, backend outage или проблем с рекламите.

### Обхват

Support route, runbook, monitoring, ranked/ad controls и rollback/compatibility процедура.

### Критерии за приемане

- [ ] Определени са публичен support контакт и частен security/report маршрут без непотвърдени адреси.
- [ ] Алармите имат собственик и прагове за error/SSV delay/latency/cost; има процедура за първа реакция.
- [ ] Server control може да спре нови ranked/ad starts, без да нулира потвърдени резултати или да губи вече спечелени награди.
- [ ] Минимално поддържана client/ruleset версия, maintenance message и recovery са определени; несъвместими резултати не се смесват.
- [ ] Документирани са backup restore, migration rollback/forward fix и ограничението, че store binary rollback не е мигновен.

### Проверка и демонстрация

Staging упражнение с backend outage, SSV закъснение и погрешен ruleset deployment. Проверка за ясно съобщение и запазени earned rewards.

## [CPI-038](https://github.com/georgi-cole/crystal-path-infinity/issues/38) — Release readiness и контролирано публично пускане

**Етап:** M5 · **Приоритет:** P0 · **Размер:** M · **Зависимости:** CPI-035, CPI-036, CPI-037

**Договор CPI-001:** задачата следва [приетата продуктова посока](decisions/CPI-001-product-contract.md). Безкрайният standalone режим, всички възрасти и аналитичната цел на възрастовите данни са приети. Доброволният отговор и analytics групата са техническата препоръка; размерът/графикът на revive SP остава за обсъждане, без приета фиксирана или намаляваща конфигурация. Критериите по-долу не са отчетени като изпълнени.

### Цел

Първата публична версия да излезе с доказани основни функции и управляем риск.

### Обхват

Финален review на критерии, beta feedback, account prerequisites, production конфигурация и rollout план.

### Критерии за приемане

- [ ] Всички P0 са приети, включително окончателно решение за фиксираната revive SP стойност; няма blocker-и за endless progression, death, 10-revive cap, lossless score validation, account deletion, child/unknown privacy потоци или native stability.
- [ ] Beta feedback и performance/latency/SSV данните са прегледани; критерии за продължаване/спиране на rollout са числово фиксирани. Endless balance gate използва CPI-032/CPI-034 и beta данните за дистанция, активна продължителност, ad time/play time, `revivesToReachScore`, реални SP варианти в отделни private rulesets и дългосрочни runtime/storage/cost. Няма стар gate за таван 350 или неизпълнени тестове, обявени за доказателство.
- [ ] Production endpoints, ad app/units, signing, privacy URLs, all-ages audience settings, приложими родителски/consent потоци и точни Families SDK версии/closeability са проверени по подписания build; optional analytics не е условие за основната игра.
- [ ] Submission, staged rollout и monitoring имат собственик и график; публично publishing не е страничен ефект от planning пакета.
- [ ] Първият operational review проверява distance/session distribution без финален ред, ad time/play time и no-fill по региони, revives и разходи. Промени в щетите, idle правилата или restore SP изискват отделно измерено решение и ruleset; не се активират автоматично.

### Проверка и демонстрация

Go/no-go запис с build IDs, изпълнени тестове и ограничения. Изпращането към магазините е отделна изрично започната release работа, когато пакетът е готов.
