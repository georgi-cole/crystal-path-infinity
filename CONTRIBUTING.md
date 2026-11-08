# Работа по задачите

Един branch и PR за конкретна CPI задача с проверими критерии. В началото на PR посочваме CPI ID и issue връзка; описваме проблема, промененото поведение и покритите приемателни критерии.

- Записваме изпълнените команди, резултатите, проверената ревизия и оставащите ограничения.
- Не променяме bbmobilenew-source като страничен ефект.
- Правилата имат версия; несъвместими резултати не се смесват.
- Mock реклами и произволни клиентски scores не са официални награди/рекорди.
- Тайни, signing материали, service-role ключове и лични данни не влизат в git.

## Документация преди мърдж в main

Всяка промяна към `main` включва актуализация на засегнатата документация в същия PR. При промени в правила, mystery ефекти, магазин, реклами или продължавания актуализираме [текущите правила](docs/CURRENT_GAME_RULES.md), подробния договор и при нужда [бизнес плана](docs/BUSINESS_PLAN.md). PR изброява обновените документи или конкретно обяснява защо няма засегната документация.

Историческите решения и измервания запазват датата и версията си; отбелязваме коя текуща версия ги замества. Тестовата конфигурация не се представя като внедрена сървърна промяна. Препоръки и целеви показатели се обозначават като предложения, докато не бъдат приети и реализирани.

## Локални проверки

Командите се изпълняват от корена с документираната Node версия и root lockfile:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run build:staging
npm run build:production
npm run planning:check
node --test .github/scripts/app-checks.test.mjs
```

`npm run format` е изрично локално редактиране; CI използва само `format:check`. Root `typecheck` и `test` изпълняват mobile и `packages/game-core`; lint/format също включват новото ядро. Новите тестове проверяват реални правила или поведение. Бъдещите API тестове ще се включат при реализацията; празна suite или фиктивен успешен тест не покрива липсваща функция. Native generation, нужните инструменти и launch evidence са описани в [app инструкциите](apps/mobile/README.md).

Ядрото е чисто и не получава системен clock, browser/native или store зависимости. Source baseline fixtures сочат фиксиран commit; промяна в тях изисква изходно доказателство или изрична versioned промяна на standalone правилата. `RunState` съдържа тайния маршрут и RNG и не е ranked API response. Виж [CPI-005](docs/decisions/CPI-005-game-core.md).

## Проверки на PR и разход за native изпълнение

Устойчивите имена за required checks са **Planning manifest and bootstrap** и **App required checks**. App required checks изисква успешен **App quality**: typecheck, lint, format:check, действителните application тестове, проверките на CI маршрутизирането и трите web среди. Planning проверката валидира manifest-а и bootstrap защитите. Те се стартират за всеки PR; няма workflow-level path filter, който да оставя изискуема проверка в pending.

Промени само в разпознатата документация, планиране, issue/PR шаблони или качествени конфигурации пропускат скъпите native jobs. App quality записва причината в job summary; това е изрично пропускане, а не отчетен native pass. Промени в приложението, root dependencies/toolchain, app workflow или непознати пътища изискват реалните **Development Android build and emulator launch** и **Development iOS build and simulator launch**. Изтрити/преместени файлове участват в сравнението. Неизвестен event или недостъпно сравнение изисква native проверка; manual dispatch проверява и двете платформи.

Агрегираният App required checks се изпълнява и след грешка. Той отхвърля неуспешен App quality, липсващо решение за native обхвата и неочаквано пропуснат/неуспешен native job. Native builds остават development debug/unsigned Simulator; CI не използва production credentials или платено подписване. Required-check настройките и реалната демонстрация с първо неуспешен, после поправен PR се документират отделно след проверка в GitHub.

Done означава изпълнени критерии и демо или възпроизводима проверка. Emulator/Simulator резултатите не заместват проверки на физически устройства, реклами или backend. За всяко native доказателство записваме конкретния build, реалния launch резултат и проверения screenshot.
