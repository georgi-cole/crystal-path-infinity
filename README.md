# Crystal Path: Infinity — Mobile

Самостоятелна игра за Android и iOS, извлечена от Crystal Path: Infinity в The Big Eye.

**CPI-003 добавя самостоятелната [основа на мобилното приложение](apps/mobile/README.md): React/TypeScript/Capacitor, минимален екран и отделни development/staging/production идентичности.** [Резултатите и обхватът](docs/decisions/CPI-003-app-foundation.md) разграничават web, native build и реално отваряне. CPI-002 остава отворен за [проверките на физически устройства, реклами и backend](docs/spikes/CPI-002-results.md); Georgi изрично разреши продължаването след merge на PR #40. Georgi прие основните игрови правила, класациите и регионалните записи: самостоятелната игра е действително безкрайна, достъпна за всички възрасти, а възрастовите данни служат за аналитика. Приетото рекламно възстановяване е **200 SP за успешни продължавания 1–5 и 150 SP за 6–10**. Балансът ще се прегледа след playtesting. Gameplay и завършеното мобилно приложение предстоят.

[38 задачи в GitHub](https://github.com/georgi-cole/crystal-path-infinity/issues) са създадени с критерии за приемане, приоритети, области и зависимости. [CPI-001](https://github.com/georgi-cole/crystal-path-infinity/issues/1) съдържа [съгласувания договор за правила, профил и класации](docs/decisions/CPI-001-product-contract.md). [CPI-004 / PR #42](https://github.com/georgi-cole/crystal-path-infinity/pull/42) и [CPI-005 / PR #43](https://github.com/georgi-cole/crystal-path-infinity/pull/43) са слети с успешни required checks. [CPI-006](https://github.com/georgi-cole/crystal-path-infinity/issues/6) добавя собственост върху текущия опит и callbacks, както и приемателната матрица за смърт/прогрес през 349/350/351. Остават проверките в [CPI-002](https://github.com/georgi-cole/crystal-path-infinity/issues/2). Задачите за детски профили, аналитика и реклами уточняват конкретната реализация, без ново одобрение на възрастов обхват. Текущият статус на задачите и PR се поддържа в GitHub. Проверените административни настройки са описани в [статуса на хранилището](docs/REPOSITORY_SETUP.md).

## Стартиране на приложението

CPI-005 добавя [чистото игрово ядро](packages/game-core/README.md) като отделен TypeScript workspace: безкраен маршрут с ограничен буфер, сериализируеми преходи и приетите SP/mystery/revive правила. То още не е свързано с играемия мобилен интерфейс. [Решенията за timing, RNG и точни индекси](docs/decisions/CPI-005-game-core.md) разграничават запазените правила от standalone промените; root `typecheck`, `lint` и `test` включват и ядрото.

[CPI-006](docs/decisions/CPI-006-death-progress.md) добавя `createRunSession`: входовете се обвързват с показания ред/живот и се изпълняват върху актуалния state. Повторен или остарял callback не добавя действие; cleanup запазва checkpoint без неявен край.

[CPI-007](docs/decisions/CPI-007-clock-lifecycle.md) добавя един активен часовник, независими pause leases и native foreground clock с идентичност на текущите page/bridge. Мобилният runtime изчаква потвърден native sample преди tick/input, прекратява callbacks и playback при cleanup и не начислява време от OS suspend. Native CI включва прекъсвания преди първия JavaScript и пресъздаване на process/WebView. Играемият renderer и реалните React/audio връзки предстоят в CPI-008.

Node **22.23.4** е фиксиран в `.nvmrc` и CI. От корена на хранилището:

```bash
npm ci --ignore-scripts
npm run dev
```

Отвори `http://127.0.0.1:5174`. Не са необходими backend, акаунт или ключове. `npm run build`, `npm run build:staging` и `npm run build:production` създават съответната web версия. Native generation, toolchain и артефактите са описани в [инструкциите на приложението](apps/mobile/README.md). Изолираният [CPI-002 Mobile Lab](spikes/mobile/README.md) запазва собствени зависимости и команди.

## Първа версия

- Безкраен кристален мост, Stability Points, подсказки, mystery плочки и съществуващата визуална атмосфера. Няма финал, победа или скрит край на ред 350; съдържанието продължава да се генерира.
- Начало с 300 SP и единен максимум 400 SP. При успешно продължаване SP се задават на 200 за номера 1–5 и на 150 за 6–10; не се прибавят към старите SP.
- Един човек играе собствен опит; асинхронно съревнование с реални хора чрез Top 100 за света, континент и държава.
- Игра за всички възрасти; practice без акаунт или задължителен отговор за възраст. Профил с потребителско име и избрана държава за регионалните класации.
- Доброволно въвеждане на години за аналитика, с препоръчано съхранение като частна възрастова група и дата на отговора. Няма публична възраст, дата на раждане или използване на демографския отговор за рекламно таргетиране.
- До 10 успешно спечелени рекламни продължавания за един опит. Десетата награда продължава играта; следващата смърт е окончателна.
- React, TypeScript и Capacitor; самостоятелен backend за профили, проверени опити, класации и рекламни награди.

## Документи

| Документ | Съдържание |
| --- | --- |
| [Продуктов план](docs/PRODUCT_PLAN.md) | Приет обхват, безкраен прогрес и възстановяване 200/150 SP |
| [CPI-001 — продуктов договор](docs/decisions/CPI-001-product-contract.md) | Точни правила, приемателни сценарии и статус на решенията |
| [CPI-002 — Mobile Lab](spikes/mobile/README.md) | Стартиране, тестови реклами, native build и ограничения |
| [CPI-002 — резултати](docs/spikes/CPI-002-results.md) | Измервания, SDK audit, device gates и go/no-go |
| [CPI-003 — приложение](apps/mobile/README.md) | Инсталация, команди, среди и native generation |
| [CPI-003 — решения и резултати](docs/decisions/CPI-003-app-foundation.md) | Самостоятелна идентичност и проверими build/launch доказателства |
| [CPI-004 — quality gates](docs/decisions/CPI-004-quality-gates.md) | Lint/format, задължителни проверки и native lifecycle диагностика |
| [CPI-005 — игрово ядро](docs/decisions/CPI-005-game-core.md) | Pure transitions, точен endless прогрес, RNG/checkpoint и ефекти/продължавания |
| [CPI-006 — смърт и прогрес](docs/decisions/CPI-006-death-progress.md) | Callback ownership, еднократни действия, cleanup/recovery и граници 349/350/351 |
| [CPI-007 — часовник и lifecycle](docs/decisions/CPI-007-clock-lifecycle.md) | Активно време, независими паузи, native foreground snapshots и ранни OS прекъсвания |
| [Инспекция](docs/SOURCE_AUDIT.md) | Установено поведение, зависимости и проблеми |
| [Backlog](docs/BACKLOG.md) | Задачи с зависимости и критерии |
| [Архитектура](docs/ARCHITECTURE.md) | Клиент, сървър, профили и класации |
| [Рекламни продължавания](docs/REWARDED_REVIVES.md) | Правило 10, SSV и възстановяване |
| [Екрани](docs/SCREEN_PLAN.md) | Splash, меню, игра, профил и класации |
| [Настройки и пускане](docs/REPOSITORY_SETUP.md) | GitHub, външни услуги и release gates |
| [Ресурси](planning/reuse-manifest.json) | Точни пътища и изходен commit |
| [GitHub задачи](planning/github-issues.json) | Проверена връзка между CPI ID и реалните GitHub номера |
| [Източници](docs/SOURCES.md) | Код и официална документация |

## Проверка на пакета

Python 3.11+ е достатъчен; не се инсталират зависимости на играта.

```bash
python3 scripts/validate_plan.py
python3 scripts/bootstrap_github.py
```

Втората команда по подразбиране показва планираните GitHub операции без изпълнение. Реално създаване: `--apply` след автентикация с GitHub CLI. Прочети документа за настройките.

## Произход

Източник: `georgi-cole/bbmobilenew-source`, commit `6ace929a60410e728928aa51eaf80ba9b5cf2262`, инспекция 1 ноември 2026 г. Infinity (`crystal_path_shattered`) е различна от The Crystal Path (`glass_bridge_brutal`). Запазваме proprietary правата на Georgi Kolev. Правата за всеки отделен ресурс се проверяват при копиране.

Ред 350 остава историческо поведение на инспектираната Big Eye версия. Самостоятелният endless договор не променя старото хранилище.
