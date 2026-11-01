# Работа по задачите

Един branch и PR за конкретна CPI задача с проверими критерии. В началото на PR посочваме CPI ID и issue връзка; описваме проблема, промененото поведение и покритите приемателни критерии.

- Записваме изпълнените команди, резултатите, проверената ревизия и оставащите ограничения.
- Не променяме bbmobilenew-source като страничен ефект.
- Правилата имат версия; несъвместими резултати не се смесват.
- Mock реклами и произволни клиентски scores не са официални награди/рекорди.
- Тайни, signing материали, service-role ключове и лични данни не влизат в git.

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

`npm run format` е изрично локално редактиране; CI използва само `format:check`. Новите тестове проверяват реални правила или поведение. Когато се добавят gameplay ядро и API, техните тестове се включват в test командата; празна suite или фиктивен успешен тест не покрива липсваща реализация. Native generation, нужните инструменти и launch evidence са описани в [app инструкциите](apps/mobile/README.md).

## Проверки на PR и разход за native изпълнение

Устойчивите имена за required checks са **Planning manifest and bootstrap** и **App required checks**. App required checks изисква успешен **App quality**: typecheck, lint, format:check, действителните application тестове, проверките на CI маршрутизирането и трите web среди. Planning проверката валидира manifest-а и bootstrap защитите. Те се стартират за всеки PR; няма workflow-level path filter, който да оставя изискуема проверка в pending.

Промени само в разпознатата документация, планиране, issue/PR шаблони или качествени конфигурации пропускат скъпите native jobs. App quality записва причината в job summary; това е изрично пропускане, а не отчетен native pass. Промени в приложението, root dependencies/toolchain, app workflow или непознати пътища изискват реалните **Development Android build and emulator launch** и **Development iOS build and simulator launch**. Изтрити/преместени файлове участват в сравнението. Неизвестен event или недостъпно сравнение изисква native проверка; manual dispatch проверява и двете платформи.

Агрегираният App required checks се изпълнява и след грешка. Той отхвърля неуспешен App quality, липсващо решение за native обхвата и неочаквано пропуснат/неуспешен native job. Native builds остават development debug/unsigned Simulator; CI не използва production credentials или платено подписване. Required-check настройките и реалната демонстрация с първо неуспешен, после поправен PR се документират отделно след проверка в GitHub.

Done означава изпълнени критерии и демо или възпроизводима проверка. Emulator/Simulator резултатите не заместват проверки на физически устройства, реклами или backend. За всяко native доказателство записваме конкретния build, реалния launch резултат и проверения screenshot.
