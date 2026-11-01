# Източници и граници на проверката

Проверени на 1 ноември 2026 г. Версиите, store правилата и SDK изискванията се проверяват отново при implementation/release. Препоръките са проектни решения, не внедрени интеграции.

## Изходен код

- [Infinity правила](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/shatteredLogic.ts)
- [Infinity компонент](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/minigames/crystalPathShattered/CrystalPathShatteredGame.tsx)
- [AdMob bridge](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/services/ads/admobBridge.ts)
- [Сегашен Supabase модел](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/docs/SUPABASE_BACKEND.md)
- [Възрастова политика](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/src/safety/playerSafety.ts)
- [Capacitor конфигурация](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/capacitor.config.ts)
- [Proprietary лиценз](https://github.com/georgi-cole/bbmobilenew-source/blob/6ace929a60410e728928aa51eaf80ba9b5cf2262/LICENSE)

Пълен inventory: [reuse-manifest.json](../planning/reuse-manifest.json).

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

Няма изпълнени native/device/ad проверки, store submissions или измерени latency/performance резултати в тази инспекция. GDPR източниците обосновават отделно решение за цели, минимизация и детски consent; не определят автоматично минимална възраст за играта.
