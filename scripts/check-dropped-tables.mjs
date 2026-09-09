#!/usr/bin/env node
/**
 * Live SQL against a table that was dropped on purpose.
 *
 * ── Why the other checks cannot see this ─────────────────────────────────
 *
 * `check-sql-columns.mjs` validates a column reference against
 * `db/schema.sql` plus every entry in `MIGRATIONS`. `MIGRATIONS` is
 * append-only — an entry is never edited or removed, because its name is the
 * key in `schema_migrations` — so the migrations that BUILT the extraction
 * engine's twenty-five tables are still in the array long after the tables
 * were dropped. Their columns are therefore still "known", and a query
 * against `extraction_runs.total_items` passes the column checker while
 * throwing `no such table` on every request.
 *
 * `tsc` cannot see it. `next build` cannot see it. It is a runtime error in
 * a route that is otherwise fine, which is how seven files kept querying
 * dropped tables for a day — including `/api/v2/admin/reprocess-vlogs`, the
 * endpoint behind the button that transcribes four hundred recordings.
 *
 * `src/lib/dropped-tables.ts` is the one list. This reads it and fails on
 * any `FROM` / `JOIN` / `INTO` / `UPDATE` / `TABLE` naming one of them in
 * `src/` or `workers/`.
 *
 * ⚠️ `src/lib/migration-runner.ts` is exempt and must stay so: its whole
 * job is to hold the statements that built those tables, and
 * `isDroppedTableError()` is what stops them being retried forever.
 *
 * Run: node scripts/check-dropped-tables.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const list = readFileSync('src/lib/dropped-tables.ts', 'utf8')
const body = /DROPPED_TABLES[^=]*=\s*\[([\s\S]*?)\]/.exec(list)?.[1] ?? ''
const DROPPED = [...new Set([...body.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]))]
if (!DROPPED.length) {
  console.error('Could not read DROPPED_TABLES from src/lib/dropped-tables.ts')
  process.exit(1)
}

/** The two files whose job IS to name a dropped table. */
const EXEMPT = new Set([
  // Append-only by design: it holds the CREATE statements that made them.
  'src/lib/migration-runner.ts',
  // The list itself.
  'src/lib/dropped-tables.ts',
  // Drops them from a live database — `POST /api/v2/admin/reset-to-recordings`.
  'src/app/api/v2/admin/reset-to-recordings/route.ts',
])

function walk(dir) {
  const out = []
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    if (name === 'node_modules' || name === '.next') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx|mjs|sql)$/.test(name)) out.push(p)
  }
  return out
}

/**
 * ⚠️ `db/` is scanned too, and it is the half that bites hardest. The
 * bootstrap workflow applies `db/schema.sql` and `db/migrations.sql` on
 * EVERY push to main, so a CREATE for a dropped table there does not merely
 * throw — it brings the table BACK, empty, one deploy after the reset route
 * dropped it. That reasoning was already recorded for schema.sql and
 * `db/migrations.sql` was missed: it re-created `chat_threads`,
 * `chat_messages` and `chat_attachments` every time.
 */
const files = [...walk('src'), ...walk('workers'), ...walk('db')].filter(f => !EXEMPT.has(f))

// A dropped table named in prose is a record of a decision; only SQL breaks.
const clauses = /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)/gi

let bad = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const seen = new Set()
  for (const m of code.matchAll(clauses)) {
    const t = m[2].toLowerCase()
    if (!DROPPED.includes(t) || seen.has(t)) continue
    seen.add(t)
    // A CREATE in db/ does not throw — it is worse than that. The bootstrap
    // applies those files on every push to main, so it brings the table
    // BACK, empty, one deploy after the reset route dropped it.
    const why = f.startsWith('db/') && m[1].toUpperCase() === 'TABLE'
      ? 'dropped on 8 Sep, and the bootstrap re-applies this file on every push — this brings it back, empty'
      : 'dropped on 8 Sep; this throws "no such table"'
    console.error(`  ${f}\n      ${m[1].toUpperCase()} ${t} — ${why}`)
    bad++
  }
}

// ── Columns on a surviving table holding a deleted engine's output ──────
//
// A dropped table announces itself; these do not. `vlogs.title` and
// `vlogs.summary` were written by the extraction engine's last pass, nothing
// has written either since 8 Sep, and they were still the largest text on
// /vlog/[id] and the line under a recording on the home feed. Rendering
// perfectly, marked as the log's, and still a deleted model's prose about
// his life.
//
// ⚠️ The alias is resolved from the query, never assumed. `p.summary` is a
// page's paragraph, `d.title` is a document's, `v.summary` on
// `month_summaries` is the month's — all legitimate, and a check that
// flagged them would be a check nobody reads. So: find what `vlogs` is
// called in each SQL string, and flag only that alias.
const colBody = /MODEL_WRITTEN_COLUMNS[^=]*=\s*\[([\s\S]*?)\]/.exec(list)?.[1] ?? ''
const COLUMNS = [...new Set([...colBody.matchAll(/'([a-z0-9_.]+)'/g)].map(m => m[1]))]
/** Words that follow a table name without being an alias. */
const SQL_KEYWORDS = new Set([
  'where', 'set', 'on', 'order', 'group', 'limit', 'left', 'right', 'inner',
  'outer', 'cross', 'join', 'union', 'having', 'values', 'using', 'as',
])

const byTable = new Map()
for (const q of COLUMNS) {
  const [t, c] = q.split('.')
  if (!byTable.has(t)) byTable.set(t, [])
  byTable.get(t).push(c)
}

for (const f of files) {
  if (f.startsWith('db/')) continue   // the column still exists; it is reads that are banned
  const src = readFileSync(f, 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const seen = new Set()
  for (const sql of code.matchAll(/`([^`]*\b(?:SELECT|UPDATE)\b[^`]*)`/gis)) {
    const q = sql[1]
    for (const [table, cols] of byTable) {
      // `FROM vlogs v`, `JOIN vlogs v`, `UPDATE vlogs v` — and the bare
      // table name when the query uses no alias at all.
      const aliases = [...q.matchAll(new RegExp(`\\b(?:FROM|JOIN|UPDATE)\\s+${table}\\s+(?:AS\\s+)?([a-z][a-z0-9_]*)`, 'gi'))]
        .map(m => m[1])
        .filter(a => !SQL_KEYWORDS.has(a.toLowerCase()))
      // No alias means the query names its columns bare. ⚠️ This used to be
      // a negative lookahead for a following lowercase letter, and the `i`
      // flag made `[a-z]` match `WHERE` — so every un-aliased query read as
      // aliased and the whole check silently passed.
      const bare = aliases.length === 0
        && new RegExp(`\\b(?:FROM|JOIN|UPDATE)\\s+${table}\\b`, 'i').test(q)
      for (const c of cols) {
        const hit =
          aliases.some(a => new RegExp(`\\b${a}\\.${c}\\b`).test(q))
          || (bare && new RegExp(`(?:SELECT|,)\\s*${c}\\s*(?:,|\\s+FROM|\\s*$)`, 'i').test(q))
        if (hit && !seen.has(`${table}.${c}`)) {
          seen.add(`${table}.${c}`)
          console.error(`  ${f}\n      ${table}.${c} — the extraction engine wrote it; nothing has since 8 Sep`)
          bad++
        }
      }
    }
  }
}

console.log(`\n${files.length} files checked against ${DROPPED.length} dropped tables`
  + ` and ${COLUMNS.length} columns the deleted engine wrote.`)
if (bad) {
  console.error(`\n${bad} live reference${bad === 1 ? '' : 's'} to something the 8 Sep deletion removed.`)
  console.error('A dropped table coming back means a generator came back with it, and so')
  console.error('does a column it wrote. The fix is to stop reading it — never to re-create')
  console.error('the table, and never to start writing the column again.')
  process.exit(1)
}
console.log('No live SQL names a dropped table.')
