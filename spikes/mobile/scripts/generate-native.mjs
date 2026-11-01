#!/usr/bin/env node
// Recreate ignored lab projects from the installed, pinned Capacitor templates.
// Run this after the web build. A later `cap sync ios` replaces the app SPM
// manifest, so regenerate (or run --check) before compiling after any sync.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versions = Object.freeze({
  '@capacitor/cli': '8.5.3',
  '@capacitor/core': '8.5.3',
  '@capacitor/android': '8.5.3',
  '@capacitor/ios': '8.5.3',
  '@capacitor/app': '8.1.2',
  '@capacitor-community/admob': '8.2.1',
});
const sdkVersions = Object.freeze({
  android: { googleMobileAds: '25.4.0', userMessagingPlatform: '4.0.0' },
  ios: { googleMobileAds: '13.11.0', userMessagingPlatform: '3.1.0' },
});
// Google's public sample application IDs; production IDs are not configurable.
const sampleAppIds = Object.freeze({
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
});
const cli = join(appRoot, 'node_modules/@capacitor/cli/bin/capacitor');
const umpPackage = 'swift-package-manager-google-user-messaging-platform';
const umpUrl = `https://github.com/googleads/${umpPackage}.git`;
const iosLock = 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved';

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

function write(relativePath, content) {
  const target = join(appRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function replaceOnce(text, search, replacement, description) {
  assert.equal(text.split(search).length, 2, `Unexpected template: ${description}`);
  return text.replace(search, replacement);
}

function parseOptions() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node scripts/generate-native.mjs --platform android|ios [--check]');
    console.log('Recreates only the selected ignored native project. --check verifies without regenerating.');
    process.exit(0);
  }
  let platform;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--platform' && platform === undefined) {
      platform = args[++index];
    } else if (args[index] === '--check' && !check) {
      check = true;
    } else {
      throw new Error(`Unsupported or repeated argument: ${args[index]}`);
    }
  }
  assert.ok(platform === 'android' || platform === 'ios', 'Specify --platform android or --platform ios');
  return { platform, check };
}

function verifyPackages() {
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.name, '@crystal-path-infinity/mobile-spike', 'Generator must run inside the isolated lab');
  for (const [name, expected] of Object.entries(versions)) {
    assert.equal(manifest.dependencies?.[name] ?? manifest.devDependencies?.[name], expected, `${name} declaration`);
    assert.equal(JSON.parse(read(`node_modules/${name}/package.json`)).version, expected, `${name} installed version`);
  }
  // These are read only. Do not patch plugin source to make compilation pass.
  const admobSwift = read('node_modules/@capacitor-community/admob/Package.swift');
  assert.ok(admobSwift.includes(`swift-package-manager-google-mobile-ads.git", exact: "${sdkVersions.ios.googleMobileAds}"`), 'AdMob iOS GMA pin changed');
  const admobGradle = read('node_modules/@capacitor-community/admob/android/build.gradle');
  for (const name of ['playServicesAdsVersion', 'userMessagingPlatformVersion']) {
    assert.ok(admobGradle.includes(`rootProject.ext.${name}`), `AdMob no longer supports the ${name} override`);
  }
}

function pluginFingerprints() {
  return [
    'node_modules/@capacitor-community/admob/Package.swift',
    'node_modules/@capacitor-community/admob/android/build.gradle',
    'node_modules/@capacitor/app/Package.swift',
  ].map((path) => createHash('sha256').update(read(path)).digest('hex'));
}

function cap(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: appRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true', CAPACITOR_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Capacitor ${args.join(' ')} failed${result.signal ? ` (${result.signal})` : ''}`);
}

function configureAndroid() {
  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  let manifest = read(manifestPath);
  manifest = replaceOnce(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">', 'manifest namespaces');
  manifest = replaceOnce(manifest, '    <application\n', '    <application\n        android:usesCleartextTraffic="false"\n', 'application');
  manifest = replaceOnce(manifest, '        <activity\n',
    `        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${sampleAppIds.android}" />\n\n        <activity\n            android:screenOrientation="portrait"\n`, 'main activity');
  manifest = replaceOnce(manifest, '</manifest>',
    '    <!-- This child/unknown lab must not merge the advertising ID permission. -->\n    <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />\n</manifest>', 'permissions');
  write(manifestPath, manifest);
  write('android/variables.gradle', replaceOnce(read('android/variables.gradle'), 'ext {',
    `ext {\n    // Exact SDK overrides supported by the unmodified AdMob plugin.\n    playServicesAdsVersion = '${sdkVersions.android.googleMobileAds}'\n    userMessagingPlatformVersion = '${sdkVersions.android.userMessagingPlatform}'`, 'Android SDK variables'));

  // Local probe traffic is a Debug-only facility. Remote endpoints still need
  // HTTPS, enforced both by the app and by this narrow native network policy.
  write('android/app/src/debug/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:networkSecurityConfig="@xml/lab_network_security_config" />
</manifest>
`);
  write('android/app/src/debug/res/xml/lab_network_security_config.xml', `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
`);
  const debugConfig = JSON.parse(read('android/app/src/main/assets/capacitor.config.json'));
  debugConfig.android = { ...debugConfig.android, allowMixedContent: true };
  write('android/app/src/debug/assets/capacitor.config.json', `${JSON.stringify(debugConfig, null, 2)}\n`);
}

function plistLibrary() {
  // Reuse Capacitor CLI's locked dependency; the lab has no extra tool install.
  return createRequire(join(appRoot, 'node_modules/@capacitor/cli/package.json'))('plist');
}

function configureIOS() {
  const plist = plistLibrary();
  const info = plist.parse(read('ios/App/App/Info.plist'));
  info.GADApplicationIdentifier = sampleAppIds.ios;
  info.UISupportedInterfaceOrientations = ['UIInterfaceOrientationPortrait'];
  delete info['UISupportedInterfaceOrientations~ipad'];
  info.NSAppTransportSecurity = { NSAllowsLocalNetworking: true };
  write('ios/App/App/Info.plist', `${plist.build(info)}\n`);

  const projectPath = 'ios/App/App.xcodeproj/project.pbxproj';
  const project = read(projectPath);
  assert.equal(project.match(/TARGETED_DEVICE_FAMILY = "1,2";/g)?.length, 2, 'Unexpected iOS device-family template');
  write(projectPath, project.replaceAll('TARGETED_DEVICE_FAMILY = "1,2";', 'TARGETED_DEVICE_FAMILY = "1";'));

  const packagePath = 'ios/App/CapApp-SPM/Package.swift';
  let swift = read(packagePath);
  swift = replaceOnce(swift, '\n    dependencies: [\n',
    `\n    dependencies: [\n        // Lab constraint; cap sync regenerates this manifest.\n        .package(url: "${umpUrl}", exact: "${sdkVersions.ios.userMessagingPlatform}"),\n`, 'app SPM dependencies');
  swift = replaceOnce(swift, '\n            dependencies: [\n',
    `\n            dependencies: [\n                .product(name: "GoogleUserMessagingPlatform", package: "${umpPackage}"),\n`, 'app SPM target');
  write(packagePath, swift);

  const savedLock = join(appRoot, 'native-locks/Package.resolved');
  if (existsSync(savedLock)) {
    mkdirSync(dirname(join(appRoot, iosLock)), { recursive: true });
    copyFileSync(savedLock, join(appRoot, iosLock));
    console.log('Restored native-locks/Package.resolved; CI will require its resolved versions.');
  }
}

function verifyNative(platform) {
  if (platform === 'android') {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    assert.ok(manifest.includes(`android:value="${sampleAppIds.android}"`), 'Android sample app ID missing');
    assert.ok(manifest.includes('android:screenOrientation="portrait"'), 'Android portrait setting missing');
    assert.ok(manifest.includes('android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"'), 'AD_ID removal missing');
    assert.ok(manifest.includes('android:usesCleartextTraffic="false"'), 'Release cleartext must be disabled');
    const variables = read('android/variables.gradle');
    assert.ok(variables.includes(`playServicesAdsVersion = '${sdkVersions.android.googleMobileAds}'`), 'Android GMA override missing');
    assert.ok(variables.includes(`userMessagingPlatformVersion = '${sdkVersions.android.userMessagingPlatform}'`), 'Android UMP override missing');
    const mainConfig = JSON.parse(read('android/app/src/main/assets/capacitor.config.json'));
    const debugConfig = JSON.parse(read('android/app/src/debug/assets/capacitor.config.json'));
    assert.notEqual(mainConfig.android?.allowMixedContent, true, 'Mixed content must remain Debug-only');
    assert.equal(debugConfig.android?.allowMixedContent, true, 'Debug local probe configuration missing');
    const policy = read('android/app/src/debug/res/xml/lab_network_security_config.xml');
    assert.ok(policy.includes('<base-config cleartextTrafficPermitted="false" />'), 'Local-only cleartext policy missing');
    assert.deepEqual([...policy.matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map((match) => match[1]),
      ['localhost', '127.0.0.1', '10.0.2.2'], 'Unexpected local probe domains');
  } else {
    const info = plistLibrary().parse(read('ios/App/App/Info.plist'));
    assert.equal(info.GADApplicationIdentifier, sampleAppIds.ios, 'iOS sample app ID');
    assert.deepEqual(info.UISupportedInterfaceOrientations, ['UIInterfaceOrientationPortrait']);
    assert.deepEqual(info.NSAppTransportSecurity, { NSAllowsLocalNetworking: true });
    assert.equal(info.NSUserTrackingUsageDescription, undefined, 'Fixed child/unknown lab must not request tracking');
    const families = [...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/TARGETED_DEVICE_FAMILY = "([^"]+)";/g)];
    assert.deepEqual(families.map((match) => match[1]), ['1', '1'], 'iPhone-only build settings');
    const swift = read('ios/App/CapApp-SPM/Package.swift');
    assert.ok(swift.includes(`capacitor-swift-pm.git", exact: "${versions['@capacitor/ios']}"`), 'Capacitor SPM exact pin missing');
    assert.ok(swift.includes(`.package(url: "${umpUrl}", exact: "${sdkVersions.ios.userMessagingPlatform}")`), 'UMP SPM exact pin missing; rerun the generator after cap sync');
    assert.ok(swift.includes('.product(name: "CapacitorCommunityAdmob"'), 'AdMob plugin missing from generated app');
    assert.ok(swift.includes('.product(name: "CapacitorApp"'), 'App lifecycle plugin missing from generated app');
  }
  const report = {
    platform,
    scope: 'CPI-002 compilation lab; no device validation or production readiness implied',
    npmVersions: versions,
    configuredNativeVersions: sdkVersions[platform],
    sampleAdMobAppId: sampleAppIds[platform],
    privacyMode: 'fixed child/unknown; official test ad units only',
    portrait: true,
    ...(platform === 'ios' ? { packageLockRestored: existsSync(join(appRoot, 'native-locks/Package.resolved')) } : { adIdPermissionRemoved: true }),
  };
  write(`artifacts/native-config-${platform}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

try {
  const { platform, check } = parseOptions();
  verifyPackages();
  const target = join(appRoot, platform);
  assert.ok(!existsSync(target) || !lstatSync(target).isSymbolicLink(), 'Refusing a symlinked native project');
  if (!check) {
    assert.ok(existsSync(join(appRoot, 'dist/index.html')), 'Build the web app first: npm run build');
    const before = pluginFingerprints();
    // The only deletion target is this lab's selected, ignored generated folder.
    rmSync(target, { recursive: true, force: true });
    cap('add', platform, ...(platform === 'ios' ? ['--packagemanager', 'SPM'] : []));
    cap('sync', platform);
    assert.deepEqual(pluginFingerprints(), before, 'Capacitor changed third-party plugin manifests; stop and inspect');
    if (platform === 'android') configureAndroid();
    else configureIOS();
  }
  verifyNative(platform);
} catch (error) {
  console.error(`Native lab generation failed: ${error.message}`);
  process.exitCode = 1;
}
