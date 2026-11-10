import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage } from '../language-context';
import { PROFILE_SECTIONS, ProfileSectionLabel } from '../account/profile-menu';
import { savedPendingForAccount } from './saved-pending-client';
import type {
  SavedPendingClient,
  SavedPendingCursor,
  SavedPendingPage,
} from './saved-pending-client';
import './saved-pending-view.css';
interface Loaded {
  client: SavedPendingClient;
  scope: object;
  page: SavedPendingPage;
  phase: 'loading' | 'ready' | 'error';
}
interface SavedRunsProps {
  client: SavedPendingClient | null;
  online: boolean;
  canRecover?: boolean;
  onRecover: (runId: string) => void;
}

export function SavedRuns(props: SavedRunsProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <details name={PROFILE_SECTIONS} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <ProfileSectionLabel icon="saved" title={t('savedPending.title')} />
      </summary>
      {open && (
        <div className="cpi-profile-row-panel">
          <SavedPendingView {...props} />
        </div>
      )}
    </details>
  );
}

export function SavedPendingView({ client, online, canRecover = true, onRecover }: SavedRunsProps) {
  const { t, number } = useLanguage();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const generation = useRef<object>({});
  const getScope = useCallback(() => client?.accountScope() ?? null, [client]);
  const subscribe = useCallback(
    (observer: () => void) => client?.subscribeAccountScope(observer) ?? (() => undefined),
    [client],
  );
  const scope = useSyncExternalStore(subscribe, getScope, getScope);
  const load = useCallback(
    async (after: SavedPendingCursor | null) => {
      if (!client || !scope || getScope() !== scope) return;
      const epoch = {};
      generation.current = epoch;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoaded((previous) => ({
        client,
        scope,
        page:
          after && previous?.client === client && previous.scope === scope
            ? previous.page
            : { status: 'saved', runs: [], next: null },
        phase: 'loading',
      }));
      try {
        const page = await client.read(after, controller.signal);
        if (controller.signal.aborted || generation.current !== epoch || getScope() !== scope)
          return;
        // Show one bounded page, not an ever-growing client-side recovery history.
        setLoaded({ client, scope, phase: 'ready', page });
      } catch {
        if (!controller.signal.aborted && generation.current === epoch && getScope() === scope)
          setLoaded((previous) => ({
            client,
            scope,
            phase: 'error',
            page:
              previous?.client === client && previous.scope === scope
                ? previous.page
                : { status: 'saved', runs: [], next: null },
          }));
      }
    },
    [client, scope, getScope],
  );
  useEffect(() => {
    if (client && online && scope) void Promise.resolve().then(() => load(null));
    return () => {
      generation.current = {};
      request.current?.abort();
    };
  }, [client, online, scope, attempt, load]);
  const current = loaded?.client === client && loaded.scope === scope ? loaded : null;
  const page = savedPendingForAccount(current?.page ?? null, current?.scope ?? null, scope);
  const busy = !current || current.phase === 'loading';
  return (
    <section className="cpi-saved-pending" aria-label={t('savedPending.title')}>
      {!client || !scope ? (
        <p role="status">{t('savedPending.unavailable')}</p>
      ) : !online ? (
        <p role="status">{t('savedPending.offline')}</p>
      ) : (
        <>
          {busy && <p role="status">{t('savedPending.loading')}</p>}
          {current?.phase === 'error' && (
            <>
              <p role="alert">{t('savedPending.error')}</p>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                {t('savedPending.refresh')}
              </button>
            </>
          )}
          {current?.phase === 'ready' && page?.runs.length === 0 && (
            <p>{t('savedPending.empty')}</p>
          )}
          {!canRecover && !!page?.runs.length && <p>{t('savedPending.endCurrent')}</p>}
          <ul>
            {page?.runs.map((run) => (
              <li key={run.runId}>
                <p>{t('savedPending.progress', { row: number(run.lastClearedRow) })}</p>
                <p>
                  {t(
                    run.rewardPending
                      ? 'savedPending.awaiting'
                      : run.revivesGranted > run.revivesApplied
                        ? 'savedPending.earned'
                        : 'savedPending.resolved',
                  )}
                </p>
                <button
                  type="button"
                  disabled={busy || !canRecover}
                  onClick={() => {
                    if (getScope() === scope) onRecover(run.runId);
                  }}
                >
                  {t('savedPending.recover')}
                </button>
              </li>
            ))}
          </ul>
          {page?.next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void load(page.next);
              }}
            >
              {t('savedPending.more')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
