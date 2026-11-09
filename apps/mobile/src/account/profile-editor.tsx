import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import { ageBandFromInput, profileForAccount } from './profile-client';
import type {
  OwnerProfile,
  ProfileClient,
  ProfileEdit,
  ProfileProblem,
  ProfileResult,
} from './profile-client';
import './profile-editor.css';

/** The caller supplies a session-scoped client only after trusted account verification. */
export function ProfileEditor({
  client,
  online,
  setup = false,
  onSaved,
}: {
  client: ProfileClient | null;
  online: boolean;
  setup?: boolean;
  onSaved?: (owner: OwnerProfile) => void;
}) {
  const { t, locale } = useLanguage();
  const readScope = useCallback(() => client?.accountScope?.() ?? null, [client]);
  const subscribeScope = useCallback(
    (observer: () => void) => client?.subscribeAccountScope?.(observer) ?? (() => undefined),
    [client],
  );
  const accountScope = useSyncExternalStore(subscribeScope, readScope, readScope);
  const [loaded, setLoaded] = useState<{
    client: ProfileClient | null;
    accountScope: object | null;
    owner: OwnerProfile | null;
  }>({ client: null, accountScope: null, owner: null });
  // Identity is checked during render, before an effect can clear old state.
  const owner =
    loaded.client === client
      ? profileForAccount(loaded.owner, loaded.accountScope, accountScope)
      : null;
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [age, setAge] = useState('');
  const [analytics, setAnalytics] = useState<ProfileEdit['analyticsAction']>('keep');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [problem, setProblem] = useState<ProfileProblem | 'age_invalid' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const epoch = useRef<object>({});

  useEffect(() => {
    const generation = {};
    epoch.current = generation;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setAge('');
      setUsername('');
      setCountry('');
      setAnalytics('keep');
      setLoaded({ client, accountScope, owner: null });
      setProblem(null);
      setPhase('loading');
      if (!client || !online || !accountScope) return;
      let result: ProfileResult;
      try {
        result = await client.load(controller.signal);
      } catch {
        result = { ok: false, problem: 'unavailable' };
      }
      if (controller.signal.aborted || generation !== epoch.current || readScope() !== accountScope)
        return;
      if (result.ok) {
        setLoaded({ client, accountScope, owner: result.value });
        setUsername(result.value.profile?.username ?? '');
        setCountry(result.value.profile?.countryCode ?? result.value.countryCode ?? '');
        setAnalytics('keep');
        setPhase('ready');
      } else {
        setProblem(result.problem);
        setPhase('error');
      }
    });
    return () => {
      controller.abort();
      request.current?.abort();
      request.current = null;
      epoch.current = {};
    };
  }, [client, online, attempt, accountScope, readScope]);

  async function save() {
    if (!client || !online || !owner || phase === 'saving') return;
    const band = analytics === 'answer' ? ageBandFromInput(age) : null;
    // Clear the sensitive input before any asynchronous work, including failed saves.
    setAge('');
    if (analytics === 'answer' && (!owner.analyticsAllowed || band === null)) {
      setProblem('age_invalid');
      return;
    }
    const generation = {};
    epoch.current = generation;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setProblem(null);
    setPhase('saving');
    let result: ProfileResult;
    try {
      result = await client.save(
        {
          username: username.trim() || null,
          countryCode: country || null,
          analyticsAction: analytics,
          analyticsAgeBand: band,
        },
        controller.signal,
      );
    } catch {
      result = { ok: false, problem: 'unavailable' };
    }
    if (controller.signal.aborted || generation !== epoch.current || readScope() !== accountScope)
      return;
    if (result.ok) {
      setLoaded({ client, accountScope, owner: result.value });
      setUsername(result.value.profile?.username ?? '');
      setCountry(result.value.profile?.countryCode ?? result.value.countryCode ?? '');
      setAnalytics('keep');
      setPhase('saved');
      onSaved?.(result.value);
    } else {
      setAnalytics('keep');
      setProblem(result.problem);
      setPhase('ready');
    }
  }

  const errors: Record<ProfileProblem | 'age_invalid', string> = {
    unavailable: t('profile.retry'),
    username_invalid: t('profile.nameInvalid'),
    username_reserved: t('profile.nameReserved'),
    username_taken: t('profile.nameTaken'),
    country_unsupported: t('profile.countryInvalid'),
    country_cooldown: t('profile.countryCooldown'),
    analytics_not_allowed: t('profile.analyticsUnavailable'),
    age_invalid: t('profile.ageInvalid'),
  };
  const currentIdentity =
    loaded.client === client && loaded.accountScope === accountScope && accountScope !== null;
  const visiblePhase = currentIdentity && online && client ? phase : 'loading';
  const visibleProblem = currentIdentity && online && client ? problem : null;
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return (
    <section className="cpi-profile-editor" aria-labelledby="cpi-profile-title">
      <h2 id="cpi-profile-title" className="visually-hidden">
        {t('profile.edit')}
      </h2>
      {!client || !accountScope ? (
        <p role="status">{t('profile.signInFirst')}</p>
      ) : !online ? (
        <p role="status">{t('profile.offline')}</p>
      ) : visiblePhase === 'loading' ? (
        <p role="status">{t('profile.loading')}</p>
      ) : (
        owner && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={phase === 'saving'}>
              {!owner.profile && !setup && <p>{t('profile.namePrompt')}</p>}
              <label htmlFor="cpi-profile-name">
                {t(setup ? 'profile.optionalNickname' : 'profile.username')}
              </label>
              <input
                id="cpi-profile-name"
                value={username}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={24}
                aria-describedby="cpi-profile-name-help"
                onChange={(event) => setUsername(event.target.value)}
              />
              <p id="cpi-profile-name-help">
                {t(setup ? 'profile.nicknameHint' : 'profile.nameHelp')}
              </p>
              <label htmlFor="cpi-profile-country">
                {t(setup ? 'profile.optionalCountry' : 'profile.country')}
              </label>
              <select
                id="cpi-profile-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="">{t('profile.worldOnly')}</option>
                {owner.countries.map((item) => (
                  <option key={item.countryCode} value={item.countryCode}>
                    {names.of(item.countryCode) ?? item.countryCode}
                  </option>
                ))}
              </select>
              {!setup && <p>{t('profile.countryHelp')}</p>}
              {owner.countryChangeAvailableAt && (
                <p>
                  {t('profile.nextCountryChange', {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    }).format(new Date(owner.countryChangeAvailableAt)),
                  })}
                </p>
              )}
              {setup ? (
                owner.analyticsAllowed && (
                  <>
                    <label htmlFor="cpi-profile-age">{t('profile.optionalAge')}</label>
                    <input
                      id="cpi-profile-age"
                      value={age}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={3}
                      pattern="[0-9]{1,3}"
                      aria-describedby="cpi-profile-age-purpose"
                      onChange={(event) => {
                        setAge(event.target.value);
                        setAnalytics(event.target.value ? 'answer' : 'keep');
                      }}
                    />
                    <p id="cpi-profile-age-purpose">{t('profile.agePurpose')}</p>
                  </>
                )
              ) : (
                <>
                  <h3>{t('profile.optionalAnalytics')}</h3>
                  <p>{t('profile.agePurpose')}</p>
                  <label htmlFor="cpi-profile-analytics">{t('profile.ageChoice')}</label>
                  <select
                    id="cpi-profile-analytics"
                    value={analytics}
                    onChange={(event) => {
                      setAge('');
                      setAnalytics(event.target.value as ProfileEdit['analyticsAction']);
                    }}
                  >
                    <option value="keep">{t('profile.skip')}</option>
                    {owner.analyticsAllowed && (
                      <option value="answer">{t('profile.answer')}</option>
                    )}
                    <option value="withdraw">{t('profile.withdraw')}</option>
                  </select>
                  {analytics === 'answer' && owner.analyticsAllowed && (
                    <>
                      <label htmlFor="cpi-profile-age">{t('profile.age')}</label>
                      <input
                        id="cpi-profile-age"
                        value={age}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={3}
                        required
                        pattern="[0-9]{1,3}"
                        onChange={(event) => setAge(event.target.value)}
                      />
                    </>
                  )}
                  {!owner.analyticsAllowed && <p>{t('profile.analyticsUnavailable')}</p>}
                  {owner.analyticsAgeBand && <p>{t('profile.bandSaved')}</p>}
                </>
              )}
              <button type="submit">
                {t(
                  phase === 'saving'
                    ? 'profile.saving'
                    : setup
                      ? 'profile.saveAndPlay'
                      : 'profile.save',
                )}
              </button>
            </fieldset>
          </form>
        )
      )}
      {visibleProblem && <p role="alert">{errors[visibleProblem]}</p>}
      {visiblePhase === 'saved' && <p role="status">{t('profile.saved')}</p>}
      {visiblePhase === 'error' && client && online && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          {t('profile.reload')}
        </button>
      )}
    </section>
  );
}
