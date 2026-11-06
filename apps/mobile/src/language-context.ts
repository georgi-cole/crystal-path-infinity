import { createContext, useContext } from 'react';
import { localizeNumber, translate } from './i18n';
import type { LocaleCode, LocaleChoice } from './i18n';
import type { MessageKey, MessageParams } from './i18n/messages';

export interface LanguageContextValue {
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
  number: (value) => localizeNumber(value, 'en'),
};

export const LanguageContext = createContext<LanguageContextValue>(fallback);

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
