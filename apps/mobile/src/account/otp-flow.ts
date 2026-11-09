/**
 * A privacy-first, deliberately untrusted account-intake client.
 * Eligibility is issued by a separately reviewed server, never inferred
 * from a user's optional analytics answer, locale, or a client-only checkbox.
 */
export interface EligibilityPermit {
  status: 'eligible';
  permit: string;
  policyVersion: string;
  expiresAt: number;
}
export type EligibilityDecision = EligibilityPermit | { status: 'parental_review' | 'unavailable' };

export interface AccountAgeScreen {
  readonly age: number;
  readonly country: string;
}
export interface OtpGateway {
  eligibility(screen?: AccountAgeScreen): Promise<unknown>;
  requestCode(email: string, permit: string): Promise<unknown>;
  verifyCode(email: string, code: string, permit: string): Promise<unknown>;
}

export type AccountFlowStep =
  | 'guest'
  | 'checking'
  | 'parental_review'
  | 'unavailable'
  | 'eligible'
  | 'sending'
  | 'code'
  | 'verifying'
  | 'verified_pending_session'
  | 'offline';

export type AccountFlowProblem =
  'invalid_email' | 'invalid_code' | 'expired' | 'rate_limited' | 'retry' | 'cooldown' | null;

export interface AccountFlowSnapshot {
  step: AccountFlowStep;
  problem: AccountFlowProblem;
  resendAt: number | null;
  codeExpiresAt: number | null;
}

export class AccountGatewayError extends Error {
  constructor(readonly kind: 'rate_limited' | 'expired' | 'invalid_code' | 'unavailable') {
    super('Account service is not available for this operation.');
    this.name = 'AccountGatewayError';
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

const MAX_PERMIT_LIFETIME_MS = 15 * 60_000;
const PERMIT_CLOCK_SKEW_MS = 30_000;

/** Unknown responses fail closed, even if an API inadvertently sends extra fields. */
export function validateEligibility(input: unknown, now: number): EligibilityDecision {
  if (!isRecord(input)) return { status: 'unavailable' };
  if (input.status === 'parental_review') return { status: 'parental_review' };
  if (input.status !== 'eligible') return { status: 'unavailable' };
  if (
    typeof input.permit !== 'string' ||
    !/^[A-Za-z0-9._~-]{24,1024}$/.test(input.permit) ||
    typeof input.policyVersion !== 'string' ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(input.policyVersion) ||
    typeof input.expiresAt !== 'number' ||
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= now ||
    // The server enforces the permit expiry using its own clock.
    input.expiresAt > now + MAX_PERMIT_LIFETIME_MS + PERMIT_CLOCK_SKEW_MS
  ) {
    return { status: 'unavailable' };
  }
  return {
    status: 'eligible',
    permit: input.permit,
    policyVersion: input.policyVersion,
    expiresAt: input.expiresAt,
  };
}

/** UI validity is only a convenience. The trusted endpoint validates again. */
export function validAccountEmail(email: unknown): email is string {
  return (
    typeof email === 'string' &&
    email.length >= 3 &&
    email.length <= 254 &&
    email === email.trim() &&
    !Array.from(email).some((char) => char.charCodeAt(0) < 33 || char.charCodeAt(0) === 127) &&
    /^[^@]+@[^@]+\.[^@]+$/.test(email)
  );
}

function problemOf(error: unknown): AccountFlowProblem {
  if (error instanceof AccountGatewayError) {
    if (error.kind === 'rate_limited') return 'rate_limited';
    if (error.kind === 'invalid_code') return 'invalid_code';
    if (error.kind === 'expired') return 'expired';
  }
  return 'retry';
}

/**
 * No persistent data, no auth state, no ranked score promotion.
 * Cancellation invalidates late responses; it cannot unsend an already issued email.
 */
export class AccountOtpFlow {
  private verifiedTicket: string | null = null;
  private revision = 0;
  private permit: EligibilityPermit | null = null;
  private email: string | null = null;
  private cooldownUntil = 0;
  private otpExpiresAt = 0;
  private snapshotValue: AccountFlowSnapshot = {
    step: 'guest',
    problem: null,
    resendAt: null,
    codeExpiresAt: null,
  };

  constructor(
    private readonly gateway: OtpGateway,
    private readonly now: () => number = () => Date.now(),
  ) {}

  snapshot(): AccountFlowSnapshot {
    return { ...this.snapshotValue };
  }
  /** Hand a verified server ticket to the credential owner once, never to a rendered snapshot. */
  takeVerifiedTicket(): string | null {
    const ticket = this.verifiedTicket;
    this.verifiedTicket = null;
    return ticket;
  }

  private update(step: AccountFlowStep, problem: AccountFlowProblem = null): void {
    this.snapshotValue = {
      step,
      problem,
      resendAt: this.cooldownUntil || null,
      codeExpiresAt: this.otpExpiresAt || null,
    };
  }

  cancel(): void {
    this.verifiedTicket = null;
    this.revision++;
    this.permit = null;
    this.email = null;
    this.cooldownUntil = 0;
    this.otpExpiresAt = 0;
    this.update('guest');
  }

  offline(): void {
    this.cancel();
    this.update('offline');
  }

  async checkEligibility(online: boolean, screen?: AccountAgeScreen): Promise<void> {
    this.cancel();
    if (!online) {
      this.update('offline');
      return;
    }
    const current = this.revision;
    this.update('checking');
    try {
      const decision = validateEligibility(await this.gateway.eligibility(screen), this.now());
      if (current !== this.revision) return;
      if (decision.status === 'eligible') {
        this.permit = decision;
        this.update('eligible');
      } else {
        this.update(decision.status, decision.status === 'unavailable' ? 'retry' : null);
      }
    } catch {
      if (current === this.revision) this.update('unavailable', 'retry');
    }
  }

  async requestCode(email: string, online: boolean): Promise<void> {
    if (!online) {
      this.offline();
      return;
    }
    const previous = this.snapshotValue.step;
    if (previous !== 'eligible' && previous !== 'code') return;
    if (!this.permit || this.now() >= this.permit.expiresAt) {
      this.cancel();
      this.update('unavailable', 'expired');
      return;
    }
    if (!validAccountEmail(email)) {
      this.update(previous, 'invalid_email');
      return;
    }
    if (previous === 'code' && this.email !== email) {
      this.update('code', 'invalid_email');
      return;
    }
    if (this.now() < this.cooldownUntil) {
      this.update(previous, 'cooldown');
      return;
    }
    const current = this.revision;
    this.update('sending');
    try {
      const response: unknown = await this.gateway.requestCode(email, this.permit.permit);
      if (current !== this.revision) return;
      if (
        !isRecord(response) ||
        response.status !== 'accepted' ||
        typeof response.expiresAt !== 'number' ||
        !Number.isSafeInteger(response.expiresAt) ||
        response.expiresAt <= this.now() ||
        response.expiresAt > this.permit.expiresAt
      ) {
        this.update(previous, 'retry');
        return;
      }
      this.email = email;
      this.otpExpiresAt = response.expiresAt;
      this.cooldownUntil = this.now() + 60_000;
      this.update('code');
    } catch (error) {
      if (current === this.revision) this.update(previous, problemOf(error));
    }
  }

  async verifyCode(code: string, online: boolean): Promise<void> {
    if (!online) {
      this.offline();
      return;
    }
    if (this.snapshotValue.step !== 'code' || !this.email || !this.permit) return;
    if (this.now() >= this.otpExpiresAt || this.now() >= this.permit.expiresAt) {
      this.update('code', 'expired');
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      this.update('code', 'invalid_code');
      return;
    }
    const current = this.revision;
    this.update('verifying');
    try {
      const response: unknown = await this.gateway.verifyCode(this.email, code, this.permit.permit);
      if (current !== this.revision) return;
      if (isRecord(response) && response.status === 'verified') {
        this.verifiedTicket =
          typeof response.verifiedTicket === 'string' &&
          /^[A-Za-z0-9._~-]{24,1024}$/.test(response.verifiedTicket)
            ? response.verifiedTicket
            : null;
        // Not authenticated! Session issuance, secure rotation, revocation,
        // and ranked account attachment belong to the next CPI-018 slice.
        this.email = null;
        this.permit = null;
        this.update('verified_pending_session');
      } else {
        this.update('code', 'invalid_code');
      }
    } catch (error) {
      if (current === this.revision) this.update('code', problemOf(error));
    }
  }
}
