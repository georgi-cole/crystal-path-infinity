# CPI-002 · Crystal Path Mobile Lab

Изолиран технически прототип за React + Capacitor, server round trips, lifecycle/audio и rewarded callbacks. **Това още не е пълната игра.** Всички опити са `official: false`, без класации, профили или реални награди. Bridge сцената няма mystery система и използва опростени 20 SP щета при всяка грешна стъпка.

Локална проверка към 2026-11-01: **30 автоматизирани теста, typecheck, production web build и генериране/проверка на Android и iOS проектите преминават**. Това не доказва native compilation, работа на устройство, показана реклама или доставен Google SSV callback. Измерванията и оставащите проверки са в [CPI-002 results](../../docs/spikes/CPI-002-results.md); ограниченията на SDK са в [native audit](../../docs/spikes/CPI-002-native-audit.md).

## 1. Инсталиране и автоматизирани проверки

Командите по-долу се изпълняват от `spikes/mobile`, освен първото `cd`. CI използва **Node 22.23.4**; package engines допуска `>=22.23.4 <25`.

```bash
cd spikes/mobile
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

`package-lock.json` заключва npm dependencies. Native кандидатът е Capacitor **8.5.3**, AdMob plugin **8.2.1**, App plugin **8.1.2**. Generator-ът проверява декларациите и действително инсталираните версии; не инсталира пакети и не променя third-party код.

## 2. Browser fixture

В първи терминал:

```bash
npm run probe
```

Във втори терминал, от същата директория:

```bash
npm run dev
```

Отвори **http://127.0.0.1:5173**. Остави `Server address` празно: Vite препраща `/v1/probe` към `127.0.0.1:8787`. Този proxy е част от dev сървъра; самостоятелно отворен `dist` или `npm run preview` не го предоставя.

1. Натисни **Start probe run**, после LEFT/RIGHT. Резултатът се показва след server response; началото е 300 SP, скалата е до 400.
2. **Test death** → **Prepare simulated continuation**.
3. Избери **Earned → dismiss** или **Dismiss → earned**, после **Restore 200 SP**. И двата реда на callbacks трябва да водят до един restore след симулиран grant. **Simulate no-fill** не дава grant и позволява нов опит за същата смърт.
4. Повтори за границите: revive 1–5 задават 200 SP, 6–10 задават 150 SP. Десетото продължава играта; следващата смърт приключва опита.
5. Пробвай Pause/Resume, **Enable sound probe**, background/foreground и **Check server state**. **Export JSON** запазва наблюденията без run token; browser резултатите остават симулация.

**Retry unconfirmed step** изпраща същите sequence, side и idempotency key след изгубен response; друга плочка остава блокирана до потвърждение. **Check server state** може да възстанови вече приетата стъпка или restore. Това е recovery в текущата сесия, не след app kill.

За изкуствено забавяне на **synthetic step** заявки стартирай сървъра с `PROBE_SYNTHETIC_DELAY_MS=250 npm run probe`. Това е контролирано внесено закъснение и се отчита отделно от реална мрежова латентност.

За възпроизводим HTTP/storage отчет: `npm run measure`. Скриптът създава отделни loopback servers, изпълнява 10 000 перфектни synthetic стъпки и два artificial-delay профила, и записва `artifacts/probe-local.json`. Това не е оценка на реалната трудност или cellular network.

## 3. API smoke flow и ограничения

Пълният договор, грешките и SSV проверките са в [server/CONTRACT.md](server/CONTRACT.md). Следният пример изисква работещ `npm run probe`, създава synthetic опит и изпълнява death → intent → simulated grant → restore. Не отпечатва token-а:

```bash
node --input-type=module <<'JS'
const base = 'http://127.0.0.1:8787/v1/probe';
let token;
async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
}
const run = await post('/runs', { mode: 'synthetic', platform: 'web' });
token = run.token;
const path = `/runs/${run.runId}`;
await post(`${path}/death`, {});
const intent = await post(`${path}/reward-intent`, {});
await post(`${path}/synthetic-grant`, { intentId: intent.intentId });
const { state } = await post(`${path}/restore`, { intentId: intent.intentId });
console.log({ official: state.official, sp: state.sp,
  granted: state.revivesGranted, applied: state.revivesApplied });
JS
```

Очаквано: `official: false`, `sp: 200`, `granted: 1`, `applied: 1`. `synthetic-grant` е забранен за native опити; client `earned` събитие никога не разрешава server restore.

Сървърът пази всичко само в паметта: максимум **20 опита, 1000 уникални step actions на опит, 10 reward intents на опит и 32 активни HTTP handlers**. Достигането на бюджет връща явна lab грешка; не въвежда край на бъдещата endless игра. Restart изтрива всички опити, tokens и pending rewards. Reload на UI губи текущата сесия — durable recovery не е реализирано. Не рестартирай по време на наблюдение за забавен callback, без да отчетеш загубата на състояние.

`PROBE_HOST`, `PROBE_PORT` и `PROBE_ORIGINS` управляват bind/port/точния CORS allowlist. Defaults са loopback, порт 8787 и локалните Vite/Capacitor origins. HTTP timings, request/response bytes и JSON checkpoint bytes са лабораторни показатели, не измерени DB storage, cloud cost или tap-to-photon latency.

## 4. Генериране и Android build

Необходими са **JDK 21**, Android SDK с API 36 и подходящи build tools; `ANDROID_HOME` трябва да сочи към SDK. CI използва Ubuntu 24.04. Wrapper-ът идва от Capacitor template: Gradle 8.14.3 / AGP 8.13.0.

```bash
npm run build
npm run native:generate -- --platform android
npm run native:generate -- --platform android --check
bash android/gradlew -p android --no-daemon --stacktrace :app:assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Generator-ът изтрива и създава отново **само избраната игнорирана** директория `android/` или `ios/`. **Той изпълнява и `cap sync`.** Не прави отделен sync след него: особено `cap sync ios` презаписва app SPM manifest и премахва exact UMP constraint. След промяна в web кода изпълни build → generator отново; `--check` открива липсващата конфигурация. Не пази ръчни native промени в генерираните директории.

Android използва Google sample app ID, portrait и exact GMA **25.4.0** / UMP **4.0.0**, с премахнат `AD_ID` permission. Само Debug допуска локален HTTP и необходимото WebView mixed content за `localhost`, `127.0.0.1`, `10.0.2.2`; останалият cleartext е забранен.

За стандартния Android Emulator, работещ на същия host като probe сървъра, въведи **http://10.0.2.2:8787/v1/probe**. `localhost` в емулатора е самият емулатор. За отдалечен сървър или физическо устройство използвай достижим **HTTPS** endpoint; произволен LAN HTTP адрес се отхвърля от UI. Сървърът трябва да приема точния WebView origin. Локалният probe не се публикува автоматично от тези команди.

## 5. iOS Simulator build

Нужен е Mac. CI използва macOS 26 / **Xcode 26.6**; избраният GMA изисква Xcode 26.2+. От Bash, при инсталиран Xcode 26.6:

```bash
export DEVELOPER_DIR=/Applications/Xcode_26.6.app/Contents/Developer
npm run build
npm run native:generate -- --platform ios
npm run native:generate -- --platform ios --check
resolution_flags=()
if [[ -f native-locks/Package.resolved ]]; then
  resolution_flags+=(-disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile)
fi
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App "${resolution_flags[@]}"
xcodebuild build -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/ios \
  -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=
```

Това създава simulator `.app`, без App Store credentials. То не е IPA за физически iPhone. За UI можеш да отвориш `ios/App/App.xcodeproj` в Xcode и да избереш наличен iPhone Simulator. Ако probe-ът работи на същия Mac, използвай `http://localhost:8787/v1/probe`; за remote endpoint — HTTPS. iOS настройката е само `NSAllowsLocalNetworking`, без broad ATS exceptions.

SPM използва Capacitor **8.5.3**, GMA **13.11.0** и app-level exact UMP **3.1.0**. Ако има проверен `native-locks/Package.resolved`, generator-ът го копира в `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`. Първото CI resolution трябва да върне действителния lock като artifact за преглед. Simulator compilation/presentation не заменя тест на физическо устройство за ads, audio, background и recovery.

## 6. Native callbacks и бъдещ SSV тест

В native приложението **Native callbacks only · no server needed** зарежда Google demo rewarded unit; след loaded натисни **Show test ad**. Наблюдавай earned/dismissed, блокиране на input/audio и foreground. След затварянето **Finish callback-only trace** завършва наблюдението. Този режим няма server reward и не възстановява SP. No-fill, UMP отказ или SDK грешка се записват като резултат от теста, без заобикаляне на gate-а.

Текущият adapter използва само официални Google demo IDs, `isTesting: true`, non-personalized request и фиксиран child/unknown context с отделни UMP/GMA flags и G rating. Това е ограничен privacy test context; не е завършеният all-ages onboarding.

**Demo units не принадлежат на наш AdMob account и не можем да насочим техния SSV callback към наш endpoint.** Native server опит не получава grant само защото SDK е излъчил `earned`; проверката остава pending. След затворена, непотвърдена demo реклама **End unverified probe · no reward** приключва само локалната диагностична сесия и освобождава UI за нов тест. Не отменя server intent и не дава SP; старата сесия няма последващ recovery UI в този ограничен lab. `verifiedSsvGrants` е действителният брояч, а името на evidence channel само по себе си не доказва callback.

Бъдещият end-to-end SSV тест изисква собствен AdMob app/rewarded unit, конфигуриран и проверен **public HTTPS callback URL**, регистрирано **test device** и потвърдено test-ad обслужване. Това е отделна, преглеждана промяна на sample app/unit конфигурацията и server allowlist, не наличен environment switch. При plugin 8.2.1 `isTesting: true` подменя unit-а с Google demo unit на iOS; account-owned тестът трябва да запази собствен unit чрез съответната конфигурация, като test-device регистрацията продължава да осигурява тестови реклами. Подробностите и native log ограниченията са в [native audit, раздел 7](../../docs/spikes/CPI-002-native-audit.md).

AdMob „Verify URL“, unit tests със собствен тестов ключ и JS callback trace са отделни доказателства; никое не замества наблюдаван, подписан Google callback за конкретен native intent. Източници: [Google SSV](https://developers.google.com/admob/android/ssv), [AdMob callback setup](https://support.google.com/admob/answer/9603226?hl=en), [Android test devices](https://developers.google.com/admob/android/test-ads), [iOS test devices](https://developers.google.com/admob/ios/test-ads).

## 7. Артефакти и отчет

[Mobile spike workflow](../../.github/workflows/mobile-spike.yml) изпълнява web checks и отделни Android/iOS compilation jobs. Артефактите се пазят **7 дни**:

| Изход | Път / CI artifact |
| --- | --- |
| Web bundle | `dist/` |
| Проверена native конфигурация | `artifacts/native-config-android.json`, `artifacts/native-config-ios.json` |
| Build logs / dependency reports | `artifacts/`; CI `mobile-spike-web-evidence`, `mobile-spike-android-evidence`, `mobile-spike-ios-evidence` |
| Android debug APK | `android/app/build/outputs/apk/debug/app-debug.apk`; CI `mobile-spike-android-debug` |
| iOS Simulator app | `build/ios/Build/Products/Debug-iphonesimulator/App.app`; CI `mobile-spike-ios-simulator` съдържа `cpi002-ios-simulator.tar.gz` |
| Разрешен SPM lock | `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`, включен в iOS evidence |
| Ръчно експортирани наблюдения | Browser/native **Export JSON** → `cpi002-web-evidence.json` или съответния platform filename; native download behavior остава device проверка |

CI проверява resolved SDK версиите и отсъствието на `AD_ID` в merged debug manifest. Успешен compilation job удостоверява само изпълнените build/check стъпки. Записвай отделно OS/device, dependency versions, броя timing samples, UMP/ad резултат и дали има **реално verified SSV**, когато попълваш [results](../../docs/spikes/CPI-002-results.md).
