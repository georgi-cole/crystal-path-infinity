export const EXPANSION_WORLDS = ['moonpatch', 'candy'] as const;
const supported = new Set<string>(EXPANSION_WORLDS);

export function acceptsExpandedWorlds(request: Request): boolean {
  return request.headers.get('accept') === 'application/json; cpi-world-catalog=2';
}

export function expansionWorldProduct(key: string): boolean {
  return key.startsWith('theme.') && supported.has(key.slice('theme.'.length));
}

/** Older app builds validate wallet World IDs against their bundled catalog. */
export function legacyWorldWallet(wallet: unknown): unknown {
  if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) return wallet;
  const view = wallet as Record<string, unknown>;
  if (!Array.isArray(view.owned) || typeof view.equipped !== 'string') return wallet;
  return {
    ...view,
    owned: view.owned.filter((id) => typeof id !== 'string' || !supported.has(id)),
    equipped: supported.has(view.equipped) ? 'obsidian' : view.equipped,
  };
}
