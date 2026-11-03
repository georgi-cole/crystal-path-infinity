import { LANGUAGE_KEY, LOCALES } from './i18n';
import { useLanguage } from './language-context';
import type { LocaleChoice } from './i18n';
import './locale-settings.css';

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
}: { accountAvailable?: boolean } = {}) {
  const { t } = useLanguage();
  return (
    <div className="cpi-settings-destinations">
      <section className="cpi-settings-section" aria-labelledby="cpi-privacy-heading">
        <h2 id="cpi-privacy-heading">{t('settings.privacyTitle')}</h2>
        <p>{t('settings.privacyInfo')}</p>
        <p className="cpi-menu-fine-print">{t('settings.privacyUnavailable')}</p>
      </section>
      <section className="cpi-settings-section" aria-labelledby="cpi-account-heading">
        <h2 id="cpi-account-heading">{t('settings.accountTitle')}</h2>
        <p>{t(accountAvailable ? 'settings.accountAvailable' : 'settings.accountUnavailable')}</p>
      </section>
      <section className="cpi-settings-section" aria-labelledby="cpi-support-heading">
        <h2 id="cpi-support-heading">{t('settings.supportTitle')}</h2>
        <p>{t('settings.supportUnavailable')}</p>
      </section>
    </div>
  );
}
