const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: unknown, nullable = false): value is string | null {
  return (
    (nullable && value === null) ||
    (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)))
  );
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function invalid(): never {
  throw new Error('Invalid own reward export');
}
function page(value: unknown, key: string): { items: unknown[]; next: string | null } {
  const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !record(raw) ||
    !Array.isArray(raw[key]) ||
    raw[key].length > 100 ||
    (raw.next !== null && !identifier(raw.next))
  )
    invalid();
  return { items: raw[key], next: raw.next };
}

export function ownRewardExport(value: unknown): { rewards: object[]; next: string | null } {
  const raw = page(value, 'rewards');
  const rewards: object[] = [];
  for (const item of raw.items) {
    if (
      !record(item) ||
      !identifier(item.id) ||
      !identifier(item.runId) ||
      typeof item.deathId !== 'string' ||
      !/^[A-Za-z0-9:_-]{1,120}$/.test(item.deathId) ||
      typeof item.rulesetVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(item.rulesetVersion) ||
      !['pending', 'verified', 'denied', 'forfeited'].includes(String(item.state)) ||
      typeof item.ordinal !== 'number' ||
      !Number.isInteger(item.ordinal) ||
      item.ordinal < 1 ||
      item.ordinal > 10 ||
      item.restoreSp !== (item.ordinal <= 5 ? 200 : 150) ||
      !timestamp(item.createdAt) ||
      !timestamp(item.expiresAt, true) ||
      !timestamp(item.resolvedAt, true) ||
      !timestamp(item.providerEarnedAt, true)
    )
      invalid();
    const grant = item.grant;
    if (
      grant !== null &&
      (!record(grant) ||
        !identifier(grant.id) ||
        !['granted', 'applied', 'forfeited'].includes(String(grant.state)) ||
        !timestamp(grant.grantedAt) ||
        !timestamp(grant.appliedAt, true))
    )
      invalid();
    rewards.push({
      id: item.id,
      runId: item.runId,
      deathId: item.deathId,
      rulesetVersion: item.rulesetVersion,
      state: item.state,
      ordinal: item.ordinal,
      restoreSp: item.restoreSp,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      resolvedAt: item.resolvedAt,
      providerEarnedAt: item.providerEarnedAt,
      grant:
        grant === null
          ? null
          : {
              id: grant.id,
              state: grant.state,
              grantedAt: grant.grantedAt,
              appliedAt: grant.appliedAt,
            },
    });
  }
  return { rewards, next: raw.next };
}
export function ownAdAuthorizationExport(value: unknown): {
  adAuthorizations: object[];
  next: string | null;
} {
  const raw = page(value, 'adAuthorizations');
  const adAuthorizations: object[] = [];
  for (const item of raw.items) {
    if (
      !record(item) ||
      !identifier(item.id) ||
      typeof item.policyVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(item.policyVersion) ||
      !['unknown', 'child', 'teen', 'adult'].includes(String(item.context)) ||
      typeof item.prerequisitesSatisfied !== 'boolean' ||
      !timestamp(item.issuedAt) ||
      !timestamp(item.validUntil) ||
      !timestamp(item.revokedAt, true) ||
      !record(item.flags) ||
      !record(item.inventory)
    )
      invalid();
    const flags = item.flags;
    const inventory = item.inventory;
    if (
      typeof flags.childDirected !== 'boolean' ||
      typeof flags.underAgeOfConsent !== 'boolean' ||
      typeof flags.nonPersonalized !== 'boolean' ||
      !['G', 'PG', 'T', 'MA'].includes(String(flags.maxAdContentRating)) ||
      inventory.provider !== 'admob' ||
      !['android', 'ios'].includes(String(inventory.platform)) ||
      typeof inventory.sdkVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(inventory.sdkVersion) ||
      !Array.isArray(inventory.mediation) ||
      inventory.mediation.length > 20
    )
      invalid();
    const mediation: object[] = [];
    for (const adapter of inventory.mediation) {
      if (
        !record(adapter) ||
        typeof adapter.identifier !== 'string' ||
        !/^[A-Za-z0-9._-]{1,120}$/.test(adapter.identifier) ||
        typeof adapter.version !== 'string' ||
        !/^[A-Za-z0-9._-]{1,80}$/.test(adapter.version)
      )
        invalid();
      mediation.push({ identifier: adapter.identifier, version: adapter.version });
    }
    adAuthorizations.push({
      id: item.id,
      policyVersion: item.policyVersion,
      context: item.context,
      prerequisitesSatisfied: item.prerequisitesSatisfied,
      flags: {
        childDirected: flags.childDirected,
        underAgeOfConsent: flags.underAgeOfConsent,
        maxAdContentRating: flags.maxAdContentRating,
        nonPersonalized: flags.nonPersonalized,
      },
      issuedAt: item.issuedAt,
      validUntil: item.validUntil,
      revokedAt: item.revokedAt,
      inventory: {
        provider: 'admob',
        platform: inventory.platform,
        sdkVersion: inventory.sdkVersion,
        mediation,
      },
    });
  }
  return { adAuthorizations, next: raw.next };
}
