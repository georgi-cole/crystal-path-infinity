/** The approved host owns fresh OTP reauthentication and durable receipt recovery. */
export interface AccountControlsClient {
  /** Gather every bounded page with fresh reauth subproofs; all next cursors must be null. */
  exportData(): Promise<unknown>;
  deleteAccount(): Promise<'deleted' | 'revocation_pending'>;
}
type Phase = 'idle' | 'exporting' | 'deleting' | 'pending' | 'deleted' | 'error';
interface ControlsSnapshot {
  readonly phase: Phase;
  readonly exportJson: string | null;
  readonly error: 'export' | 'delete' | 'copy' | null;
  readonly copied: boolean;
}
export const EMPTY_ACCOUNT_CONTROLS: ControlsSnapshot = {
  phase: 'idle',
  exportJson: null,
  error: null,
  copied: false,
};
const empty = EMPTY_ACCOUNT_CONTROLS;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: unknown, keys: readonly string[]) {
  if (!record(value)) throw new Error('Invalid account export');
  const output: Record<string, string | number | boolean | null> = {};
  for (const key of keys) {
    const field = value[key];
    if (field === undefined) continue;
    if (
      field !== null &&
      typeof field !== 'boolean' &&
      !(typeof field === 'number' && Number.isFinite(field)) &&
      !(typeof field === 'string' && field.length <= 2048)
    )
      throw new Error('Invalid account export');
    output[key] = field;
  }
  return output;
}

/** Reconstruct safe self-service fields; never display arbitrary provider extras. */
export function formatAccountExport(value: unknown): string {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.exportedAt !== 'string')
    throw new Error('Invalid account export');
  const next = value.next;
  if (
    !record(next) ||
    ['consent', 'parental', 'run', 'result', 'report', 'reward', 'adAuthorization'].some(
      (key) => next[key] !== null,
    ) ||
    Object.values(next).some((cursor) => cursor !== null)
  )
    throw new Error('Account export has additional pages');
  const list = (key: string, keys: readonly string[]) => {
    const items = value[key];
    if (!Array.isArray(items) || items.length > 10_000) throw new Error('Invalid account export');
    return items.map((item) => fields(item, keys));
  };
  const rewardRows = value.rewards;
  const authorizationRows = value.adAuthorizations;
  if (
    !Array.isArray(rewardRows) ||
    rewardRows.length > 10_000 ||
    !Array.isArray(authorizationRows) ||
    authorizationRows.length > 10_000
  )
    throw new Error('Invalid account export');
  const rewards = rewardRows.map((item: unknown) => {
    if (!record(item)) throw new Error('Invalid account export');
    return {
      ...fields(item, [
        'id',
        'runId',
        'deathId',
        'rulesetVersion',
        'state',
        'ordinal',
        'restoreSp',
        'createdAt',
        'expiresAt',
        'resolvedAt',
        'providerEarnedAt',
      ]),
      grant:
        item.grant === null ? null : fields(item.grant, ['id', 'state', 'grantedAt', 'appliedAt']),
    };
  });
  const adAuthorizations = authorizationRows.map((item: unknown) => {
    if (
      !record(item) ||
      !record(item.inventory) ||
      !Array.isArray(item.inventory.mediation) ||
      item.inventory.mediation.length > 20
    )
      throw new Error('Invalid account export');
    return {
      ...fields(item, [
        'id',
        'policyVersion',
        'context',
        'prerequisitesSatisfied',
        'issuedAt',
        'validUntil',
        'revokedAt',
      ]),
      flags: fields(item.flags, [
        'childDirected',
        'underAgeOfConsent',
        'maxAdContentRating',
        'nonPersonalized',
      ]),
      inventory: {
        ...fields(item.inventory, ['provider', 'platform', 'sdkVersion']),
        mediation: item.inventory.mediation.map((adapter: unknown) =>
          fields(adapter, ['identifier', 'version']),
        ),
      },
    };
  });
  const output = {
    schemaVersion: 1,
    exportedAt: value.exportedAt,
    profile:
      value.profile === null
        ? null
        : fields(value.profile, ['publicId', 'username', 'countryCode', 'createdAt', 'updatedAt']),
    privateProfile:
      value.privateProfile === null
        ? null
        : fields(value.privateProfile, [
            'analyticsAgeBand',
            'ageResponseAt',
            'privacyContext',
            'contextUpdatedAt',
          ]),
    consents: list('consents', [
      'id',
      'purpose',
      'decision',
      'policyVersion',
      'jurisdiction',
      'recordedAt',
    ]),
    parentalAuthorizations: list('parentalAuthorizations', [
      'id',
      'purpose',
      'state',
      'verifiedAt',
      'revokedAt',
      'createdAt',
    ]),
    runs: list('runs', [
      'runId',
      'rulesetVersion',
      'status',
      'sp',
      'hints',
      'lastClearedRow',
      'currentRow',
      'revivesGranted',
      'revivesApplied',
      'revivesToReachScore',
      'activeTimeMs',
      'countryCode',
      'continentCode',
      'mappingVersion',
      'createdAt',
      'updatedAt',
      'finalizedAt',
    ]),
    results: list('results', [
      'runId',
      'rulesetVersion',
      'lastClearedRow',
      'revivesToReachScore',
      'achievedAt',
      'countryCode',
      'continentCode',
      'mappingVersion',
      'finalizedAt',
      'publishedAt',
    ]),
    ...(value.reports === undefined
      ? {}
      : { reports: list('reports', ['id', 'targetPublicId', 'reason', 'pending', 'createdAt']) }),
    rewards,
    adAuthorizations,
    next: fields(value.next, [
      'consent',
      'parental',
      'run',
      'result',
      'report',
      'reward',
      'adAuthorization',
    ]),
  };
  const text = JSON.stringify(output, null, 2);
  if (text.length > 2_000_000) throw new Error('Account export is too large to display');
  return text;
}

/** Independently testable ownership: a late A response cannot become B's data. */
export class AccountControlsOwner {
  private client: AccountControlsClient | null;
  private scope: object | null;
  private epoch: object = {};
  private value: ControlsSnapshot = empty;
  private readonly listeners = new Set<() => void>();
  constructor(client: AccountControlsClient | null, scope: object | null = client) {
    this.client = client;
    this.scope = scope;
  }
  matches(client: AccountControlsClient | null, scope: object | null) {
    return this.client === client && this.scope === scope;
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(value: ControlsSnapshot) {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
  replace(client: AccountControlsClient | null, scope: object | null = client) {
    this.clear();
    this.client = client;
    this.scope = scope;
  }
  clear() {
    this.epoch = {};
    this.update({ ...empty });
  }
  async exportData() {
    if (
      !this.client ||
      !this.scope ||
      ['exporting', 'deleting', 'pending', 'deleted'].includes(this.value.phase)
    )
      return;
    const epoch = {};
    this.epoch = epoch;
    this.update({ ...empty, phase: 'exporting' });
    try {
      const result = await this.client.exportData();
      if (this.epoch !== epoch) return;
      this.update({ ...empty, exportJson: formatAccountExport(result) });
    } catch {
      if (this.epoch === epoch) this.update({ ...empty, phase: 'error', error: 'export' });
    }
  }
  async deleteAccount() {
    if (
      !this.client ||
      !this.scope ||
      ['exporting', 'deleting', 'deleted'].includes(this.value.phase)
    )
      return;
    const wasPending = this.value.phase === 'pending';
    const epoch = {};
    this.epoch = epoch;
    this.update({ ...empty, phase: 'deleting' });
    try {
      const result = await this.client.deleteAccount();
      if (this.epoch !== epoch) return;
      if (result !== 'deleted' && result !== 'revocation_pending')
        throw new Error('Invalid deletion');
      this.update({ ...empty, phase: result === 'deleted' ? 'deleted' : 'pending' });
    } catch {
      if (this.epoch === epoch)
        this.update({ ...empty, phase: wasPending ? 'pending' : 'error', error: 'delete' });
    }
  }
  async copyExport(write: (text: string) => Promise<void>) {
    const text = this.value.exportJson;
    if (!text) return;
    const epoch = this.epoch;
    try {
      await write(text);
      if (epoch === this.epoch) this.update({ ...this.value, copied: true, error: null });
    } catch {
      if (epoch === this.epoch) this.update({ ...this.value, error: 'copy', copied: false });
    }
  }
}
