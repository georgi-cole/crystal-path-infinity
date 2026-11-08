# Mystery relics v6 · избор върху моста

Историческа версия v6. Новите тренировки използват [v7 със запознаване при първо откриване и дневник](MYSTERY-DISCOVERY-V7.md); записаните v6 опити запазват правилата си.

**Интерфейс · 8 ноември 2026 · за преглед.** Затвореният и отвореният изглед са вградени като 256×256 WebP копия с прозрачност. При появяване светлина за около 0,4 секунди минава по вече видимия силует и той се установява на място. На текущия ред действието е достъпно веднага. При намалено движение кутията се показва директно.


Статус: тестов баланс `infinity-v6-relics` в `codex/mystery-pacts`. Наследява категориите, периодите без повторение, 24-те резултата и death clock от [v5](MYSTERY-DIRECTOR-V5.md).

## Ритъм

- Нормална кутия през **случайни 5, 6 или 7 реда**, с еднакъв шанс за всяка дистанция. Първата също е на ред 5–7.
- Следващият ред се избира веднъж и се пази със състоянието. Подсказки, изчакване, размерът на буфера и зареждането на записа не го преизбират. Подмината кутия започва следващия интервал.
- Виолетовият разлом остава 50/50: 30 секунди без кутии или 30 секунди кутия през 3 реда. След изтичане започва нов нормален интервал 5–7 реда, без натрупани кутии.
- Приема се нова версия на правилата: запазените v1–v5 опити продължават със стария си ритъм и отделни рекорди. Официалният баланс остава v1. Новите тренировки и стаята на мистериите използват v6.

## Изборът

Кутията стои на текущия ред на моста. При отваряне затвореният асет прелива към отворения, след което се появяват два светещи символа с кратки оферти над него. Няма общ правоъгълен панел или затъмняващ фон. Мостът и основните показатели остават видими. Различните категории оцветяват сиянието и материала.

Всяка оферта показва наградата, цената и основния риск. Например Soul exchange показва „+1–2 hints / −25 SP / 35%: extra −15 SP“ и „65%: +40 SP / −1 hint / 35%: −30 SP“. Предупреждението за задължителна и потенциално фатална жертва остава видимо. Пълните вероятности, крайните стойности и договорът са в малък разгъваем блок „Условия“. Marketing има две основни оферти при повече от една подсказка; безплатното продължаване е малко действие под тях.

Едно натискане изпълнява избора. Tab/Enter работят; Escape затваря подробностите. Няма автоматично приемане. Първите 60 секунди замразяват текущите ефекти и death clock; след това се запазва прогресивното изтичане на SP за 10 секунди. Цената на Half Life се обновява според оставащите SP. Reduce motion показва директно отворения асет и спира появяването/сканирането.

Визуалната референция е малкият проектиран знак над намерена armor ability в Halo: Reach, описан и показан в [Armor Ability](https://halo.fandom.com/wiki/Armor_Ability). [Оригиналният наръчник](https://www.halopedia.org/images/2/2f/HR_Manual.pdf) дава контекста за способностите и тяхното използване в играта. Двете оферти над кутията са наша интерпретация за този мост.

## Асети и точни prompts

Използван е вграденият инструмент **image_gen**: една нова генерация и една редакция на генерирания затворен вариант. И двата са заявени с `transparent_background: true`. Прикаченият потребителски screenshot служи за референция към проблема в интерфейса; не е редактиран или използван като изходен асет.

Крайни файлове в проекта:

- `apps/mobile/public/mystery/relic-closed-v6.webp` — 512×512 RGBA, 157 192 bytes.
- `apps/mobile/public/mystery/relic-open-v6.webp` — 512×512 RGBA, 186 722 bytes.

Оригиналите са 1254×1254 PNG. Подготвени са за играта с преоразмеряване до 512×512 и WebP кодиране без загуба, със запазен alpha канал (0–255); общо около 344 KB. Двете състояния се зареждат при първата кутия, за да е готово отварянето. Текстът, символите и интеракциите остават достъпни елементи на интерфейса.

### Затворена кутия · generation

```text
Create a production-ready original game prop sprite, a CLOSED mystery relic chest, isolated on a fully transparent background. One single object only, no environment, no floor plane, no UI, no words, no text, no letters, no logos. A premium physically rendered compact cubic reliquary for a dark crystal bridge game: smoked obsidian glass panels, precisely bevelled brushed platinum edges, slender warm ivory-gold emissive seams, a restrained tiny diamond-shaped luminous crystal seal on the front. Looks tangible, cinematic, exquisite and mysterious, with realistic refracted glass and elegant material detail, not a wireframe or a drawn icon. Symmetrical front-facing three-quarter perspective: camera centered horizontally, slightly above the object so its top and both left/right faces are visible equally, orthographic lens. Chest lid shut. No handles, no legs, no padlock, no ornamental filigree. Minimal sophisticated science-fantasy design. Chest occupies roughly the central 70 percent of square canvas width and 65 percent height, centered slightly below middle, leave generous clear transparent room above for a future opening lid. Crisp clean alpha edges and soft internal glow, no opaque cast shadow or baked backdrop. Readable as a small in-world game object at 100 CSS pixels. Original design, do not copy any existing game prop.
```

### Отворена кутия · edit

Изходно изображение: избраният затворен вариант.

```text
Edit this original mystery relic chest into its OPEN state for a two-state game sprite. Preserve the exact existing chest design, materials, bevels, front crystal seal, camera, canvas dimensions, body position and body scale. Keep the lower chest body exactly in its current position. Lift the entire lid straight upward by about 18 percent of the canvas height, hovering horizontally above the chest, revealing an elegant hollow dark obsidian interior with a restrained soft ivory-gold light emerging from inside. The lower chest body must retain its front glass walls, not become a different pedestal. Lid is fully separated and floats above the opening; same perspective and symmetric camera as the original. No giant projection cone, no beams reaching outside the prop, no sparks, no floor, no UI, no text, no logos, no extra objects. Production-ready physically rendered game sprite with a fully transparent background and clean alpha edges. Leave all empty space transparent and keep the full object including lid inside the canvas.
```

## Проверки

Изходна ревизия: `477f253b8593c21b31a769ff482b55a9aafacb98`; промяната е върху същия тестов бранч.

- `npm run test --workspaces -- --maxWorkers=2`: **919 успешни теста** — mobile 500, game-core 264, server-core 155. Покриват реалните 24 резултата във v5/v6, строгия публичен формат, отделните рекорди и възстановяване на частично изтекъл clock. Новите проверки покриват всички дистанции 5–7, буфериране/подсказки/сериализиране без преизбиране, двата режима и завръщане към нормален ритъм. Старият фиксиран v5 ритъм също остава проверен.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: успешни. След последната CSS адаптация за малки телефони format е проверен отново.
- `npm run build`, `npm run build:staging`, `npm run build:production`: успешни за финалните източници. Двата WebP асета присъстват в output директорията. Остава съществуващото незадължително предупреждение за JavaScript пакет над 500 KB.
- `python scripts/validate_plan.py`: валиден план; `python -m unittest discover -s scripts -p 'test_*.py'`: 13 успешни проверки; `node --test .github/scripts/app-checks.test.mjs`: 15 успешни проверки. Използван е работещият Windows `python` вместо Store alias `python3`.
- Браузър: естествена оферта на Оракула на ред 5 върху моста; двата асета са заредени; няма хоризонтално излизане на 1600×900, 390×844 и 320×568 CSS viewport. На ниския телефон източникът и символите се свиват, за да има място за предупрежденията. Проверени са подробности при поискване и затваряне с Escape.
- Стаята на мистериите: Half Life 100 → 80 SP след минута + 5 секунди, обновена цена −40 SP и сделка до 40 SP / 7 подсказки; Marketing 100 → 120 SP / 1 подсказка; компактните две оферти и рисковете на Soul exchange. При Reduce motion отвореният асет е видим без анимация. След връщане главният опит остава на ред 5, 4 изчистени реда и 295 SP. Browser console няма грешки. Тестовата настройка за движение е възстановена, viewport override е изчистен и опитът е оставен паузиран.

За изпробване: **Нова тренировка → Пауза → Стая на мистериите**. Стаята започва с Half Life и спрян часовник. Текущите v5 записи продължават със стария интервал; за 5–7 реда трябва нова тренировка.

Native build, Emulator/Simulator и физически телефон не са проверявани за тази ревизия. Браузърната проверка не е native/device доказателство. Няма merge или публикуване на приложение.
