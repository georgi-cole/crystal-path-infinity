import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLanguage } from './language-context';
import { useTestStore, useThemeId } from './store-context';
import { STORE_PRODUCTS, storeProduct, createTestReceiptId } from './store-catalog';
import type { StoreProduct, ThemeId, WorldId } from './store-catalog';
import { WORLD_KITS, WORLD_ORDER } from './world-kits';
import { ThemeArtwork } from './theme-art';
import { StorePackArt } from './store-pack-art';
import { WorldShowcase } from './world-experience';
import './store-vault.css';

function StoreDialog({
  title,
  onClose,
  children,
  world,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  world?: ThemeId;
}) {
  const equipped = useThemeId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const { t } = useLanguage();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const content = ref.current;
    content?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = content?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!nodes?.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes[nodes.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
        event.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="cpi-vault-backdrop"
      data-world={world ?? equipped}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="cpi-vault-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-dialog-title"
      >
        <button
          className="cpi-vault-close"
          type="button"
          onClick={onClose}
          aria-label={t('vault.close')}
        >
          ×
        </button>
        <h2 id="vault-dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

type Dialog =
  { kind: 'theme'; theme: WorldId } | { kind: 'checkout'; id: string } | { kind: 'reset' } | null;
export function StoreVault() {
  const { t, number, locale } = useLanguage();
  const { store, snapshot, error } = useTestStore();
  const [filter, setFilter] = useState<'worlds' | 'essentials' | 'collection'>('worlds');
  const [resource, setResource] = useState<'credit' | 'sp' | 'hints'>('credit');
  const [family, setFamily] = useState<'all' | 'adventure' | 'sport' | 'pets'>('all');
  const [worldPage, setWorldPage] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState('');
  const modal = dialog !== null;
  const price = (product: StoreProduct) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(product.price);
  const amount = (product: StoreProduct) =>
    t(
      product.kind === 'sp'
        ? 'vault.spAmount'
        : product.kind === 'credit'
          ? 'vault.creditAmount'
          : 'vault.hintAmount',
      { count: number(product.quantity) },
    );
  function act(operation: () => void, success = '') {
    try {
      operation();
      setNotice(success);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function buy(product: StoreProduct) {
    if (!store) return;
    act(() => {
      const id = createTestReceiptId();
      store.beginPurchase(product.id, id);
      setDialog({ kind: 'checkout', id });
    });
  }
  function closeDialog(cancel = true) {
    if (cancel && dialog?.kind === 'checkout') act(() => store?.cancelPurchase(dialog.id));
    setDialog(null);
  }
  const themeProducts = STORE_PRODUCTS.filter((product) => product.kind === 'theme')
    .sort((a, b) => WORLD_ORDER.indexOf(a.theme!) - WORLD_ORDER.indexOf(b.theme!))
    .filter((product) =>
      filter === 'collection'
        ? snapshot.owned.includes(product.theme!)
        : family === 'all' || WORLD_KITS[product.theme!].family === family,
    );
  const pages = Math.max(1, Math.ceil(themeProducts.length / 2));
  const page = Math.min(worldPage, pages - 1);
  const visibleWorlds = themeProducts.slice(page * 2, page * 2 + 2);
  const checkout =
    dialog?.kind === 'checkout' && snapshot.pending?.id === dialog.id ? snapshot.pending : null;
  const checkoutProduct = checkout ? storeProduct(checkout.productId) : null;
  return (
    <section className={'cpi-store-vault is-' + filter} aria-labelledby="cpi-store-title">
      <div inert={modal}>
        <header className="cpi-store-heading">
          <span>{t('store.eyebrow')}</span>
          <h1 id="cpi-store-title" data-menu-heading tabIndex={-1}>
            {t(
              filter === 'essentials'
                ? 'vault.catalogTitle'
                : filter === 'collection'
                  ? 'vault.collection'
                  : 'vault.worldCollectionTitle',
            )}
          </h1>
          {filter === 'worlds' && (
            <p>{t('vault.worldCollectionCount', { count: number(WORLD_ORDER.length) })}</p>
          )}
          <span className="cpi-store-status">
            <i />
            {t('vault.test')}
          </span>
        </header>
        {filter !== 'worlds' && (
          <aside className="cpi-vault-wallet" aria-label={t('vault.manage')}>
            <div>
              <span>{t('vault.reserve')}</span>
              <strong>
                {number(snapshot.sp)} <small>SP</small>
              </strong>
            </div>
            <div>
              <span>{t('vault.credits')}</span>
              <strong>{number(snapshot.credits)}</strong>
            </div>
            <div>
              <span>{t('vault.hints')}</span>
              <strong>{number(snapshot.hints)}</strong>
            </div>
          </aside>
        )}
        {(error || notice) && (
          <p className="cpi-vault-notice" role={error ? 'alert' : 'status'}>
            {error ?? notice}
          </p>
        )}
        {snapshot.pending && (
          <aside className="cpi-vault-pending">
            <div>
              <strong>{t('vault.pendingTitle')}</strong>
              <p>{t('vault.pendingDetail')}</p>
            </div>
            <button
              type="button"
              onClick={() => setDialog({ kind: 'checkout', id: snapshot.pending!.id })}
            >
              {t('vault.finish')}
            </button>
          </aside>
        )}
        <nav className="cpi-store-filters" aria-label={t('general.store')}>
          {(['worlds', 'essentials', 'collection'] as const).map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setWorldPage(0);
              }}
            >
              {t(
                id === 'worlds'
                  ? 'vault.worlds'
                  : id === 'essentials'
                    ? 'vault.essentials'
                    : 'vault.collection',
              )}
            </button>
          ))}
        </nav>
        {filter === 'worlds' && (
          <nav className="cpi-vault-world-families" aria-label={t('vault.worlds')}>
            {(['all', 'adventure', 'sport', 'pets'] as const).map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={family === id}
                onClick={() => {
                  setFamily(id);
                  setWorldPage(0);
                }}
              >
                {t(
                  id === 'all'
                    ? 'vault.allWorlds'
                    : id === 'adventure'
                      ? 'vault.adventureWorlds'
                      : id === 'sport'
                        ? 'vault.sportWorlds'
                        : 'vault.petWorlds',
                )}
              </button>
            ))}
          </nav>
        )}
        {filter !== 'essentials' && (
          <div
            className={'cpi-vault-worlds' + (visibleWorlds.length === 1 ? ' has-one-world' : '')}
          >
            {filter === 'collection' && (
              <article className="cpi-vault-original">
                <div>
                  <span>{t('vault.owned')}</span>
                  <h2>{t('vault.obsidian')}</h2>
                  <p>{t('vault.default')}</p>
                </div>
                <button
                  type="button"
                  disabled={!store || snapshot.equipped === 'obsidian'}
                  onClick={() => act(() => store?.equip('obsidian'))}
                >
                  {t(snapshot.equipped === 'obsidian' ? 'vault.equipped' : 'vault.equip')}
                </button>
              </article>
            )}
            {visibleWorlds.map((product) => {
              const theme = product.theme!;
              const owned = snapshot.owned.includes(theme);
              return (
                <article
                  className={'cpi-vault-world world-' + theme}
                  key={product.id}
                  data-world={theme}
                >
                  <div className="cpi-vault-world-picture">
                    <ThemeArtwork theme={theme} />
                    {owned && <span className="cpi-vault-world-tag">{t('vault.owned')}</span>}
                  </div>
                  <div className="cpi-vault-world-copy">
                    <h2>{t(product.name)}</h2>
                    <p>{t(WORLD_KITS[theme].mood)}</p>
                    <div className="cpi-vault-world-actions">
                      <button
                        type="button"
                        className="is-primary"
                        disabled={
                          !store || !!error || !!snapshot.pending || snapshot.equipped === theme
                        }
                        aria-label={
                          owned
                            ? undefined
                            : t('vault.unlock') + ' · ' + t(product.name) + ' · ' + price(product)
                        }
                        onClick={() => (owned ? act(() => store?.equip(theme)) : buy(product))}
                      >
                        {owned
                          ? t(snapshot.equipped === theme ? 'vault.equipped' : 'vault.equip')
                          : t('vault.testBuyPrice', { price: price(product) })}
                      </button>
                      <button type="button" onClick={() => setDialog({ kind: 'theme', theme })}>
                        {t('vault.explore')}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {filter !== 'essentials' && pages > 1 && (
          <nav className="cpi-vault-world-pages" aria-label={t('vault.worlds')}>
            <button
              type="button"
              disabled={page === 0}
              aria-label={t('vault.previousWorlds')}
              onClick={() => setWorldPage(page - 1)}
            >
              ‹
            </button>
            <span role="status">
              {t('vault.worldPage', { current: number(page + 1), total: number(pages) })}
            </span>
            <button
              type="button"
              disabled={page === pages - 1}
              aria-label={t('vault.nextWorlds')}
              onClick={() => setWorldPage(page + 1)}
            >
              ›
            </button>
          </nav>
        )}
        {filter === 'essentials' && (
          <>
            <nav className="cpi-vault-resource-filters" aria-label={t('vault.essentials')}>
              {(['credit', 'sp', 'hints'] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={resource === kind}
                  onClick={() => setResource(kind)}
                >
                  <span aria-hidden="true">
                    {kind === 'credit' ? '↻' : kind === 'sp' ? '✦' : '◈'}
                  </span>
                  {t(
                    kind === 'credit'
                      ? 'vault.continuations'
                      : kind === 'sp'
                        ? 'vault.reserve'
                        : 'vault.hintsShort',
                  )}
                </button>
              ))}
            </nav>
            {[resource].map((kind) => (
              <section
                className="cpi-vault-shelf"
                key={kind}
                aria-labelledby={'vault-shelf-' + kind}
              >
                <header>
                  <div>
                    <h2 id={'vault-shelf-' + kind}>
                      {t(
                        kind === 'credit'
                          ? 'vault.credits'
                          : kind === 'sp'
                            ? 'vault.reserve'
                            : 'vault.hints',
                      )}
                    </h2>
                    <p>
                      {t(
                        kind === 'credit'
                          ? 'vault.creditShort'
                          : kind === 'sp'
                            ? 'vault.spShort'
                            : 'vault.hintShort',
                      )}
                    </p>
                  </div>
                </header>
                <div className="cpi-vault-packs">
                  {STORE_PRODUCTS.filter((product) => product.kind === kind).map(
                    (product, index, products) => (
                      <article key={product.id} className={'cpi-vault-pack is-' + kind}>
                        <StorePackArt kind={kind} tier={index} />
                        {index === products.length - 1 && (
                          <span className="cpi-vault-pack-tag">{t('vault.bestValue')}</span>
                        )}
                        <span className="cpi-vault-pack-number">
                          {number(product.quantity)}
                          <small>
                            {kind === 'sp'
                              ? 'SP'
                              : t(kind === 'credit' ? 'vault.creditsUnit' : 'vault.hintsUnit')}
                          </small>
                        </span>
                        <h3>{t(product.name)}</h3>
                        <button
                          type="button"
                          disabled={!store || !!error || !!snapshot.pending}
                          aria-label={t('vault.testBuyLabel', {
                            name: t(product.name),
                            amount: amount(product),
                            price: price(product),
                          })}
                          onClick={() => buy(product)}
                        >
                          <span>{t('vault.testBuyPrice', { price: price(product) })}</span>
                          <span aria-hidden="true">+</span>
                        </button>
                      </article>
                    ),
                  )}
                </div>
                <details className="cpi-vault-details">
                  <summary>{t('vault.howItWorks')}</summary>
                  <p>
                    {t(
                      kind === 'credit'
                        ? 'vault.creditRules'
                        : kind === 'sp'
                          ? 'vault.spRules'
                          : 'vault.hintRules',
                    )}
                  </p>
                  <p>{t('vault.assistedRules')}</p>
                </details>
              </section>
            ))}
          </>
        )}
        <footer className="cpi-vault-footer">
          <p>{t('vault.testDetail')}</p>
          {snapshot.assistedBest !== null && (
            <p>{t('vault.localBest', { row: number(snapshot.assistedBest) })}</p>
          )}
          <button type="button" onClick={() => setDialog({ kind: 'reset' })}>
            {t('vault.reset')}
          </button>
        </footer>
      </div>
      {dialog?.kind === 'reset' && (
        <StoreDialog title={t('vault.reset')} onClose={() => closeDialog()}>
          <p>{t('vault.resetConfirm')}</p>
          <div className="cpi-vault-checkout-actions">
            <button type="button" onClick={() => closeDialog()}>
              {t('vault.cancel')}
            </button>
            <button
              type="button"
              className="cpi-vault-primary"
              onClick={() =>
                act(() => {
                  store?.reset();
                  setDialog(null);
                }, t('vault.resetDone'))
              }
            >
              {t('vault.reset')}
            </button>
          </div>
        </StoreDialog>
      )}
      {dialog?.kind === 'theme' && (
        <StoreDialog
          title={t(WORLD_KITS[dialog.theme].title)}
          world={dialog.theme}
          onClose={() => closeDialog()}
        >
          <WorldShowcase key={dialog.theme} theme={dialog.theme} />
          <p>{t(WORLD_KITS[dialog.theme].detail)}</p>
          <p className="cpi-vault-muted">{t('vault.included')}</p>
          <button
            type="button"
            className="cpi-vault-primary cpi-vault-unlock"
            disabled={!store || !!error || !!snapshot.pending || snapshot.equipped === dialog.theme}
            onClick={() => {
              const product = STORE_PRODUCTS.find((item) => item.theme === dialog.theme)!;
              if (snapshot.owned.includes(dialog.theme)) {
                act(() => store?.equip(dialog.theme));
                setDialog(null);
              } else buy(product);
            }}
          >
            {snapshot.owned.includes(dialog.theme)
              ? t(snapshot.equipped === dialog.theme ? 'vault.equipped' : 'vault.equip')
              : t('vault.unlock') +
                ' · ' +
                price(STORE_PRODUCTS.find((item) => item.theme === dialog.theme)!)}
          </button>
        </StoreDialog>
      )}
      {checkout && checkoutProduct && (
        <StoreDialog
          title={t('vault.checkout')}
          world={checkoutProduct.theme}
          onClose={() => closeDialog()}
        >
          <span className="cpi-store-status">{t('vault.test')}</span>
          <h3>{t(checkoutProduct.name)}</h3>
          <p>{checkoutProduct.kind === 'theme' ? t('vault.included') : amount(checkoutProduct)}</p>
          <p>{t('vault.testPrice', { price: price(checkoutProduct) })}</p>
          <p className="cpi-vault-muted">{t('vault.testDetail')}</p>
          <div className="cpi-vault-checkout-actions">
            <button
              type="button"
              className="cpi-vault-primary"
              onClick={() =>
                act(() => {
                  store?.completePurchase(checkout.id);
                  setDialog(null);
                }, t('vault.success'))
              }
            >
              {t('vault.approve')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDialog(null);
                setNotice(t('vault.pendingDetail'));
              }}
            >
              {t('vault.pending')}
            </button>
            <button
              type="button"
              onClick={() =>
                act(() => {
                  store?.cancelPurchase(checkout.id);
                  setDialog(null);
                }, t('vault.failed'))
              }
            >
              {t('vault.fail')}
            </button>
            <button
              type="button"
              onClick={() => {
                closeDialog();
                setNotice(t('vault.cancelled'));
              }}
            >
              {t('vault.cancel')}
            </button>
          </div>
        </StoreDialog>
      )}
    </section>
  );
}
