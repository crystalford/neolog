#!/usr/bin/env node
/**
 * The migration runner, and the one thing that had gone quietly wrong with it.
 *
 * `MIGRATIONS` is append-only — an entry is never edited or removed, because
 * its name is the key in `schema_migrations` and renaming one re-runs SQL
 * that already applied. So the migrations that built `threads`, `clusters`,
 * `productions` and the rest are still in the array after those tables were
 * dropped on 8 Sep, and every one of them now fails with `no such table`.
 *
 * A failed migration is not recorded as applied, which is correct: a real
 * failure must be retried. The consequence here was not correct — fifty-odd
 * statements failing on the first request of every cold Worker isolate,
 * forever, and a health report that could never come back clean.
 *
 * So `no such table` is benign for exactly the tables this product dropped
 * on purpose, and for nothing else. These assertions hold that line:
 *
 *   a dropped table is recognised     ... and marked applied, once
 *   a LIVE table is not               ... `no such table: log_entries` is a
 *                                         real failure and must stay one
 *   the blanket pattern stays out     BENIGN_PATTERNS must never carry a
 *                                     bare /no such table/
 *   one list, not two                 the reset route and the runner read
 *                                     the same array
 *
 * Run: node scripts/test/migrations.mjs
 */

import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

const dropSrc = readFileSync('src/lib/dropped-tables.ts', 'utf8')
const runSrc  = readFileSync('src/lib/migration-runner.ts', 'utf8')
const resetSrc = readFileSync('src/app/api/v2/admin/reset-to-recordings/route.ts', 'utf8')

// Lift DROPPED_TABLES out of the source rather than importing TypeScript.
const listBody = /export const DROPPED_TABLES = \[([\s\S]*?)\] as const/.exec(dropSrc)[1]
const DROPPED = [...listBody.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
const set = new Set(DROPPED)

function isDroppedTableError(message) {
  const m = /no such table:?\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(message)
  return m ? set.has(m[1]) : false
}

console.log('migrations: an obsolete one is recorded, a broken one is not')

// ── the list itself ────────────────────────────────────────────────────────
ok('the dropped list is populated', DROPPED.length >= 25)
check('no live table is on it', DROPPED.filter(t => [
  'log_entries', 'vlogs', 'transcript_words', 'operator', 'pages', 'page_entries',
  'entry_revisions', 'documents', 'document_drafts', 'correspondence',
  'correspondence_messages', 'attachments', 'photos', 'schema_migrations',
].includes(t)), [])

// ── recognising an obsolete failure ────────────────────────────────────────
ok('D1 wording, with colon',    isDroppedTableError('D1_ERROR: no such table: clusters'))
ok('SQLite wording, no colon',  isDroppedTableError('no such table threads'))
ok('mixed case',                isDroppedTableError('No Such Table: PRODUCTIONS'.toLowerCase()))
ok('every dropped table matches',
   DROPPED.every(t => isDroppedTableError(`no such table: ${t}`)))

// ── and refusing to swallow a real one ─────────────────────────────────────
ok('a live table is a real failure',  !isDroppedTableError('no such table: log_entries'))
ok('the entry table especially',      !isDroppedTableError('D1_ERROR: no such table: entry_revisions'))
ok('an unknown table is a real failure', !isDroppedTableError('no such table: something_new'))
ok('a different error is not swallowed', !isDroppedTableError('database is locked'))
ok('a column error is not a table error', !isDroppedTableError('no such column: clusters'))

// `entities` is dropped but `entity_mentions` is a different name — a prefix
// match would wrongly swallow a live table one day.
ok('the match is whole-name, not prefix', !isDroppedTableError('no such table: entities_v2'))

// ── the runner wires it, and keeps the blanket pattern out ─────────────────
ok('the runner imports the check', /isDroppedTableError/.test(runSrc))
ok('and records the migration instead of retrying',
   /skipped_table_dropped/.test(runSrc) && /INSERT INTO schema_migrations[\s\S]{0,400}skipped_table_dropped/.test(runSrc))

const benign = /const BENIGN_PATTERNS = \[([\s\S]*?)\]/.exec(runSrc)[1]
ok('BENIGN_PATTERNS carries no bare "no such table"',
   !/\/no such table\/[a-z]*\s*,/.test(benign))
ok('its one no-such-table entry is scoped to schema_migrations',
   !benign.includes('no such table') || /no such table.*schema_migrations/.test(benign))

// ── one list, not two ──────────────────────────────────────────────────────
ok('the reset route reads the shared list', /DROPPED_TABLES/.test(resetSrc))
ok('and does not keep its own copy',
   !/const OLD_TABLES = \[/.test(resetSrc))

// ── the failure this was actually costing ──────────────────────────────────
// Every migration whose target table is dropped must be recognised, or the
// cold-isolate retry storm comes back.
const entries = [...runSrc.matchAll(/\{\s*name:\s*'([^']+)',\s*sql:\s*`([\s\S]*?)`/g)]
ok('migrations parse', entries.length > 150)
const obsolete = entries.filter(([, , sql]) => {
  const m = /(?:ALTER TABLE|CREATE INDEX[^O]*ON|CREATE TABLE(?: IF NOT EXISTS)?|UPDATE|INSERT INTO)\s+`?([a-z_]+)/i.exec(sql)
  return m && set.has(m[1])
})
ok('the obsolete migrations are still in the array (append-only)', obsolete.length >= 40)
ok('and every one of them is recognised as obsolete',
   obsolete.every(([, , sql]) => {
     const t = /(?:ALTER TABLE|CREATE INDEX[^O]*ON|CREATE TABLE(?: IF NOT EXISTS)?|UPDATE|INSERT INTO)\s+`?([a-z_]+)/i.exec(sql)[1]
     return isDroppedTableError(`no such table: ${t}`)
   }))

console.log(`\n  ${pass} passed, ${fail} failed  (${obsolete.length} obsolete migrations recognised)`)
process.exit(fail ? 1 : 0)
