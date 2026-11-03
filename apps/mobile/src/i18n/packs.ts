import type { LocaleCode } from '../i18n';
import type { MessageKey } from './messages';
import { bg } from './bg';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { ptBR } from './pt-BR';
import { ja } from './ja';
import { zhHans } from './zh-Hans';
import { ar } from './ar';

/**
 * Preview packs may intentionally fall back to English for copy that has not
 * been reviewed. Never advertise a fallback-only language in the selector.
 * Locale keys and interpolation contract are validated in CI.
 */
export const localePacks: Partial<Record<LocaleCode, Partial<Record<MessageKey, string>>>> = {
  bg,
  es,
  fr,
  de,
  'pt-BR': ptBR,
  ja,
  'zh-Hans': zhHans,
  ar,
} satisfies Partial<Record<LocaleCode, Partial<Record<MessageKey, string>>>>;
