import type { ProtectedRefreshTokenStore } from './secure-session';
import { validateRefreshToken } from './secure-session';

/**
 * Only a trusted, server-side OTP/consent flow may issue the one-time exchange ticket.
 * This client is not an authorization authority, and it never uploads practice scores.
 */
export interface SessionTransport {
  exchange(ticket: string): Promise<unknown>;
  refresh(refreshToken: string): Promise<unknown>;
  revoke(refreshToken: string): Promise<unknown>;
}

export interface ActiveAccountSession {
  readonly status: 'active';
  readonly subject: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export type SessionPhase =
  | 'guest'
  | 'restoring'
  | 'connecting'
  | 'active'
  | 'refreshing'
  | 'recovery_required'
  | 'signing_out'
  | 'revocation_unconfirmed'
  | 'blocked';

export interface PublicSessionSnapshot {
  readonly phase: SessionPhase;
  readonly canUseAccount: boolean;
  readonly expiresAt: number | null;
}

export interface AccountRequestLease {
  readonly accessToken: string;
  readonly signal: AbortSignal;
}

/** The configured gateway definitively rejected the saved refresh token. */
export class RefreshCredentialRejected extends Error {}

export class SessionNotAvailable extends Error {
  constructor() {
    super('Account session unavailable. Local practice is still available.');
    this.name = 'SessionNotAvailable';
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

const subjectPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ticketPattern = /^[A-Za-z0-9._~-]{24,1024}$/;
const accessPattern = /^[\x21-\x7e]{16,8192}$/;

/** A parsed network result has exactly the session fields we intend to retain. */
export function parseAccountSession(value: unknown, now: number): ActiveAccountSession | null {
  if (!isRecord(value) || value.status !== 'active') return null;
  if (typeof value.subject !== 'string' || !subjectPattern.test(value.subject)) return null;
  if (typeof value.accessToken !== 'string' || !accessPattern.test(value.accessToken)) return null;
  try {
    validateRefreshToken(value.refreshToken);
  } catch {
    return null;
  }
  if (
    typeof value.expiresAt !== 'number' ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= now + 15_000 ||
    value.expiresAt > now + 24 * 60 * 60_000
  ) {
    return null;
  }
  return {
    status: 'active',
    subject: value.subject,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
  };
}

/**
 * No automatic startup, persistent access token, email, DOB, account alias or
 * user-generated ranked score. Each caller must inject an approved backend.
 */
export class AccountSessionOwner {
  private phase: SessionPhase = 'guest';
  private revision = 0;
  private current: ActiveAccountSession | null = null;
  private vaultTail: Promise<void> = Promise.resolve();
  private inFlight = new Set<AbortController>();
  private renewal: Promise<boolean> | null = null;
  private signingOut: Promise<boolean> | null = null;
  private failedRevocation: string | null = null;
  private accountEpoch: object = Object.freeze({});
  private readonly accountObservers = new Set<() => void>();

  constructor(
    private readonly vault: ProtectedRefreshTokenStore,
    private readonly transport: SessionTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  snapshot(): PublicSessionSnapshot {
    return {
      phase: this.phase,
      canUseAccount:
        this.phase === 'active' &&
        this.current !== null &&
        this.current.expiresAt > this.now() + 5_000,
      expiresAt: this.phase === 'active' ? (this.current?.expiresAt ?? null) : null,
    };
  }

  /** Opaque local identity generation; never a subject, token or request field. */
  accountScope(): object | null {
    return (this.phase === 'active' || this.phase === 'refreshing') &&
      this.current &&
      this.current.expiresAt > this.now() + 5_000
      ? this.accountEpoch
      : null;
  }

  subscribeAccountScope(observer: () => void): () => void {
    this.accountObservers.add(observer);
    return () => this.accountObservers.delete(observer);
  }

  private notifyAccountScope(): void {
    for (const observer of this.accountObservers) {
      try {
        observer();
      } catch {
        /* A view observer cannot block session invalidation. */
      }
    }
  }

  private settlePhase(generation: number, phase: SessionPhase): void {
    if (generation !== this.revision) return;
    this.phase = phase;
    this.notifyAccountScope();
  }

  private invalidate(phase: SessionPhase): number {
    this.revision++;
    this.phase = phase;
    this.current = null;
    this.accountEpoch = Object.freeze({});
    for (const controller of this.inFlight) controller.abort();
    this.inFlight.clear();
    this.notifyAccountScope();
    return this.revision;
  }

  private vaultOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.vaultTail.then(operation);
    this.vaultTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async revokeQuietly(refreshToken: string): Promise<void> {
    try {
      await this.transport.revoke(refreshToken);
    } catch {
      // A stale token never becomes a live local session after an interrupted request.
    }
  }

  private async failClosedStorage(generation: number, token?: string): Promise<void> {
    if (generation !== this.revision) return;
    const cleanupGeneration = this.invalidate('blocked');
    try {
      await this.vaultOperation(() => this.vault.clear());
      this.settlePhase(cleanupGeneration, 'guest');
    } catch {
      // Persistent storage may still hold a token: never claim signed out.
    }
    if (token) await this.revokeQuietly(token);
  }

  private async accept(
    response: unknown,
    generation: number,
    expectedSubject?: string,
    previousRefreshToken?: string,
  ): Promise<boolean> {
    const parsed = parseAccountSession(response, this.now());
    if (generation !== this.revision) {
      if (parsed) await this.revokeQuietly(parsed.refreshToken);
      return false;
    }
    if (
      !parsed ||
      (expectedSubject !== undefined && parsed.subject !== expectedSubject) ||
      (previousRefreshToken !== undefined && parsed.refreshToken === previousRefreshToken)
    ) {
      await this.failClosedStorage(generation, parsed?.refreshToken);
      return false;
    }
    try {
      await this.vaultOperation(() => this.vault.write(parsed.refreshToken));
    } catch {
      await this.failClosedStorage(generation, parsed.refreshToken);
      return false;
    }
    if (generation !== this.revision) {
      await this.revokeQuietly(parsed.refreshToken);
      return false;
    }
    this.current = parsed;
    this.phase = 'active';
    this.notifyAccountScope();
    return true;
  }

  /** Called only when the trusted backend has issued a single-use verified ticket. */
  async exchangeVerifiedTicket(ticket: string): Promise<boolean> {
    if (!this.vault.supported || this.phase !== 'guest' || !ticketPattern.test(ticket)) {
      return false;
    }
    const generation = this.invalidate('connecting');
    try {
      return await this.accept(await this.transport.exchange(ticket), generation);
    } catch {
      this.settlePhase(generation, 'guest');
      return false;
    }
  }

  /** Called independently of the offline practice bootstrap. */
  async restore(): Promise<boolean> {
    if (!this.vault.supported || (this.phase !== 'guest' && this.phase !== 'recovery_required')) {
      return false;
    }
    const generation = this.invalidate('restoring');
    try {
      const stored = await this.vaultOperation(() => this.vault.read());
      if (generation !== this.revision) return false;
      if (!stored) {
        this.settlePhase(generation, 'guest');
        return false;
      }
      return await this.accept(await this.transport.refresh(stored), generation, undefined, stored);
    } catch (error) {
      if (error instanceof RefreshCredentialRejected) await this.failClosedStorage(generation);
      else this.settlePhase(generation, 'recovery_required');
      return false;
    }
  }

  /**
   * Reuse one in-flight rotation. A subject change is never a valid refresh.
   * If the server rotates the token but the vault cannot commit it, deny access.
   */
  refresh(): Promise<boolean> {
    if (this.renewal) return this.renewal;
    if (!this.vault.supported || this.phase !== 'active' || !this.current) {
      return Promise.resolve(false);
    }
    const existing = this.current;
    const generation = this.revision;
    this.phase = 'refreshing';
    this.notifyAccountScope();
    const work = (async () => {
      try {
        return await this.accept(
          await this.transport.refresh(existing.refreshToken),
          generation,
          existing.subject,
          existing.refreshToken,
        );
      } catch (error) {
        if (error instanceof RefreshCredentialRejected) await this.failClosedStorage(generation);
        else if (generation === this.revision) this.invalidate('recovery_required');
        return false;
      }
    })();
    this.renewal = work;
    void work.then(
      () => {
        if (this.renewal === work) this.renewal = null;
      },
      () => {
        if (this.renewal === work) this.renewal = null;
      },
    );
    return work;
  }

  /**
   * The callback is an approved, identity-scoped account API call.
   * The AbortSignal and post-response epoch check block stale client results;
   * server authorization/revocation must ALSO protect in-flight mutations.
   */
  async withAccountRequest<T>(operation: (lease: AccountRequestLease) => Promise<T>): Promise<T> {
    if (this.renewal) await this.renewal;
    if (this.phase === 'active' && this.current) {
      if (this.current.expiresAt - this.now() <= 60_000) await this.refresh();
    }
    if (this.phase !== 'active' || !this.current || this.current.expiresAt <= this.now() + 5_000) {
      throw new SessionNotAvailable();
    }
    const generation = this.revision;
    const subject = this.current.subject;
    const controller = new AbortController();
    this.inFlight.add(controller);
    try {
      const result = await operation({
        accessToken: this.current.accessToken,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        generation !== this.revision ||
        this.current?.subject !== subject ||
        this.phase !== 'active'
      ) {
        throw new SessionNotAvailable();
      }
      return result;
    } catch {
      throw new SessionNotAvailable();
    } finally {
      this.inFlight.delete(controller);
    }
  }

  /**
   * Fence account requests synchronously, then clear the protected credential.
   * A failed server revoke is explicitly reported, not treated as a full logout.
   */
  signOut(): Promise<boolean> {
    if (this.signingOut) return this.signingOut;
    if (this.phase === 'revocation_unconfirmed') return Promise.resolve(false);
    const previous = this.current?.refreshToken ?? null;
    const generation = this.invalidate('signing_out');
    const work = (async () => {
      let token: string | null = previous;
      try {
        const saved = await this.vaultOperation(() => this.vault.read());
        if (!token) token = saved;
        await this.vaultOperation(() => this.vault.clear());
      } catch {
        this.settlePhase(generation, 'blocked');
        return false;
      }
      if (generation !== this.revision) return false;
      if (token) {
        try {
          const result: unknown = await this.transport.revoke(token);
          if (!isRecord(result) || result.status !== 'revoked') throw new Error();
        } catch {
          if (generation === this.revision) {
            this.failedRevocation = token;
            this.settlePhase(generation, 'revocation_unconfirmed');
          }
          return false;
        }
      }
      if (generation !== this.revision) return false;
      this.failedRevocation = null;
      this.settlePhase(generation, 'guest');
      return true;
    })();
    this.signingOut = work;
    void work.then(
      () => {
        if (this.signingOut === work) this.signingOut = null;
      },
      () => {
        if (this.signingOut === work) this.signingOut = null;
      },
    );
    return work;
  }

  /** Retry a failed remote revoke while the app process still holds the token. */
  async retryRevocation(): Promise<boolean> {
    if (this.phase !== 'revocation_unconfirmed' || !this.failedRevocation) return false;
    const generation = this.revision;
    try {
      const response: unknown = await this.transport.revoke(this.failedRevocation);
      if (generation !== this.revision || !isRecord(response) || response.status !== 'revoked') {
        return false;
      }
      this.failedRevocation = null;
      this.settlePhase(generation, 'guest');
      return true;
    } catch {
      return false;
    }
  }

  /** Dispose memory/cancel in-flight requests, but do not silently revoke on app close. */
  dispose(): void {
    this.invalidate('guest');
    this.failedRevocation = null;
  }
}
