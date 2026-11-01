# Източници и граници на проверката

Дата на достъп: **2026-11-01**. Версиите, store правилата и SDK изискванията се проверяват отново при implementation/release. Препоръките са проектни решения, не внедрени интеграции. Източниците обосновават техническите и privacy подробности; продуктовите решения на Georgi за endless, всички възрасти и аналитична цел на възрастта са записани отделно в [CPI-001](decisions/CPI-001-product-contract.md).

## Изходен код

- [Infinity правила](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/shatteredLogic.ts)
- [Infinity компонент](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/CrystalPathShatteredGame.tsx)
- [AdMob bridge](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/services/ads/admobBridge.ts)
- [Сегашен Supabase модел](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/docs/SUPABASE_BACKEND.md)
- [Историческа възрастова политика на Big Eye](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/safety/playerSafety.ts) — не определя възрастов достъп за новата игра.
- [Capacitor конфигурация](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/capacitor.config.ts)
- [Proprietary лиценз](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/LICENSE)

Пълен inventory: [reuse-manifest.json](../planning/reuse-manifest.json).

Финалът на ред 350 е установено поведение на инспектираната Big Eye версия. Той не е изискване към новото приложение: standalone договорът премахва края и продължава генерирането на пътя и mystery възможностите. Изходното хранилище не се променя от този план.

## Официални платформени източници

- [Capacitor](https://capacitorjs.com/docs)
- [Splash и icons](https://capacitorjs.com/docs/guides/splash-screens-and-icons)
- [AdMob rewarded policy](https://support.google.com/admob/answer/7313578?hl=en)
- [AdMob Android SSV](https://developers.google.com/admob/android/ssv)
- [AdMob iOS SSV](https://developers.google.com/admob/ios/ssv)
- [UMP privacy](https://developers.google.com/admob/android/privacy)
- [Apple privacy / ATT](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Google Play deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [GDPR принципи](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en)
- [Детски данни и consent](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en)
- [GitHub repositories API](https://docs.github.com/en/rest/repos/repos)
- [GitHub CLI](https://cli.github.com/manual/gh_repo_create)
- [Checkout action](https://github.com/actions/checkout)

Началният CI използва actions/checkout v7, чийто ref е проверен през GitHub API до commit `3d3c42e5aac5ba805825da76410c181273ba90b1`.

## Уточнения за всички възрасти, аналитика и реклами

Следните официални източници са проверени на **2026-11-01** за коригирания all-ages обхват. Те не налагат автоматично 18+ достъп и не означават обща забрана за реклами при деца.

| Източник | Проверен факт и последица за плана |
| --- | --- |
| [Google Play: target audience](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en) | Целевите възрастови групи се декларират отделно от content rating. При включена детска аудитория се прилагат Families изисквания; конкретните групи трябва да отразяват реалния продукт. |
| [Google Play: Families policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en) | За деца/неизвестна възраст се изискват подходящи self-certified ad SDK версии, съдържание и ограничения на рекламното обработване. Прекъсващи играта реклами, включително rewarded, трябва да могат да се затворят след 5 секунди. Това не определя автоматично кога е спечелена наградата. |
| [Families Self-Certified Ads SDK Program](https://support.google.com/googleplay/android-developer/answer/9900633) | Проверяват се конкретни SDK версии и mediation конфигурации. Наличието на JavaScript bridge не доказва, че интеграцията покрива Families изискванията. |
| [Google Play: data practices in Families apps](https://support.google.com/googleplay/android-developer/answer/11043825?hl=en-en) | При приложение за деца и възрастни advertising ID не трябва да се изпраща по подразбиране при старт; неизвестна възраст не се третира като доказан възрастен. |
| [AdMob: apps for everyone, including children and families](https://support.google.com/admob/answer/6223431?hl=en) | AdMob описва път за приложения със смесена възрастова аудитория чрез подходящи age-treatment/content-rating настройки и съвместими ad sources. Детският ad pool може да има различна наличност; не обещаваме десет запълнени реклами. |
| [AdMob UMP: EEA disclosure and under-age treatment](https://developers.google.com/admob/android/privacy/gdpr) | Consent, оттеглянето и under-age сигналите са отделни от доброволното гледане на реклама. UMP сигналът не конфигурира автоматично всички ad requests; избраните native SDK версии трябва да се проверят. |
| [AdMob: personalized and non-personalized ads](https://support.google.com/admob/answer/7676680?hl=en) | Неперсонализирани реклами могат да използват identifiers/storage за frequency capping и отчети; consent може да е необходим. „Неперсонализирано“ не означава автоматично „без разрешение“. |
| [Apple App Review Guidelines, 1.3 и 5.1.4](https://developer.apple.com/app-store/review/guidelines/) | All-ages продукт не се включва автоматично в Kids Category. Kids Category и приложенията, насочени основно към деца, имат допълнителни ограничения; тесни изключения за определена аналитика/контекстуални реклами съществуват. Parental gate не е равнозначно на валидно родителско съгласие за данни. |
| [Apple: age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) | Content рейтингът произтича от въпросник и съответните регионални правила. Той е отделен от privacy/consent условията; store позиционирането се уточнява при подготовката за release. |
| [GDPR, членове 5–8](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/) | Член 8 разглежда consent-based обработване при онлайн услуга, пряко предлагана на дете; 16 е общата граница, която държавите членки могат да намалят до минимум 13. Това не е обща минимална възраст за игра и не е изискване за родителско съгласие за всички под 18. |
| [European Commission: children's data](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en) | Необходимите съгласия зависят от основанието за обработване и държавата. Аналитичен диапазон 13–15 сам не установява приложим праг. |
| [European Commission: GDPR principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en) | Цел, минимизация и срокове се определят за конкретното обработване. Групи вместо точни години са препоръка за заявената аналитична цел, а не твърдение, че точно число никога не може да се съхранява. |
| [FTC: current COPPA compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business) | И доброволно поискана лична информация се счита за събиране. Приложимият детски поток трябва да предхожда съответното събиране/разкриване; account идентификатор плюс демографски данни не стават анонимни само чрез псевдоним. Има ограничени изключения, а не общо разрешение за всички child analytics. |
| [FTC: COPPA FAQs](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) | Support-for-internal-operations изключението може да покрие определени технически analytics/contextual-ad дейности при ограничени условия. Не го пренасяме автоматично върху възстановим профил, демография и публична класация. FAQ отбелязва измененото правило; за окончателни изисквания се използва актуалната редакция. |
| [FTC: 2025 rule changes](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data) | Актуализирани са изискванията за определени third-party disclosures и ограничено съхранение. Финалната account/ad реализация не разчита само на стари примери за COPPA. |

Практическият договор е: полезна игра без демографски отговор; доброволна частна аналитика; отделен `privacyContext` за необходимите protections/permissions; подходящ детски/родителски онлайн път там, където се изисква. Това не е пренесена възрастова забрана от Big Eye. Декларираната страна за класацията сама по себе си не е проверка на приложимата юрисдикция за consent.

## Граници на проверката

Няма изпълнени native/device/ad проверки, store submissions или измерени latency/performance резултати в тази инспекция. Не е потвърдена конкретна комбинация от Capacitor, AdMob bridge, native ad SDK и Families съвместими версии; това е доказателство за CPI-002/CPI-026, преди реални реклами. CPI-019/CPI-031/CPI-036 уточняват допустимото събиране, детския/родителския онлайн поток, retention и launch пазарите. Тези задачи не възстановяват 18+ gate и не отлагат all-ages gameplay.
