# CPI-002 — Native AdMob audit

**Дата на проверката: 2026-11-01. Обхват: `@capacitor-community/admob@8.2.1` и Capacitor `8.5.3`.**

Статичният одит потвърждава SSV bridge за `customData` на Android и iOS и достатъчна основа за изолиран spike с тестови реклами. Остават конкретни проверки на native build, реални устройства, consent и подписан SSV callback. Този документ не отчита CPI-002 като изпълнена и не избира production mediation конфигурация.

## 1. Какво е действително проверено

Прочетени са публикуваните npm archives за plugin `8.2.1` и `@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/cli` `8.5.3`. SHA-512 на всеки архив е сравнен успешно с `dist.integrity` от npm registry преди извличането. Прочетени са native изходният код, TypeScript declarations, Gradle/Swift/CocoaPods manifest-ите и Android template-ът в CLI. Това е проверка на публикуваните пакети; native dependency resolution и устройствено изпълнение още не са доказани с този одит. [P1–P5]

| Пакет | Версия | `gitHead` от npm |
| --- | --- | --- |
| `@capacitor-community/admob` | `8.2.1` | `a8f8ac48df11ac79805fef7059546e97f028be1b` |
| Capacitor core/android/ios/cli | `8.5.3` | `06e3e1984337f836a4c28b2afc92faa977dea315` |

Plugin archive integrity: `sha512-kJRy6EMNrutDZL0ETChg5pAJ9pQFxkcsinrTRD4wkYp7NGkLZmG0m/YBMyXvUhMkbMIqlCGkNRSjgXi25F9/ww==`. Публикуваната plugin документация изисква Capacitor **8.5 или по-нов в major 8**; npm dependency `@capacitor/core: ^8.0.0` сама по себе си не налага това по-тясно изискване. `8.5.3` удовлетворява обявения диапазон. Това не замества build проверката. [P1, P6]

## 2. Точни версии и диапазони

| Компонент | Декларирано в проверения пакет | Последица за spike-а |
| --- | --- | --- |
| Node | Plugin и Capacitor CLI: `>=22.0.0` | Записваме действителната patch версия от средата. |
| Android Google Mobile Ads | `com.google.android.gms:play-services-ads:25.4.+` | **Динамичен patch диапазон**, не exact pin. За възпроизводим кандидат може да се зададе `playServicesAdsVersion = '25.4.0'`; Google публикува този artifact. Фактическият runtime graph трябва да го потвърди. |
| Android UMP | `com.google.android.ump:user-messaging-platform:4.0.0` | Exact default, с възможност за override чрез `userMessagingPlatformVersion`. |
| iOS GMA, SPM и CocoaPods | `13.11.0` exact | Plugin задава еднаква GMA версия по двата пътя. |
| iOS UMP, SPM | `.upToNextMinor(from: "3.1.0")` | `>=3.1.0, <3.2.0`; окончателната patch версия идва от `Package.resolved`. |
| iOS UMP, CocoaPods | `~> 3.1` | `>=3.1, <4.0`, **по-широко от SPM**; окончателната версия идва от `Podfile.lock`. Не твърдим автоматично `3.1.0`. |
| iOS GMA upstream SPM зависимост към UMP | `1.1.0..<4.0.0` | Съвместима е с plugin диапазона `3.1.x`; Google публикува UMP `3.1.0`. |
| Android SDK | `minSdk 24`, `compileSdk 36`, `targetSdk 36` | Съвпадат в plugin defaults и Capacitor 8.5.3 template-а. |
| Android build | AGP `8.13.0`; Gradle wrapper `8.14.3`; Java target `21`; plugin Kotlin `2.2.20` | Това са defaults/template стойности, не отчет за локално наличен toolchain. |
| iOS deployment | Plugin: iOS `15`; Swift tools declaration `5.9` | Няма понижаване до upstream GMA minimum iOS 13. |
| Xcode | Capacitor 8: `26.0+`; GMA release notes от `13.4.0`: `26.2+` | За комбинацията с GMA `13.11.0` използваме **Xcode 26.2+** като кандидат минимум и записваме фактическите Xcode/iOS SDK версии. |
| Mediation adapters | В проверените plugin manifests няма външни network adapters | Първият spike е Google-only. Добавянето на adapter изисква собствена точна версия и повторна проверка. |

Източници за package defaults: [P2–P5, P7–P9]. За Capacitor toolchain и GMA release изискванията: [G1–G3]. Google Android quick-start вече показва `25.5.0`; това **не е** default на проверения plugin. Не подменяме избраните версии само защото документацията показва по-нова. [G2, G4]

Преди native pass запазваме Android dependency report/locks и избрания iOS lockfile. `package-lock.json` не заключва самостоятелно всички Gradle/Swift/CocoaPods зависимости. Ако се избере Xcode 27 с CocoaPods, текущият Google quick-start описва допълнително уеднаквяване на pod deployment targets до iOS 15; това е условна build проверка за този път. [G5]

## 3. SSV bridge: реализиран и на двете платформи

Публичният API приема `prepareRewardVideoAd({ adId, ssv: { customData, userId? } })`. `ssv` изисква поне едно от двете полета. Native wiring е проверен директно:

| Платформа | Native mapping преди показване |
| --- | --- |
| Android | `SsvInfo` чете `ssv.customData` / `ssv.userId`; load callback изгражда `ServerSideVerificationOptions` чрез `setCustomData()` / `setUserId()` и го поставя на заредената реклама. |
| iOS | Load callback чете същите полета; задава `ServerSideVerificationOptions.customRewardText` / `userIdentifier`, след това `ad.serverSideVerificationOptions`. |

Източници: [P10–P13]. Google описва `custom_data` в server callback и percent escaping на стойността. Получаването на JS reward не доказва получен или проверен SSV callback. [G6–G8]

**Ограничения, които определят spike-а:**

- SSV полетата се поставят при **prepare/load**. Server intent трябва да съществува преди това; няма публичен API за промяната им върху вече заредена реклама.
- Native кешът е keyed by ad unit ID; второ prepare за същия unit може да замени първото. Използваме един активен rewarded attempt и изрично върнатия `adUnitId` при show. Не подготвяме паралелно реклами за различни death intents върху един unit.
- `Rewarded` payload съдържа `type` и `amount`, без нашия intent ID или SSV transaction ID. Връзката към текущия attempt се пази от нашия orchestrator; сървърът проверява подписания callback.
- iOS `AdRewardExecutor.swift` съдържа `NSLog` за **пълните** `customData` и `userId`. Spike-ът използва синтетичен непривилегирован opaque ID. Преди истински профили/реклами се премахват или редактират тези native logs; не поставяме username, години, държава, auth token или самодостатъчен секрет в SSV полетата. [P11–P13]

За CPI-001 `reward_amount` от рекламната платформа удостоверява конфигурирания ad reward; server intent определя конкретното продължаване и 200/150 SP. Клиентският `amount` не избира SP и не променя броячите.

## 4. Callback семантика: отделни reward и dismissal

| Събитие / Promise | Проверено поведение на plugin 8.2.1 |
| --- | --- |
| `prepareRewardVideoAd()` | Resolve с `{ adUnitId }` след load; load failure reject-ва и излъчва `FailedToLoad`. |
| `showRewardVideoAd()` | Resolve при **earned reward**, със същия `type/amount`, който се излъчва като `Rewarded`. Това не означава затворен fullscreen ad. |
| `Dismissed` | Отделно събитие; само по себе си не удостоверява награда. Native кешът премахва показаната реклама. |
| Dismiss без earned reward | Прочетените native dismissal handlers не resolve/reject-ват show promise. Няма основание UI да чака само този Promise. |
| Native failed-to-show | Излъчва `FailedToShow` и чисти кеша; native callback няма settle на първоначалния show promise. Precondition failures могат отделно да reject-нат. |
| `initialize()` | Android разрешава promise след намиране на banner parent; iOS извиква SDK start без completion handler и resolve-ва. Това не удостоверява, че всички SDK/adapters са приключили initialization. |

Източници: [P11–P16]. Това са статични code findings, а не вече възпроизведени device дефекти.

Listener-ите трябва да са регистрирани преди prepare/show. Един idempotent handler обработва earned reward; Promise резултатът и `Rewarded` event не дават две награди. UI следи независимо `earned`, `dismissed`, `failed` и server verification. Ограничено UI чакане може да покаже recovery действие, но не отнема валидна късна награда. Слушателите се премахват след завършване/cleanup.

Google гарантира earned-before-dismissed за собствените си реклами; при mediation редът зависи от ad source. Не записваме тази гаранция като универсално правило на orchestrator-а. [G6, G7]

На iOS plugin 8.2.1 спира WebView media при fullscreen presentation и я възстановява при dismissal/failure. Това адресира обявен audio fix, но gameplay часовникът и входът остават отговорност на приложението. Проверяваме Web Audio и HTML media след многократно показване, background и failed presentation. [P6, P13, P16]

## 5. Privacy API: какво е налично и какво липсва

| Нужда | Android | iOS | Практическо решение за spike |
| --- | --- | --- | --- |
| Child-directed GMA flag | `initialize({ tagForChildDirectedTreatment })` задава true/false/unspecified | Задава native property **само при `true`** | Явно child/unknown test context преди initialization; false не се приема за надежден reset на iOS. |
| GMA under-consent flag | True/false/unspecified | Само true | Отделна проверка от UMP flag-а. |
| Max ad content rating | `MaxAdContentRating.General` → G | `General` → `.general` | Child/unknown тестът използва G; не разчита само на account default. |
| UMP under-consent flag | `requestConsentInfo({ tagForUnderAgeOfConsent })` | Същият JS API към `isTaggedForUnderAgeOfConsent` | Подаваме съответния context независимо от GMA configuration. |
| UMP status и UI | `canRequestAds`, `privacyOptionsRequirementStatus`, consent/privacy forms | Същите основни възможности | Gate за заявка; повторна оценка след privacy change. |
| Новото GMA age treatment `CHILD` / `TEEN` / `UNSPECIFIED` | Native SDK го има; plugin JS API **не го излага** | Native SDK го има; plugin JS API **не го излага** | За distinct TEEN policy е нужен малък bridge extension/подходящ plugin update и тест. |
| iOS ATT | Неприложимо | Status и request helpers са налични | Tracking не се отключва само от UMP резултат или analytics отговор. |

Източници за действителното API и platform разликите: [P14–P19]. Особено подвеждащ е comment-ът в plugin consent declaration, че TFUA true предоставя избор за персонализирани реклами: **официалното поведение е обратното — UMP не иска consent от маркирания under-consent потребител**. UMP flag-ът не се препраща автоматично към GMA. [G9, G10]

GMA въведе новото age treatment в Android `25.3.0` и iOS `13.3.0`, следователно то съществува в одитираните SDK кандидати. Google документира legacy TFCD/TFUA `true` като еквивалент на CHILD; липсата на нов JS enum не означава липса на child protection. Но старите flags нямат TEEN еквивалент. [G2, G3, G11, G12]

Промяна на context по време на процеса изисква конкретна проверка: iOS true → false/omitted оставя вече зададените native flags; повторно `initialize()` не е доказан cross-platform reset API. За първия spike използваме ясно означени отделни test contexts/стартирания. Production adapter трябва да обновява всички приложими настройки и да отхвърля реклами, заредени при предишен context.

UMP се обновява при стартиране и приложимите форми се обработват преди рекламни заявки. `canRequestAds` е SDK сигнал, не доказателство за възраст, родителско разрешение или analytics consent. `resetConsentInfo()` е помощ за тестове, не production withdrawal flow. Apple ATT е отделно разрешение за tracking/IDFA; играта не се отключва чрез съгласие за tracking. [G13–G15]

Изводът следва приетия договор: всички възрасти могат да играят; доброволните години са за аналитика. Този одит не използва липсващ възрастов отговор като adult разрешение и не въвежда обща забрана за детски rewarded ads.

## 6. Families compatibility: потвърдено и оставащо

Официалният Play списък включва `com.google.android.gms:play-services-ads` **19.0.0 или по-нова**, като изрично насочва към SDK Index за статуса на отделните версии. `25.4.0` попада в обявения диапазон. Полученият SDK Index snapshot обаче показва стари данни с `22.2.0` и не излага проверим ред за `25.4.0`; **точният текущ version-level статус не е удостоверен от този одит**. Това не е констатация, че версията е несъвместима. Нужен е актуален проверим запис за действително разрешената версия преди child/unknown production traffic. [G16, G17]

За all-ages Android приложение Google изисква Families self-certified SDK при реклами към деца/unknown и настройка CHILD + G. Сертификацията на SDK не доказва автоматично правилен ad content/format. Прекъсващи играта rewarded реклами към тази аудитория трябва да могат да се затварят след 5 секунди; това не означава earned reward след 5 секунди. Проверява се на устройство с действителната child request конфигурация. [G18, G19]

Play Families списъкът е Android програма; не описваме iOS SDK като „Play-certified“. iOS се проверява по Google настройките и приложимите Apple правила. В spike-а няма mediation adapters. Ако по-късно добавим такива, всеки SDK, adapter и ad source се проверява отделно; plugin wrapper версията не е тяхна Families сертификация. [G18]

## 7. Тестови IDs и граница на SSV доказателството

| Платформа | Google sample app ID | Rewarded demo ad unit ID |
| --- | --- | --- |
| Android | `ca-app-pub-3940256099942544~3347511713` | `ca-app-pub-3940256099942544/5224354917` |
| iOS | `ca-app-pub-3940256099942544~1458002511` | `ca-app-pub-3940256099942544/1712485313` |

App ID се използва в manifest/Info.plist; unit ID се подава на rewarded API. Google публикува тези sample app IDs и platform-specific rewarded units. [G4, G5, G20, G21]

`isTesting: true` при prepare **винаги подменя unit-а с Google demo unit на iOS**. Android запазва подадения unit, ако SDK разпознава устройството като test device; иначе го подменя с demo unit. `initializeForTesting: true` регистрира `testingDevices`; това е различна възможност. За възпроизводим demo тест подаваме изрично platform demo unit ID. За по-късен account-owned SSV тест използваме собствен тестово конфигуриран unit, регистрирано test device, `isTesting: false` и verified callback URL; това запазва unit-а, а test-device регистрацията осигурява test ads. Не изпълняваме live advertising тест. [P14, P16, P20, G20–G22]

Google demo units не са към нашия AdMob account и не можем да конфигурираме наш endpoint за тях. Те проверяват presentation, callbacks и native поставянето на SSV options. AdMob „Verify URL“ проверява server endpoint отделно. Пълното JS → native → Google → наш подписан callback доказателство остава отделен device/account-owned test; demo callback trace или синтетичен server fixture не се отчита като него. [G8, G20–G22]

## 8. Конкретни проверки и оставащи блокери

Всички проверки по-долу остават **неизпълнени** в рамките на този статичен одит.

| Проверка | Необходимо доказателство / критерий |
| --- | --- |
| Native build на двете платформи | Действителни Node/JDK/Gradle/Xcode/iOS SDK версии, Android dependency graph и iOS lock; успешен build на точно тези зависимости. |
| Reward → dismiss | Trace на двете събития; едно локално QA действие; игровият вход остава спрян до dismissal и валиден restore. |
| Dismiss без reward / no-fill / failed show | UI приключва loading/showing без да чака неприключващ show Promise; няма grant или придвижване към следващото продължаване. |
| Repeated taps и cleanup | Един активен attempt; повторени reward event/Promise не дават двойна награда; listeners и cached ads не растат след серия. |
| Background / app kill / audio | Запис от Android и iPhone; чисто връщане на Web Audio/HTML media, input и pause; pending intent остава възстановим. |
| SSV string round trip | Синтетичен ID и отделен encoding fixture с `+`, `%`, `&` и Unicode; verified callback запазва точната стойност, правилния unit и уникалния transaction. Replay не дава нов grant. |
| Account-owned SSV | Наш verified endpoint и регистрирани test devices; native SSV logs не съдържат потребителски или секретни данни. Без това остава само bridge/source proof. |
| Child/unknown request | Настройки преди initialization, G content rating, отделен UMP/GMA сигнал; проверка на реалния request и близостта на close контрола след 5 s. |
| Context transition | iOS true → false/omitted е възпроизведено и обработено чрез bridge correction или определен lifecycle; стара заредена реклама не се показва след privacy change. |
| TEEN ако е нужен | Доказан bridge за native age treatment; не заменяме липсващия enum с предположение за false/unspecified. |
| UMP / ATT | Fresh install, consent required/not required, refusal, privacy-options change, under-consent, ATT denied/restricted; без повторни ad loads от два callback пътя. |
| Families version record | Актуален запис за точния Android SDK и всяка евентуална mediation зависимост; не само общият диапазон от support страницата. |

Няма доказана липса на SSV bridge, която да налага смяна на Capacitor. Реалните корекции са listener-driven orchestration, точни native locks, ограничаване/премахване на SSV logs и изрично управление на privacy context. Native/device/SSV/Families доказателствата остават вход към окончателния CPI-002 go/no-go; latency и инфраструктурният разчет се отчитат в отделната част на spike-а.

## 9. Първични източници

Всички посочени източници са проверени на **2026-11-01**. Npm archive-ите са изтеглени от publisher registry; native файловете по-долу са от същия проверен пакет. GitHub линковете използват immutable `gitHead`, а не `main`.

### Публикувани пакети и точен source

- **P1 — npm plugin metadata / archive:** https://registry.npmjs.org/@capacitor-community%2fadmob/8.2.1 ; https://registry.npmjs.org/@capacitor-community/admob/-/admob-8.2.1.tgz
- **P2 — Android plugin manifest:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/build.gradle
- **P3 — iOS SPM manifest:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/Package.swift
- **P4 — iOS podspec:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/CapacitorCommunityAdmob.podspec
- **P5 — Capacitor registry metadata:** https://registry.npmjs.org/@capacitor%2fcore/8.5.3 ; https://registry.npmjs.org/@capacitor%2fandroid/8.5.3 ; https://registry.npmjs.org/@capacitor%2fios/8.5.3 ; https://registry.npmjs.org/@capacitor%2fcli/8.5.3 . CLI archive contains `assets/android-template.tar.gz`.
- **P6 — Plugin 8.2.1 release:** https://github.com/capacitor-community/admob/releases/tag/v8.2.1 ; package `README.md` from P1.
- **P7 — Google Android GMA 25.4.0 POM:** https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-ads/25.4.0/play-services-ads-25.4.0.pom
- **P8 — Google Android UMP 4.0.0 POM:** https://dl.google.com/dl/android/maven2/com/google/android/ump/user-messaging-platform/4.0.0/user-messaging-platform-4.0.0.pom
- **P9 — Google iOS exact manifests:** https://github.com/googleads/swift-package-manager-google-mobile-ads/blob/13.11.0/Package.swift ; https://github.com/googleads/swift-package-manager-google-user-messaging-platform/blob/3.1.0/Package.swift
- **P10 — Reward API:** P1 archive `dist/esm/reward/reward-ad-options.interface.d.ts`, `reward-definitions.interface.d.ts`, `reward-ad-plugin-events.enum.d.ts`.
- **P11 — Android SSV/reward callbacks:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/rewarded/RewardedAdCallbackAndListeners.kt
- **P12 — Android rewarded executor:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/rewarded/AdRewardExecutor.java
- **P13 — iOS rewarded executor:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/ios/Sources/AdMobPlugin/Rewarded/AdRewardExecutor.swift
- **P14 — Android initialization/privacy:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/AdMob.java
- **P15 — Android fullscreen callbacks:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/helpers/FullscreenPluginCallback.kt
- **P16 — iOS initialization/privacy/media:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/ios/Sources/AdMobPlugin/AdMobPlugin.swift
- **P17 — Android UMP:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/consent/AdConsentExecutor.java
- **P18 — iOS UMP:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/ios/Sources/AdMobPlugin/Consent/ConsentExecutor.swift
- **P19 — Public privacy declarations:** P1 archive `dist/esm/definitions.d.ts`, `dist/esm/consent/consent-request-options.interface.d.ts`.
- **P20 — Android test-unit selection:** https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/models/AdOptions.java ; https://github.com/capacitor-community/admob/blob/a8f8ac48df11ac79805fef7059546e97f028be1b/android/src/main/java/com/getcapacitor/community/admob/helpers/AdViewIdHelper.java

### Google / Apple / Capacitor documentation

- **G1 — Capacitor 8 environment/upgrade:** https://capacitorjs.com/docs/getting-started/environment-setup ; https://capacitorjs.com/docs/updating/8-0
- **G2 — Android GMA release notes:** https://developers.google.com/admob/android/rel-notes
- **G3 — iOS GMA release notes:** https://developers.google.com/admob/ios/rel-notes
- **G4 — Android GMA quick-start:** https://developers.google.com/admob/android/quick-start
- **G5 — iOS GMA quick-start:** https://developers.google.com/admob/ios/quick-start
- **G6 — Android rewarded:** https://developers.google.com/admob/android/rewarded
- **G7 — iOS rewarded:** https://developers.google.com/admob/ios/rewarded
- **G8 — SSV verification:** https://developers.google.com/admob/android/ssv
- **G9 — Android UMP under-consent:** https://developers.google.com/admob/android/privacy/gdpr
- **G10 — iOS UMP under-consent:** https://developers.google.com/admob/ios/privacy/gdpr
- **G11 — Android targeting/age treatment:** https://developers.google.com/admob/android/targeting
- **G12 — iOS targeting/age treatment:** https://developers.google.com/admob/ios/targeting
- **G13 — Android UMP:** https://developers.google.com/admob/android/privacy
- **G14 — iOS UMP:** https://developers.google.com/admob/ios/privacy
- **G15 — Apple tracking/privacy:** https://developer.apple.com/app-store/user-privacy-and-data-use/
- **G16 — Families self-certified SDK list:** https://support.google.com/googleplay/android-developer/answer/12955712?hl=en
- **G17 — Google Play SDK Index:** https://play.google.com/sdks/details/com-google-android-gms-play-services-ads
- **G18 — AdMob and Families:** https://support.google.com/admob/answer/6223431?hl=en
- **G19 — Play Families ad format requirements:** https://support.google.com/googleplay/android-developer/answer/9893335?hl=en
- **G20 — Android test ads:** https://developers.google.com/admob/android/test-ads
- **G21 — iOS test ads:** https://developers.google.com/admob/ios/test-ads
- **G22 — SSV account setup/test endpoint:** https://support.google.com/admob/answer/9603226?hl=en
