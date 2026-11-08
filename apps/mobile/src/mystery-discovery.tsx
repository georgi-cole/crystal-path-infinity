import { practiceStorage, QA_TOOLS_ENABLED } from './app-profile';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useThemeId } from './store-context';
import { mysteryTier } from '@crystal-path-infinity/game-core';
import { PRACTICE_RULESET_VERSION } from './practice-rules';
import type { EffectKind, RunState } from '@crystal-path-infinity/game-core';
import { useLanguage } from './language-context';
import { EffectGlyph } from './mystery-effects';
import { effectCopy } from './mystery.messages';
import { mysteryDiscoverySummary } from './mystery-discovery-copy';
import { discoveriesFromRun, discoveredKinds, readMysteryJournal } from './mystery-journal-model';
import { MysteryLab } from './mystery-lab';
import './mystery-discovery.css';

const compactJournal =
  '(max-width: 420px) and (max-height: 620px), (orientation: landscape) and (max-height: 500px)';

function subscribeToJournalViewport(onChange: () => void) {
  const media = window.matchMedia(compactJournal);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function JournalPager({
  label,
  previous,
  next,
  position,
  announcement,
  onChange,
}: {
  label: string;
  previous: string;
  next: string;
  position: string;
  announcement?: string;
  onChange: (offset: number) => void;
}) {
  return (
    <div className="cpi-journal-pager" role="group" aria-label={label}>
      <button type="button" aria-label={previous} onClick={() => onChange(-1)}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m10 3-5 5 5 5" />
        </svg>
      </button>
      <span role="status" aria-atomic="true">
        {announcement && <span className="visually-hidden">{announcement} </span>}
        {position}
      </span>
      <button type="button" aria-label={next} onClick={() => onChange(1)}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m6 3 5 5-5 5" />
        </svg>
      </button>
    </div>
  );
}

function JournalCard({
  kind,
  version,
  onTry,
}: {
  kind: EffectKind;
  version: string;
  onTry: () => void;
}) {
  const { locale, t, number } = useLanguage();
  const [part, setPart] = useState(0);
  const compact = useSyncExternalStore(
    subscribeToJournalViewport,
    () => window.matchMedia(compactJournal).matches,
    () => false,
  );
  const copy = effectCopy(locale, kind, version);
  const summary = mysteryDiscoverySummary(kind, locale === 'bg');
  const paragraphs = copy.detail.split('\n\n');
  const paged = compact && paragraphs.length > 1 && copy.detail.length > 170;
  const selected = Math.min(part, paragraphs.length - 1);
  const visible = paged ? [paragraphs[selected]] : paragraphs;
  return (
    <article className="cpi-journal-card" data-tier={mysteryTier(kind)}>
      <header>
        <EffectGlyph kind={kind} />
        <h2>{copy.title}</h2>
        {QA_TOOLS_ENABLED && (
          <button
            type="button"
            className="cpi-journal-demo"
            onClick={onTry}
            aria-label={t('guide.tryDiscovery', { title: copy.title })}
          >
            {t('guide.tryIt')} <span aria-hidden="true">{'\u2197'}</span>
          </button>
        )}
      </header>
      {summary && <p className="cpi-journal-summary">{summary}</p>}
      <div className="cpi-journal-explanation">
        <div className="cpi-journal-explanation-heading">
          <h3>{t('guide.howItWorks')}</h3>
          {paged && (
            <JournalPager
              label={t('guide.howItWorks')}
              previous={t('guide.previousPart')}
              next={t('guide.nextPart')}
              position={t('guide.partPosition', {
                page: number(selected + 1),
                total: number(paragraphs.length),
              })}
              onChange={(offset) =>
                setPart((index) => (index + offset + paragraphs.length) % paragraphs.length)
              }
            />
          )}
        </div>
        {visible.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}

export function MysteryJournal({
  onClose,
  state,
  known: provided,
  reducedMotion = false,
}: {
  onClose?: () => void;
  state?: RunState;
  reducedMotion?: boolean;
  known?: readonly EffectKind[];
}) {
  const { locale, t, number } = useLanguage();
  const theme = useThemeId();
  const [known] = useState(() => {
    let stored: EffectKind[] = [];
    try {
      if (typeof window !== 'undefined') stored = readMysteryJournal(practiceStorage());
    } catch {
      /* Saved run discoveries are still available. */
    }
    return discoveredKinds(provided ?? [...stored, ...(state ? discoveriesFromRun(state) : [])]);
  });
  const [page, setPage] = useState(0);
  const [demo, setDemo] = useState<EffectKind | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!demo) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [demo]);
  if (QA_TOOLS_ENABLED && demo)
    return (
      <MysteryLab
        initialKind={demo}
        availableKinds={known}
        onClose={() => setDemo(null)}
        reducedMotion={reducedMotion}
      />
    );
  const version = state?.rulesetVersion ?? PRACTICE_RULESET_VERSION;
  const activeKind = known[page];
  const changePage = (offset: number) =>
    setPage((index) => (index + offset + known.length) % known.length);
  return (
    <section className="cpi-mystery-journal" data-world={theme} aria-labelledby="cpi-journal-title">
      <header className={onClose ? 'cpi-journal-header' : 'visually-hidden'}>
        <h1 id="cpi-journal-title" ref={heading} tabIndex={-1} data-menu-heading>
          {t('guide.journalTab')}
        </h1>
        {onClose && (
          <button type="button" onClick={onClose}>
            {t('guide.backToRun')}
          </button>
        )}
      </header>
      {!activeKind ? (
        <div className="cpi-journal-empty">
          <span aria-hidden="true">{'\u25c7'}</span>
          <h2>{t('guide.journalEmpty')}</h2>
          <p>{t('guide.journalIntro')}</p>
        </div>
      ) : (
        <>
          {known.length > 1 && (
            <JournalPager
              label={t('guide.journalTab')}
              previous={t('guide.previousDiscovery')}
              next={t('guide.nextDiscovery')}
              announcement={effectCopy(locale, activeKind, version).title}
              position={t('guide.discoveryPosition', {
                page: number(page + 1),
                total: number(known.length),
              })}
              onChange={changePage}
            />
          )}
          <JournalCard
            key={activeKind}
            kind={activeKind}
            version={version}
            onTry={() => setDemo(activeKind)}
          />
        </>
      )}
    </section>
  );
}
