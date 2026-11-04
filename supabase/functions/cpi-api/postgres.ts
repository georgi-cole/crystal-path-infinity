import pg from 'pg';
import { createEdgeSqlPool } from '../../../packages/server-core/src/supabase-database.ts';

/** Future approved composition uses a private TLS session connection, never PostgREST writes. */
export function connectDevelopmentDatabase(connectionString: string) {
  return createEdgeSqlPool(connectionString, (options) => new pg.Client(options));
}
