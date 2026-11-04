import type { SqlConnection, SqlPool } from './database.ts';
import { DEVELOPMENT_PROJECT } from './supabase-edge.ts';

export interface EdgeDatabaseClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
export interface EdgeDatabaseOptions {
  readonly connectionString: string;
  readonly ssl: { readonly rejectUnauthorized: true };
  readonly connectionTimeoutMillis: number;
  readonly query_timeout: number;
  readonly statement_timeout: number;
}

/** Dedicated clients avoid leaking SET ROLE/session state through an isolate's pool. */
export function createEdgeSqlPool(
  connectionString: string,
  makeClient: (options: EdgeDatabaseOptions) => EdgeDatabaseClient,
): SqlPool {
  const url = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search ||
    url.hash ||
    !url.password ||
    url.pathname !== '/postgres' ||
    url.port !== '5432' ||
    !(
      (url.hostname === `db.${DEVELOPMENT_PROJECT}.supabase.co` && url.username === 'postgres') ||
      (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
        url.username === `postgres.${DEVELOPMENT_PROJECT}`)
    )
  )
    throw new Error('Invalid development database target');
  const options: EdgeDatabaseOptions = {
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    statement_timeout: 12000,
  };
  let open = 0;
  return {
    async connect(): Promise<SqlConnection> {
      if (open >= 4) throw new Error('Database busy');
      open += 1;
      let client: EdgeDatabaseClient | undefined;
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        try {
          await client?.end();
        } catch {
          /* Never expose credentials from driver errors. */
        } finally {
          open -= 1;
        }
      };
      try {
        client = makeClient(options);
        await client.connect();
        await client.query('set role service_role');
        const result = await client.query('select current_user as role');
        if (result.rows[0]?.role !== 'service_role') throw new Error('Role unavailable');
        const connected = client;
        return {
          async query(text, values) {
            if (closed) throw new Error('Connection closed');
            return connected.query(text, values ? [...values] : undefined);
          },
          release() {
            void close();
          },
        };
      } catch {
        await close();
        throw new Error('Database unavailable');
      }
    },
  };
}
