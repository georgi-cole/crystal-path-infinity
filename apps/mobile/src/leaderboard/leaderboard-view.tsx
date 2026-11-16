import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import {
  CONTINENTS,
  LeaderboardCache,
  leaderboardKey,
  leaderboardForAccount,
  validLeaderboardQuery,
} from './leaderboard-client';
import type {
  LeaderboardClient,
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardSnapshot,
} from './leaderboard-client';
import './leaderboard-view.css';
import './leaderboard-game.css';
import { ACCOUNT_COUNTRIES } from '../account/country-codes';
import { NameReportButton } from './name-report';
import type { NameReportClient } from './name-report-client';

const continentKeys = {
  AF: 'leaderboard.continentAF',
  AS: 'leaderboard.continentAS',
  EU: 'leaderboard.continentEU',
  NA: 'leaderboard.continentNA',
  SA: 'leaderboard.continentSA',
  OC: 'leaderboard.continentOC',
  AN: 'leaderboard.continentAN',
} as const;

export function LeaderboardTable({
  entries,
  caption,
  ownPublicId,
  reportClient = null,
  online = true,
}: {
  entries: readonly LeaderboardEntry[];
  caption: string;
  ownPublicId?: string;
  reportClient?: NameReportClient | null;
  online?: boolean;
}) {
  const { t, number, locale } = useLanguage();
  const countries = new Intl.DisplayNames([locale], { type: 'region' });
  return (
    <div className="cpi-ranking-list-wrap">
      <ol className="cpi-ranking-list" aria-label={caption}>
        {entries.slice(0, 10).map((item) => {
          const yours = ownPublicId === item.publicId;
          return (
            <li
              key={item.publicId}
              className={'cpi-ranking-row' + (yours ? ' cpi-leaderboard-own' : '')}
              data-place={item.rank}
            >
              <span
                className="cpi-ranking-place"
                aria-label={t('leaderboard.rank') + ' ' + number(item.rank)}
              >
                {number(item.rank)}
              </span>
              <div className="cpi-ranking-player">
                <span className="cpi-ranking-name">
                  <bdi>{item.username}</bdi>
                  {yours && <small className="cpi-ranking-you">{t('leaderboard.you')}</small>}
                </span>
                {item.countryCode && (
                  <small className="cpi-ranking-country">
                    {countries.of(item.countryCode) ?? item.countryCode}
                  </small>
                )}
              </div>
              <span className="cpi-ranking-score">
                <strong dir="auto">{number(item.lastClearedRow)}</strong>
                <small>{t('leaderboard.rows')}</small>
              </span>
              {!yours && (
                <NameReportButton
                  client={reportClient}
                  targetPublicId={item.publicId}
                  username={item.username}
                  online={online}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface ViewState {
  cache: LeaderboardCache;
  accountScope: object | null;
  key: string;
  phase: 'loading' | 'ready' | 'error';
  data: LeaderboardSnapshot | null;
}

/** No live endpoint or account is selected here. The parent supplies an approved client. */
export function LeaderboardView({
  client,
  online,
  rulesetVersion = 'infinity-v1',
  mappingVersion = 'cpi-regions-2026-11-v1',
  countries = [],
  pendingPersonalResult = false,
  reportClient = null,
  countryCode = null,
  pendingScore = null,
}: {
  client: LeaderboardClient | null;
  online: boolean;
  rulesetVersion?: string;
  mappingVersion?: string;
  countries?: readonly { countryCode: string; continentCode: string }[];
  pendingPersonalResult?: boolean;
  reportClient?: NameReportClient | null;
  countryCode?: string | null;
  pendingScore?: string | null;
}) {
  const { t, locale, number } = useLanguage();
  const [scope, setScope] = useState<LeaderboardQuery['scope']>('world');
  const [region, setRegion] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ViewState | null>(null);
  const cache = useMemo(() => (client ? new LeaderboardCache(client) : null), [client]);
  const readScope = useCallback(() => client?.accountScope?.() ?? null, [client]);
  const subscribeScope = useCallback(
    (observer: () => void) => client?.subscribeAccountScope?.(observer) ?? (() => undefined),
    [client],
  );
  const accountScope = useSyncExternalStore(subscribeScope, readScope, readScope);
  const query = useMemo<LeaderboardQuery>(
    () => ({
      rulesetVersion,
      scope,
      region: scope === 'world' ? null : region || null,
      mappingVersion: scope === 'world' ? null : mappingVersion,
    }),
    [rulesetVersion, scope, region, mappingVersion],
  );
  const key = leaderboardKey(query);
  const valid = validLeaderboardQuery(query);
  useEffect(() => () => cache?.clear(), [cache]);
  useEffect(() => {
    if (!cache || !online || !valid) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState({ cache, accountScope, key, phase: 'loading', data: cache.peek(query) });
      try {
        const data = await cache.read(query, controller.signal);
        if (!controller.signal.aborted && readScope() === accountScope)
          setState({ cache, accountScope, key, phase: 'ready', data });
      } catch {
        if (!controller.signal.aborted)
          setState({ cache, accountScope, key, phase: 'error', data: cache.peek(query) });
      }
    });
    return () => controller.abort();
  }, [cache, online, valid, key, query, attempt, accountScope, readScope, pendingScore]);

  // Never display the previous filter or previous client's results while a
  // new effect is starting. Offline snapshots contain no own-account links.
  const current = state?.cache === cache && state.key === key ? state : null;
  const candidate = online ? (current?.data ?? null) : (cache?.peek(query) ?? null);
  const data = candidate
    ? leaderboardForAccount(candidate, current?.accountScope ?? null, accountScope)
    : null;
  const countryNames = new Intl.DisplayNames([locale], { type: 'region' });
  const own = online && current?.phase === 'ready' ? data?.own : null;
  const ownKnown =
    online &&
    current?.phase === 'ready' &&
    accountScope !== null &&
    current.accountScope === accountScope;
  const ownInTop =
    !!own && data?.top100.slice(0, 10).some((entry) => entry.publicId === own.publicId);
  return (
    <section className="cpi-leaderboard" aria-label={t('general.rankings')}>
      {!client ? (
        <p role="status">{t('leaderboard.unavailable')}</p>
      ) : (
        <>
          <fieldset className="cpi-leaderboard-filters">
            <legend className="visually-hidden">{t('menu.rankingsScope')}</legend>
            {(['world', 'continent', 'country'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="cpi-leaderboard-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => {
                    setScope(value);
                    setRegion(
                      value === 'country'
                        ? (countryCode ?? '')
                        : value === 'continent'
                          ? (countries.find((item) => item.countryCode === countryCode)
                              ?.continentCode ?? '')
                          : '',
                    );
                  }}
                />
                {t(
                  value === 'world'
                    ? 'leaderboard.world'
                    : value === 'continent'
                      ? 'leaderboard.continent'
                      : 'leaderboard.country',
                )}
              </label>
            ))}
            {scope !== 'world' && (
              <label className="cpi-leaderboard-region">
                {t('leaderboard.region')}
                <select value={region} onChange={(event) => setRegion(event.target.value)}>
                  <option value="">{t('leaderboard.chooseRegion')}</option>
                  {scope === 'continent'
                    ? CONTINENTS.map((code) => (
                        <option key={code} value={code}>
                          {t(continentKeys[code])}
                        </option>
                      ))
                    : (countries.length
                        ? countries.map(({ countryCode }) => countryCode)
                        : ACCOUNT_COUNTRIES
                      ).map((code) => (
                        <option key={code} value={code}>
                          {countryNames.of(code) ?? code}
                        </option>
                      ))}
                </select>
              </label>
            )}
          </fieldset>
          {!valid ? (
            <p role="status">{t('leaderboard.chooseRegion')}</p>
          ) : (
            <>
              <div aria-live="polite" role="status">
                {!online
                  ? t(data ? 'leaderboard.cached' : 'leaderboard.offline')
                  : current?.phase === 'error'
                    ? t(data ? 'leaderboard.stale' : 'leaderboard.error')
                    : current?.phase !== 'ready'
                      ? t(data ? 'leaderboard.refreshing' : 'leaderboard.loading')
                      : null}
              </div>
              <div className="cpi-ranking-toolbar">
                <div className="cpi-ranking-banner">
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M14 7h20v12c0 9-20 9-20 0ZM14 12H7v6c0 6 7 7 10 7m17-13h7v6c0 6-7 7-10 7M24 28v9m-9 4h18" />
                  </svg>
                  <h2>{t('leaderboard.top10')}</h2>
                </div>
                {online && (
                  <button
                    className="cpi-ranking-refresh"
                    type="button"
                    aria-label={t('leaderboard.refresh')}
                    disabled={current?.phase === 'loading'}
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M19 8a8 8 0 1 0 1 7M19 3v6h-6" />
                    </svg>
                  </button>
                )}
              </div>
              {data && (
                <>
                  {data.top100.length === 0 ? (
                    <div className="cpi-ranking-first" role="status">
                      <span aria-hidden="true">✧</span>
                      <p>{t('leaderboard.emptyBoard')}</p>
                    </div>
                  ) : (
                    <LeaderboardTable
                      entries={data.top100.slice(0, 10)}
                      caption={t('leaderboard.top10')}
                      ownPublicId={own?.publicId}
                      reportClient={reportClient}
                      online={online}
                    />
                  )}
                </>
              )}
              {ownInTop && own && (
                <div className="cpi-ranking-standing">
                  <span>{t('leaderboard.own')}</span>
                  <strong>#{number(own.rank)}</strong>
                  <span>
                    {number(own.lastClearedRow)} {t('leaderboard.rows')}
                  </span>
                </div>
              )}
              {!ownInTop && (data || pendingScore) && (
                <div className="cpi-ranking-personal">
                  <h2>{t('leaderboard.own')}</h2>
                  {own ? (
                    <LeaderboardTable
                      entries={[own]}
                      caption={t('leaderboard.own')}
                      ownPublicId={own.publicId}
                      reportClient={reportClient}
                      online={online}
                    />
                  ) : (
                    <div className="cpi-ranking-first">
                      <span aria-hidden="true">✧</span>
                      {pendingScore ? (
                        <>
                          <strong>{pendingScore}</strong>
                          <p>{t('leaderboard.scoreQueued')}</p>
                        </>
                      ) : (
                        <p>
                          {t(
                            ownKnown ? 'leaderboard.firstScore' : 'leaderboard.positionUnavailable',
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      {(pendingPersonalResult || pendingScore) && (
        <p className="cpi-ranking-sync" role="status">
          {t('leaderboard.scoreQueued')}
        </p>
      )}
    </section>
  );
}
