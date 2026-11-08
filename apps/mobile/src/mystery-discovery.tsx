import { practiceStorage, QA_TOOLS_ENABLED } from './app-profile';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import { MysteryPager } from './mystery-pager';
import './mystery-discovery.css';

function JournalCard({
  kind,
  version,
  navigation,
  onTry,
}: {
  kind: EffectKind;
  version: string;
  navigation: ReactNode;
  onTry: () => void;
}) {
  const { locale, t } = useLanguage();
  const copy = effectCopy(locale, kind, version);
  const summary = mysteryDiscoverySummary(kind, locale === 'bg', version);
  const paragraphs = copy.detail.split('\n\n');
  return (
    <article className="cpi-journal-card" data-tier={mysteryTier(kind)}>
      <header className="cpi-journal-hero">
        <div className="cpi-journal-emblem" aria-hidden="true">
          <EffectGlyph kind={kind} />
        </div>
        <h2>{copy.title}</h2>
        {summary && <p className="cpi-journal-summary">{summary}</p>}
      </header>
      <div className="cpi-journal-explanation">
        <h3>{t('guide.howItWorks')}</h3>
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <footer className="cpi-journal-card-footer">
        {navigation}
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
      </footer>
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
        <JournalCard
          key={activeKind}
          kind={activeKind}
          version={version}
          navigation={
            known.length > 1 ? (
              <MysteryPager
                className="cpi-journal-pager cpi-journal-entry-pager"
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
            ) : (
              <span className="cpi-journal-count">
                {t('guide.discoveryPosition', { page: number(1), total: number(1) })}
              </span>
            )
          }
          onTry={() => setDemo(activeKind)}
        />
      )}
    </section>
  );
}
