# GitHub настройки и подготовка за пускане

Този документ отделя провереното състояние от желаните настройки. Файл, workflow definition или dry-run не означава изпълнена GitHub операция или успешен CI. `.bootstrap-receipt.json` е отчет само за операции, извършени чрез bootstrap скрипта; промени през GitHub интеграцията или интерфейса се проверяват отделно.

## Прието решение за видимостта — 1 ноември 2026 г.

Georgi избра **Public по време на разработката**, за да използва безплатните стандартни GitHub-hosted runners. След приключване на разработката собственикът ще направи репото **Private**. Public е текущото желано състояние и не е неприключена настройка. `planning/backlog.json` записва `repository.private: false`; bootstrap проверява този изричен избор и не сменя автоматично видимостта на съществуващо репо.

Според [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), стандартните runners са безплатни за публични репота; larger runners се таксуват и там. Текущият workflow използва `ubuntu-latest`. При бъдещото преминаване към Private се преглеждат отново Actions квотата и поддръжката на branch rules според плана. [Съществуващите публични forks остават публични](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## Проверено състояние — 1 ноември 2026 г.

[Репото `georgi-cole/crystal-path-infinity`](https://github.com/georgi-cole/crystal-path-infinity) е създадено от собственика. Основният пакет от **26 файла** е качен в `main` с [commit `235f3379`](https://github.com/georgi-cole/crystal-path-infinity/commit/235f3379c74ddd37bf7febec69ad28be23b75f35); Git blob хешовете на всички файлове са прочетени обратно и съвпадат с подготвения пакет. Създадени и проверени са **38 GitHub issues** със стабилни CPI ID и **14 използвани labels**. [Planning checks run #41311788955](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41311788955) е приключил успешно за този commit. Това удостоверява подготовката на плана и backlog-а; мобилното приложение още не е реализирано.

След потвърждението „done“ от собственика настройките са прочетени повторно при старта на CPI-001. `main` е на [commit `583c851c`](https://github.com/georgi-cole/crystal-path-infinity/commit/583c851cf1385d4038b4347e9bc9e2e1efcbc611) с [успешен CI #41312774366](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41312774366). Repo API потвърждава squash-only и изтриване на merged branches; ruleset API потвърждава активния **Protect main** и всички описани задължителни правила. CPI-001 е започната в отделен branch `cpi-001-product-contract` и има label `status:in-progress`.

| Област | Проверено | Оставаща работа |
| --- | --- | --- |
| Видимост | **Public**, изрично избрано от собственика за разработката | Private е отложено до приключване на разработката |
| Основен branch | `main` | Няма оставаща промяна по името |
| Issues | Включени; 38 задачи са налични | Backlog-ът може да се използва веднага |
| Labels | Първоначалните 14 и `status:in-progress` за CPI-001 | Оформянето на цветове/описания по manifest остава незадължителна организация |
| Неизползван label | `priority:P2` не е създаден | Не блокира backlog-а; добавя се при нужда или чрез bootstrap |
| Milestones | По issues няма зададени native GitHub milestones | Шестте фази са описани в manifest; да се проверят/създадат native milestones и да се присвоят на задачите |
| Wiki | Включено | Може да се изключи; не блокира работата, документацията е в git |
| Merge методи | Само squash; merge commit и rebase са изключени | Проверено, няма оставаща промяна |
| Изтриване на merged branches | Включено | Проверено, няма оставаща промяна |
| Auto-merge | Изключено | Съответства на плана |
| Actions permissions | Собственикът потвърди ръчната настройка; workflow изрично има `contents: read` | Repo-level permissions и fork approval не са независимо прочетени през ограничения connector |
| CI | **Planning checks: success** за commit `583c851c` — manifest, bootstrap tests и dry-run | Мобилните build/test проверки се добавят след scaffold в CPI-004 |
| Защита на `main` | Активен [Protect main / 26312536](https://github.com/georgi-cole/crystal-path-infinity/settings/rules/26312536): PR, 0 approvals, resolved conversations, strict required check, без bypass/force push/delete | Проверено; работата продължава през branch и PR |

Наличният GitHub connector позволява repo/ruleset прочитане и работа с branches/PR/issues, но не предоставя admin mutations за тези настройки, native milestones и оформяне на labels. Ръчните промени са извършени от собственика; таблицата различава API-провереното от неговото потвърждение. Не е необходим нов browser login, за да продължим по CPI-001. Липсата на native milestones не прави backlog-а неизползваем.

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
| Планиран начален CI | Проверка на manifest и bootstrap tests; не mobile build |
| CI след scaffold | Lint, typecheck, core/API tests, web build; native проверки според milestone |
| Main защита | Проверява се и се включва след първия работещ CI; PR, green checks, resolved conversations, без force push/delete |

[Branch rulesets са налични за Public репота и с GitHub Free](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository). Поддръжката им за Private зависи от GitHub плана. При собственик без втори reviewer задаваме 0 required approvals, като запазваме задължителния PR и успешния CI. CODEOWNERS указва кой преглежда, но сам по себе си не е защита.

## Справочник за трите ръчни секции

Следните стойности документират желаната конфигурация за бъдеща проверка. Не е необходимо собственикът да ги изпълнява отново; действителният статус и начинът на проверка са в таблицата по-горе.

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

Текущият workflow вече работи и изрично задава `contents: read`. Repository настройките по-горе се проверяват от собственика. GitHub connector-ът е отделен от `GITHUB_TOKEN` на workflow-а; тази отметка не управлява възможността да създаваме PR-и през интеграцията.

Документация: [GitHub Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

### 3. Settings → Rules / Rulesets → New ruleset → New branch ruleset

Име: **Protect main**. Enforcement: **Active**. В Target branches → Add a target се избира default branch (`main`). Bypass list остава празен.

| Правило | Стойност |
| --- | --- |
| Require a pull request before merging | Включено |
| Required approvals | **0** за текущата работа без втори независим reviewer |
| Require conversation resolution before merging | Включено |
| Require status checks to pass before merging | Включено |
| Required check | **Planning manifest and bootstrap**; GitHub Actions като източник, ако се предлага |
| Require branches to be up to date before merging | Включено |
| Block force pushes | Включено |
| Restrict deletions | Включено |

В списъка с required checks се добавя реалният job **Planning manifest and bootstrap**, който вече е изпълняван успешно. **Planning checks** е името на целия workflow. Required approvals = 0 запазва PR и CI изискванията, без да изисква одобрение от втори GitHub потребител. Не се включват изискване за code-owner approval, approval на последния push или Restrict updates. Последното би ограничило обновяванията до actors с bypass права, а bypass list е празен.

Натиска се Create. След активирането работата минава през branch → PR → успешни проверки → squash merge. При промяната на CI в CPI-004 актуализираме required checks към действителните им имена. Използваме един branch ruleset за `main`; не е нужна дублираща classic защита със същите правила.

Документация: [създаване на ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository), [налични правила](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

### Настройки, които могат да изчакат

Шестте native milestones, цветовете/описанията на labels и евентуален Projects board не блокират CPI-001. 38-те issues вече имат етап, приоритет и зависимости. При оформяне на labels се използва `planning/backlog.json`; при milestones задачите се групират M0: #1–#4, M1: #5–#10, M2: #11–#16, M3: #17–#25, M4: #26–#30, M5: #31–#38. Service configuration и signing са част от по-късните задачи.

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

1. Нови уникални Android application ID и iOS bundle ID; работно предложение `com.georgicole.crystalpathinfinity`, проверява се преди регистрация.
2. Отделни backend development/staging/production среди. Преглед на регион, реални разходи и latency преди избор. Не използваме production таблиците на The Big Eye.
3. Нови AdMob app entries/ad units за двете платформи. В developer builds само тестови реклами. SSV endpoint, consent съобщения и privacy options.
4. Store records, signing и ограничени CI secrets се настройват при beta. Съществуващи developer акаунти могат да се ползват, но нямаме доказателство за текущата им готовност.
5. Публични support/privacy/deletion страници и проверено притежание на домейн преди store submission.

Тези услуги, signing материали, live реклами и store releases не се създават от planning bootstrap. Няма автоматично купуване на планове или публикуване.

## Definition of Done за MVP

Работи на реален Android и iPhone; endless прогресът и mystery плочките продължават след 350 без финал; дългите опити имат ограничена активна памет и проверено възстановяване; death правилата са единни; официалните scores и награди са сървърно валидирани; десетата реклама дава продължаване, а следващата смърт приключва; World/Europe/Bulgaria филтрите и собственото място са коректни; играта е достъпна за всички възрасти без задължителен demographic отговор; частните analytics възрастови данни/email не изтичат; child/unknown account/ad потоците, deletion и support функционират; store disclosures съответстват на signed build; beta balance review и release gates са документирани. Това са бъдещи критерии, не заявен текущ резултат. Конкретният revive SP остава за решение в CPI-001.
