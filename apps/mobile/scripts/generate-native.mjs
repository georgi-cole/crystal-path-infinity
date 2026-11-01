#!/usr/bin/env node
// Generates disposable app projects, not the CPI-002 lab. This command owns
// Capacitor add + sync; repeat the build/generate sequence after web changes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
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

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '../..');
const appRequire = createRequire(join(appRoot, 'package.json'));
const capacitorVersion = '8.5.3';
const buildNumber = 1;
const background = '#080c1b';
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
  assert.ok(
    !appDependencies.some(
      (name) =>
        name.startsWith('@capacitor-community/') ||
        (name.startsWith('@capacitor/') && !nativePackages.includes(name)),
    ),
    'CPI-003 includes no native feature/ad plugins',
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
  let manifest = read('android/app/src/main/AndroidManifest.xml');
  // Template permissions are deliberately limited to network access. Dependency
  // manifest permissions are checked again on the compiled artifact in CI.
  manifest = manifest.replace(/\s*<uses-permission\b[^>]*\/\s*>/g, '');
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
  write('android/app/src/main/AndroidManifest.xml', manifest);
  let gradle = read('android/app/build.gradle');
  gradle = replaceOnce(
    gradle,
    'versionName "1.0"',
    `versionName "${info.version}"`,
    'Android versionName',
  );
  assert.ok(gradle.includes(`versionCode ${buildNumber}`), 'Unexpected Android versionCode');
  write('android/app/build.gradle', gradle);
  // Neutral launch background only. The designed splash belongs to its backlog task.
  write(
    'android/app/src/main/res/values/cpi_colors.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="cpi_background">${background}</color></resources>
`,
  );
  write(
    'android/app/src/main/res/drawable/cpi_launch_placeholder.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="@android:color/transparent" /></shape>
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
        <item name="windowSplashScreenAnimatedIcon">@drawable/cpi_launch_placeholder</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
`,
  );
}
function configureIOS(info) {
  const plist = cliRequire()('plist');
  const config = plist.parse(read('ios/App/App/Info.plist'));
  config.UISupportedInterfaceOrientations = ['UIInterfaceOrientationPortrait'];
  delete config['UISupportedInterfaceOrientations~ipad'];
  config.UIUserInterfaceStyle = 'Dark';
  delete config.NSAppTransportSecurity; // ATS defaults; no local/remote cleartext exception.
  assert.ok(
    !Object.keys(config).some((key) => key.endsWith('UsageDescription')),
    'Unexpected iOS permission purpose string',
  );
  write('ios/App/App/Info.plist', `${plist.build(config)}\n`);

  let project = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.equal(project.match(/TARGETED_DEVICE_FAMILY = "1,2";/g)?.length, 2);
  assert.equal(project.match(/MARKETING_VERSION = 1\.0;/g)?.length, 2);
  assert.equal(project.match(/CURRENT_PROJECT_VERSION = 1;/g)?.length, 2);
  project = project
    .replaceAll('TARGETED_DEVICE_FAMILY = "1,2";', 'TARGETED_DEVICE_FAMILY = "1";')
    .replaceAll('MARKETING_VERSION = 1.0;', `MARKETING_VERSION = ${info.version};`)
    .replaceAll(
      'CODE_SIGN_STYLE = Automatic;',
      'CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;',
    )
    .replaceAll('CODE_SIGN_IDENTITY = "iPhone Developer";', 'CODE_SIGN_IDENTITY = "";');
  write('ios/App/App.xcodeproj/project.pbxproj', project);

  let launch = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
  launch = launch
    .replace(' image="Splash"', '')
    .replace('<image name="Splash" width="1366" height="1366"/>', '')
    .replace(
      '<color key="backgroundColor" systemColor="systemBackgroundColor"/>',
      '<color key="backgroundColor" red="0.031372549" green="0.047058824" blue="0.105882353" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>',
    );
  write('ios/App/App/Base.lproj/LaunchScreen.storyboard', launch);

  const savedLock = join(appRoot, 'native-locks/Package.resolved');
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
    },
    'Only the bundled SystemBars presentation settings belong in CPI-003',
  );
  const copiedBuildInfo =
    platform === 'android'
      ? 'android/app/src/main/assets/public/build-info.json'
      : 'ios/App/App/public/build-info.json';
  assertBuiltEnvironment(json(copiedBuildInfo), info.environment, info.version);
  if (platform === 'android') {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const permissions = [
      ...manifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g),
    ].map((match) => match[1]);
    assert.deepEqual(permissions, ['android.permission.INTERNET']);
    assert.ok(manifest.includes('android:usesCleartextTraffic="false"'));
    assert.ok(manifest.includes('android:screenOrientation="portrait"'));
    assert.ok(!/com\.google|AD_ID|networkSecurityConfig/.test(manifest));
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
      [],
      'Feature plugins must not enter the scaffold',
    );
    assert.ok(read('android/app/src/main/res/values/cpi_colors.xml').includes(background));
  } else {
    const plist = cliRequire()('plist').parse(read('ios/App/App/Info.plist'));
    assert.equal(plist.CFBundleDisplayName, info.appName);
    assert.deepEqual(plist.UISupportedInterfaceOrientations, ['UIInterfaceOrientationPortrait']);
    assert.equal(plist.UIUserInterfaceStyle, 'Dark');
    assert.equal(plist.NSAppTransportSecurity, undefined);
    assert.ok(
      !Object.keys(plist).some((key) => key.endsWith('UsageDescription') || key.startsWith('GAD')),
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
    assert.equal(project.match(/CODE_SIGNING_ALLOWED = NO;/g)?.length, 2);
    assert.ok(!project.includes('CODE_SIGN_STYLE = Automatic;'));
    const swift = read('ios/App/CapApp-SPM/Package.swift');
    assert.ok(swift.includes(`capacitor-swift-pm.git", exact: "${capacitorVersion}"`));
    assert.equal(
      (swift.match(/\.package\(/g) ?? []).length,
      1,
      'Only Capacitor may be an app SPM dependency',
    );
    assert.ok(!/AdMob|GoogleMobileAds|GoogleUserMessagingPlatform|CapacitorApp/.test(swift));
  }
  const report = {
    schemaVersion: 1,
    platform,
    buildInfo: info,
    buildNumber,
    capacitorVersion,
    background,
    nativeFeaturePlugins: [],
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
  const manifest = verifyPackages();
  const info = getBuildInfo(environment, manifest.version);
  // This guard must run before rm/add/sync or any generated project mutation.
  assertBuiltEnvironment(json('dist/build-info.json'), environment, manifest.version);
  assert.ok(
    existsSync(join(appRoot, 'dist/index.html')),
    'Build the matching web environment first',
  );
  const target = join(appRoot, platform);
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
