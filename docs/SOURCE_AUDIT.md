# Инспекция на Crystal Path: Infinity

Дата: 1 ноември 2026 г. Източник: `georgi-cole/bbmobilenew-source`, commit `6ace929a60410e728928aa51eaf80ba9b5cf2262`.

**Статичен преглед на код, конфигурации, тестове и ресурси.** Не са изпълнявани native build, устройствен тест, реална реклама или съществуващата тестова suite. Констатациите за дефекти трябва да се възпроизведат при извличането.

## Установено поведение

Infinity е `crystal_path_shattered`, в `src/minigames/crystalPathShattered/`; оригиналният The Crystal Path е `glass_bridge_brutal`. Infinity използва React + DOM/CSS. Коментарът в компонента описва премахване на Pixi/WebGL и тежки филтри за стабилност.

| Елемент | Текущо поведение |
| --- | --- |
| Старт | 300 SP, 2 hints |
| Избор | Лява/дясна плочка с една скрита безопасна страна |
| Грешна плочка | -10 SP на редове 1–10, -15 на 11–25, -20 на 26+; ефектите могат да променят щетата |
| Напредък | Правилна и преживяна грешна стъпка придвижват с един ред |
| Mystery | Доброволен централен избор през 3–6 реда; първата е на видим ред 4–7; не придвижва |
| Изходи | 12 претеглени mystery резултата: лечение, hints, shield, regen, lucky, щети, fragility, drain, inversion |
| Ефекти | 5 секунди, максимум два активни |
| Hint | Показва safeSide до следващата стъпка или 3.5 секунди |
| Край | Смърт или скрита победа на ред 350; няма реално безкраен опит |
| RNG | Seed + mulberry32; клиентът разполага с всички 350 safeSide стойности |
| Rendering | 6 видими реда; константата VISIBLE_ROW_WINDOW=8 не управлява този slice |
| Класиране | Завършилите първи по finishedAtMs; другите по furthestRow, SP, survivalIndex |
| Други играчи | Локално симулирани AI опити и feed |
| Време | Registry има 160000 ms, но компонентът няма общ countdown и host не подава лимита. Реален 160-секунден край не е доказан |

`authoritative: true` означава локален избор на сезонен победител, не backend anti-cheat.

## Конкретни проблеми

1. Wrong branch на ред 350 не задава `finishedAtMs`, за разлика от safe branch: възможен застой след преживяна грешна последна стъпка.
2. Периодичният drain може да достигне 0 SP без `eliminated=true`; inputEnabled не проверява изрично този флаг.
3. Regen има таван 400 SP; директното лечение и някои wrong-tile heals нямат същия таван.
4. Date.now/React интервалите нямат договор за pause, реклама, background и restart.
5. Fatal wrong увеличава furthestRow след анимацията, а mystery death не го увеличава. За новата класация е нужен точен договор за „преминат“ и „смъртен“ ред.

Това са статични находки, не възпроизведени устройствено дефекти. CPI-006 ги проверява преди внедряване на revives.

## Преизползване и отделяне

Запазваме gameplay логиката, CSS моста/пукнатините, Infinity фона и избрани звуци. Отделяме Redux `gameSlice`, `applyMinigameWinner`, MinigameHost/CompleteWrapper, LOH/POS награди, AI roster/feed и VIP gating. Premium визията може да бъде стандартна за новата игра.

Прочетени тестове: `tests/crystalPathShattered.logic.test.ts`, `tests/crystalPathShattered.asyncFlow.test.tsx`, `tests/crystalPathShattered.styles.test.ts`, `tests/integration/minigame.crystalPathShattered.integration.test.ts`. Запазваме правилата и cleanup сценарии; подменяме season/host интеграцията.

AdMob bridge има полезни consent/fullscreen/cleanup механизми, но наградата е клиентски callback без SSV ledger. adsService зависи от season/VIP/social и има dev simulator. Supabase е анонимен install-bound backup/analytics без cross-device recovery. playerSafety по подразбиране е 18+, а ads/online са adult-only: това не е автоматично решение за новата аудитория. Старите native app IDs, permissions и privacy декларации не се копират.

Audio hook управлява четири SFX; BGM се стартира другаде и изисква нов собствен lifecycle.

Основни източници и точни ресурсни пътища: [SOURCES](SOURCES.md) и [reuse manifest](../planning/reuse-manifest.json).
