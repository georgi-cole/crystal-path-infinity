# CPI-016: International-first localization, accessibility and settings

**Owner-directed scope correction — 3 November 2026.** The initial issue said BG/EN because those were assumed starting languages. Crystal Path: Infinity is a global, all-ages product: the language system is **not limited to Bulgaria and English**. The first-wave language catalog and English fallback are independent of the game-core reducer, app identity, ads, analytics age, profile country, server authority and personal records.

## First-wave language choice

The selector contains **automatic device language** plus languages shown in their own writing systems:

| BCP-47 language | Visible name | Direction |
|---|---|---|
| en | English | LTR |
| bg | Български | LTR |
| es | Español | LTR |
| fr | Français | LTR |
| de | Deutsch | LTR |
| pt-BR | Português (Brasil) | LTR |
| ja | 日本語 | LTR |
| zh-Hans | 简体中文 | LTR |
| ar | العربية | RTL |

These are **preview translations**, not certified/professionally reviewed release locales. Most core navigation, tutorial, gameplay, settings, death/pending/finish and accessibility copy is translated, with a clearly announced English fallback for remaining copy. Additional language packs can be added to `src/i18n/` without modifying SP rules, native code, gameplay checkpoints or route seeds. Production launch requires native-speaker review for each marketed locale, including critical reward, privacy and deletion text. Do not claim all languages or full market readiness from a preview catalog.

- Default preference is `system`; `navigator.languages` order is respected with an explicit supported-language lookup and fallback to English. No geolocation or profile-country guess is used.
- A manual selection changes the UI immediately and persists under the standalone `cpi.ui.language.v1` key. Existing practice settings v2, local saved runs, scores, tutorial completion and audio/haptic toggles are untouched. Malformed/unavailable language storage falls back safely to automatic.
- Regional matches such as es-MX, fr-CA, de-AT and ar-EG select their closest available language. zh-Hant / Taiwan/Hong Kong uses English until a **separately translated Traditional Chinese** pack is available; it never silently uses Simplified Chinese. Unsupported languages fall back to English and can still choose a provided language.
- `html.lang` and `html.dir` update on selection; Arabic gets RTL labels and interface. Bridge rows explicitly remain physically left/right regardless of writing direction. Text and accessible labels are translated; enormous decimal row IDs use `BigInt` plus `Intl.NumberFormat` to avoid IEEE-754 precision loss. Game authority, seed, tie-break and step order remain unchanged.
- Stable `MessageKey` IDs and placeholder substitutions (`{row}`, `{sp}`, etc.) are validated in CI. A missing preview translation falls back to canonical English, **never** a raw key or invented text. Typed ids prevent undefined use in translated React components. All locale packs intentionally remain independent from server/analytics state.

## Accessible game states

The existing premium Big Eye-inspired menu/buttons and CPI-010 music/SFX/haptics toggles are retained; no season/AI game dependencies are added. Reduced-motion preference now applies to the hub as well as the tutorial/bridge, eliminating shakes, flashes and unnecessary motion while preserving the visible safe/cracked labels and death/result feedback. Low/critical SP is accompanied by explicit warning copy, not just colors. Tile outcomes have readable safe/cracked/hint labels, with semantic screen-reader names. Navigation, forms and result choices allow wrapping at 320–390px, font scaling, focus rings and comfortable touch targets. Arabic RTL must not mirror the physical tile selection.

## Privacy/account/support

Permanent sections appear under Settings. Offline checkpoints, settings and local best are explained accurately. There is **no fabricated published privacy-policy URL, account deletion button or sent support request**; these have honest unavailable states until actual services and verified URLs exist. Their release implementation belongs with the account/privacy/support service milestones. They must never collect or upload age or account data just because a language is selected.

## Manual acceptance and follow-up

Check device-language auto-detection, switching while a saved run exists, app kill/reopen, unsupported-device English fallback, a 1000+-digit row, text scaling (200%), screen reader order, reduced-motion without losing outcomes, 320px/390px portrait, RTL Arabic and physical left/right directions, CJK glyphs, WebView font rendering and real native Android/iOS background/foreground. Verify that language changes never reset progress, clock, SP, effect timers, haptics or audio preference. All advertised translations require human linguistic review before public release; machine checks can only verify structural correctness.
