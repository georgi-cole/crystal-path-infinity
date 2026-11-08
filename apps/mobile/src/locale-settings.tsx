import { LANGUAGE_KEY, LOCALES } from './i18n';
import { useLanguage } from './language-context';
import type { LocaleChoice } from './i18n';
import type { ReactNode } from 'react';
import './locale-settings.css';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from './support-contact';

/**
 * Real, persisted language selection plus truthful permanent privacy/account
 * destinations. No fake privacy policy, delete request or support submission.
 */
export function LanguageSettings() {
  const { locale, choice, setChoice, warning, t } = useLanguage();
  return (
    <section className="cpi-settings-section" aria-labelledby="cpi-language-heading">
      <h2 id="cpi-language-heading">{t('settings.language')}</h2>
      <label className="cpi-language-label" htmlFor="cpi-language-select">
        {t('settings.languageHelp')}
      </label>
      <select
        id="cpi-language-select"
        className="cpi-language-select"
        name={LANGUAGE_KEY}
        value={choice}
        onChange={(event) => setChoice(event.target.value as LocaleChoice)}
        aria-describedby="cpi-language-preview"
        aria-labelledby="cpi-language-heading"
      >
        <option value="system">{t('settings.system')}</option>
        {LOCALES.map(({ code, name }) => (
          <option key={code} value={code} lang={code} dir={code === 'ar' ? 'rtl' : 'ltr'}>
            {name}
          </option>
        ))}
      </select>
      <p className="cpi-menu-fine-print" id="cpi-language-preview">
        {t('settings.languagePreview')}
      </p>
      {warning && (
        <p role="alert" className="cpi-menu-warning">
          {t('app.warningSettings')}
        </p>
      )}
      <span className="visually-hidden" aria-live="polite">
        {LOCALES.find((item) => item.code === locale)?.name}
      </span>
    </section>
  );
}

export function PrivacyAccountSupport({
  accountAvailable = false,
  accountConnected = false,
  accountActions,
  privacyActions,
}: {
  accountAvailable?: boolean;
  accountConnected?: boolean;
  accountActions?: ReactNode;
  privacyActions?: ReactNode;
} = {}) {
  const { t } = useLanguage();
  return (
    <div className="cpi-settings-destinations">
      <details className="cpi-settings-section cpi-settings-disclosure">
        <summary>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
            <path d="M12 8v7" />
          </svg>
          <span id="cpi-privacy-heading">{t('settings.privacyTitle')}</span>
        </summary>
        <div className="cpi-settings-expanded">
          <p>{t(accountConnected ? 'settings.privacyConnected' : 'settings.privacyInfo')}</p>
          <p className="cpi-menu-fine-print">{t('settings.privacyUnavailable')}</p>
          {privacyActions}
        </div>
      </details>
      <details className="cpi-settings-section cpi-settings-disclosure">
        <summary>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21v-2c0-4 14-4 14 0v2" />
          </svg>
          <span id="cpi-account-heading">{t('settings.accountTitle')}</span>
        </summary>
        <div className="cpi-settings-expanded">
          <p>
            {t(
              accountAvailable
                ? 'settings.accountAvailable'
                : accountConnected
                  ? 'settings.accountToolsUnavailable'
                  : 'settings.accountUnavailable',
            )}
          </p>
          {accountActions}
        </div>
      </details>
      <details className="cpi-settings-section cpi-settings-disclosure">
        <summary>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 15V11a8 8 0 0 1 16 0v4M4 11H2v7h4v-7H4Zm16 0h2v7h-4v-7h2ZM18 20h-6" />
          </svg>
          <span id="cpi-support-heading">{t('settings.supportTitle')}</span>
        </summary>
        <div className="cpi-settings-expanded">
          <p>{t('support.intro')}</p>
          <p>{t('support.message')}</p>
          <a
            className="cpi-menu-action cpi-menu-action--secondary cpi-support-contact"
            href={SUPPORT_MAILTO}
          >
            <span className="cpi-menu-action-title">{t('support.contact')}</span>{' '}
            <span aria-hidden="true">↗</span>
          </a>
          <span className="cpi-support-address">{SUPPORT_EMAIL}</span>
          <p className="cpi-menu-fine-print">{t('support.compose')}</p>
          <p className="cpi-menu-fine-print">{t('support.private')}</p>
        </div>
      </details>
    </div>
  );
}
