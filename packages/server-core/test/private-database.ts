import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import type { SqlPool } from '../src/database.ts';
/** Embedded SQL correctness fixture; serialization here is NOT evidence of independent PostgreSQL concurrency. */
export async function privateDatabase() {
  const db = await PGlite.create();
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);`);
  const path = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(path)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(new URL(name, path), 'utf8'));
  let tail = Promise.resolve();
  const pool: SqlPool = {
    async connect() {
      const prior = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prior;
      return {
        query: (text, values) => db.query<Record<string, unknown>>(text, values ? [...values] : []),
        release,
      };
    },
  };
  return { db, pool };
}
