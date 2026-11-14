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
    <div className="cpi-leaderboard-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="cpi-leaderboard-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('leaderboard.rank')}</th>
            <th scope="col">{t('leaderboard.player')}</th>
            <th scope="col">{t('leaderboard.rows')}</th>
            <th scope="col">{t('leaderboard.revives')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((item) => (
            <tr
              key={item.publicId}
              className={ownPublicId === item.publicId ? 'cpi-leaderboard-own' : undefined}
            >
              <td>{number(item.rank)}</td>
              <th scope="row">
                <span>{item.username}</span>
                <small>
                  {item.countryCode
                    ? (countries.of(item.countryCode) ?? item.countryCode)
                    : t('leaderboard.countryUnknown')}
                </small>
                <NameReportButton
                  client={reportClient}
                  targetPublicId={item.publicId}
                  username={item.username}
                  online={online}
                />
              </th>
              <td className="cpi-leaderboard-score" dir="auto">
                {number(item.lastClearedRow)}
              </td>
              <td>{number(item.revivesToReachScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
}: {
  client: LeaderboardClient | null;
  online: boolean;
  rulesetVersion?: string;
  mappingVersion?: string;
  countries?: readonly { countryCode: string; continentCode: string }[];
  pendingPersonalResult?: boolean;
  reportClient?: NameReportClient | null;
}) {
  const { t, number, locale } = useLanguage();
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
  }, [cache, online, valid, key, query, attempt, accountScope, readScope]);

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
  const date = data
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(data.updatedAt),
      )
    : '';
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
                    setRegion('');
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
                <small>{t('leaderboard.declared')}</small>
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
              {online && (
                <button
                  type="button"
                  disabled={current?.phase === 'loading'}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {t(current?.phase === 'error' ? 'leaderboard.retry' : 'leaderboard.refresh')}
                </button>
              )}
              {data && (
                <>
                  <p>{t('leaderboard.total', { count: number(data.count) })}</p>
                  <p className="cpi-leaderboard-date">{t('leaderboard.updated', { date })}</p>
                  {data.top100.length === 0 ? (
                    <p role="status">{t('leaderboard.empty')}</p>
                  ) : (
                    <LeaderboardTable
                      entries={data.top100}
                      caption={t('leaderboard.top')}
                      ownPublicId={own?.publicId}
                      reportClient={reportClient}
                      online={online}
                    />
                  )}
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
                    <p>{t(ownKnown ? 'leaderboard.noOwn' : 'leaderboard.ownUnavailable')}</p>
                  )}
                  {own && data.neighbors.length > 1 && (
                    <LeaderboardTable
                      entries={data.neighbors}
                      caption={t('leaderboard.nearby')}
                      ownPublicId={own.publicId}
                      reportClient={reportClient}
                      online={online}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {pendingPersonalResult && <p role="status">{t('leaderboard.pending')}</p>}
      <details>
        <summary>{t('leaderboard.tieTitle')}</summary>
        <p>{t('leaderboard.tie')}</p>
      </details>
    </section>
  );
}
