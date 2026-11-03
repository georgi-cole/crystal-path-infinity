import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('CPI-018 native protected-session templates', () => {
  it('uses a device-bound AndroidKeyStore key and authenticated encryption', () => {
    const java = read('native-templates/android/CpiSecureSession.java');
    expect(java).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(java).toContain('AES/GCM/NoPadding');
    expect(java).toContain('new GCMParameterSpec(128, iv)');
    expect(java).toContain('MODE_PRIVATE');
    expect(java).not.toContain('android.util.Log');
  });

  it('uses device-only iOS Keychain and drops credentials after reinstall', () => {
    const swift = read('native-templates/ios/CpiSecureSession.swift');
    expect(swift).toContain('kSecAttrAccessibleWhenUnlockedThisDeviceOnly');
    expect(swift).toContain('kSecAttrSynchronizable as String] = false');
    expect(swift).toContain('SecItemDelete(itemQuery() as CFDictionary)');
    expect(swift).toContain('UserDefaults.standard.bool(forKey: marker)');
    expect(swift).not.toContain('CAPLog');
  });

  it('registers both native implementations and forbids Android backup', () => {
    const java = read('native-templates/android/MainActivity.java');
    const swift = read('native-templates/ios/CpiLifecycle.swift');
    const generator = read('scripts/generate-native.mjs');
    expect(java).toContain('registerPlugin(CpiSecureSession.class)');
    expect(swift).toContain('registerPluginInstance(CpiSecureSession())');
    expect(generator).toContain("read('native-templates/ios/CpiSecureSession.swift')");
    expect(generator).toContain('android:allowBackup="false"');
    expect(generator).toContain("'CpiSecureSession.java'");
  });
});
