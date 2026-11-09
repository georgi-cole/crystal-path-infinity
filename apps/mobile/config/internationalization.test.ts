import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  chooseDeviceLanguage,
  LANGUAGE_KEY,
  languageDirection,
  LOCALES,
  localizeInteger,
  matchLanguage,
  readLanguageChoice,
  resolveLocale,
  translate,
  writeLanguageChoice,
} from '../src/i18n';
import { localePacks } from '../src/i18n/packs';
import { en } from '../src/i18n/messages';
import type { MessageKey } from '../src/i18n/messages';
import { LanguageSettings, PrivacyAccountSupport } from '../src/locale-settings';

describe('CPI-016 internationalization contract', () => {
  it('ships nine selectable world regions beyond a BG/EN-only UI', () => {
    const codes = LOCALES.map(({ code }) => code);
    expect(codes).toEqual(['en', 'bg', 'es', 'fr', 'de', 'pt-BR', 'ja', 'zh-Hans', 'ar']);
    expect(new Set(codes).size).toBe(codes.length);
    expect(LOCALES.every(({ name }) => name.length > 0)).toBe(true);
    expect(LOCALES.find(({ code }) => code === 'ar')?.direction).toBe('rtl');
    expect(
      LOCALES.filter(({ code }) => code !== 'ar').every(({ direction }) => direction === 'ltr'),
    ).toBe(true);
  });

  it('prioritizes supported system languages, handles regions and rejects unsupported dialect scripts safely', () => {
    expect(matchLanguage('es-MX')).toBe('es');
    expect(matchLanguage('fr-CA')).toBe('fr');
    expect(matchLanguage('de-AT')).toBe('de');
    expect(matchLanguage('pt-PT')).toBe('pt-BR');
    expect(matchLanguage('pt_BR')).toBe('pt-BR');
    expect(matchLanguage('zh-CN')).toBe('zh-Hans');
    expect(matchLanguage('zh-Hans-SG')).toBe('zh-Hans');
    expect(matchLanguage('zh-Hant')).toBe(null);
    expect(matchLanguage('zh-TW')).toBe(null);
    expect(matchLanguage('ar-EG')).toBe('ar');
    expect(matchLanguage('hi-IN')).toBe(null);
    expect(chooseDeviceLanguage(['hi-IN', 'ja-JP'])).toBe('ja');
    expect(chooseDeviceLanguage(['zh-TW'])).toBe('en');
    expect(chooseDeviceLanguage(['zz-ZZ'])).toBe('en');
    expect(resolveLocale('system', ['bg-BG'])).toBe('bg');
    expect(resolveLocale('es', ['en-US'])).toBe('es');
  });

  it('persists only a locale preference; invalid storage and absent values use automatic detection', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
    expect(readLanguageChoice(storage)).toBe('system');
    writeLanguageChoice(storage, 'fr');
    expect(map.get(LANGUAGE_KEY)).toBe('fr');
    expect(readLanguageChoice(storage)).toBe('fr');
    writeLanguageChoice(storage, 'system');
    expect(readLanguageChoice(storage)).toBe('system');
    map.set(LANGUAGE_KEY, 'unsupported');
    expect(readLanguageChoice(storage)).toBe('system');
    expect(() => writeLanguageChoice(storage, 'zz' as never)).toThrow();
    expect(
      readLanguageChoice({
        getItem: () => {
          throw Error('blocked');
        },
        setItem: () => {},
      }),
    ).toBe('system');
    expect(languageDirection('ar')).toBe('rtl');
    expect(languageDirection('bg')).toBe('ltr');
  });

  it('never exposes translation keys; all catalog IDs are known and interpolations are preserved', () => {
    const keys = Object.keys(en) as MessageKey[];
    expect(keys.length).toBeGreaterThan(220);
    const essential: MessageKey[] = [
      'general.play',
      'general.practice',
      'general.endRun',
      'menu.tagline',
      'menu.playUnavailable',
      'menu.rankingsUnavailable',
      'menu.profileFuture',
      'settings.language',
      'settings.system',
      'settings.privacyTitle',
      'settings.accountTitle',
      'settings.supportTitle',
      'tutorial.safeTitle',
      'tutorial.safeInstruction',
      'tutorial.fatalTitle',
      'tutorial.mysteryInstruction',
      'tutorial.ruleSp',
      'game.spCritical',
      'game.deathTitle',
      'game.offerTitle',
      'game.offerDetail',
      'game.pendingTitle',
      'game.pendingRecovery',
      'game.confirmTitle',
      'game.confirmForfeit',
      'game.practiceUnverified',
      'game.complete',
      'game.nextRun',
      'game.fatalNotCounted',
    ];
    for (const code of LOCALES.map((item) => item.code)) {
      const overrides = code === 'en' ? en : localePacks[code];
      if (code !== 'en') {
        expect(Object.keys(overrides ?? {}).length).toBeGreaterThan(200);
      }
      for (const key of essential) {
        expect(overrides?.[key], code + ':' + key).toBeTruthy();
      }
      for (const [key, translation] of Object.entries(overrides ?? {})) {
        expect(keys).toContain(key);
        expect(translation.trim().length).toBeGreaterThan(0);
        const placeholders = (input: string) =>
          [...input.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((x) => x[1]).sort();
        expect(placeholders(translation), code + ':' + key).toEqual(
          placeholders(en[key as MessageKey]),
        );
      }
      for (const key of keys) {
        const translated = translate(code, key, {
          row: '1000',
          sp: 200,
          count: 5,
          index: 6,
          remaining: 4,
        });
        expect(translated.length).toBeGreaterThan(0);
        expect(translated).not.toBe(key);
        expect(translated).not.toContain('undefined');
      }
    }
    expect(translate('fr', 'game.offerTitle', { index: 6, sp: 150 })).toContain('150');
    expect(translate('ar', 'game.confirmTitle')).not.toBe(en['game.confirmTitle']);
  });

  it('formats huge row IDs exactly with per-language grouping, never with Number precision loss', () => {
    const value = '900719925474099312345678';
    expect(localizeInteger(value, 'en')).toBe('900,719,925,474,099,312,345,678');
    expect(localizeInteger(value, 'de')).toBe('900.719.925.474.099.312.345.678');
    expect(localizeInteger(value, 'fr')).toContain('900');
    expect(localizeInteger(value, 'ar')).not.toBe('—');
    expect(localizeInteger('0', 'bg')).toBe('0');
    expect(localizeInteger(null, 'en')).toBe('—');
    expect(localizeInteger('1e20', 'en')).toBe('—');
    expect(localizeInteger('0001', 'en')).toBe('—');
    expect(localizeInteger('-12', 'en')).toBe('—');
  });

  it('shows real settings, native language names and truthful non-working service status', () => {
    const languageHtml = renderToStaticMarkup(createElement(LanguageSettings));
    expect(languageHtml).toContain('value="system"');
    for (const language of LOCALES) {
      expect(languageHtml).toContain('value="' + language.code + '"');
      expect(languageHtml).toContain(language.name);
    }
    const privacy = renderToStaticMarkup(createElement(PrivacyAccountSupport));
    expect(privacy).toContain('Privacy and data');
    expect(privacy).toContain('Account and deletion');
    expect(privacy).toContain('Help and support');
    expect(privacy).not.toContain('Account deleted');
    expect(privacy).not.toContain('Support request submitted');
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    expect(main).toContain('<LanguageProvider>');
    const scene = readFileSync(new URL('../src/infinity-scene.tsx', import.meta.url), 'utf8');
    const bridge = readFileSync(new URL('../src/prism-bridge.tsx', import.meta.url), 'utf8');
    expect(bridge).toContain('cpi-pane-caption');
    expect(bridge).toContain("'game.hintedTile'");
    const hud = readFileSync(new URL('../src/run-hud.tsx', import.meta.url), 'utf8');
    expect(hud).toContain("'game.spCritical'");
    expect(hud).toContain("'game.spLow'");
    expect(scene).toContain('dir="ltr"');
    const css = readFileSync(new URL('../src/global-accessibility.css', import.meta.url), 'utf8');
    expect(css).toContain("[dir='rtl']");
    expect(css).toContain('cpi-reduced-motion');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('max-width: 340px');
  });
});
