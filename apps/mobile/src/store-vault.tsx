import { useState } from 'react';
import { EffectGlyph } from './effect-glyph';
import { useLanguage } from './language-context';
import './store-vault.css';

const PRODUCTS = [
  { id: 'sp', group: 'essentials', title: 'store.sp', note: 'store.spNote' },
  { id: 'hints', group: 'essentials', title: 'store.hints', note: 'store.hintsNote' },
  { id: 'noAds', group: 'essentials', title: 'store.noAds', note: 'store.noAdsNote' },
  { id: 'bridges', group: 'personalize', title: 'store.bridges', note: 'store.bridgesNote' },
  {
    id: 'backgrounds',
    group: 'personalize',
    title: 'store.backgrounds',
    note: 'store.backgroundsNote',
  },
  { id: 'themes', group: 'personalize', title: 'store.themes', note: 'store.themesNote' },
] as const;
const FILTERS = ['all', 'essentials', 'personalize'] as const;

function ProductArt({ kind }: { kind: (typeof PRODUCTS)[number]['id'] }) {
  if (kind === 'sp') return <EffectGlyph kind="heal_20" />;
  if (kind === 'hints') return <EffectGlyph kind="gain_hint" />;
  if (kind === 'noAds')
    return (
      <svg viewBox="0 0 96 80" fill="none">
        <rect x="17" y="19" width="62" height="44" rx="7" />
        <path d="m43 32 13 9-13 9V32ZM23 68l50-56" />
      </svg>
    );
  if (kind === 'bridges')
    return (
      <svg viewBox="0 0 96 80" fill="none">
        <path d="m42 12-31 61M54 12l31 61" opacity=".4" />
        <path d="M40 20h6v8H36zM50 20h6l4 8H50zM33 35h13v12H27zM50 35h13l6 12H50zM23 55h23v17H14zM50 55h23l9 17H50z" />
        <path className="cpi-store-rail" d="m38 21-26 50M58 21l26 50" strokeDasharray="1 7" />
      </svg>
    );
  if (kind === 'backgrounds')
    return (
      <div className="cpi-store-abyss">
        <i />
        <i />
        <span />
      </div>
    );
  return (
    <div className="cpi-store-swatches">
      <i />
      <i />
      <i />
    </div>
  );
}

/** A catalog preview. Prices, entitlements and payment fulfillment are not configured. */
export function StoreVault() {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  return (
    <section className="cpi-store-vault" aria-labelledby="cpi-store-title">
      <header className="cpi-store-heading">
        <span>{t('store.eyebrow')}</span>
        <h1 id="cpi-store-title" data-menu-heading tabIndex={-1}>
          {t('general.store')}
        </h1>
        <p>{t('store.tagline')}</p>
        <span className="cpi-store-status">
          <i />
          {t('store.status')}
        </span>
      </header>
      <div className="cpi-store-filters" role="tablist" aria-label={t('general.store')}>
        {FILTERS.map((id) => (
          <button
            type="button"
            role="tab"
            key={id}
            id={'cpi-store-tab-' + id}
            aria-selected={filter === id}
            aria-controls="cpi-store-catalog"
            tabIndex={filter === id ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const index =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? FILTERS.length - 1
                    : (FILTERS.indexOf(id) +
                        (event.key === 'ArrowRight' ? 1 : FILTERS.length - 1)) %
                      FILTERS.length;
              const next = FILTERS[index];
              setFilter(next);
              document.getElementById('cpi-store-tab-' + next)?.focus();
            }}
            onClick={() => setFilter(id)}
          >
            {t(
              id === 'all'
                ? 'store.all'
                : id === 'essentials'
                  ? 'store.essentials'
                  : 'store.personalize',
            )}
          </button>
        ))}
      </div>
      <div
        className="cpi-store-grid"
        role="tabpanel"
        id="cpi-store-catalog"
        aria-labelledby={'cpi-store-tab-' + filter}
      >
        {PRODUCTS.filter((product) => filter === 'all' || product.group === filter).map(
          (product) => (
            <article className={'cpi-store-product is-' + product.id} key={product.id}>
              <div className="cpi-store-art" aria-hidden="true">
                <ProductArt kind={product.id} />
              </div>
              <h2>{t(product.title)}</h2>
              <p>{t(product.note)}</p>
            </article>
          ),
        )}
      </div>
      <p className="cpi-store-availability">{t('store.unavailable')}</p>
    </section>
  );
}
