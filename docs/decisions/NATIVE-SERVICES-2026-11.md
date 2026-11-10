# Native услуги · подготовка и активиране

**Следващ етап · 7 ноември 2026:** [Новият сървърен кандидат](LIVE-SERVER-2026-11.md) добавя OTP/session issuer, self-service, v11 spending, refund/acknowledgement workers и отделен `cpi-live` host. Списъците по-долу описват предходната native подготовка и не са доказателство за активирани live услуги. Актуалните оставащи настройки и граници са в [release ръководството](../RELEASE_SERVICES_SETUP_BG.md). Публичните ID, предишните CI резултати и неизпълнените реални приемателни тестове се запазват.

Актуално към **7 ноември 2026**. Бранч: `codex/mystery-pacts`. Този документ разграничава реализирания код от настройките, внедряването и приемането с истинските платформи. **Не е удостоверение за готов рилийз.**

**Последваща staging проверка · 7 ноември.** AdMob Verify URL върна успех за двата Crystal Path блока срещу отделния `cpi-live` staging host. Google изпрати подписаната конзолна заявка с резервирания nonce, без награда. Миграциите вече са приложени в staging. Google Play One-time products изисква качена сборка с Billing, а iOS каталогът е празен. [Текущи стъпки за приемане](../RELEASE_SERVICES_SETUP_BG.md).

**Последваща Android проверка · 7 ноември.** Подписаната `0.1.0 (1)` от `bf7f804` е активна в Crystal Path Internal Testing. В Google Play са активирани 18 еднократни продукта с предложените SKU. Двата одобрени акаунта са добавени към канала и License testing. Тази сборка включва Billing и използва staging API с изключени реклами. Проверен е статусът в Play Console. Приемането на телефон, сървърната проверка на разписката и начисляването на покупката остават отворени. [Ръководство за Android теста](../RELEASE_SERVICES_SETUP_BG.md#8-създай-истинските-продукти-в-двата-магазина).

**Staging съвместимост · 8 ноември 2026 г.** Google сверяването е успешно и Android `0.1.0 (1)` е готов за първата покупка с тестов метод. Apple SDK `3.1.0` запазва проверките за подпис, верига и OCSP. Изпълнението в Supabase staging не поддържа нужните X.509 операции, потвърдено със същия подписан Sandbox `TEST` пакет, който премина в Node. iOS checkout остава затворен. [Резултати от staging](../RELEASE_SERVICES_SETUP_BG.md#ios-testflight-в-github-actions).

**Staging съвместимост · 9 ноември 2026 г.** Apple SDK 3.1.0 проверява iOS Sandbox транзакции и нотификации в отделен Cloudflare Worker с Apple Root CA G3 и онлайн OCSP. Supabase държи Apple API ключа и подписва заявките с P-256 Web Crypto. Сървърът сверява оригиналната и актуалната транзакция и записва доставката само за съответния акаунт и SKU. Apple потвърди доставка на подписан `TEST` пакет, а автоматичният cron обнови Apple и Google refund историята. Каталозите и checkout се проверяват отделно за всяка платформа. В TestFlight `0.1.0 (17)` е потвърдена една Sandbox доставка на Rockmallow за вписания тестер. Консуматив и възстановяване остават за проверка. [Разгръщане и проверка](../RELEASE_SERVICES_SETUP_BG.md#apple-sandbox-проверка--9-ноември-2026-г).

## Регистрирани публични идентификатори

Собственикът потвърди следните записи на 7 ноември. Това са публични идентификатори, не тайни ключове. Единственият източник за приложението е `apps/mobile/config/publisher.ts`.

| Услуга | Запис |
| --- | --- |
| Android package / Apple bundle | `com.georgicole.crystalpath.infinity` |
| Google Play Console | `4972812942109567422` · чернова |
| App Store Connect | `6831790531` · Prepare for Submission |
| Apple Team | `C97T2A5255` |
| AdMob Android app | `ca-app-pub-9243398419153145~7433632761` |
| AdMob iOS app | `ca-app-pub-9243398419153145~7303584917` |
| Rewarded Continue · Android | `ca-app-pub-9243398419153145/5387868010` |
| Rewarded Continue · iOS | `ca-app-pub-9243398419153145/4563926844` |

По данни на собственика остават статутът на търговец в Google Play и приемането на актуализирания Apple Developer Program License Agreement от Account Holder. AdMob показва Requires review / Limited ad serving. Създаването на запис не активира доставка на реклами, плащане или публикуване.

## Реализирано в този бранч

- Пиннати native пакети: `@capacitor-community/admob` **8.3.0**, `@capgo/native-purchases` **8.9.6**. Пряка връзка с Google Play Billing и Apple StoreKit, без RevenueCat.
- Google SDK: Android **25.4.0**, iOS **13.11.0**, iOS UMP **3.1.0**. Отделен SPM lock за рекламния вариант. Native проектите се генерират възпроизводимо; инсталиран пакет сам по себе си не го включва в приложението.
- Адаптерът за реклами изисква пресен сървърен permit и Google UMP, преди да инициализира SDK/зарежда реклама. Няма рекламен request при стартиране. Няма mediation adapters. Премахват се Android AD_ID и трите ACCESS_ADSERVICES разрешения; няма ATT prompt. Това не означава, че рекламният SDK не обработва данни: декларациите за данни и приемането на физически устройства остават задължителни.
- Компилираният рекламен Android вариант добавя ACCESS_NETWORK_STATE, WAKE_LOCK и FOREGROUND_SERVICE чрез Google ads-api/WorkManager; billing вариантът добавя com.android.vending.BILLING. Merged-manifest blame е проверен в първото CI изпълнение. Точният allowlist е ограничен до включените компоненти; обичайният вариант остава само с INTERNET и app-scoped signature permission. AD_ID/Privacy Sandbox разрешения не се допускат и в SDK варианта.
- Локалният `CpiRewardedAds` bridge зарежда веднъж, после поставя само непрозрачния сървърен nonce точно преди показване. Няма имейл/Auth UUID в Google custom data. Използва съществуващия CPI-029 поток и проверената SSV награда. SDK `earned` callback **не** дава SP.
- При грешка в показването се освобождава екранът; стар callback не може да завърши чужда реклама. Прекъснатото зареждане изхвърля само собствената предварително заредена реклама.
- Native checkout ползва локализираната цена от магазина. Няма превръщане на `test.*` в реален SKU. Сървърът задава разрешения каталог. Няма клиентски quantity/цена/баланс.
- Преди касата server begin потвърждава точния SKU: стара клиентска оферта не може да отвори плащане за заменен продукт. Restore не зависи от налична цена/getProducts. Сървърът връща проверения тип за finish/consume; оттеглените SKU се пазят неизменно с `available: false` и продължават да се проверяват, без да се предлагат за ново плащане. При промяна на количеството/типа създаваме нов SKU и запазваме стария mapping за възстановяване.
- Автоматичното finish/consume/acknowledge е изключено **и в native конфигурацията при стартиране, и при checkout**. Едва след сървърна доставка iOS finish-ва, Android consume-ва консумативите или acknowledge-ва света. Изгубен отговор се възстановява със същата разписка. Logout сменя собствеността веднага и не допуска чужда покупка да се добави към новия акаунт.
- Сървърни източници: Apple `SignedDataVerifier` **3.1.0** с верига, bundle, environment и online проверки; Google Play `purchases.productsv2` чрез ограничен server service account. Проверяват се продукт, количество 1, състояние, среда, транзакция и случаен billing account alias. Sandbox разписка не важи в production.
- Apple verifier изисква и authenticated `AppStoreServerAPIClient.getTransactionInfo`: първо проверява device JWS, после актуалния подписан запис от Apple, включително отмяна на покупката. OCSP само по себе си проверява сертификата, не по-късен refund. Нужни са отделните App Store Connect In-App Purchase API private key, Key ID и Issuer ID; Team ID не ги заменя. Те се предоставят само в server secrets. Продължаващата refund/voided-purchase обработка след доставка остава условие за активиране.
- Нова **невнедрена** SQL миграция `20261107000100_native_commerce.sql`: частен портфейл и уникална доставка на покупка. Повторението връща вече записания баланс. След изтриване на Auth потребителя остава неприкачваем alias и replay tombstone, без Auth user ID. Няма raw purchase token/JWS в таблиците. Политиката за запазване, export/delete и възстановяванията на плащания трябва да се свържат преди активиране.
- OTP клиентът предава проверения еднократен ticket на `AccountSessionOwner`, без да го показва в UI snapshot. Само refresh credential се пази в Keychain/Keystore; браузърът няма незащитен fallback. Входът/възстановяването са изрични, не блокират старта на безплатна локална игра.
- Потребителският магазин има отделно свързване за жив каталог/портфейл, Restore purchases и Equip/Unequip. QA продължава да използва отделния симулатор. Реалните услуги са **изключени по подразбиране**.

## Какво още не работи като реална услуга

| Част | Оставаща работа преди активиране |
| --- | --- |
| Вход и създаване на акаунт | Внедрен собствен trusted eligibility/guardian + OTP/session issuer, реален изпращач на кодовете, надежден limiter и отмяна на сесии; export/delete с пресен вход. Клиентският ticket bridge не създава този сървър. |
| Рекламна награда | Внедрени reward API/SSV host и privacy issuer, точните ad units/SDK inventory в сървърния allowlist, callback URL в двете AdMob units, приемане на устройство. Старият заключен `cpi-api` не е такъв host. |
| Покупки | 18 продукта да бъдат създадени/одобрени в двата магазина, потвърдени SKU mappings, service-account права в Google, внедрен verifier/ledger, refunds/voided purchase обработка и lifecycle. Няма създадени продукти само от наличието на app record. |
| Използване на ресурсите | Сървърно прилагане на v11 Assisted/reserves/15 продължавания и Marketing бюджет; не се свързва живо плащане към локален QA портфейл или стария official v1. `economyReady` остава false, докато това не е внедрено. |
| Световно пускане | Действителни правила за регион/възраст/родителско разрешение, consent forms, store audience/data declarations и недопустими региони. Няма автоматично предположение „всеки е възрастен“ или измислен глобален минимум. |
| Поддръжка | `support@kolequant.com` остава адресът по изрично решение на собственика. При DNS проверката на 7 ноември `.com` не се открива; собственикът ще го настрои. Това трябва да се тества с реално получено писмо. |

В чата **Prepare Supabase backend and play-** и `bbmobilenew-source/docs/SUPABASE_BACKEND.md` е описано събиране на контакти и QA достъп; документът изрично не включва SMTP/OTP за играчи. `kolequant.xyz` има Cloudflare MX препращане. Това не е настроен изходящ SMTP за Crystal Path. Не сменяме глобални Auth настройки или чужди приложения като страничен ефект.

## Контролирано включване

`backend/commerce-products.proposed.json` съдържа 18 предложени съвпадащи Apple/Google SKU, количества, типове и одобрени ценови ориентири. **Нито един не е създаден в конзолите от този файл.** След действително създаване/проверка операторът попълва server catalog с потвърдените стойности за всяка платформа; UI не използва ценовите ориентири като платежна оферта.

Default build не включва Google/платежни native plugins. За компилационна проверка с демонстрационни Google app IDs:

```powershell
$env:CPI_NATIVE_ADS='true'
$env:CPI_NATIVE_PURCHASES='true'
npm run build
npm run native:generate -- --platform android --environment development
npm run native:generate -- --platform ios --environment development
```

Това **не активира акаунти/приходи**. Development/staging не приемат живи Google app IDs. За production се вземат регистрираните IDs от `publisher.ts`. Старият unsigned beta профил остава с услугите изключени; той не е платежен или рекламен release candidate.

Публичните `VITE_ACCOUNT_SERVICES_ENABLED`, `VITE_REWARDED_ADS_ENABLED`, `VITE_PURCHASES_ENABLED` са false по подразбиране. `VITE_ACCOUNT_API_BASE_URL` трябва да сочи собствен прегледан HTTPS host, не `/auth/v1` или `/rest/v1`. Реалните Android/iOS SDKs и server approval са допълнителни изисквания. Никакви service-role/Google/Apple/SMTP ключове във VITE променливи, Git или чат.

`createLiveServices` свързва наличните account/profile/ranked/reward/commerce клиенти. Той не внедрява host и не заменя още липсващия account self-service issuer. `createCommerceService({ economyReady: false, ... })` държи каталога и портфейла затворени. Новите routes не са включени в заключения Supabase entry point; CPI-017 deployment workflow остава непроменен и не прилага новата миграция.

## Приемане

Unit/contract тестовете покриват разписка без добавени ресурси преди проверка, повторение след загубен отговор, чужд акаунт/среда/SKU, pending/cancel, UMP отказ, стара реклама и освобождаване след грешка. SQL тестовете изпълняват истинската миграция в embedded PostgreSQL (PGlite); единствената му връзка е сериализирана, което **не доказва** contention на production connection pool.

В **Mobile app checks → Run workflow → native_services=true** се компилира и стартира SDK вариантът с демонстрационни Google IDs. `false` проверява обичайния вариант. Това е отделно от реални реклами, плащания и кодове на физически телефони.

Локална проверка · 7 ноември: typecheck, lint, format, 676 mobile теста (673 в пълната suite и 3 допълнителни gateway теста), 310 core, 167 server, 6 balance; planning validator/13 теста и 15 CI-routing теста. Четирите web build-а development/staging/QA/production са проверени. Native проектите се генерират успешно и с изключени, и с включени SDKs за Android/iOS. Windows генерацията не е native компилация. CI допълнително изпълнява новия commerce тест с 16 конкурентни заявки върху PostgreSQL 17 и отделни service-role връзки; резултатът се отчита отделно след изпълнение.

Първо CI изпълнение на `a60b94f` · [42306961462](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42306961462): App quality и PostgreSQL 17 **успешни**, включително 16 конкурентни покупки/една доставка. iOS SDK вариантът се компилира и стартира успешно на iPhone SE 3rd gen / iOS 26.5 Simulator, два cold starts и Settings interruption, 0 runtime/JS грешки; `ios-launch.png` е прегледан. Android APK се компилира успешно, но permission проверката спря за WAKE_LOCK/FOREGROUND_SERVICE от Google WorkManager. Първото изпълнение остава **неуспешно като общ резултат**. След проверка на manifest blame allowlist-ът е коригиран само за SDK варианта; нужно е повторно изпълнение. По-късната ревизия добавя възстановяване без налична цена, защита за заменен SKU и актуална Apple server проверка; нейното приемане се записва отделно.

Последваща локална ревизия · 7 ноември: **678 mobile / 169 server** теста успешни, typecheck/lint/format успешни. Проверени са и текущ Apple refund срещу по-стар device JWS, restore на оттеглен SKU и отказ преди checkout при заменен SKU. Новите account/ad privacy/restore бутони използват съществуващите менюта и стилове; рекламната поверителност е в съществуващата секция Privacy and data. Примерните env файлове остават празни за изключени услуги, така че да не нарушават unsigned-beta guard-а.

**Приемане на код `d3a3f4c` · 7 ноември:** [CI 42310520347](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/42310520347) е **успешно за всички jobs**, с `native_services=true`: App quality, PostgreSQL schema/access/16 конкурентни доставки, Android APK + Emulator и iOS Simulator. Android 16 / API 36: три cold starts, Home/lock/resume, 0 JS/runtime грешки. iPhone SE 3rd gen / iOS 26.5: два cold starts, Settings/prebridge/resume, 0 JS/runtime грешки. И двете `*-launch.png` снимки са прегледани; екранът е зареден без видимо застъпване. Permission проверката потвърждава описания ограничен SDK allowlist и отсъствието на AD_ID/ACCESS_ADSERVICES. Development/staging/QA/production web build-овете са повторени успешно и локално на същия код. Това доказва компилация и старт на development SDK варианта; **не** доказва реална реклама, покупка, изпратен OTP или внедрен backend. Артефактите в CI са с 7-дневно запазване. Оставащите условия в таблицата по-горе продължават да важат; real-service флаговете не са включени.

Преди рилийз трябва да се докажат: получен код, вход/restore/logout/отменена сесия, изтриване от приложението; доброволна реклама → подписан SSV → точно едно продължаване; отказ/no-fill/дублиран callback/прекъсване; sandbox покупка за всеки вид продукт → точно една доставка и consume/finish; restore след kill/reinstall; отказ/чакащо плащане/refund; ресурсите действително се използват по v11; отделни резултати Assisted; успешно получено support писмо. Записваме build, OS, среда и резултат. Simulator launch не замества тези доказателства.

## Първични източници

- [Google rewarded test inventory · Android](https://developers.google.com/admob/android/test-ads), [iOS](https://developers.google.com/admob/ios/test-ads). Демонстрационните units не са end-to-end SSV приемане за нашата unit: за него се използват нашите unit IDs с изрично регистрирани test devices в AdMob и съответстващ изолиран server allowlist.
- [Google Play purchase lifecycle](https://developer.android.com/google/play/billing/lifecycle/one-time), [ProductPurchaseV2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2).
- [Apple SignedDataVerifier](https://apple.github.io/app-store-server-library-node/classes/SignedDataVerifier.html), [официален Apple Root CA G3](https://www.apple.com/certificateauthority/AppleRootCA-G3.cer). Публичният сертификат в `packages/server-core/certificates` има SHA-256 `63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179`.
- [AdMob SDK](https://github.com/capacitor-community/admob), [Native Purchases SDK](https://github.com/Cap-go/capacitor-native-purchases), [Supabase account settings](https://supabase.com/docs/guides/auth/general-configuration).

Историческите симулации, ценови ориентири и бизнес цели не са променяни. Никакви симулирани рекламни или платежни събития не се отчитат като реални приходи.

## Живи rewarded единици за гостите · 10 ноември 2026 г.

Android и iPhone имат отделни производствени guest rewarded единици. Изборът е част от компилацията и изисква изричния live флаг и регистрирания native SDK. Вътрешният TestFlight използва демонстрационните единици. [Идентификатори, команди и статус на прегледа](../RELEASE_SERVICES_SETUP_BG.md#гост-реклами-в-мобилните-сборки).
