import type { SqlConnection, SqlPool } from './database.ts';
import { isObject, providerJson, sqlTransaction } from './private-services.ts';

export interface AccountDirectory {
  /** Called only after the server has checked an unexpired OTP. */
  verifiedEmail(this: void, email: string): Promise<string>;
  emailForSubject(this: void, subject: string): Promise<string>;
}
export interface ProviderSignupDirectory {
  lookup(
    connection: SqlConnection,
    email: string,
    marker: string,
  ): Promise<{ subject: string; matchesProvider: boolean } | null>;
  create(connection: SqlConnection, email: string, marker: string): Promise<string | null>;
}
export interface AccountMailer {
  send(
    this: void,
    message: { id: string; email: string; code: string; purpose: 'login' | 'export' | 'delete' },
  ): Promise<void>;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function createSupabaseAccountDirectory(options: {
  url: string;
  serviceKey: string;
  database: SqlPool;
  fetcher?: typeof fetch;
}): AccountDirectory & { providerSignup: ProviderSignupDirectory } {
  const url = new URL(options.url);
  if (
    url.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    options.serviceKey.length < 30
  )
    throw new Error('Invalid account directory');
  const headers = {
    apikey: options.serviceKey,
    authorization: 'Bearer ' + options.serviceKey,
    'content-type': 'application/json',
  };
  async function lookup(email: string) {
    return sqlTransaction(options.database, async (connection) => {
      const row = (
        await connection.query('select cpi_private.account_user_for_verified_email($1) as id', [
          email,
        ])
      ).rows[0];
      return typeof row?.id === 'string' && uuid.test(row.id) ? row.id : null;
    });
  }
  const providerSignup: ProviderSignupDirectory = {
    async lookup(connection, email, marker) {
      const { rows } = await connection.query(
        'select subject, matches_provider from cpi_private.account_provider_signup_owner($1,$2)',
        [email, marker],
      );
      const [row] = rows;
      if (!row) return null;
      if (rows.length !== 1 || typeof row.subject !== 'string' || !uuid.test(row.subject))
        throw new Error('Ambiguous account directory result');
      return { subject: row.subject, matchesProvider: row.matches_provider === true };
    },
    async create(connection, email, marker) {
      const existing = await providerSignup.lookup(connection, email, marker);
      if (existing) return existing.matchesProvider ? existing.subject : null;
      try {
        await providerJson(
          url.origin + '/auth/v1/admin/users',
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              email,
              email_confirm: true,
              app_metadata: { cpi_provider_signup: marker },
            }),
          },
          options.fetcher,
        );
      } catch {
        // A lost response or concurrent email signup is resolved by the protected lookup.
      }
      const resolved = await providerSignup.lookup(connection, email, marker);
      if (resolved) return resolved.matchesProvider ? resolved.subject : null;
      throw new Error('Account directory unavailable');
    },
  };
  return {
    providerSignup,
    async verifiedEmail(email) {
      const existing = await lookup(email);
      if (existing) return existing;
      try {
        const created = await providerJson(
          url.origin + '/auth/v1/admin/users',
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, email_confirm: true }),
          },
          options.fetcher,
        );
        if (isObject(created) && typeof created.id === 'string' && uuid.test(created.id))
          return created.id;
      } catch {
        // The same verified address may have been created by a concurrent exchange.
        const concurrent = await lookup(email);
        if (concurrent) return concurrent;
      }
      throw new Error('Account directory unavailable');
    },
    async emailForSubject(subject) {
      if (!uuid.test(subject)) throw new Error('Invalid subject');
      const value = await providerJson(
        url.origin + '/auth/v1/admin/users/' + subject,
        { headers },
        options.fetcher,
      );
      if (
        !isObject(value) ||
        value.id !== subject ||
        !value.email_confirmed_at ||
        typeof value.email !== 'string'
      )
        throw new Error('Account unavailable');
      return value.email;
    },
  };
}

/** Outgoing mail is separate from support@kolequant.com forwarding. No Supabase public OTP endpoint. */
export function createResendAccountMailer(options: {
  apiKey: string;
  from: string;
  fetcher?: typeof fetch;
}): AccountMailer {
  if (
    !/^re_[A-Za-z0-9_-]{16,}$/.test(options.apiKey) ||
    !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(options.from)
  )
    throw new Error('Invalid mail configuration');
  return {
    async send(message) {
      const action = {
        login: 'sign in',
        export: 'export your data',
        delete: 'delete your account',
      }[message.purpose];
      const result = await providerJson(
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + options.apiKey,
            'content-type': 'application/json',
            'idempotency-key': 'cpi-otp/' + message.id,
          },
          body: JSON.stringify({
            from: 'Crystal Path <' + options.from + '>',
            to: [message.email],
            subject: 'Your Crystal Path code',
            text:
              'Your code to ' +
              action +
              ' is ' +
              message.code +
              '. It expires in 10 minutes. Do not share it. If you did not request this, ignore this email.\n\nCrystal Path: Infinity · Kolequant',
          }),
        },
        options.fetcher,
      );
      if (!isObject(result) || typeof result.id !== 'string') throw new Error('Mail unavailable');
    },
  };
}
