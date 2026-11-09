#!/usr/bin/env node
// Generates disposable app projects, not the CPI-002 lab. This command owns
// Capacitor add + sync; repeat the build/generate sequence after web changes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertBuiltEnvironment,
  getBuildInfo,
  requireEnvironment,
} from '../config/environments.ts';
import { patchAndroidLifecycle } from '../config/native-lifecycle-patch.ts';
import { BRAND_BACKGROUND, syncNativeBrandAssets } from './brand-assets.mjs';
import { assertUnsignedRelease, resolveUnsignedRelease } from '../config/release-build.ts';
import {
  LIVE_NATIVE_PACKAGES,
  GOOGLE_ADS_SDK,
  readNativeIntegrations,
} from '../config/native-integrations.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '../..');
const appRequire = createRequire(join(appRoot, 'package.json'));
const capacitorVersion = '8.5.3';
let buildNumber = 1;
let release = null;
let integrations;
const background = BRAND_BACKGROUND;
const nativePackages = [
  '@capacitor/cli',
  '@capacitor/core',
  '@capacitor/android',
  '@capacitor/ios',
];
const iosLockPath =
  'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';

function read(path) {
  return readFileSync(join(appRoot, path), 'utf8');
}
function json(path) {
  return JSON.parse(read(path));
}
function write(path, content) {
  const destination = join(appRoot, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}
function replaceOnce(text, before, after, description) {
  assert.equal(text.split(before).length, 2, `Unexpected Capacitor template: ${description}`);
  return text.replace(before, after);
}
function options() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: node --experimental-strip-types scripts/generate-native.mjs --platform android|ios --environment development|staging|production [--check]',
    );
    console.log(
      'Build the matching web environment first. Only the selected ignored native directory is regenerated.',
    );
    process.exit(0);
  }
  let platform;
  let environment;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--platform' && platform === undefined) platform = args[++index];
    else if (args[index] === '--environment' && environment === undefined)
      environment = args[++index];
    else if (args[index] === '--check' && !check) check = true;
    else throw new Error(`Unknown or repeated argument: ${args[index]}`);
  }
  assert.ok(
    platform === 'android' || platform === 'ios',
    'Specify --platform android or --platform ios',
  );
  return { platform, environment: requireEnvironment(environment), check };
}
function verifyPackages() {
  const manifest = json('package.json');
  const workspace = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@crystal-path-infinity/mobile');
  assert.equal(workspace.name, '@crystal-path-infinity/workspace');
  assert.match(
    manifest.version,
    /^\d+\.\d+\.\d+$/,
    'Native version must be numeric major.minor.patch',
  );
  const declarations = {
    ...workspace.dependencies,
    ...workspace.devDependencies,
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  for (const name of nativePackages) {
    assert.equal(declarations[name], capacitorVersion, `${name} declared version`);
    assert.equal(
      JSON.parse(readFileSync(appRequire.resolve(`${name}/package.json`), 'utf8')).version,
      capacitorVersion,
      `${name} installed version`,
    );
  }
  const appDependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  for (const [name, version] of Object.entries(LIVE_NATIVE_PACKAGES)) {
    assert.equal(declarations[name], version, `${name} declared version`);
    assert.equal(
      JSON.parse(readFileSync(appRequire.resolve(`${name}/package.json`), 'utf8')).version,
      version,
      `${name} installed version`,
    );
  }
  assert.ok(
    !appDependencies.some(
      (name) =>
        (name.startsWith('@capacitor-community/') && !Object.hasOwn(LIVE_NATIVE_PACKAGES, name)) ||
        (name.startsWith('@capacitor/') && !nativePackages.includes(name)),
    ),
    'Only explicitly pinned and reviewed native integrations are allowed',
  );
  return manifest;
}
function cliRequire() {
  return createRequire(appRequire.resolve('@capacitor/cli/package.json'));
}
function runCap(environment, ...args) {
  const executable = join(
    dirname(appRequire.resolve('@capacitor/cli/package.json')),
    'bin/capacitor',
  );
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: appRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CPI_APP_ENV: environment,
      CI: 'true',
      CAPACITOR_TELEMETRY_DISABLED: '1',
    },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Capacitor ${args.join(' ')} failed`);
}
function configureAndroid(info) {
  // A disposable copy pins the upstream source and keeps node_modules pristine.
  const capacitorPackage = dirname(appRequire.resolve('@capacitor/android/package.json'));
  cpSync(capacitorPackage, join(appRoot, 'android/cpi-capacitor'), { recursive: true });
  write(
    'android/cpi-capacitor/capacitor/src/main/java/com/getcapacitor/CpiLifecycleGate.java',
    read('native-templates/android/CpiLifecycleGate.java'),
  );
  const lifecycleSource =
    'android/cpi-capacitor/capacitor/src/main/java/com/getcapacitor/cordova/MockCordovaWebViewImpl.java';
  write(lifecycleSource, patchAndroidLifecycle(read(lifecycleSource)));
  write(
    'android/capacitor.settings.gradle',
    replaceOnce(
      read('android/capacitor.settings.gradle'),
      "new File('../../../node_modules/@capacitor/android/capacitor')",
      "new File(settingsDir, 'cpi-capacitor/capacitor')",
      'Pinned Android lifecycle source copy',
    ),
  );
  const javaPath = `android/app/src/main/java/${info.appId.replaceAll('.', '/')}`;
  for (const name of [
    'MainActivity.java',
    'CpiLifecycle.java',
    'CpiFeedback.java',
    'CpiSecureSession.java',
    'CpiWebView.java',
  ]) {
    write(
      `${javaPath}/${name}`,
      read(`native-templates/android/${name}`)
        .replaceAll('__PACKAGE__', info.appId)
        .replaceAll('__DEVELOPMENT__', String(info.environment === 'development')),
    );
  }
  if (integrations.ads) {
    write(
      `${javaPath}/CpiRewardedAds.java`,
      read('native-templates/android/CpiRewardedAds.java').replaceAll('__PACKAGE__', info.appId),
    );
    write(
      `${javaPath}/MainActivity.java`,
      replaceOnce(
        read(`${javaPath}/MainActivity.java`),
        'registerPlugin(CpiSecureSession.class);',
        'registerPlugin(CpiSecureSession.class);\n        registerPlugin(CpiRewardedAds.class);',
        'Rewarded ad bridge registration',
      ),
    );
    write(
      'android/variables.gradle',
      read('android/variables.gradle') +
        `\next { playServicesAdsVersion = '${GOOGLE_ADS_SDK.android}' }\n`,
    );
  }
  write(
    'android/app/src/main/res/layout/capacitor_bridge_layout_main.xml',
    read(
      'android/cpi-capacitor/capacitor/src/main/res/layout/capacitor_bridge_layout_main.xml',
    ).replaceAll('com.getcapacitor.CapacitorWebView', `${info.appId}.CpiWebView`),
  );
  let manifest = read('android/app/src/main/AndroidManifest.xml');
  // Template permissions are deliberately limited to network access. Dependency
  // manifest permissions are checked again on the compiled artifact in CI.
  manifest = manifest.replace(/\s*<uses-permission\b[^>]*\/\s*>/g, '');
  if (integrations.ads) {
    manifest = manifest.replace(
      '<manifest ',
      '<manifest xmlns:tools="http://schemas.android.com/tools" ',
    );
    const removed = [
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_ADSERVICES_AD_ID',
      'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
      'android.permission.ACCESS_ADSERVICES_TOPICS',
    ];
    manifest = manifest.replace(
      '</manifest>',
      removed
        .map((name) => `    <uses-permission android:name="${name}" tools:node="remove" />`)
        .join('\n') + '\n</manifest>',
    );
  }
  manifest = replaceOnce(
    manifest,
    '</manifest>',
    '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>',
    'Android permissions',
  );
  manifest = replaceOnce(
    manifest,
    '    <application\n',
    '    <application\n        android:usesCleartextTraffic="false"\n',
    'Android cleartext policy',
  );
  manifest = replaceOnce(
    manifest,
    'android:allowBackup="true"',
    'android:allowBackup="false"',
    'Android backup policy',
  );
  manifest = replaceOnce(
    manifest,
    '        <activity\n',
    '        <activity\n            android:screenOrientation="portrait"\n',
    'Android orientation',
  );
  if (integrations.ads) {
    manifest = replaceOnce(
      manifest,
      '</application>',
      `    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${integrations.androidAdMobAppId}" />\n` +
        '    <meta-data android:name="com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT" android:value="true" />\n    </application>',
      'AdMob application identity',
    );
  }
  write('android/app/src/main/AndroidManifest.xml', manifest);
  let gradle = read('android/app/build.gradle');
  if (integrations.ads)
    gradle = replaceOnce(
      gradle,
      'dependencies {',
      `dependencies {\n    implementation 'com.google.android.gms:play-services-ads:${GOOGLE_ADS_SDK.android}'`,
      'Pinned ads SDK',
    );
  gradle = replaceOnce(
    gradle,
    'versionName "1.0"',
    `versionName "${info.version}"`,
    'Android versionName',
  );
  gradle = replaceOnce(
    gradle,
    'versionCode 1',
    `versionCode ${buildNumber}`,
    'Android versionCode',
  );
  assert.ok(gradle.includes(`versionCode ${buildNumber}`), 'Unexpected Android versionCode');
  write('android/app/build.gradle', gradle);
  // Use a black system starting window so the Kolequant intro owns the visible splash.
  write(
    'android/app/src/main/res/values/cpi_colors.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="cpi_background">${background}</color></resources>
`,
  );
  write(
    'android/app/src/main/res/values/styles.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/cpi_background</item>
        <item name="android:statusBarColor">@color/cpi_background</item>
        <item name="android:navigationBarColor">@color/cpi_background</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="AppTheme">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/cpi_background</item>
        <item name="windowSplashScreenAnimatedIcon">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`,
  );
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    write(
      `android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`,
      read('native-templates/android/cpi_adaptive_icon.xml'),
    );
  }
  write(
    'android/app/src/main/res/drawable/cpi_monochrome.xml',
    read('native-templates/android/cpi_monochrome.xml'),
  );
  syncNativeBrandAssets(appRoot, 'android');
}
function configureIOS(info) {
  if (integrations.ads) {
    let swift = read('ios/App/CapApp-SPM/Package.swift');
    swift = replaceOnce(
      swift,
      '    dependencies: [\n        .package(',
      `    dependencies: [
        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git", exact: "${GOOGLE_ADS_SDK.ios}"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-user-messaging-platform.git", exact: "3.1.0"),
        .package(`,
      'Pinned Google iOS packages',
    );
    swift = replaceOnce(
      swift,
      '                .product(name: "Capacitor", package: "capacitor-swift-pm"),',
      '                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads"),\n                .product(name: "Capacitor", package: "capacitor-swift-pm"),',
      'Direct rewarded bridge dependency',
    );
    write('ios/App/CapApp-SPM/Package.swift', swift);
  }
  write(
    'ios/App/App/AppDelegate.swift',
    read('ios/App/App/AppDelegate.swift') +
      '\n' +
      read('native-templates/ios/CpiLifecycle.swift').replaceAll(
        '__DEVELOPMENT__',
        String(info.environment === 'development'),
      ) +
      '\n' +
      read('native-templates/ios/CpiSecureSession.swift'),
  );
  write(
    'ios/App/App/SceneDelegate.swift',
    replaceOnce(
      read('ios/App/App/SceneDelegate.swift'),
      'CAPBridgeViewController()',
      'CpiBridgeViewController()',
      'iOS lifecycle controller',
    ),
  );
  write(
    'ios/App/App/Base.lproj/Main.storyboard',
    replaceOnce(
      read('ios/App/App/Base.lproj/Main.storyboard'),
      'customClass="CAPBridgeViewController" customModule="Capacitor"',
      'customClass="CpiBridgeViewController" customModule="App"',
      'iOS storyboard lifecycle controller',
    ),
  );
  const plist = cliRequire()('plist');
  const config = plist.parse(read('ios/App/App/Info.plist'));
  config.UISupportedInterfaceOrientations = ['UIInterfaceOrientationPortrait'];
  delete config['UISupportedInterfaceOrientations~ipad'];
  config.UIUserInterfaceStyle = 'Dark';
  config.GCSupportsGameMode = true;
  config.LSSupportsGameMode = true;
  config.UIStatusBarHidden = true;
  config.UIViewControllerBasedStatusBarAppearance = true;
  if (integrations.ads) {
    config.GADApplicationIdentifier = integrations.iosAdMobAppId;
    config.GADDelayAppMeasurementInit = true;
    const delegate = read('ios/App/App/AppDelegate.swift');
    write(
      'ios/App/App/AppDelegate.swift',
      replaceOnce(
        delegate,
        'bridge?.registerPluginInstance(CpiSecureSession())',
        'bridge?.registerPluginInstance(CpiSecureSession())\n        bridge?.registerPluginInstance(CpiRewardedAds())',
        'iOS rewarded bridge',
      ) +
        '\n' +
        read('native-templates/ios/CpiRewardedAds.swift'),
    );
  }
  delete config.NSAppTransportSecurity; // ATS defaults; no local/remote cleartext exception.
  assert.ok(
    !Object.keys(config).some((key) => key.endsWith('UsageDescription')),
    'Unexpected iOS permission purpose string',
  );
  write('ios/App/App/Info.plist', `${plist.build(config)}\n`);

  let project = read('ios/App/App.xcodeproj/project.pbxproj');
  write('ios/App/App/PrivacyInfo.xcprivacy', read('native-templates/ios/PrivacyInfo.xcprivacy'));
  project = replaceOnce(
    project,
    '/* Begin PBXBuildFile section */',
    '/* Begin PBXBuildFile section */\n\t\tC00700000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = C00700000000000000000002 /* PrivacyInfo.xcprivacy */; };',
    'privacy build resource',
  );
  project = replaceOnce(
    project,
    '/* Begin PBXFileReference section */',
    '/* Begin PBXFileReference section */\n\t\tC00700000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };',
    'privacy file reference',
  );
  project = replaceOnce(
    project,
    '\t\t\t\t504EC3131FED79650016851F /* Info.plist */,',
    '\t\t\t\t504EC3131FED79650016851F /* Info.plist */,\n\t\t\t\tC00700000000000000000002 /* PrivacyInfo.xcprivacy */,',
    'privacy app group',
  );
  project = replaceOnce(
    project,
    '\t\t\t\t504EC3121FED79650016851F /* LaunchScreen.storyboard in Resources */,',
    '\t\t\t\t504EC3121FED79650016851F /* LaunchScreen.storyboard in Resources */,\n\t\t\t\tC00700000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,',
    'privacy resources phase',
  );
  assert.equal(project.match(/TARGETED_DEVICE_FAMILY = "1,2";/g)?.length, 2);
  assert.equal(project.match(/MARKETING_VERSION = 1\.0;/g)?.length, 2);
  assert.equal(project.match(/CURRENT_PROJECT_VERSION = 1;/g)?.length, 2);
  project = project
    .replaceAll('TARGETED_DEVICE_FAMILY = "1,2";', 'TARGETED_DEVICE_FAMILY = "1";')
    .replaceAll('MARKETING_VERSION = 1.0;', `MARKETING_VERSION = ${info.version};`)
    .replaceAll('CURRENT_PROJECT_VERSION = 1;', `CURRENT_PROJECT_VERSION = ${buildNumber};`)
    .replaceAll(
      'CODE_SIGN_STYLE = Automatic;',
      'CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;',
    )
    .replaceAll('CODE_SIGN_IDENTITY = "iPhone Developer";', 'CODE_SIGN_IDENTITY = "";');
  write('ios/App/App.xcodeproj/project.pbxproj', project);

  // Match the WebView background while the Kolequant intro is loading.
  write(
    'ios/App/App/Base.lproj/LaunchScreen.storyboard',
    read('native-templates/ios/LaunchScreen.storyboard'),
  );
  syncNativeBrandAssets(appRoot, 'ios');

  const savedLock = join(
    appRoot,
    integrations.ads ? 'native-locks/Package.ads.resolved' : 'native-locks/Package.resolved',
  );
  if (existsSync(savedLock)) {
    mkdirSync(dirname(join(appRoot, iosLockPath)), { recursive: true });
    copyFileSync(savedLock, join(appRoot, iosLockPath));
  }
}
function verifyNative(platform, info) {
  const configPath =
    platform === 'android'
      ? 'android/app/src/main/assets/capacitor.config.json'
      : 'ios/App/App/capacitor.config.json';
  const config = json(configPath);
  assert.equal(config.appId, info.appId);
  assert.equal(config.appName, info.appName);
  assert.equal(config.backgroundColor, background);
  assert.equal(
    config.server?.url,
    undefined,
    'No live-reload/backend URL may be baked into the native app',
  );
  assert.notEqual(config.server?.cleartext, true);
  assert.notEqual(config.server?.androidScheme, 'http');
  assert.notEqual(config.android?.allowMixedContent, true);
  assert.deepEqual(
    config.plugins,
    {
      SystemBars: { style: 'DARK', insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
      ...(integrations.purchases ? { NativePurchases: { autoFinishTransactions: false } } : {}),
    },
    'Only the bundled SystemBars presentation settings need Capacitor configuration',
  );
  const copiedBuildInfo =
    platform === 'android'
      ? 'android/app/src/main/assets/public/build-info.json'
      : 'ios/App/App/public/build-info.json';
  assertBuiltEnvironment(json(copiedBuildInfo), info.environment, info.version);
  const copiedRelease =
    platform === 'android'
      ? 'android/app/src/main/assets/public/release-info.json'
      : 'ios/App/App/public/release-info.json';
  if (release) assertUnsignedRelease(json(copiedRelease), release);
  else
    assert.ok(
      !existsSync(join(appRoot, copiedRelease)),
      'Unexpected release metadata in an ordinary build',
    );
  if (platform === 'android') {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const permissions = [
      ...manifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g),
    ].map((match) => match[1]);
    assert.deepEqual(
      permissions,
      integrations.ads
        ? [
            'com.google.android.gms.permission.AD_ID',
            'android.permission.ACCESS_ADSERVICES_AD_ID',
            'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
            'android.permission.ACCESS_ADSERVICES_TOPICS',
            'android.permission.INTERNET',
          ]
        : ['android.permission.INTERNET'],
    );
    assert.ok(manifest.includes('android:usesCleartextTraffic="false"'));
    assert.ok(manifest.includes('android:screenOrientation="portrait"'));
    assert.ok(!/networkSecurityConfig/.test(manifest));
    if (integrations.ads) assert.ok(manifest.includes('tools:node="remove"'));
    else assert.ok(!/AD_ID/.test(manifest));
    if (integrations.ads) assert.ok(manifest.includes(integrations.androidAdMobAppId));
    else assert.ok(!/com\.google/.test(manifest));
    const gradle = read('android/app/build.gradle');
    assert.ok(gradle.includes(`applicationId "${info.appId}"`));
    assert.ok(gradle.includes(`versionName "${info.version}"`));
    assert.ok(gradle.includes(`versionCode ${buildNumber}`));
    assert.ok(
      !gradle.includes('signingConfig '),
      'No production signing configuration is generated',
    );
    assert.deepEqual(
      json('android/app/src/main/assets/capacitor.plugins.json'),
      integrations.plugins.map((pkg) => ({
        pkg,
        classpath:
          pkg === '@capacitor-community/admob'
            ? 'com.getcapacitor.community.admob.AdMob'
            : 'ee.forgr.nativepurchases.NativePurchasesPlugin',
      })),
      'Only configured native integrations are copied into this app',
    );
    assert.ok(read('android/app/src/main/res/values/cpi_colors.xml').includes(background));
    const launchStyle = read('android/app/src/main/res/values/styles.xml');
    assert.ok(
      launchStyle.includes(
        '<item name="windowSplashScreenAnimatedIcon">@android:color/transparent</item>',
      ),
    );
    assert.ok(
      launchStyle.includes(
        '<item name="windowSplashScreenBackground">@color/cpi_background</item>',
      ),
    );
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      assert.equal(
        read(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`),
        read('native-templates/android/cpi_adaptive_icon.xml'),
      );
    }
    assert.equal(
      read('android/app/src/main/res/drawable/cpi_monochrome.xml'),
      read('native-templates/android/cpi_monochrome.xml'),
    );
    assert.equal(
      read(
        'android/cpi-capacitor/capacitor/src/main/java/com/getcapacitor/cordova/MockCordovaWebViewImpl.java',
      ),
      patchAndroidLifecycle(
        readFileSync(
          join(
            dirname(appRequire.resolve('@capacitor/android/package.json')),
            'capacitor/src/main/java/com/getcapacitor/cordova/MockCordovaWebViewImpl.java',
          ),
          'utf8',
        ),
      ),
    );
    assert.ok(
      read('android/capacitor.settings.gradle').includes(
        "new File(settingsDir, 'cpi-capacitor/capacitor')",
      ),
    );
    assert.equal(
      read('android/cpi-capacitor/capacitor/src/main/java/com/getcapacitor/CpiLifecycleGate.java'),
      read('native-templates/android/CpiLifecycleGate.java'),
    );
    assert.ok(
      read(
        `android/app/src/main/java/${info.appId.replaceAll('.', '/')}/MainActivity.java`,
      ).includes('registerPlugin(CpiLifecycle.class)'),
    );
    for (const name of [
      'MainActivity.java',
      'CpiLifecycle.java',
      'CpiFeedback.java',
      'CpiSecureSession.java',
      'CpiWebView.java',
    ]) {
      let expected = read(`native-templates/android/${name}`)
        .replaceAll('__PACKAGE__', info.appId)
        .replaceAll('__DEVELOPMENT__', String(info.environment === 'development'));
      if (integrations.ads && name === 'MainActivity.java')
        expected = expected.replace(
          'registerPlugin(CpiSecureSession.class);',
          'registerPlugin(CpiSecureSession.class);\n        registerPlugin(CpiRewardedAds.class);',
        );
      assert.equal(
        read(`android/app/src/main/java/${info.appId.replaceAll('.', '/')}/${name}`),
        expected,
      );
    }
  } else {
    const plist = cliRequire()('plist').parse(read('ios/App/App/Info.plist'));
    assert.equal(plist.CFBundleDisplayName, info.appName);
    assert.deepEqual(plist.UISupportedInterfaceOrientations, ['UIInterfaceOrientationPortrait']);
    assert.equal(plist.UIUserInterfaceStyle, 'Dark');
    assert.equal(plist.GCSupportsGameMode, true);
    assert.equal(plist.LSSupportsGameMode, true);
    assert.equal(plist.UIStatusBarHidden, true);
    assert.equal(plist.UIViewControllerBasedStatusBarAppearance, true);
    assert.equal(plist.NSAppTransportSecurity, undefined);
    assert.ok(
      !Object.keys(plist).some(
        (key) => key.endsWith('UsageDescription') || (!integrations.ads && key.startsWith('GAD')),
      ),
    );
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    assert.equal(
      [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].filter(
        (match) => match[1] === info.appId,
      ).length,
      2,
    );
    assert.equal(project.match(/TARGETED_DEVICE_FAMILY = "1";/g)?.length, 2);
    assert.equal(project.split(`MARKETING_VERSION = ${info.version};`).length, 3);
    assert.equal(project.split(`CURRENT_PROJECT_VERSION = ${buildNumber};`).length, 3);
    assert.equal(project.match(/CODE_SIGNING_ALLOWED = NO;/g)?.length, 2);
    assert.ok(!project.includes('CODE_SIGN_STYLE = Automatic;'));
    const swift = read('ios/App/CapApp-SPM/Package.swift');
    assert.ok(swift.includes(`capacitor-swift-pm.git", exact: "${capacitorVersion}"`));
    assert.equal(
      (swift.match(/\.package\(/g) ?? []).length,
      1 + integrations.plugins.length + (integrations.ads ? 2 : 0),
      'Only Capacitor and configured integrations may be app SPM dependencies',
    );
    if (!integrations.ads)
      assert.ok(!/Admob|AdMob|GoogleMobileAds|GoogleUserMessagingPlatform/.test(swift));
    assert.ok(
      read('ios/App/App/AppDelegate.swift').includes('registerPluginInstance(CpiLifecycle())'),
    );
    assert.ok(
      read('ios/App/App/AppDelegate.swift').includes('registerPluginInstance(CpiSecureSession())'),
    );
    assert.ok(read('ios/App/App/SceneDelegate.swift').includes('CpiBridgeViewController()'));
    let expectedDelegate =
      read('native-templates/ios/CpiLifecycle.swift').replaceAll(
        '__DEVELOPMENT__',
        String(info.environment === 'development'),
      ) +
      '\n' +
      read('native-templates/ios/CpiSecureSession.swift');
    if (integrations.ads)
      expectedDelegate =
        expectedDelegate.replace(
          'bridge?.registerPluginInstance(CpiSecureSession())',
          'bridge?.registerPluginInstance(CpiSecureSession())\n        bridge?.registerPluginInstance(CpiRewardedAds())',
        ) +
        '\n' +
        read('native-templates/ios/CpiRewardedAds.swift');
    assert.ok(read('ios/App/App/AppDelegate.swift').endsWith(expectedDelegate));
    assert.equal(
      read('ios/App/App/PrivacyInfo.xcprivacy'),
      read('native-templates/ios/PrivacyInfo.xcprivacy'),
    );
    assert.equal(project.match(/PrivacyInfo.xcprivacy in Resources/g)?.length, 2);
    assert.equal(
      read('ios/App/App/Base.lproj/LaunchScreen.storyboard'),
      read('native-templates/ios/LaunchScreen.storyboard'),
    );
    const appIcons = json('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json');
    assert.ok(
      appIcons.images.some(
        (item) => item.size === '1024x1024' && item.filename === 'AppIcon-512@2x.png',
      ),
    );
  }
  const brandAssets = syncNativeBrandAssets(appRoot, platform, true);
  const report = {
    schemaVersion: 1,
    platform,
    buildInfo: info,
    buildNumber,
    capacitorVersion,
    background,
    brandAssets,
    nativeFeaturePlugins: [
      'CpiLifecycle (local, no device permissions)',
      'CpiSecureSession (local, device-bound refresh credential only)',
      ...integrations.plugins.map((pkg) => `${pkg}@${LIVE_NATIVE_PACKAGES[pkg]}`),
      ...(integrations.ads ? ['CpiRewardedAds (local, server nonce before presentation)'] : []),
    ],
    bundledSystemBars: config.plugins.SystemBars,
    productionSigningConfigured: false,
    configuredOnly: true,
    scope:
      'Generated configuration; compilation and emulator/simulator launch have separate evidence.',
  };
  write(`artifacts/native-config-${platform}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

try {
  const { platform, environment, check } = options();
  integrations = readNativeIntegrations(process.env, environment);
  const manifest = verifyPackages();
  release = resolveUnsignedRelease(environment, manifest.version, process.env);
  buildNumber = release?.buildNumber ?? 1;
  const info = release?.app ?? getBuildInfo(environment, manifest.version);
  // This guard must run before rm/add/sync or any generated project mutation.
  assertBuiltEnvironment(json('dist/build-info.json'), environment, info.version);
  if (release) assertUnsignedRelease(json('dist/release-info.json'), release);
  else
    assert.ok(
      !existsSync(join(appRoot, 'dist/release-info.json')),
      'Unexpected release metadata; rebuild ordinary assets',
    );
  assert.ok(
    existsSync(join(appRoot, 'dist/index.html')),
    'Build the matching web environment first',
  );
  const target = join(appRoot, platform);
  assert.equal(
    dirname(target),
    appRoot,
    'Native target must remain a direct app workspace directory',
  );
  assert.ok(
    !existsSync(target) || !lstatSync(target).isSymbolicLink(),
    'Refusing a symlinked native directory',
  );
  if (!check) {
    rmSync(target, { recursive: true, force: true });
    runCap(
      environment,
      'add',
      platform,
      ...(platform === 'ios' ? ['--packagemanager', 'SPM'] : []),
    );
    runCap(environment, 'sync', platform);
    if (platform === 'android') configureAndroid(info);
    else configureIOS(info);
  }
  verifyNative(platform, info);
} catch (error) {
  console.error(`Native generation failed: ${error.message}`);
  process.exitCode = 1;
}
