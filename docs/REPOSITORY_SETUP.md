# GitHub настройки и подготовка за пускане

Този документ отделя провереното състояние от желаните настройки. Файл, workflow definition или dry-run не означава изпълнена GitHub операция или успешен CI. `.bootstrap-receipt.json` е отчет само за операции, извършени чрез bootstrap скрипта; промени през GitHub интеграцията или интерфейса се проверяват отделно.

## Проверено състояние — 1 ноември 2026 г.

[Репото `georgi-cole/crystal-path-infinity`](https://github.com/georgi-cole/crystal-path-infinity) е създадено от собственика. Основният пакет от **26 файла** е качен в `main` с [commit `235f3379`](https://github.com/georgi-cole/crystal-path-infinity/commit/235f3379c74ddd37bf7febec69ad28be23b75f35); Git blob хешовете на всички файлове са прочетени обратно и съвпадат с подготвения пакет. Създадени и проверени са **38 GitHub issues** със стабилни CPI ID и **14 използвани labels**. [Planning checks run #41311788955](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/41311788955) е приключил успешно за този commit. Това удостоверява подготовката на плана и backlog-а; мобилното приложение още не е реализирано.

| Област | Проверено | Оставаща работа |
| --- | --- | --- |
| Видимост | **Public** | **Private** остава препоръчаната и планирана настройка; още не е приложена |
| Основен branch | `main` | Няма оставаща промяна по името |
| Issues | Включени; 38 задачи са налични | Backlog-ът може да се използва веднага |
| Labels | 14: `priority:P0`, `priority:P1`, `type:task`, `status:backlog` и 10 `area:*` labels | Цветовете са `ededed`, описанията са празни; да се оформят по manifest |
| Неизползван label | `priority:P2` не е създаден | Не блокира backlog-а; добавя се при нужда или чрез bootstrap |
| Milestones | По issues няма зададени native GitHub milestones | Шестте фази са описани в manifest; да се проверят/създадат native milestones и да се присвоят на задачите |
| Wiki | Включено | Да се изключи; документацията се поддържа в git |
| Merge методи | Squash, merge commit и rebase са включени | Да остане squash; другите два метода да се изключат |
| Изтриване на merged branches | Изключено | Да се включи |
| Auto-merge | Изключено | Съответства на плана |
| Actions permissions | Не са проверени/настроени през admin API | Да се приложат и проверят read-only permissions и забрана workflows да одобряват PR |
| CI | **Planning checks: success** за commit `235f3379` — manifest, bootstrap tests и dry-run | Мобилните build/test проверки се добавят след scaffold в CPI-004 |
| Защита на `main` | Rulesets API върна празен списък; classic branch protection не е проверена | Да се проверят и двата механизма; няма потвърдена защита |

Наличният GitHub connector не предостави операции за admin settings, native milestones и оформяне на labels. Наличният браузър няма завършен GitHub вход. Затова тези настройки са оставени явно като неприключени, вместо да се отчитат като изпълнени. Подготовката на кода може да започне по съществуващите issues; липсата на native milestones не прави backlog-а неизползваем.

## Желани настройки

| Настройка | Стойност |
| --- | --- |
| Owner / име | georgi-cole / crystal-path-infinity |
| Видимост | Private |
| Основен branch | main |
| Лиценз | Proprietary, Georgi Kolev; не MIT |
| Issues | Включени; 38 задачи със стабилни CPI ID, присвоени към 6 native milestones, с labels |
| Wiki | Изключено; документацията е в git |
| Merge | Squash; изтриване на merged branch; без auto-merge |
| Actions | Минимални read-only permissions; без workflow approval на PR |
| Планиран начален CI | Проверка на manifest и bootstrap tests; не mobile build |
| CI след scaffold | Lint, typecheck, core/API tests, web build; native проверки според milestone |
| Main защита | Проверява се и се включва след първия работещ CI; PR, green checks, resolved conversations, без force push/delete |

Поддръжката на private branch protection зависи от GitHub плана и достъпа. Ако не е налична, това остава явно ограничение; не твърдим, че branch е защитен. При собственик без втори reviewer не изискваме невъзможно self-approval. CODEOWNERS указва кой преглежда, но сам по себе си не е защита.

## Конкретни оставащи GitHub настройки

1. **Видимост:** собственикът да прегледа Public → Private в Settings → General. Докато това не е извършено и проверено, репото остава публично; препоръката в документа не променя достъпа.
2. **General:** изключване на Wiki; включен само squash merge; включено автоматично изтриване на merged branches. Auto-merge остава изключено.
3. **Actions → General:** read-only workflow permissions; изключено разрешението workflows да създават и одобряват pull requests. Да се провери ефективната настройка след запис.
4. **Labels:** актуализиране на цветовете и описанията на съществуващите labels по `planning/backlog.json`. Не се създават дублиращи labels с различен правопис.
5. **Milestones:** създаване на липсващите шест native milestones по manifest и присвояване на всяко issue според неговото поле `milestone`. CPI ID и зависимостите остават същите. Това може да се довърши след началото на работата.
6. **Защита на `main`:** началният planning workflow вече е минал успешно. Остава да се проверят rulesets и classic branch protection и да се настроят PR, изискваният реален check `Planning manifest and bootstrap`, resolved conversations и забрана за force push/delete, ако планът ги поддържа. Празният rulesets отговор сам по себе си не доказва липса или наличие на classic protection. Имената на required checks се преглеждат отново при промяната на CI в CPI-004.

## Проверка и допълване чрез bootstrap

```bash
python3 scripts/validate_plan.py
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/bootstrap_github.py
```

Третата команда е dry-run, без мрежови заявки. **`--apply` отказва текущото Public репо по дизайн.** Скриптът не сменя видимостта автоматично и защитата му не трябва да се заобикаля.

След като собственикът е направил репото Private, пълният planning пакет е качен и е взет **fresh checkout на актуалното `main`**, може да се използва GitHub CLI автентикация за `georgi-cole`:

```bash
python3 scripts/bootstrap_github.py --apply
```

Съществуващият `planning/backlog.json` служи като маркер за правилния продукт и source commit. Fresh checkout избягва конфликт между стар локален пакет и по-нови remote файлове. Скриптът отказва чуждо/несвързано съдържание и различаващи се remote файлове; при такъв отказ се прави преглед, а не destructive reset. Не поставяй token в командата или файловете.

`--apply --adopt-initial` е само за private репо с недокоснат стандартен initial README. Не е вариант за заобикаляне на проверките в текущото вече попълнено репо.

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

Работи на реален Android и iPhone; запис/възстановяване и прекъсвания са проверени; last-row/death правила са единни; официалните scores и награди са сървърно валидирани; десетата реклама дава продължаване; следващият death приключва; World/Europe/Bulgaria филтрите и собственото място са коректни; private age/email не изтичат; deletion и support функционират; store disclosures съответстват на реалния signed build; beta обратната връзка и release gates са документирани. Това са бъдещи критерии, не заявен текущ резултат.
