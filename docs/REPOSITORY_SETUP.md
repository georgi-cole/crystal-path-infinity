# GitHub настройки и подготовка за пускане

Този документ отделя провереното състояние от желаните настройки. Файл, workflow definition или dry-run не означава изпълнена GitHub операция или успешен CI. `.bootstrap-receipt.json` е отчет само за операции, извършени чрез bootstrap скрипта; промени през GitHub интеграцията или интерфейса се проверяват отделно.

## Прието решение за видимостта — 1 ноември 2026 г.

Georgi избра **Public по време на разработката**, за да използва безплатните стандартни GitHub-hosted runners. След приключване на разработката собственикът ще направи репото **Private**. Public е текущото желано състояние и не е неприключена настройка. `planning/backlog.json` записва `repository.private: false`; bootstrap проверява този изричен избор и не сменя автоматично видимостта на съществуващо репо.

Според [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), стандартните runners са безплатни за публични репота; larger runners се таксуват и там. Planning workflow използва `ubuntu-latest`; application CI в CPI-004 използва `ubuntu-24.04` и `macos-26`. При бъдещото преминаване към Private се преглеждат отново Actions квотата и поддръжката на branch rules според плана. [Съществуващите публични forks остават публични](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## История на началната подготовка

[Репото `georgi-cole/crystal-path-infinity`](https://github.com/georgi-cole/crystal-path-infinity) е създадено от собственика. Първоначалният пакет от **26 файла** е качен в `main` с [commit `235f3379`](https://github.com/georgi-cole/crystal-path-infinity/commit/235f3379c74ddd37bf7febec69ad28be23b75f35); Git blob хешовете на всички файлове са прочетени обратно и съвпадат с подготвения пакет. Създадени и проверени са **38 GitHub issues** със стабилни CPI ID и **14 използвани labels**. [Planning checks run #41311788955](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41311788955) е приключил успешно. Това е исторически запис за първоначалния planning bootstrap, не текущ брой файлове или доказателство за готова игра.

След потвърждението „done“ от собственика настройките са прочетени повторно при старта на CPI-001. Тогава `main` е бил на [commit `583c851c`](https://github.com/georgi-cole/crystal-path-infinity/commit/583c851cf1385d4038b4347e9bc9e2e1efcbc611) с [успешен CI #41312774366](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41312774366). Repo API потвърждава squash-only и изтриване на merged branches; ruleset API потвърждава активния **Protect main** с planning проверката.

Продуктовият договор [CPI-001](https://github.com/georgi-cole/crystal-path-infinity/issues/1) е съгласуван в [PR #39](https://github.com/georgi-cole/crystal-path-infinity/pull/39), включително 200 SP за успешни продължавания 1–5 и 150 SP за 6–10. Балансът се преглежда отново след playtesting.

## Проверено състояние след CPI-004 — 1 ноември 2026 г.

Georgi е слял [PR #42 / CPI-004](https://github.com/georgi-cole/crystal-path-infinity/pull/42) в [commit `1d013c48`](https://github.com/georgi-cole/crystal-path-infinity/commit/1d013c48fa8e8b3dea18dc857a9d39790df60b89) и възложи CPI-005. Самостоятелната app основа и quality gates вече съществуват; gameplay ядрото се извлича в CPI-005. Backend, физическите устройства, реалният ad/SSV поток, Families проверките и deployed backend частта на CPI-002 остават отворени.

[PR #42 / CPI-004](https://github.com/georgi-cole/crystal-path-infinity/pull/42) добавя application quality gates и проверява отказ при реален дефект. `App quality` включва typecheck, lint, format, application tests, три web builds и девет routing tests. Android/iOS build-and-launch jobs се избират за runtime промени. Винаги наличният aggregate `App required checks` проверява quality резултата и двата native резултата, когато те са избрани; не допуска неочаквано skipped изпълнение да прикрие провал.

Контролираната отрицателна демонстрация на [commit `5ffcdc13`](https://github.com/georgi-cole/crystal-path-infinity/commit/5ffcdc13ae3f7ef70d1dc72a589d67e2d5612912) въведе реална TypeScript грешка в app metadata. В [run #41335551139](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41335551139) **`App quality` и `App required checks` се провалиха**, а native jobs бяха пропуснати. Ревизия `a72a5cd2` възстанови правилния metadata тип. В [run #41336328215](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41336328215) quality и iOS проверките преминаха; Android checker отчете отделен Google Play Services crash като app failure. Неговата process attribution и изчакването на реален pause са коригирани без SDK patch или скриване на JavaScript изключения. Точната финална проверена ревизия и резултатите са в PR #42; първоначалният неуспешен run не се представя като native pass.

**И двата required checks са записани и прочетени обратно през API.** След първоначалния **Confirm access** собственикът завърши повторната проверка и записа настройката. Active ruleset `26312536` съдържа `Planning manifest and bootstrap` и `App required checks`, и двата от GitHub Actions (`15368`), със strict up-to-date policy и непроменени останали защити. Няма оставаща ръчна CPI-004 настройка. Финалните [Mobile app checks](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41338065917) и [Planning checks](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41338065901) са успешни на `28654fbc`; squash merge има същия tree. Подробностите са в [CPI-004 quality gates](decisions/CPI-004-quality-gates.md) и PR #42.

| Област | Проверено | Оставаща работа |
| --- | --- | --- |
| Видимост | **Public**, изрично избрано от собственика за разработката | Private е отложено до приключване на разработката |
| Основен branch | `main` | Няма оставаща промяна по името |
| Issues | Включени; 38 задачи са налични | Backlog-ът може да се използва веднага |
| Labels | Първоначалните 14; при CPI-001 е проверено и добавянето на `status:in-progress` | Оформянето на цветове/описания по manifest остава незадължителна организация |
| Неизползван label | `priority:P2` не е създаден | Не блокира backlog-а; добавя се при нужда или чрез bootstrap |
| Milestones | По issues няма зададени native GitHub milestones | Шестте фази са описани в manifest; да се проверят/създадат native milestones и да се присвоят на задачите |
| Wiki | Включено | Може да се изключи; не блокира работата, документацията е в git |
| Merge методи | Само squash; merge commit и rebase са изключени | Проверено, няма оставаща промяна |
| Изтриване на merged branches | Включено | Проверено, няма оставаща промяна |
| Auto-merge | Изключено | Съответства на плана |
| Actions permissions | Предходно ръчно потвърждение от собственика; workflow файловете изрично задават `contents: read` | Repo-level permissions и fork approval не са независимо прочетени; workflow декларацията не доказва repository настройката |
| App основа | CPI-003 е слята чрез PR #41 в `c6e6185d`; има самостоятелен shell и build/launch проверки | Gameplay и backend са бъдеща работа; отворената част на CPI-002 остава отделно |
| CI в CPI-004 | PR #42 е слят; всичките пет checks преминаха, включително трите Android cold starts и iOS background/resume; реалният отказ при дефект също е проверен | Бъдещите gameplay/API тестове се добавят при реализацията им |
| Защита на `main` | Активен [Protect main / 26312536](https://github.com/georgi-cole/crystal-path-infinity/settings/rules/26312536): PR, 0 approvals, resolved conversations, strict `Planning manifest and bootstrap` и `App required checks` от GitHub Actions (`15368`), без bypass/force push/delete | Няма оставаща CPI-004 промяна; двете изисквания са прочетени обратно през API |

Наличният GitHub connector позволява repo/ruleset прочитане и работа с branches/PR/issues, но не предоставя admin mutations за тези настройки, native milestones и оформяне на labels. Таблицата различава API-провереното от предходното ръчно потвърждение. Първоначалната Confirm access пречка вече е разрешена. Липсата на native milestones не прави backlog-а неизползваем.

## Желани настройки

| Настройка | Стойност |
| --- | --- |
| Owner / име | georgi-cole / crystal-path-infinity |
| Видимост | Public по време на разработката; Private след приключване, по действие на собственика |
| Основен branch | main |
| Лиценз | Proprietary, Georgi Kolev; не MIT |
| Issues | Включени; 38 задачи със стабилни CPI ID, присвоени към 6 native milestones, с labels |
| Wiki | Изключено; документацията е в git |
| Merge | Squash; изтриване на merged branch; без auto-merge |
| Actions | Минимални read-only permissions; без workflow approval на PR |
| Начален planning CI | `Planning manifest and bootstrap`: manifest, bootstrap tests и dry-run |
| Application CI | `App quality` плюс native jobs според runtime diff; винаги наличен aggregate `App required checks`. Gameplay/API тестове се добавят с реализацията на тези функции |
| Main защита | Съществуващият Active ruleset изисква PR, двата planning/app checks, resolved conversations и забраните; записът и readback са приключени |

[Branch rulesets са налични за Public репота и с GitHub Free](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository). Поддръжката им за Private зависи от GitHub плана. При собственик без втори reviewer задаваме 0 required approvals, като запазваме задължителния PR и успешния CI. CODEOWNERS указва кой преглежда, но сам по себе си не е защита.

## Справочник за трите ръчни секции

Следните стойности са справочник за конфигурацията. Вече потвърдените настройки не трябва да се въвеждат повторно. Добавянето на `App required checks` към съществуващия ruleset е завършено; действителният статус е в таблицата по-горе.

### 1. Settings → General → Pull Requests

| Опция | Стойност |
| --- | --- |
| Allow squash merging | Включено |
| Allow merge commits | Изключено |
| Allow rebase merging | Изключено |
| Automatically delete head branches | Включено |
| Allow auto-merge | Изключено засега |

Така всеки завършен PR се влива като един commit, а приключилите работни branches се почистват. В Features запазваме Issues включени; Wiki може да се изключи, защото документацията е в `docs/`. Видимостта остава Public, а default branch остава `main`.

Документация: [squash merge](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests), [изтриване на head branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches).

### 2. Settings → Actions → General

В **Workflow permissions**:

- Избира се **Read repository contents and packages permissions**.
- **Allow GitHub Actions to create and approve pull requests** остава изключено.
- Натиска се Save за секцията.

В **Approval for running fork pull request workflows from contributors** се избира **Require approval for all external contributors** и се записва. Това се отнася до външни fork PR-и, а не до нормалните ни branches в репото.

Workflow файловете изрично задават `contents: read`. Repository настройките по-горе имат предходно потвърждение от собственика, но не и независимо API readback. GitHub connector-ът е отделен от `GITHUB_TOKEN` на workflow-а; тази отметка не управлява възможността да създаваме PR-и през интеграцията.

Документация: [GitHub Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

### 3. Settings → Rules / Rulesets → Protect main

Редактира се съществуващият **Protect main**, ID `26312536`; не се създава втори ruleset. Enforcement остава **Active**, target е default branch (`main`), а bypass list остава празен.

| Правило | Стойност |
| --- | --- |
| Require a pull request before merging | Включено |
| Required approvals | **0** за текущата работа без втори независим reviewer |
| Require conversation resolution before merging | Включено |
| Require status checks to pass before merging | Включено |
| Съществуващ required check | **Planning manifest and bootstrap**, source GitHub Actions (`15368`) |
| Допълнителен required check в CPI-004 | **App required checks**, source GitHub Actions (`15368`); записан и API-проверен |
| Require branches to be up to date before merging | Включено |
| Block force pushes | Включено |
| Restrict deletions | Включено |

В списъка се запазва реалният job **Planning manifest and bootstrap**. **Planning checks** е името на целия workflow. Новият required контекст е aggregate job **App required checks**, който обобщава `App quality` и избраните native jobs. Не се изискват директно native job имената, защото при обоснована documentation-only промяна те могат да бъдат skipped. Required approvals = 0 запазва PR и CI изискванията, без да изисква одобрение от втори GitHub потребител. Не се включват code-owner approval, approval на последния push или Restrict updates; bypass list остава празен.

При първия **Save** GitHub поиска **Confirm access**. Собственикът завърши тази проверка; следващият ruleset API readback потвърди и двата required контекста, правилния GitHub Actions източник и непроменените останали защити. Работата продължава през branch → PR → успешни проверки → squash merge; не заобикаляме защитата и не добавяме дублираща classic защита.

Документация: [създаване на ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository), [налични правила](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

### Настройки, които могат да изчакат

Шестте native milestones, цветовете/описанията на labels и евентуален Projects board не блокират текущата разработка. 38-те issues вече имат етап, приоритет и зависимости. При оформяне на labels се използва `planning/backlog.json`; при milestones задачите се групират M0: #1–#4, M1: #5–#10, M2: #11–#16, M3: #17–#25, M4: #26–#30, M5: #31–#38. Service configuration и signing са част от по-късните задачи. Незавършеното добавяне на app required check е отделна CPI-004 acceptance точка и не се приравнява към тази незадължителна организация.

## Проверка и допълване чрез bootstrap

```bash
python3 scripts/validate_plan.py
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/bootstrap_github.py
```

Третата команда е dry-run, без мрежови заявки. Видимостта се чете от `planning/backlog.json` — в момента **Public**. `--apply` сверява действителната видимост с изрично записаната в manifest и отказва несъответствие; не променя видимостта на съществуващо репо.

След **fresh checkout на актуалното `main`**, при необходимост може да се използва GitHub CLI автентикация за `georgi-cole`:

```bash
python3 scripts/bootstrap_github.py --apply
```

Съществуващият `planning/backlog.json` служи като маркер за правилния продукт и source commit. Fresh checkout избягва конфликт между стар локален пакет и по-нови remote файлове. Скриптът отказва чуждо/несвързано съдържание и различаващи се remote файлове; при такъв отказ се прави преглед, а не destructive reset. Не поставяй token в командата или файловете.

`--apply --adopt-initial` е само за точното репо с видимост, съответстваща на manifest, и недокоснат стандартен initial README. Не е вариант за заобикаляне на проверките в текущото вече попълнено репо. При бъдещо преминаване към Private актуализираме manifest чрез прегледана промяна, така че той и реалното репо да са съгласувани.

Скриптът допълва липсващи planning файлове, settings, labels, milestones и issues, когато проверките позволяват това. При повторение **пази съществуващите marked issues**, техните тела и статуси; не създава втори комплект от 38 задачи. Зависимостите на новосъздадени issues се превръщат във връзки към реалните GitHub номера. Partial failure се записва локално.

Запазването на съществуващото съдържание има две последици: bootstrap не пренаписва автоматично цветовете/описанията на налични labels и не присвоява липсващи milestones на вече съществуващи issues. Тези две оставащи настройки трябва да се довършат отделно. Branch protection също остава отделна проверка, а не обещан резултат от скрипта.

GitHub Projects board е удобна следваща стъпка, но не е нужен за старт: наличните Issues + labels и описаните в manifest фази дават работещ backlog. По желание колони Backlog / Ready / In progress / Review / Done; максимум една активна implementation задача. В пакета няма създаден cloud Project.

## Външни настройки по време на разработката

1. App основата използва `com.georgicole.crystalpath.infinity`, с `.dev` и `.staging` варианти за съответните среди. Това са работни application/bundle идентификатори до проверка и официална регистрация; наличие в конфигурацията не доказва създадени store records.
2. Отделни backend development/staging/production среди. Преглед на регион, реални разходи и latency преди избор. Не използваме production таблиците на The Big Eye.
3. Нови AdMob app entries/ad units за двете платформи. В developer builds само тестови реклами. SSV endpoint, consent съобщения и privacy options.
4. Store records, signing и ограничени CI secrets се настройват при beta. Съществуващи developer акаунти могат да се ползват, но нямаме доказателство за текущата им готовност.
5. Публични support/privacy/deletion страници и проверено притежание на домейн преди store submission.

Тези услуги, signing материали, live реклами и store releases не се създават от planning bootstrap. Няма автоматично купуване на планове или публикуване.

## Definition of Done за MVP

Работи на реален Android и iPhone; endless прогресът и mystery плочките продължават след 350 без финал; дългите опити имат ограничена активна памет и проверено възстановяване; death правилата са единни; официалните scores и награди са сървърно валидирани; успешни продължавания 1–5 задават 200 SP, а 6–10 — 150 SP; десетото връща в играта, а следващата смърт приключва; no-fill/retry/restart не променят поредността или обещаните SP; World/Europe/Bulgaria филтрите и собственото място са коректни; играта е достъпна за всички възрасти без задължителен demographic отговор; частните analytics възрастови данни/email не изтичат; child/unknown account/ad потоците, deletion и support функционират; store disclosures съответстват на signed build; beta balance review и release gates са документирани. Това са бъдещи критерии, не заявен текущ резултат. Графикът 200/150 SP е приет за началната реализация и се преглежда след playtesting.
