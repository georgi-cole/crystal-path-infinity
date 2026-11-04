import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../language-context';
import {
  CONTINENTS,
  LeaderboardCache,
  leaderboardKey,
  validLeaderboardQuery,
} from './leaderboard-client';
import type {
  LeaderboardClient,
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardSnapshot,
} from './leaderboard-client';
import './leaderboard-view.css';

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
}: {
  entries: readonly LeaderboardEntry[];
  caption: string;
  ownPublicId?: string;
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
}: {
  client: LeaderboardClient | null;
  online: boolean;
  rulesetVersion?: string;
  mappingVersion?: string;
  countries?: readonly { countryCode: string; continentCode: string }[];
  pendingPersonalResult?: boolean;
}) {
  const { t, number, locale } = useLanguage();
  const [scope, setScope] = useState<LeaderboardQuery['scope']>('world');
  const [region, setRegion] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ViewState | null>(null);
  const cache = useMemo(() => (client ? new LeaderboardCache(client) : null), [client]);
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
      setState({ cache, key, phase: 'loading', data: cache.peek(query) });
      try {
        const data = await cache.read(query, controller.signal);
        if (!controller.signal.aborted) setState({ cache, key, phase: 'ready', data });
      } catch {
        if (!controller.signal.aborted)
          setState({ cache, key, phase: 'error', data: cache.peek(query) });
      }
    });
    return () => controller.abort();
  }, [cache, online, valid, key, query, attempt]);

  // Never display the previous filter or previous client's results while a
  // new effect is starting. Offline snapshots contain no own-account links.
  const current = state?.cache === cache && state.key === key ? state : null;
  const data = online ? (current?.data ?? null) : (cache?.peek(query) ?? null);
  const countryNames = new Intl.DisplayNames([locale], { type: 'region' });
  const own = online && current?.phase === 'ready' ? data?.own : null;
  const ownKnown = online && current?.phase === 'ready';
  const date = data
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(data.updatedAt),
      )
    : '';
  return (
    <section className="cpi-leaderboard" aria-label={t('general.rankings')}>
      <p>{t('leaderboard.declared')}</p>
      <p className="cpi-leaderboard-rules">
        {t('leaderboard.ruleset', { ruleset: rulesetVersion })}
      </p>
      {!client ? (
        <p role="status">{t('leaderboard.unavailable')}</p>
      ) : (
        <>
          <fieldset className="cpi-leaderboard-filters">
            <legend>{t('menu.rankingsScope')}</legend>
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
                <select value={region} onChange={(event) => setRegion(event.target.value)}>
                  <option value="">{t('leaderboard.chooseRegion')}</option>
                  {scope === 'continent'
                    ? CONTINENTS.map((code) => (
                        <option key={code} value={code}>
                          {t(continentKeys[code])}
                        </option>
                      ))
                    : countries.map((item) => (
                        <option key={item.countryCode} value={item.countryCode}>
                          {countryNames.of(item.countryCode) ?? item.countryCode}
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
                <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                  {t('leaderboard.retry')}
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
                    />
                  )}
                  <h2>{t('leaderboard.own')}</h2>
                  {own ? (
                    <LeaderboardTable
                      entries={[own]}
                      caption={t('leaderboard.own')}
                      ownPublicId={own.publicId}
                    />
                  ) : (
                    <p>{t(ownKnown ? 'leaderboard.noOwn' : 'leaderboard.ownUnavailable')}</p>
                  )}
                  {own && data.neighbors.length > 1 && (
                    <LeaderboardTable
                      entries={data.neighbors}
                      caption={t('leaderboard.nearby')}
                      ownPublicId={own.publicId}
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
