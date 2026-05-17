/**
 * D1 (Cloudflare SQLite) client + thin query helpers.
 *
 * Replaces the previous Supabase client. Every query that touches operator
 * data MUST filter by operator_id in application code — D1 has no RLS.
 *
 * Usage (from a Route Handler / API route running on the Workers runtime):
 *
 *   import { getDb, findOne, findMany, run } from '@/lib/d1'
 *   import { getRequestContext } from '@cloudflare/next-on-pages'
 *
 *   const db = getDb(getRequestContext().env)
 *   const vlog = await findOne<Vlog>(
 *     db,
 *     'SELECT * FROM vlogs WHERE id = ? AND operator_id = ?',
 *     vlogId, operatorId,
 *   )
 *
 * For complex queries write the SQL directly; D1 supports the common SQLite
 * dialect including JSON functions, recursive CTEs, and full-text search via
 * the fts5 extension.
 *
 * IMPORTANT: never compose SQL by string concatenation with untrusted input —
 * always use `?` parameter binding. D1 prepared statements escape correctly.
 */

import type { D1Database, D1Result } from '@cloudflare/workers-types'

export type DbEnv = { DB: D1Database }

export function getDb(env: { DB: D1Database }): D1Database {
  if (!env.DB) {
    throw new Error(
      'D1 binding "DB" is not present on env. Make sure the route is running ' +
      'on the Workers runtime (export const runtime = "edge") and that ' +
      'wrangler.toml declares the d1_databases binding.'
    )
  }
  // Fire-and-forget: ensure schema is up to date on first call per isolate.
  // The promise is memoized inside ensureMigrationsOnce so additional calls
  // within the same isolate are free. Awaiting would add latency to every
  // first request after deploy; we trust the runner to surface failures via
  // logs + the health endpoint.
  //
  // Lazy import to avoid a cycle if any callee of getDb is itself imported by
  // migration-runner. (None today, but cheap insurance.)
  void import('./migration-runner').then(m => m.ensureMigrationsOnce(env.DB))
  return env.DB
}

/**
 * Run a SELECT that returns at most one row.
 * Returns null when no row matches.
 */
export async function findOne<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<T | null> {
  return db.prepare(sql).bind(...binds).first<T>()
}

/**
 * Run a SELECT that returns many rows. Returns [] when no rows match.
 */
export async function findMany<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...binds).all<T>()
  return result.results || []
}

/**
 * Run an INSERT / UPDATE / DELETE. Returns the D1 result metadata
 * (last_row_id, changes, success, etc.).
 */
export async function run(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<D1Result> {
  return db.prepare(sql).bind(...binds).run()
}

/**
 * Run multiple statements in a single network call (still individual
 * transactions — D1 doesn't expose multi-statement transactions yet).
 * Use this for fan-out writes that are independently retryable.
 */
export async function batch(
  db: D1Database,
  statements: { sql: string; binds?: unknown[] }[]
): Promise<D1Result[]> {
  return db.batch(
    statements.map(s => db.prepare(s.sql).bind(...(s.binds ?? [])))
  )
}

/**
 * Convenience: convert a row's TEXT columns containing JSON into parsed
 * objects. Useful for columns declared in schema.sql as JSON-shaped TEXT
 * (e.g. threads.key_quotes, vlogs.engagement, broll_assets.auto_tags).
 *
 * Usage: const thread = parseJsonColumns(rawRow, ['key_quotes','questions_raised'])
 */
export function parseJsonColumns<T extends Record<string, unknown>>(
  row: T | null,
  columns: (keyof T)[]
): T | null {
  if (!row) return null
  const out: Record<string, unknown> = { ...row }
  for (const col of columns) {
    const v = out[col as string]
    if (typeof v === 'string' && v.length > 0) {
      try { out[col as string] = JSON.parse(v) } catch { /* leave as string */ }
    }
  }
  return out as T
}

/**
 * Stringify object/array values for write paths. Mirror of parseJsonColumns.
 * Returns a fresh object with the named columns JSON-encoded.
 */
export function stringifyJsonColumns<T extends Record<string, unknown>>(
  values: T,
  columns: (keyof T)[]
): T {
  const out: Record<string, unknown> = { ...values }
  for (const col of columns) {
    const v = out[col as string]
    if (v != null && typeof v !== 'string') {
      out[col as string] = JSON.stringify(v)
    }
  }
  return out as T
}
