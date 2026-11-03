import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LOCALES,
  languageDirection,
  localizeInteger,
  readLanguageChoice,
  resolveLocale,
  translate,
  writeLanguageChoice,
} from './i18n';
import type { LocaleChoice } from './i18n';
import type { MessageKey, MessageParams } from './i18n/messages';
import { LanguageContext } from './language-context';

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en'];
  return navigator.languages?.length ? Array.from(navigator.languages) : [navigator.language];
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [choice, setStoredChoice] = useState<LocaleChoice>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      return readLanguageChoice(window.localStorage);
    } catch {
      return 'system';
    }
  });
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
    if (next !== 'system' && !LOCALES.some(({ code }) => code === next)) return;
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
  const number = useCallback(
    (value: string | number | null) => localizeInteger(value, locale),
    [locale],
  );

  return (
    <LanguageContext.Provider value={{ locale, choice, setChoice, warning, t, number }}>
      {children}
    </LanguageContext.Provider>
  );
}
