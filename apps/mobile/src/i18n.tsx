import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { en } from './i18n/messages';
import type { MessageKey, MessageParams } from './i18n/messages';
import { localePacks } from './i18n/packs';

export type LocaleCode = 'en' | 'bg' | 'es' | 'fr' | 'de' | 'pt-BR' | 'ja' | 'zh-Hans' | 'ar';
export type LocaleChoice = LocaleCode | 'system';

export const LOCALES: ReadonlyArray<{
  code: LocaleCode;
  name: string;
  direction: 'ltr' | 'rtl';
  intl: string;
}> = [
  { code: 'en', name: 'English', direction: 'ltr', intl: 'en' },
  { code: 'bg', name: 'Български', direction: 'ltr', intl: 'bg' },
  { code: 'es', name: 'Español', direction: 'ltr', intl: 'es' },
  { code: 'fr', name: 'Français', direction: 'ltr', intl: 'fr' },
  { code: 'de', name: 'Deutsch', direction: 'ltr', intl: 'de' },
  { code: 'pt-BR', name: 'Português (Brasil)', direction: 'ltr', intl: 'pt-BR' },
  { code: 'ja', name: '日本語', direction: 'ltr', intl: 'ja' },
  { code: 'zh-Hans', name: '简体中文', direction: 'ltr', intl: 'zh-CN' },
  { code: 'ar', name: 'العربية', direction: 'rtl', intl: 'ar' },
];

export const LANGUAGE_KEY = 'cpi.ui.language.v1';
const supported = new Set<string>(LOCALES.map(({ code }) => code));

/** Match supported languages, never infer location, identity, age or nationality. */
export function matchLanguage(tag: string): LocaleCode | null {
  if (typeof tag !== 'string' || tag.length > 60) return null;
  const normalized = tag.replace(/_/g, '-').toLowerCase();
  if (normalized === 'zh-hant' || normalized.startsWith('zh-hant-') ||
      /^(zh-tw|zh-hk|zh-mo)(-|$)/.test(normalized)) return null;
  if (/^zh(?:-hans|-cn|-sg)?(?:-|$)/.test(normalized)) return 'zh-Hans';
  if (/^pt(?:-|$)/.test(normalized)) return 'pt-BR';
  const language = normalized.split('-')[0];
  if (supported.has(language)) return language as LocaleCode;
  return null;
}

export function chooseDeviceLanguage(languages: readonly string[]): LocaleCode {
  for (const tag of languages) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return 'en';
}

export interface LanguageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function readLanguageChoice(storage: LanguageStorage): LocaleChoice {
  try {
    const stored = storage.getItem(LANGUAGE_KEY);
    return stored === 'system' || (stored !== null && supported.has(stored))
      ? (stored as LocaleChoice)
      : 'system';
  } catch {
    return 'system';
  }
}

export function writeLanguageChoice(storage: LanguageStorage, choice: LocaleChoice): void {
  if (choice !== 'system' && !supported.has(choice)) throw new TypeError('Unsupported language');
  storage.setItem(LANGUAGE_KEY, choice);
}

export function resolveLocale(choice: LocaleChoice, deviceLanguages: readonly string[]): LocaleCode {
  return choice === 'system' ? chooseDeviceLanguage(deviceLanguages) : choice;
}

/** Translation missing in a preview pack falls back to canonical English; never exposes a key. */
export function translate(
  locale: LocaleCode,
  key: MessageKey,
  params: MessageParams = {},
): string {
  const template = localePacks[locale]?.[key] ?? en[key];
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Lossless grouping of decimal row counters (no Number or >2^53 rounding). */
export function localizeInteger(input: string | number | null, locale: LocaleCode): string {
  if (input === null || String(input).length > 1000 || !/^(0|[1-9][0-9]*)$/.test(String(input))) {
    return '—';
  }
  const intlTag = LOCALES.find((item) => item.code === locale)?.intl ?? 'en';
  try {
    return new Intl.NumberFormat(intlTag, { useGrouping: true, maximumFractionDigits: 0 }).format(
      BigInt(input),
    );
  } catch {
    return String(input).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

export function languageDirection(locale: LocaleCode): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

interface LanguageContextValue {
  locale: LocaleCode;
  choice: LocaleChoice;
  setChoice: (next: LocaleChoice) => void;
  warning: boolean;
  t: (key: MessageKey, params?: MessageParams) => string;
  number: (value: string | number | null) => string;
}
const fallback: LanguageContextValue = {
  locale: 'en',
  choice: 'system',
  setChoice: () => {},
  warning: false,
  t: (key, params) => translate('en', key, params),
  number: (value) => localizeInteger(value, 'en'),
};

const LanguageContext = createContext<LanguageContextValue>(fallback);

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en'];
  return navigator.languages?.length ? Array.from(navigator.languages) : [navigator.language];
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [choice, setStoredChoice] = useState<LocaleChoice>(() =>
    typeof window === 'undefined' ? 'system' : readLanguageChoice(window.localStorage),
  );
  const [deviceLanguages, setDeviceLanguages] = useState<readonly string[]>(browserLanguages);
  const [warning, setWarning] = useState(false);
  const locale = resolveLocale(choice, deviceLanguages);

  useEffect(() => {
    const update = () => setDeviceLanguages(browserLanguages());
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = languageDirection(locale);
    document.title = translate(locale, 'brand.name');
  }, [locale]);

  const setChoice = useCallback((next: LocaleChoice) => {
    if (next !== 'system' && !supported.has(next)) return;
    setStoredChoice(next);
    try {
      writeLanguageChoice(window.localStorage, next);
      setWarning(false);
    } catch {
      setWarning(true);
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => translate(locale, key, params),
    [locale],
  );
  const number = useCallback((value: string | number | null) => localizeInteger(value, locale), [
    locale,
  ]);

  return (
    <LanguageContext.Provider value={{ locale, choice, setChoice, warning, t, number }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
