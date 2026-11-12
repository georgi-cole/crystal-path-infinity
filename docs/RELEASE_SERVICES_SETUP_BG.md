# Акаунти, реклами и покупки: настройки за рилийз

**12 November 2026 · completed Apple submission and corrected Google declaration.** Apple app1.0.1(71) and22 visible store products are **Waiting for Review** in one23-item submission; build71 is also **IN_BETA_TESTING**. Both current six-image screenshot sizes, reviewer notes and OS-only encryption answer are saved. Published Apple privacy metadata includes the existing account/purchase data. Google's corrected Data safety questionnaire now includes provider/email-code account creation, account deletion, optional account data and purchase history; the saved correction is included in Android62's restarted review. Its new automatic checks passed and Google explicitly confirms **Your changes are now in review**. Existing SDK disclosures remain intact. No new collection, price, rule or production phone acceptance is implied. [Dated evidence and remaining limits](operations/PRODUCTION_COMMERCE_LAUNCH.md).

**12 November 2026 · later Google status.** Automated submission checks completed and the Android62 production replacement is now explicitly **in review**. Approval/public availability remain pending; Apple still requires console sign-in to finish its submission.

**12 November 2026 · subsequent distribution checkpoint.** Production commerce and its independent review inventory are deployed as recorded in the [launch record](operations/PRODUCTION_COMMERCE_LAUNCH.md); this supersedes the earlier disabled/not-deployed checkpoint below. Android1.0.1(62) is available internally and queued for public review with current artwork. iPhone1.0.1(71) is VALID and App Store eligible, but tester assignment, its public submission and two remaining purchase metadata entries wait for App Store Connect sign-in. These production-profile candidates are distinct from staging69/60: testing provider transactions remain verified Sandbox purchases in a separate review inventory. Do not describe a successful upload, registered product or review submission as successful live payment or store approval.

**12 November 2026 · public release preparation.** The owner accepted Google and Apple sign-in after updating to TestFlight69. Production's existing Adventure/offline-supply migrations and current merged sign-in runtime are now deployed; purchase/reward flags are still disabled. This supersedes older setup instructions only where the dated evidence says so. The public candidate must verify App Review's Sandbox receipts separately from live payments, with owner-bound review inventory and no official grants from test receipts. The new production Apple verifier, flags, migration and remaining store/build steps are recorded in [the production launch record](operations/PRODUCTION_COMMERCE_LAUNCH.md). Its implementation is not yet deployed or submitted. Existing staging credentials and build69 remain separate.

**11 ноември 2026 · Публичен уеб вход:** Собственикът одобри акаунти от 13 години с по-висок местен праг и временен праг 18 в останалите държави. Отделните production Google клиент, Apple Services ID и ключ са настроени. Сървърът, callback маршрутът, възрастовата политика и плановото почистване са внедрени и проверени без създаване на акаунт. Публикуването на Pages и истинските входове остават отделна стъпка. [Текущо състояние и условия за включване](operations/PUBLIC_WEB_PROVIDER_SIGN_IN.md). Записът за затворената политика от 10 ноември по-долу е исторически; staging конфигурацията е отделна.

Дата: **7 ноември 2026**. Бранч: `codex/mystery-pacts`. Отделният staging сървър е разгърнат. Подписана Android сборка и 18 Google Play продукта са подготвени за вътрешно тестване. Достъпът до покупки в играта и публичният рилийз остават отделни стъпки.

## С какво да започнеш

Вече можеш да се присъединиш към [Android Internal Testing](https://play.google.com/apps/internaltest/4701734144458822899) с един от двата добавени Google акаунта. За първата покупка от играта остават достъпът на сървъра до Google Play, изолирана staging настройка за тестерите и проверка на телефон. Ключовете се попълват в частната конфигурация. Стъпки 1–8 пазят и статуса на останалите настройки за двете платформи.

Стъпки 9–12 описват внедряването и приемането. Част от staging и production услугите вече са разгърнати; този документ отделя доказаните резултати от оставащите приемателни проверки. Подготвеният код и автоматичните проверки не заменят тестовете с реален акаунт, пощенска кутия и телефон.

## Вход в публичната уеб игра · 10 ноември 2026 г.

Публичната игра може да предлага вход с еднократен имейл код след проверка на възрастта и държавата на пребиваване. Сесията се пази само в паметта на текущия браузърен таб; след презареждане или затваряне играчът влиза отново с код. Самостоятелната account страница използва същия поток за профил, изтегляне и изтриване на данни.

Включването е отделно от merge-а: GitHub variable `CPI_PAGES_ACCOUNTS_ENABLED` трябва да е `true`. Workflow допуска това само при публикуване от `main`, а преди build проверява CORS отговорите на фиксирания production gateway за точния Pages origin. Без флага публичният build остава гост игра. `deployment-info.json` записва дали account услугите са включени.

Текущата production политика няма разрешени държави, затова регистрацията остава затворена. Guest play е достъпен. Не включвай флага, преди да са одобрени правилата за държавите, проверени краткото известие и privacy страницата спрямо живия поток, и успешно приети signup, повторен вход, export и deletion с реална пощенска кутия. QA артефактът не получава production account конфигурация. В публичния build остават изключени ranked услуги, реклами и уеб покупки; тестови цени, контролни елементи и симулирани покупки се пазят извън него.

При качване със Supabase CLI 3.0.0 използвай `export-live-secrets.mjs`, който запазва JSON и редовете в TLS сертификата. За отделна частна конфигурация може да се подадат `--env=<път>` и `--out=<път>`. Не качвай изходния файл в Git.

## Какво е подготвено

- Вход с шестцифрен код по имейл; проверка преди приемане на имейл; ограничения за изпращане и грешни кодове; прекратяване и подновяване на сесиите.
- Сървърна проверка на рекламните награди. Съобщение от телефона само по себе си не дава SP. Отделна проверка на callback адреса в AdMob не дава награди.
- Проверка на Apple/Google разписките, еднократна доставка, възстановяване на незавършени покупки, сървърно потвърждаване в Google Play и обработка на refunds/revocations/reversals.
- Сървърно използване на платени SP, подсказки и кредити; общият лимит за резервните SP и отделните assisted резултати се пазят от сървъра.
- Изтегляне на всички страници с лични данни и изтриване след нов имейл код. Отделната страница е `account.html`; в браузъра входът се пази само докато страницата е отворена.
- Частна конфигурация и проверки за готовност; новите лични ключове са създадени локално, не са отпечатани или добавени в Git.

## Какво трябва да настроиш ти — в този ред

### 1. Завърши собственическите настройки в магазините

**Проверка и действия · 7 ноември 2026**, след сървърната подготовка. Приложението в Google е `4972812942109567422`, в Apple — `6831790531`, package/bundle `com.georgicole.crystalpath.infinity`, Apple Team `C97T2A5255`.

| Област | Проверено състояние | Оставащо действие |
| --- | --- | --- |
| Google: общ фирмен профил | След изричното одобрение на Georgi е подаден `Trader`; показано е `Trader status saved`. Запазени са съществуващите фирмени данни и публичният контакт `support@kolequant.xyz`. Статусът се наследява от приложенията в профила. | Не се подава повторно общата декларация. |
| Google: Crystal Path | Запазено е `Yes, my trader status applies to this app`. В Publishing overview има `Complete app-level trader status declaration`. | Промяната още не е изпратена/одобрена за review: `Send app for review` е блокиран до останалите задължителни dashboard задачи. Optional Terms of Service URL е празен; не е измислен публичен адрес. |
| Google: плащания | След директния вход през фирмения профил е намерена услугата `Google Play Apps`. Нейният собствен панел показва вече добавена банкова сметка с маскиран номер. Не е добавяна/променяна сметка. | Подробната банкова верификация и данъчният статус остават **непотвърдени**: обичайният вграден панел е празен, а бутоните за подробни настройки не отварят съдържание от самостоятелния изглед. Проверяват се след възстановяване на пълния панел в [Payments profile](https://play.google.com/console/u/0/developers/6752786779388158337/paymentssettings). |
| Google: 15% service fee | На 7 ноември е създадена група с официалното име на фирмата и единствен основен акаунт `kolequant`. Собственикът потвърди, че няма други свързани акаунти, и отделно одобри приемането на договора. След `Accept and enroll` Google показа `Your account group is enrolled for the 15% service fee`; програмата е в списъка с активни участия. | **Записването е завършено.** Ставката важи по [условията на Google](https://play.google/additional-service-fee-tier-terms/), включително годишния праг за цялата група; не се третира като безусловни 15% за всички бъдещи приходи. |
| Apple Developer | Program License Agreement показва `Accepted November 7, 2026`. | Тази стъпка вече е готова; не е приеман повторно договор в тази проверка. |
| Apple Business | Paid/Free Apps Agreement, банковата сметка, двата U.S. tax формуляра и Digital Services Act са `Active`. | Не са променяни банкови или данъчни данни. |
| Apple DAC7 | Първоначално `Missing Info`; след обяснение и изрично потвърждение от Georgi е подадено `No` за personal services. Редът показва `Nov 7, 2026 · Active`. | Декларацията е завършена. |

За DAC7 Apple пита за услуги, извършвани от хора по конкретна заявка, например индивидуални консултации, уроци или превоз; това е различен въпрос от наличието на in-app purchases. [Официалното определение и стъпки](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-information-for-directive-on-administrative-cooperation-7th-amendment). Собственикът потвърди отговора за всички приложения на фирмата; той е подаден и приет. Снимката `apple-dac7-saved.png` записва активния статус в локалната папка с доказателства.

Общият Google developer контакт `support@kolequant.xyz` е одобрен за този фирмен профил. Публичният адрес за Crystal Path е `support@kolequant.xyz`; app-specific контактът още не е попълнен в store listing. Не са създавани служебни ключове, store продукти или реални покупки с тази проверка. Снимките са в игнорираната локална папка `apps/mobile/artifacts/store-setup-2026-11-07`; лични/банкови подробности не се добавят към Git.

Последващите снимки `google-fee-enrolled.png` и `google-play-payout-overview.png` доказват записването и наличната сметка в Google Play Apps. Публичният текст на договора е прегледан преди приемането му. Пълните адреси с временни параметри на платежния панел, банковите данни и номерът на сметката не се съхраняват в документацията. Това не активира клиентските покупки или backend услугите; условията за реалното им приемане остават по-долу.

Тези договори и лични/фирмени декларации са твои действия като собственик. Не изпращай банкови данни или частни ключове в чата.

### 2. Настрой пощата за тестове и за пускането

**Staging.** Тестовите кодове се изпращат от `login@auth.kolequant.xyz`. Отделният ключ `crystal-path-staging-otp` има право само за изпращане от този поддомейн и се пази в staging secrets. Доставянето, грешният код, правилният код, създаването на сесия и оттеглянето ѝ са проверени със служебна пощенска кутия на 7 ноември 2026 г. Адресът за изпращане не изисква собствена входяща кутия. [Resend: адреси на потвърден домейн](https://resend.com/docs/knowledge-base/how-do-i-create-an-email-address-or-sender-in-resend).

**Production.** От 9 ноември 2026 г. публичният контакт за Crystal Path е `support@kolequant.xyz`. Production и release проверките търсят MX записите на `kolequant.xyz`. При приемане потвърди получаване и отговор от тази пощенска кутия. За кодовете за вход използвай отделен потвърден изпращащ домейн `auth.kolequant.xyz` в Resend, `CPI_MAIL_FROM` от този домейн и отделен ключ само за изпращане. Публичният контакт е независим от изпращача на кодовете.

Кодовете се изпращат през [Email API на Resend](https://resend.com/docs/api-reference/emails/send-email).

### 3. Подготви изолирания Supabase проект

На 7 ноември 2026 г. създадохме [Crystal Path Infinity Staging](https://supabase.com/dashboard/project/yfntwewvfsvljxcztoyp) (`yfntwewvfsvljxcztoyp`) в **GeorgiCole Free**, регион Ирландия. Проектът е Healthy и е създаден с изключено автоматично предоставяне на Data API достъп до новите таблици. По-късно приложихме и проверихме всичките 15 миграции, създадохме `cpi_runtime` и качихме `cpi-live`. Публичната Supabase регистрация, анонимният вход и вграденият email provider са изключени в staging.

Споделеният `jbyguybxhezjhdbenevh` е архивиран и паузиран. Пауза спира и The Big Eye QA, което ползва същия DEV. The Big Eye production остава в другия активен слот. Новият сървър продължава да отказва споделения DEV адрес. [Запис за архива и паузата](operations/SUPABASE_DEV_2026-11-04.md#7-november-2026--archive-and-pause).

Когато приключат тестовете и се освободи staging слотът, създай отделен чист production проект за бъдещите играчи. Staging данните и ключовете остават отделни.

За всеки нов проект запази project reference, URL и администраторската DB парола в частния си мениджър. В избрания проект:

- Изключи публичните регистрации, анонимния вход и публичния Email provider; не свързвай публичния Supabase OTP endpoint към клиента. Нашият сървър изпраща и проверява кодовете сам и чак тогава използва admin create-user. Провери това и с директна отрицателна HTTP заявка при приемането.
- Не излагай `cpi_private` или `auth` през Data API.
- Прилагай миграциите от това репозитори **само** към тези нови проекти, след тестовете и прегледа на промяната. Старият workflow за CPI-017 не е deployment механизъм за новия сървър.
- След миграциите създай ограничен DB вход чрез `backend/live-runtime-role.sql`. Сървърът използва `cpi_runtime` и TLS session connection на порт 5432; администраторската парола не се качва в Edge Function.

Входът през нашия сървър използва [server-only admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Публичен Supabase JWT не е игрова сесия.

### 4. Одобри правилата за акаунти по държави

Световно разпространение на играта не е автоматично разрешение за събиране на имейли от всички възрасти навсякъде. Безплатната игра като гост остава достъпна без имейл и възрастова анкета.

В `CPI_ACCOUNT_POLICY` трябва да има прегледана версия и разрешените държави. За всяка се задават минимална възраст и дали неутралният възрастов екран е допустим. Вземаме по-строгото правило за декларираната държава и доверената държава на връзката. Не съхраняваме точната възраст и не използваме незадължителната аналитична анкета за разрешение.

**Детски акаунти с родителско потвърждение и външна age assurance услуга не са свързани.** Когато са нужни, имейл полето остава затворено; родителска отметка не се приема за проверка. Нужен е избор и настройка на подходящ доставчик/процес и преглед на политиката, преди да отваряме тези акаунти. Не сме въвели общо правило „18+“ за играта. Самодекларираната възраст не е доказана възраст.

### 5. Попълни частната конфигурация

Подготвеният файл е **`backend/.env.live.local`**; той е игнориран от Git. Примерът без тайни е `backend/.env.live.example`.

| Поле | Откъде идва |
| --- | --- |
| `CPI_PROJECT_REF`, `SUPABASE_URL` | Новият изолиран Supabase проект |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only API key на този проект, за локалната проверка; hosted function получава своя platform key автоматично |
| `CPI_DATABASE_URL` | TLS session connection за ограничения `cpi_runtime` вход |
| `CPI_DATABASE_CA` | PEM сертификат от Database Settings, ако пулерът използва частен CA. В частния env файл постави редовете с `\n`. Сървърът проверява сертификата и името на хоста. |
| `CPI_RUNTIME_DB_PASSWORD` | Локална парола само за създаване на DB входа; не се качва като function secret |
| Четирите `CPI_*KEY`/pepper полета | Вече генерирани отделни стойности; пазят се частно |
| `CPI_RESEND_API_KEY`, `CPI_MAIL_FROM` | Потвърденият Resend домейн и sending key |
| `CPI_ACCOUNT_POLICY` | Одобрената политика от стъпка 4 |
| `CPI_ALLOWED_ORIGINS` | Точните адреси на приложението и account страницата, без wildcard |

Не копирай този файл в `apps/mobile`; не слагай тайни в `VITE_*`. За production използвай отделни ключове и пароли. Не презаписвай staging ключовете: създай отделен частен файл/secret set.

### 6. Дай достъп за проверка на Google Play покупки

1. Създай Google Cloud service account за Crystal Path и включи **Google Play Android Developer API**.
2. Добави неговия служебен имейл в Play Console → Users and permissions с достъп **само до Crystal Path** и нужните права за четене/обработка на покупки и поръчки. Не са нужни права за публикуване на версии.
3. Създай server-only JSON key. Запиши `client_email` като `CPI_GOOGLE_CLIENT_EMAIL`, а `private_key` като `CPI_GOOGLE_PRIVATE_KEY`.
4. **Готово на 7 ноември 2026 г.** Списъкът `Crystal Path Billing QA` с двата одобрени акаунта е добавен в Crystal Path Internal Testing и в License testing. Последната настройка важи за целия Play developer акаунт. Съществуващите списъци и настройките на The Big Eye са запазени.

Покупките се проверяват през Google API; [официалните указания за защита на Billing](https://developer.android.com/google/play/billing/security) описват сървърната проверка и потвърждаването. JSON ключът не влиза в приложението.

### 7. Създай Apple In-App Purchase key

В App Store Connect създай **In-App Purchase API key** и запиши:

- Issuer ID → `CPI_APPLE_ISSUER_ID`;
- Key ID → `CPI_APPLE_KEY_ID`;
- частния `.p8` ключ → `CPI_APPLE_PRIVATE_KEY`.

Team ID `C97T2A5255` не замества Issuer ID. Следвай [Apple: Generate keys for In-App Purchases](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases/). Добави sandbox тестери/TestFlight достъп. Staging сървърът приема sandbox покупки; production сървърът приема production покупки.

### 8. Създай истинските продукти в двата магазина

Оригиналното предложение е в `backend/commerce-products.proposed.json`. `backend/commerce-products.live.example.json` остава пример с отделни Android/iOS записи и статус `unconfirmed`. За Android вече са създадени предложените SKU. При проверката на 7 ноември Apple каталогът още беше празен.

**Google Play Internal Testing · 7 ноември 2026 г.** Подписаната `0.1.0` (version code `1`) от `bf7f804` е `Active` и `Available to internal testers`. Използва регистрирания package `com.georgicole.crystalpath.infinity`, включва Billing и сочи към отделния Crystal Path staging API. Рекламите са изключени в тази сборка. Потвърдени са подписът и AAB структурата. [Инсталиране през Internal Testing](https://play.google.com/apps/internaltest/4701734144458822899).

В Play Console са проверени 18 продукта с по една активна опция `buy`. Това са 4 пакета кредити, 6 SP пакета, 2 пакета подсказки и 6 свята. Използвани са имената и референтните EUR цени от каталога, с регионалното преобразуване на Google Play. За вътрешния тест са добавени английски имена и описания. Продуктовите икони и локализациите остават за подготовката за публичен рилийз. Ресурсите са consumables, световете са non-consumables. [Google Play каталог](https://play.google.com/console/u/0/developers/6752786779388158337/app/4972812942109567422/one-time-products).

На телефон инсталирай от Google Play със същия акаунт, който е в License testing. При плащане провери обозначението за тестова покупка и избери тестовия метод на Google. Тестовият канал сам по себе си допуска и реално плащане за акаунти извън License testing. [Google Play Billing testing](https://developer.android.com/google/play/billing/test).

Покупката и начисляването в играта все още не са проверени на телефон. Staging покупките са изключени. Остават Google Play server credentials, достъп за тестовите акаунти и потвърден сървърен SKU manifest. Текущата конфигурация при включване изисква и Apple credentials. За първи Android тест може да се подготви отделна Android-only staging конфигурация, която запазва проверката на всяка разписка. За iOS следват 18-те продукта, съответните sandbox тестери и TestFlight сборка за регистрирания bundle ID. Запази смисъла и количеството на вече продаден SKU. Оттеглените SKU остават за възстановяване с `available:false`. [Apple StoreKit sandbox](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).

### iOS TestFlight в GitHub Actions

**Каталог на 8 ноември 2026 г.** Crystal Path има 18 записа в Google Play и 18 съответстващи чернови в [App Store Connect](https://appstoreconnect.apple.com/apps/6831790531/distribution/iaps/drafts). Apple показва Prepare for Submission за всичките 18. Каталогът съдържа 4 пакета кредити, 6 SP пакета, 2 пакета подсказки и 6 постоянни свята. Базовите цени в България следват [първоначалния каталог](../backend/commerce-products.proposed.json). Преди App Review добавяме снимки на покупките в играта и включваме първия consumable и първия non-consumable със съответната версия.

[CPI-035](https://github.com/georgi-cole/crystal-path-infinity/issues/35) добавя workflow **Crystal Path iOS TestFlight** на GitHub macOS runner. PR проверката компилира неподписан iPhone архив. След сливането на поправките в main стартираме workflow ръчно с upload_to_testflight и пълния SHA на проверения main commit. Преди качване той проверява същия SHA отново. Повторен опит за качване изисква нов run с нов номер на сборката.

Сборката използва регистрирания bundle ID и само staging gateway за вход и StoreKit. Apple получава сборката с **TestFlight Internal Only**. За публичната версия се подготвя отделна сборка с одобрения production сървър. Правилата за допускане на staging акаунти се проверяват от сървъра.

**Рекламен beta профил · 9 ноември 2026 г.** По подразбиране рекламите са изключени. При ръчно стартиране `rewarded_ads_test=true` включва native SDK и клиентския rewarded поток само към staging gateway. За подписано качване включи AdMob Test mode за точната версия в Test apps и впиши тази версия в променливата `CPI_IOS_ADMOB_TEST_VERSION` на средата `cpi-ios-testflight`. Приемателният тест използва само заявки, потвърдени като тестови, и отделен staging акаунт с право за конкретния тест. Конфигурацията на публичните рекламни потоци е отделна.

При първия тест на Android и iPhone запиши build, версия, устройство, Run ID, ред, номер на продължаването и SP преди/след всяко възстановяване. При затваряне преди наградата провери, че мястото остава. Повтори до десет потвърдени награди в един опит. Проверка за същия ред, 200 SP за №1–5, 150 SP за №6–10 и липса на 11-а рекламна възможност. Синтетичният SSV тест и SDK проверката са отделни доказателства от изпълнение на устройство. [AdMob Test apps](https://support.google.com/admob/answer/17080939).

**Поправка на staging входа · 9 ноември 2026 г.** Първата Android тестова сборка `0.1.0 (1)` се отвори, но в Profile липсваше вход. Native клиентът изисква пълния адрес `https://crystal-path-staging-api.kolequant.workers.dev/cpi`. TestFlight проверява настройката за вход и адреса в архива. Преди тест на реклама влез с одобрен staging акаунт и избери **Start verified run**.

При последваща проверка **Continue** оставаше на същата форма, въпреки издаденото разрешение. Часовникът на емулатора изоставаше. Клиентът допуска до 30 секунди разлика при проверка на срока, а сървърът продължава да налага 15-минутния лимит. При липса на валидно разрешение формата показва съобщение за недостъпност.

**Android rewarded проверка · 9 ноември 2026 г., `0.1.0 (1)` от `49978e4`.** Входът с email код и потвърденият опит в staging минаха. След ограничаване на staging разрешението до четири минути и публикуване на отделно европейско UMP съобщение на английски и български за двата Crystal Path app ID, Android показа **Test Ad** и **Reward granted**. Към момента на проверката няма запис за подписан callback или приложено продължаване за този опит. Ред 2 остава непреминат. Десетте продължавания са проверени със синтетични подписани callbacks в изолирана база. Реалното възстановяване на телефон остава отделна приемателна проверка.

Подписването изисква Apple Distribution сертификат с частния му ключ във формат P12, App Store Connect provisioning profile за Crystal Path и отделен App Store Connect ключ за качване. Записват се като CPI_IOS_DISTRIBUTION_P12_BASE64, CPI_IOS_DISTRIBUTION_P12_PASSWORD, CPI_IOS_PROFILE_BASE64, CPI_ASC_UPLOAD_KEY_BASE64, CPI_ASC_UPLOAD_KEY_ID и CPI_ASC_UPLOAD_ISSUER_ID в средата cpi-ios-testflight, ограничена до main. Ключът за проверка на покупки остава в Supabase staging. Workflow не публикува подписани артефакти в публичното GitHub хранилище.

**Директна регистрация в iPhone beta · 9 ноември 2026 г.** Настрой `CPI_STAGING_PROVIDER_SIGNUP_EMAILS` само в изолирания staging проект. Стойността е JSON обект с масиви `apple` и `google` за одобрените тестови адреси. Приложи миграцията `20261109000200_native_provider_signup.sql` преди разгръщане на Edge Function. Съществуващите акаунти запазват връзките и покупките си. [Поток и проверки](decisions/CPI-018-staging-provider-sign-in.md).

**Опростен iPhone beta вход · 9 ноември 2026 г.** Приложи и `20261109000300_direct_provider_entry.sql`. Активирай `CPI_STAGING_DIRECT_PROVIDER_ENTRY=true` само за изолирания staging проект, когато списъците съдържат индивидуално одобрени пълнолетни тестери. Apple и Google се отварят веднага. Новият акаунт може да пропусне профила. При съвпадащ имейл един код потвърждава съществуващия акаунт в същия поток, преди да се свърже доставчикът. Публичната политика за допустимост остава отделна.

**Вход с Apple и Google · 9 ноември 2026 г.** iPhone review сборката използва отделна среда за подписване `cpi-ios-staging-review`, достъпна само от `codex/ios-sign-in-staging`. Включи `review_source=true` и подай точния SHA след успешните проверки на PR. Архивът проверява Apple entitlement и Google callback. Експортът е TestFlight Internal Only, а акаунтите и StoreKit използват staging gateway. [Условия и проверки](decisions/CPI-018-staging-provider-sign-in.md).

**Проверка на 8 ноември 2026 г.** [GitHub Actions](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42490556975) успешно компилира и провери неподписан iPhone архив за PR #87. Създадена е групата [Crystal Path Internal QA](https://appstoreconnect.apple.com/teams/784da51c-4744-46ce-83d3-dfca3ce1152c/apps/6831790531/testflight/groups/5bfefb85-8274-4d40-a4f8-0b34d935159c) с ръчно добавяне на сборки. Отделната задължителна iOS Simulator проверка на PR #87 не премина при отваряне на Settings поради изтекло време за преминаване на приложението във фонов режим. Подписването, качването и тестът на телефон предстоят след успешни проверки на готовия main и настройването на Apple ключовете.

Apple показва приет Developer Program License Agreement и активни Paid Apps и Free Apps договори. Запазени са английски текстове за двата магазина. Apple 1.0 е с ръчно пускане и категории Games, Puzzle и Casual. Категорията Puzzle в Google Play е запазена и чака подаване за преглед. Първият пакет кредити и първият свят имат бележки за App Review. Снимките на финалната версия, review достъпът до покупките и декларациите за privacy и възраст остават преди подаване.

**Play Billing staging · 8 ноември 2026 г.** Play Console потвърди финансовите права и управлението на поръчки за служебния акаунт само за Crystal Path. Staging потвърди точните два разрешени акаунта и 18 Android SKU. Supabase запази purchase флага на false и не приложи тестовото разгръщане през редактора. Няма успешно сверяване в provider_sync. Предишният резултат 401 permissionDenied остава последният потвърден отговор на Google за проверката на анулирани покупки. Android тестовото плащане чака нова успешна проверка от staging.

**Apple подписване · последваща проверка на 8 ноември 2026 г.** Новият Apple Distribution сертификат и профилът `Crystal Path Infinity TestFlight` съвпадат с `C97T2A5255.com.georgicole.crystalpath.infinity`. Локалната проверка на P12 и подписания профил мина. Шестте signing и upload secrets са потвърдени в GitHub средата `cpi-ios-testflight` с достъп само от `main`. Отделният Developer ключ за качване върна HTTP 200 за точния App Store Connect запис. Подписаното изпълнение чака поправките и успешните проверки на `main`.

**Първи подписан опит · 8 ноември 2026 г.** [Run 42524517339](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42524517339) стартира за проверения `c4c99f3` след сливането на поправките. Сертификатът и профилът се инсталираха успешно. macOS Bash спря преди архива при разширяване на празния списък с аргументи. Задължителните архивни аргументи вече са част от списъка и в подписания режим. Следва ново подписано изпълнение от проверения `main`.

**Android staging · последваща проверка на 8 ноември 2026 г.** Staging върна HTTP 200 за Google OAuth и анулираните покупки. Умишлено невалидната разписка получи HTTP 400 `invalid`. Работникът записа успешно сверяване `google.staging` без грешки. Покупките са включени само с потвърдените 18 Android SKU, за двата одобрени тестови акаунта. Първата покупка и начисляването в играта предстоят на телефон с тестов метод на плащане. [Android Internal Testing](https://play.google.com/apps/internaltest/4701734144458822899) · [Google Play Billing тестове](https://developer.android.com/google/play/billing/test).

**Apple Sandbox · последваща проверка на 8 ноември 2026 г.** Потвърдени са 18 SKU и типовете им в Apple каталога. Отделният In-App Purchase ключ е в Crystal Path Supabase staging. Apple прие ключа за Sandbox history и отхвърли невалидната тестова транзакция. Sandbox Server URL V2 е записан за staging gateway. Apple SDK в Supabase отказа ES256 при сверяване. Истинският подписан Apple `TEST` пакет мина с проверка на сертификатите и OCSP в Node, а същият пакет се провали в staging заради липсващи методи на `X509Certificate`. След проверката върнахме Android-only каталога, за да остане достъпен Android тестът. iOS покупките чакат съвместима сървърна проверка и тест на телефон. [Доклад за Supabase runtime](https://github.com/supabase/edge-runtime/issues/761).

Временният 24-часов Supabase токен беше ограничен до Edge Functions и Edge Function Secrets на Crystal Path staging. Диагностичните функции са премахнати, а API потвърди отнемането на токена.

**Автоматично Google сверяване · 8 ноември 2026 г.** След първоначалната ръчна проверка срокът на сверяването изтече. Cloudflare отчете, че минутният cron спира преди заявката заради неподдържания режим `redirect: 'error'`. Worker-ът използва `manual` и отхвърля неуспешния HTTP отговор. Версия `f938c86c-bf3f-4ea9-bbca-c57d40b32ad5` е внедрена само в Crystal Path staging. Две поредни автоматични изпълнения обновиха `google.staging` без ръчно извикване. Android и iOS preflight заявките върнаха HTTP 204. Временното логване е изключено. [Режими за пренасочване в Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/request/#properties).

#### Apple Sandbox проверка · 9 ноември 2026 г.

Staging `cpi-live` включва потвърдените 18 Apple и 18 Google Play SKU за двата одобрени пълнолетни акаунта в България. Отделният `crystal-path-staging-apple-verifier` изпълнява Apple SDK 3.1.0 с Apple Root CA G3 и онлайн OCSP. Използва се GET форматът на RFC 5019 за OCSP, защото Apple отказа POST от Workers. Проверка на подписа и срока на отговора остава в Apple SDK. Apple In-App Purchase ключът остава в staging Supabase и подписва Apple API заявките чрез P-256 Web Crypto.

- Worker версия `bcfbb105-4a2f-4b28-b7e1-15b47c698186` прие истински Sandbox `TEST`, отхвърли променен подпис и отказа достъп без отделния сървърен ключ.
- Apple Sandbox отчете `SUCCESS` за нова подписана `TEST` нотификация към staging gateway. След обновяването периодичната задача обнови `apple.staging` и `google.staging`. Гостът получава `account_required`.
- В 11:56 ч. българско време TestFlight `0.1.0 (17)` записа една потвърдена Sandbox доставка на Rockmallow. Staging портфейлът потвърди собствеността. Това покрива checkout и доставка на свят. Консуматив и Restore Purchases чакат отделна проверка.
- Съхранявай различен 32-byte hex `CPI_APPLE_SANDBOX_VERIFIER_KEY` в Worker и staging Supabase. Разгърни `backend/apple-receipt-verifier/wrangler.json` с Wrangler 4.158.0, потвърди Apple `TEST`, после качи `cpi-live` в staging и потвърди успешното сверяване. При нужда върни потвърдения Android-only каталог. iOS checkout изчаква прясна Apple синхронизация, а Android проверява своята независимо.
- За приемане отвори `0.1.0 (17)` или по-нова вътрешна TestFlight сборка от България и влез с одобрения Crystal Path email. В The Vault купи свят и консуматив и провери доставката след повторно отваряне. Провери Restore Purchases за света и че повторна обработка не добавя втори комплект ресурси. Apple изпълнява TestFlight покупки в Sandbox. [Apple TestFlight покупки](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight).

<a id="testflight-build-35"></a>

**TestFlight 0.1.0 (35) · 9 ноември 2026 г.** В 21:59 ч. българско време App Store Connect показа активна вътрешна сборка и 18 продукта с локализация, цена и наличност. Сверяването в staging беше успешно. Ledger-ът съдържаше една потвърдена доставка на свят, който остава отключен, и нула iOS доставки на консумативи.

Впиши се с одобрения staging акаунт в сборка 35. От The Vault отвори заключен свят и направи тестова покупка. В Essentials избери малък пакет, например три подсказки, и провери еднократното начисляване. Използвай Restore Purchases със същия акаунт и потвърди, че светът остава достъпен, а ресурсите не се начисляват отново. Това са проверки на iPhone с Apple Sandbox. [TestFlight покупки](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/).

### 9. Разгърни сървъра и периодичните задачи

**Проверено в staging на 7 ноември 2026 г.** Supabase CLI `3.0.0` потвърди, че след качването няма чакащи миграции. Ограниченият DB вход може да приеме `service_role` и не е член на `postgres`. Всичките 45 таблици в `cpi_private` имат принудително RLS. `cpi-live` използва сертификата от Supabase, а сървърът отхвърли директна неподписана заявка за вход.

Ключът `crystal-path-staging-otp` в Resend е ограничен до изпращане от `auth.kolequant.xyz` и е записан в staging Edge secrets. Подписаният вътрешен тест с адрес от `resend.dev` провери доставяне, отхвърляне на грешен код, правилен код, размяна за сесия и оттегляне на сесията. При отваряне на staging gateway премахнахме тестовата държава от политиката. Публичната проверка през gateway връща `unavailable`, докато се определи достъп за тестерите.

[Staging gateway](https://crystal-path-staging-api.kolequant.workers.dev) е разгърнат като отделен Cloudflare Worker на безплатния адрес `workers.dev`, версия `ddd86cc2-deeb-4d51-add9-84bcc38fbdc5`. Минутният cron е регистриран. Подписаният му handler беше извикан отделно срещу staging и завърши успешно. Временното Wrangler разрешение за този deployment е прекратено. Локалната конфигурация на Worker-а е в `%LOCALAPPDATA%/Kolequant/CrystalPath/Staging/Gateway`.

Последователност за останалите настройки и за възпроизводим следващ deployment.

1. Провери staging конфигурацията с `node --experimental-strip-types backend/scripts/live-readiness.mjs`. Докато липсват настройки, проверката показва само имената им.
2. Свържи Supabase CLI с точния нов проект, прегледай migration dry run и приложи миграциите. Не ползвай `--include-all` за заобикаляне на несъвпадаща история.
3. Създай `cpi_runtime`, попълни неговата DB връзка и повтори проверката с `--online`.
4. В частния staging файл сложи `CPI_LIVE_ENABLED=true`, запазвайки ads/purchases флаговете изключени, докато се подготвят съответните услуги. Генерирай списъка за качване с `node --experimental-strip-types backend/scripts/export-live-secrets.mjs`.
5. Качи избраните secrets чрез `supabase secrets set --env-file backend/.env.edge.upload.local --project-ref <точният staging ref>` и разгърни **`cpi-live`** с `supabase functions deploy cpi-live --project-ref <същият ref>`. Вграденият `cpi-api` остава затворен.
6. Разгърни `backend/gateway/worker.mjs` в Cloudflare със собствен HTTPS адрес, например `api.crystalpath.kolequant.com`, чрез собствена конфигурация по `wrangler.example.toml`. Задай точния `CPI_EDGE_URL` и двата частни Worker secrets — `CPI_GATEWAY_KEY` и `CPI_WORKER_KEY`. Подписаните метаданни идват от [Cloudflare `request.cf`](https://developers.cloudflare.com/workers/runtime-apis/request/), а не от изпратена от клиента държава.
7. Включи приложения минутен cron. Той изпраща недоставени кодове, довършва потвържденията на покупки, проверява refund историята и довършва изтриванията. Провери успешното му изпълнение и настрой известяване за неуспехи в Cloudflare.
8. След ключовете за покупките включи server purchase флага в **staging**, повтори качването/deploy и изчакай успешни Google/Apple синхронизации. Нови checkout заявки остават затворени при остаряла или неуспешна синхронизация. Възстановяването на вече платено остава отделен път.

Сървърното потвърждение в Google започва след кратък прозорец за нормалното native завършване. Не consume-ваме ресурс преди доставка. След потвърждение частният purchase token се премахва от задачата. [Google Voided Purchases](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list) и [Apple notification history](https://apple.github.io/app-store-server-library-node/classes/AppStoreServerAPIClient.html) осигуряват периодично наваксване. Google RTDN push не е свързан; той не се представя като работеща интеграция.

### 10. Свържи рекламните потвърждения и privacy съобщенията

В AdMob използвай съществуващите записи:

| Платформа | App ID | Rewarded Continue |
| --- | --- | --- |
| Android | `ca-app-pub-9243398419153145~7433632761` | `ca-app-pub-9243398419153145/5387868010` |
| iOS | `ca-app-pub-9243398419153145~7303584917` | `ca-app-pub-9243398419153145/4563926844` |

1. В Rewarded Continue настрой reward amount **1**, reward item **continue**.
2. Callback URL е **`https://api.crystalpath.kolequant.com/cpi/rewards/ssv`** при избрания по-горе домейн. Ако избереш друг, използвай него навсякъде.
3. При Verify URL остави User ID празно и сложи Custom data **`00000000-0000-4000-8000-000000000000`**. Отговорът `verified-no-reward` проверява подписа и адреса, но не дава SP и не създава играч/награда. После запази същия callback URL. [Официалните AdMob стъпки](https://support.google.com/admob/answer/9603226?hl=en-GB).
4. Настрой нужните Privacy & messaging/UMP съобщения и test devices. Не гледай/кликай собствени реални реклами за тест. Демо рекламите доказват SDK поведението, но не доказват реален SSV callback; за веригата използваме подписана console проверка и staging intent тест, без да записваме тестови резултати в production.
5. Одобри SDK inventory, затварянето на рекламата и country rollout редовете. Те по подразбиране са изключени. Подготвеният вариант използва G съдържание, child-directed/under-age-of-consent флагове и неперсонализирани реклами за всички разрешени контексти; не разчита на недоказано твърдение „възрастен“.
6. Свържи приложенията с правилните store записи, публикувай точния предоставен от AdMob `app-ads.txt` запис на developer домейна и проследи app verification/review. Първоначалното Requires review/Limited ad serving не е премахнато от кода.

Не добавяй mediation мрежи без отделен SDK/privacy преглед. Операторските настройки са описани в `backend/live-operations.example.sql`; нормалният сървърен вход няма право сам да ги одобрява.

**SSV проверка · 7 ноември 2026 г.** AdMob Verify URL мина за Android и iOS срещу staging Edge адреса. Конзолата подписа тестовия идентификатор `1234567890`, `reward_amount=1` и `reward_item=Continue`. За него в staging има отделен изключен договор с Android demo inventory, а резервираният nonce може да върне само `verified-no-reward`. Двата callback адреса в AdMob не са записвани. Следва тест на показване, затваряне и доставка на награда на телефон с тестова реклама.

**Проверка през staging gateway · 8 ноември 2026 г.** AdMob потвърди подписаните Verify URL заявки към Cloudflare staging за Android и iOS. Резервираният тестов nonce не начислява награда. И двата app записа още показват Requires review и Limited ad serving до свързване на публикувана store страница. В AdMob е потвърден редът `google.com, pub-9243398419153145, DIRECT, f08c47fec0942fa0` за app-ads.txt. Публичният DNS за kolequant.com върна NXDOMAIN. Работещият публичен developer сайт и адресът за поддръжка остават част от подготовката за рилийз.

### 11. Публични страници, управление на профил и Apple notifications

- **9 ноември 2026 г.** Публичният пакет на GitHub Pages включва [политика за поверителност](https://georgi-cole.github.io/crystal-path-infinity/privacy.html) и [поддръжка](https://georgi-cole.github.io/crystal-path-infinity/support.html) на английски и български. Проверявай публичните адреси след deploy. Страниците посочват Innovation Creativity Opportunities Ltd и `support@kolequant.xyz`. Настройките в играта водят към тях.
- За Google Play account deletion използвай [публичния раздел за заявка за изтриване](https://georgi-cole.github.io/crystal-path-infinity/support.html#account-deletion). Той е достъпен без вход и позволява заявка по имейл. [Google: account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- Преди пускане на профилите провери и самостоятелното изтриване в account секцията и в `account.html` с production API адреса и allowed origin.
- В App Store Connect за Server Notifications V2 посочи `https://api.crystalpath.kolequant.com/cpi/commerce/apple-notifications`, а за sandbox — отделния staging адрес. Провери Apple test notification и последващите refund/reversal сценарии.
- При изтриване личният профил, игровите данни и сесиите се заличават. Минималният финансов запис с произволен billing alias остава, за да не се получава една покупка повторно. Възстановяването е към същия акаунт; автоматично прехвърляне на покупки към нов акаунт след изтриване не е реализирано. Това поведение и сроковете за финансовите записи трябва да са ясно описани в политиката/потвърждението преди публично пускане.

### 12. Приемане на телефони и финално включване

Преди рилийз трябва да минем с истинските конфигурации:

1. Имейл код, повторен код, грешен код, повторно влизане, logout и друг акаунт на същия телефон.
2. Реклама: UMP, отказ, затваряне, липса на налична реклама, background/return, късен или повторен подписан callback, запазен и възстановен опит. Симулация или demo видео не доказва реална награда.
3. Покупка в Play internal testing/TestFlight: успешно плащане, отказ, pending плащане, затваряне на приложението, автоматично довършване при отваряне на магазина, повторно Restore, refund, отнет свят и refund reversal.
4. Реално изразходване на SP/подсказка/кредит, общият 200 SP бюджет, последните пет продължавания само с кредит и assisted резултатът извън официалната класация.
5. Пълен export с повече от една страница, изтриване през приложението и `account.html` и обработване на заявка, получена на публичния адрес за поддръжка. Провери, че production показва само действителните възможности.
6. Подписани сборки, правилни store декларации за данни/възраст/реклами, работещ support адрес и публични правила за поверителност/условия.

**Основна покупка и Restore · 12 ноември 2026 г.** Собственикът потвърди успешно преминаване на покупка и Restore в Android `1.0.1 (59)` и TestFlight `1.0.1 (62)`. Устройствата, SKU и идентификаторите на транзакциите не са записани. Това покрива само докладвания успешен поток; отказ, pending, refund/reversal, повторно начисляване на консуматив и реално изразходване остават за приемане. След обновяването на staging Google receipt ключа редовете `google.staging` и `apple.staging` са наваксали и завършили успешно; production не е променян. Детайлният запис е в [CPI-044](decisions/CPI-044-campaign-full-services.md#tester-reported-purchase-and-restore-acceptance--12-november-2026).

Едва тогава включваме production backend, одобрените country/SDK/operations редове и клиентските флагове за реалните услуги. Наличната unsigned preparation сборка остава с изключени live услуги; нейният предпазен механизъм не се премахва. Новите официални опити ползват `infinity-v11-live`; започнатите v1 опити запазват старите правила и отделното възстановяване.

## Проверки и текущи ограничения

Синтетичните SQL/SSV/receipt тестове и native compile/startup проверките се записват отделно от реалното приемане. Източникът е [техническото решение](decisions/LIVE-SERVER-2026-11.md). Конкретни резултати и CI адреси се добавят след приключване на проверките, без да се променят историческите резултати.

**Проверен код `8628bba` · 7 ноември:** [всички CI проверки са успешни](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42326459276) — 688 mobile, 310 core и 185 server теста; независими конкурентни PostgreSQL заявки; компилация/стартиране на Android и iOS с включени SDK пакети. Снимките са прегледани. Това са development тестове и синтетични provider събития; реални имейли, награди и плащания не са активирани.

Нужно остава действителното настройване на проектите, DNS/mail, store продукти и ключове, country/privacy преглед, родителски/assurance доставчик за контекстите, които го изискват, и реалното приемане на телефони. Тези задачи не се заменят от успешен build.

## Гост реклами в мобилните сборки

**Кандидат за вътрешен тест · 9 ноември 2026 г.** При `rewarded_ads_test=true` TestFlight включва официалната демонстрационна rewarded единица на Google за гостите. За Android тестов APK или iOS тестова сборка в staging използвай `CPI_NATIVE_ADS=true` при генериране и `VITE_GUEST_REWARDED_ADS_TEST=true` при web build. Гост тестът използва локалния опит, докато одобренията за ranked тестови акаунти принадлежат на отделния сървърен поток.

На устройството отвори **Play** като гост, премини ред и изчакай загуба. Провери, че ранно затваряне на рекламата запазва броя. Изгледай демонстрационна реклама и потвърди връщане на същия ред. Повтори до десет награди в един опит. Първите пет задават 200 SP, следващите пет 150 SP. След десетата награда следващата загуба приключва опита. Запиши устройството и номера на сборката. Автоматичните тестове проверяват правилата и записа на наградата, а устройството проверява действителното показване и callback-а на SDK.

**Потвърден iPhone тест · 10 ноември 2026 г.** Собственикът потвърди десетте продължавания като гост в TestFlight 0.1.0 (42) от ревизия 50e1df6. Публичният пакет на GitHub Pages използва профила за играчи с изключени live услуги. Проверката на пакета отхвърля демонстрационните рекламни идентификатори, менюто за тест на мистерии и симулирания портфейл. Отделният QA пакет се изгражда за проверка.

Публичната мобилна конфигурация изисква отделна rewarded единица за всяка платформа от Crystal Path AdMob акаунта. При одобрен release задай идентификатора ѝ в `VITE_GUEST_REWARDED_AD_UNIT_ID` за съответната native сборка, остави `VITE_GUEST_REWARDED_ADS_TEST` изключен и включи native SDK. Гост единицата използва Google инвентар без mediation и локалния callback. Запази SSV единицата и сървърната проверка за официалните опити. Провери ограниченията за неперсонализирани реклами, неизвестна възраст и разрешеното рекламно съдържание за публичната аудитория преди активиране.

**Живи единици за гости · 10 ноември 2026 г.** В AdMob са създадени две отделни rewarded единици за Crystal Path. Всяка дава едно продължаване. И двете използват Google инвентар и оставят приложението да налага квотата от десет награди. AdMob показва без лимит на ниво единица и приложение. Гост потокът обработва локалния callback за спечелена награда. Сървърният SSV поток има свои единици.

| Платформа | Производствена единица за гости |
| --- | --- |
| Android | `ca-app-pub-9243398419153145/2271422535` |
| iPhone | `ca-app-pub-9243398419153145/8645259199` |

За сборка за публично мобилно разпространение включи `CPI_NATIVE_ADS=true` и `VITE_GUEST_REWARDED_ADS_LIVE=true`. Една компилация на web активите избира отделния идентификатор на всяка платформа. Ръчният `VITE_GUEST_REWARDED_AD_UNIT_ID` приема само един от двата регистрирани идентификатора за съответната платформа. Използвай само един от двата начина за избор. Остави флага за демонстрационни реклами изключен. iPhone изисква Mac за Xcode компилацията.

```sh
export CPI_NATIVE_ADS=true
export VITE_GUEST_REWARDED_ADS_LIVE=true
npm run build:production
npm run native:generate -- --platform android --environment production
npm run native:generate -- --platform ios --environment production
```

Двете AdMob приложения показват Requires review и Limited ad serving. Публикуваните store записи трябва да бъдат свързани и прегледани. Точният запис на издателя е наличен в [app-ads.txt на developer сайта](https://georgi-cole.github.io/app-ads.txt). Черновата в App Store Connect използва [публичния сайт на играта](https://georgi-cole.github.io/crystal-path-infinity/) в Marketing URL. В Google Play полето Website вече води към поддръжката на същия хост. [AdMob app readiness](https://support.google.com/admob/answer/10564477).

### Staging Google sign-in и Campaign interstitial одит · 12 ноември 2026

Собственикът съобщава, че rewarded рекламите работят на телефон; платформата и build number не са уточнени. За Google входа staging логът показва `POST /identity/mobile/begin` 200 в 13:35:12 (София) и Google callback 503 в 13:35:17. Read-only проверката потвърди migration `20261111000100` и наличието на `account_mobile_identity.response_encrypted`; точната причина за callback грешката не е видима в запазения лог. Това не е успешно приет Google вход и не е основание за нов телефонен build.

Campaign завършването в текущия source не показва interstitial и `publisher.ts` няма interstitial единици. Свързан е само rewarded пътят. Interstitial след завършен Mission остава предложена позиция с честотен лимит; не е конфигурирана услуга. Състоянието е записано и в [CPI-044](decisions/CPI-044-campaign-full-services.md).

**Последваща реализация · 12 ноември 2026 · CPI-044 working branch:** iOS/Android Campaign interstitials са свързани в клиента за services build. Първите две първи победи са без реклама; после най-много всяка трета победа, до две реклами за отворения процес; replay, неуспех и последната мисия са без interstitial. Отказ/липса/грешка не блокира връщането към картата. Services build използва само официалните demo IDs: Android `ca-app-pub-3940256099942544/1033173712`, iOS `ca-app-pub-3940256099942544/4411468910`. В AdMob са създадени и живите единици Android `ca-app-pub-9243398419153145/4558989155` и iOS `ca-app-pub-9243398419153145/5066255614`; Google предупреждава, че новите единици може да чакат до час. Двете приложения все още изискват review и показват Limited ad serving; това не е доказателство за доставена реклама. Преди production показване свържи публикуваните store listings и завърши AdMob прегледа.

Server branch-ът коригира диагностиката за mobile callback: безопасен event записва фиксирания етап/status/error class и само валиден SQLSTATE; няма OAuth code/state, email, provider body или error message. Тестовете доказват правилния `410 expired` за изтекъл handoff и липса на тайни в log fixture-а. Това не е Google sign-in fix: root cause на предишния staging 503 остава неизвестен, локално няма staging deploy credential, а code change още не е внедрена. Нужен е staging deploy и след това реален вход на телефона. Предишният стар запис по-горе е исторически и се заменя само за състоянието на interstitial source, не за приемането на sign-in.
# Offline Campaign TestFlight preparation · 11 November 2026 · CPI-042

App Store Connect was inspected after sign-in and showed 1.0.0 (45) in internal testing. This candidate advances the marketing version to 1.0.1; the feature playtest stays 0.7.4. A new workflow counter will identify the uploaded build. This is a candidate version, not a submitted public App Store release.

The owner requested the reviewed offline Campaign build on TestFlight, including an external tester. The new explicit `campaign_beta=true` path builds `campaign-beta` with live services, ads and purchases disabled and free local claims. Optional `external_beta=true` makes that beta eligible for external review; normal staging uploads remain internal-only. Exact-current-main source checks, full iOS simulator evidence, signing validation and archive/source manifest checks remain mandatory. This preparation is not evidence of an uploaded, processed or approved build. Record the actual build number, source, upload and tester status after execution. Do not put tester email addresses or credentials in this document or public workflow inputs.

Apple distinguishes [internal-only builds](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers) from builds eligible for [external testing and beta review](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers). Use external tester invitations rather than granting App Store Connect developer roles. No production release, real purchase, new server rollout or changed economy is introduced by this offline beta.

## 11 November 2026 · CPI-043 · Adventure catalog registration

The current [product mapping, prices and console status](decisions/CPI-043-adventure-store-catalog.md) supersedes earlier reference prices for future offers. Thirteen new products supplement the original eighteen; three existing resource SKUs are reused. New catalog entries stay draft/inactive until purchase fulfilment and restoration are tested. The current offline TestFlight 1.0.1 (54) continues simulated purchases. Google creation is initially blocked by the active Android build's missing Billing permission; the existing hint pack price reduction to final Bulgaria €1.49 saved successfully. Final verification is recorded in the detailed document. No server SKU allowlist or production purchase switch is expanded by this registration.

**CPI-043 · verified continuation, 11 November:** Apple now contains 31 Prepare for Submission drafts, including all 13 new products; the existing 10-hint SKU is €1.49 in Bulgaria. To clear Google's creation block while retaining sign-in, Android internal testers received 1.0.1 (56) from the existing production-login preview lineage with the locked Billing SDK included. It retains Apple/Google/email login and live guest ad configuration; purchases/rankings remain disabled. It is not a public release or the Campaign beta, and does not merge PR108. Google creation is enabled again; final catalog status is recorded in the detailed CPI-043 document.


**CPI-043 · final catalog save, 11 November:** Google now shows 31 products after the reviewed batch was applied: 13 new Draft buy options and the original 18 active options. Price decreases were applied without changing product identities or release availability. Apple also contains 31 draft records. Registration does not enable real purchases; fulfilment, restoration and sandbox acceptance remain prerequisites. See CPI-043 for exact prices, IDs and build evidence.

### Staging diagnostics deployed · 12 November 2026, 14:35 Europe/Sofia

The saved Supabase CLI login was available through its credential store. After TypeScript and Deno checks (3 smoke tests passed), the updated `cpi-live` was deployed only to Crystal Path Infinity Staging (`yfntwewvfsvljxcztoyp`). Both Google and Apple synthetic eligibility → begin → cancellation callback → completion ceremonies returned 200 / `cancelled`. A second Google probe with a full provider-shaped query also returned 200 / `cancelled`. These probes create no account and do not establish successful provider authentication. The owner reports Apple also fails in the installed app, despite earlier success. A real Apple/Google phone retry is pending against the refreshed service; no root-cause or complete-login success claim is made. Existing phone builds can retry sign-in without reinstalling. Campaign interstitial changes still require a new distributed client build.

### Confirmed callback transport fix · 12 November 2026, 14:44 Europe/Sofia

Fresh safe diagnostics identified the Google callback rejection at gateway verification. A synthetic provider callback using `%20` for query spaces reproduced HTTP 503; Supabase ingress serialized the equivalent spaces as `+`. The fix allows equivalent ordered decoded query fields only on `/identity/mobile/callback` while authenticating the original Worker-signed bytes. Field changes still fail authentication; SSV and every other route retain exact byte comparison. Seven gateway tests, 13 server identity tests and Deno checking passed. Deployed to isolated staging only. The exact `%20` probe now returns 200 / `cancelled` for both provider handoffs. This establishes the transport fix, not authenticated Apple/Google phone acceptance. The owner was asked to retry build62 without reinstalling; Apple completion still needs independent acceptance.
### Direct app return and remaining provider acceptance · 12 November 2026

The owner supplied a literal HTML return page from Google. Supabase was serving the HTML as plain text, so its script could not reopen the game. Mobile callbacks now return HTTP303 directly to the existing registered app scheme, carrying only the validated opaque state. Hosted cancellation probes verify the exact Location for Google and Apple; 21 focused identity tests and full 225-test server suite passed before the bounded diagnostic follow-up. This staging update is available to installed build62.

The next phone report remains unsuccessful for both providers. Apple reaches the token exchange and receives HTTP400; Google has a successful callback redirect but no corresponding completion call in the inspected attempt. Additional diagnostics read at most 4KiB of a rejected provider body and retain only an allowlisted OAuth error identifier, never its message or credentials. A temporary staging-only function guarded by the existing worker key tested both configured clients with an intentionally invalid code: both returned invalid_grant, with no invalid_client response. It created no account, used no user proof, and was deleted immediately afterward. This narrows credential diagnosis; it does not prove valid-account sign-in. A full app restart and fresh phone retry are pending. Production has not been changed.
### Hosted ES256 signing fault and OS return recovery · 12 November 2026

The fresh Apple failure was classified as invalid_client. Public-key fingerprints confirmed the staged native/web PEMs represent the same registered key (their text digests differ because of formatting); the Developer portal confirms its Crystal Path primary-app scope. A protected staging runtime probe then reproduced the actual defect: Node-compatible sign() ignored ieee-p1363 and emitted a 71-byte DER signature, which Web Crypto rejected. The implementation now signs Apple client secrets with Web Crypto ECDSA. A hosted probe produced a 64-byte signature and independently verified it successfully. Updated cpi-live is deployed only to staging. All temporary worker-key-guarded probe functions were deleted; no user proof or account was used. An intentionally invalid authorization code returning invalid_grant was insufficient to establish credential correctness and is superseded by this signature evidence. Fresh Apple phone acceptance remains pending.

The client update also recovers from a rejected OS browser-return bridge by attempting exactly the existing server completion with the app-held flow token and eligibility permit. The server must already hold a provider proof for that flow and still verifies it; an OS error authorizes nothing. Explicit cancellation and an aborted screen never complete or create an account. Tests cover recovery with a verified server reply, refusal without a proof, and aborted/explicit cancellations. This Google recovery requires a new distributed phone client; build62 cannot gain this client change from the staging deployment. Seven client handoff and eight native-provider tests passed, including a cryptographically verified 64-byte Apple client-secret signature. The owner-reported failures after a full app restart remain historical acceptance failures until a new successful phone test is recorded.
### Apple phone acceptance and streamlined provider entry · 12 November 2026

The owner successfully signed into build62 using Apple after the hosted ES256 fix. This confirms that tested Apple happy path; Google return recovery remains a new-client acceptance item. The observed email code was the existing-account first-link check. It is not an Apple/Google login requirement and should not recur after that identity is attached.

The next client preserves the selected provider through eligibility and opens it automatically when the check succeeds, removing the repeated provider-button tap. First-link codes are requested automatically once after a verified provider reply identifies an existing account, with a manual resend fallback. The message explains the one-time connection and that subsequent provider logins go directly through. Provider buttons are hidden while the existing-account code form is active. Exact age is still cleared after screening, and eligibility/account-link verification is unchanged. Account intake, gateway and handoff suites passed 21 tests; workspace typecheck passed. New phone presentation acceptance remains pending distribution.

**12 November 2026 · Internal distribution completed.** PR126 is merged. Android `1.0.1 (60)` is Active / Available to internal testers; TestFlight `1.0.1 (69)` is VALID / INTERNAL_ONLY / IN_BETA_TESTING with the existing internal group assigned, OS-only encryption confirmed and test notes saved. Exact-main full-service native checks passed in run `43229415213`; signed iOS upload passed in `43231923396`. Both builds use staging accounts, native store sandbox checkout and demonstration ads. New-client Google, simplified provider entry and Campaign completion ads still need phone acceptance; public production and public submissions are unchanged. See the [dated distribution evidence](decisions/CPI-044-campaign-full-services.md#signed-test-distribution-and-native-integration-checks--12-november-2026) for source identities, launch limits and test instructions.
