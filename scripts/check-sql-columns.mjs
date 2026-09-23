#!/usr/bin/env node
/**
 * Check that every column named in the app's SQL actually exists.
 *
 * Why this exists: on 7 Sep 2026 the log's feed query selected
 * `vlogs.transcript`. The column is `transcript_text`. TypeScript could not
 * see it, `next build` passed, the deploy went green, and `/api/v2/log`
 * returned 500 for every request — the log did not load at all. A bad column
 * name is a runtime error, so every check that ran was blind to it.
 *
 * This reads the schema the way D1 will have it — `db/schema.sql` plus every
 * `ALTER TABLE ... ADD COLUMN` and `CREATE TABLE` in the migration runner —
 * and then checks each alias-qualified reference (`v.transcript`) in the
 * app's SQL against it.
 *
 * Scope, stated honestly: it checks qualified references only. A bare column
 * in a single-table query is not checked, because telling a column apart
 * from a SQL keyword or a function name without a real parser produces more
 * false alarms than it catches bugs. Qualified references are where the
 * multi-table joins live, which is where this class of mistake happens.
 *
 * Run: node scripts/check-sql-columns.mjs
 * Exits 1 on any unknown column.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = process.cwd()

// ── Build table -> Set(columns) from schema.sql + the migration runner ────
const tables = new Map()

function addCol(table, col) {
  const t = table.toLowerCase()
  if (!tables.has(t)) tables.set(t, new Set())
  tables.get(t).add(col.toLowerCase())
}

function readCreateTables(sql) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\n\s*\)/gi
  let m
  while ((m = re.exec(sql))) {
    const table = m[1]
    for (const rawLine of m[2].split('\n')) {
      const line = rawLine.trim().replace(/--.*$/, '')
      if (!line) continue
      if (/^(FOREIGN|PRIMARY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue
      const col = line.match(/^[`"]?(\w+)[`"]?\s+/)
      if (col) addCol(table, col[1])
    }
  }
}

function readAlters(sql) {
  const re = /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+COLUMN\s+[`"]?(\w+)[`"]?/gi
  let m
  while ((m = re.exec(sql))) addCol(m[1], m[2])
}

for (const f of ['db/schema.sql', 'src/lib/migration-runner.ts']) {
  let sql
  try { sql = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
  readCreateTables(sql)
  readAlters(sql)
}

// Columns SQLite provides that no schema declares.
for (const cols of tables.values()) cols.add('rowid')

// ── Walk the app's source for SQL ────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}

const SQL_START = /\b(SELECT|INSERT\s+INTO|INSERT\s+OR\s+IGNORE\s+INTO|UPDATE|DELETE\s+FROM)\b/i

const problems = []
let checked = 0

// `workers/` too, and not as an afterthought: the workers write to D1 the
// same way the app does, and on 8 Sep every remaining reference to a dropped
// table was in `workers/` — the app was clean and the checker said so,
// because it had only ever looked at `src/`.
/**
 * Every column name in the schema, whatever table it is on.
 *
 * ⚠️ The guard that makes bare-name checking usable. A bare word in a query
 * is usually a keyword, a function, a CTE label or an alias — reporting all
 * of those would bury the real findings, which is the failure this repo has
 * written down three times. A word that IS a column somewhere and is NOT a
 * column of the one table in scope is the narrow, high-signal case: it
 * reads as a column, it is spelled like a column, and it is on the wrong
 * table or misspelled.
 */
const ANY_COLUMN = new Set([...tables.values()].flatMap(c => [...c]))

/** Tables this product dropped on purpose — see `src/lib/dropped-tables.ts`. */
const DROPPED = new Set(
  (readFileSync(join(ROOT, 'src/lib/dropped-tables.ts'), 'utf8')
    .match(/export const DROPPED_TABLES = \[([\s\S]*?)\]/)?.[1] || '')
    .match(/'([a-z_][a-z0-9_]*)'/g)?.map(t => t.slice(1, -1)) || [],
)

/** SQL's own vocabulary, so it is never read as a column name. */
const SQL_WORDS = new Set(`
select from where and or not null is as on in by order group limit offset
insert into values update set delete distinct join left right inner outer
union all case when then else end desc asc count sum avg min max coalesce
substr strftime length lower upper trim replace instr json_extract ifnull
nullif abs round cast integer text real blob exists between like glob having
returning conflict do nothing replace_ current_timestamp date datetime time
julianday printf group_concat random abs total cte with recursive
ignore collate nocase rtrim ltrim iif unique index table view trigger
primary key foreign references default check constraint autoincrement
alter add column drop create if not temp temporary begin commit rollback
pragma vacuum analyze explain natural cross using full first last nulls

`.trim().split(/\s+/))

const ROOTS = [join(ROOT, 'src'), join(ROOT, 'workers')]
for (const file of ROOTS.flatMap(r => { try { return walk(r) } catch { return [] } })) {
  const src = readFileSync(file, 'utf8')
  // Every backtick template that looks like SQL.
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    // ⚠️ SQL comments stripped first. This repo's queries carry long
    // explanations inside them — `/api/v2/onthisday`'s says why it aliases
    // `r2_key AS r` — and a bare-name pass reads every word of that prose
    // as a possible column. Two of the first four findings were the words
    // "name" and "because" out of a comment. The same lesson
    // `check-dropped-tables.mjs` and `check-container-server.mjs` both
    // learned, in the same order.
    const sql = m[1]
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // ⚠️ And every `${…}` interpolation. Those are JavaScript, not SQL:
      // `${rangeSql}`, `${ph}`, `${IN_FLIGHT_STATUSES.join(…)}`. A bare-name
      // pass read each one as a column and reported twenty-four of them.
      // What they interpolate is a fragment this checker cannot see anyway.
      .replace(/\$\{[^}]*\}/g, ' ')
    if (!SQL_START.test(sql)) continue

    // alias -> table, from FROM/JOIN/UPDATE clauses
    const aliases = new Map()
    for (const a of sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+[`"]?(\w+)[`"]?(?:\s+(?:AS\s+)?([a-zA-Z]\w*))?/gi)) {
      const table = a[1].toLowerCase()
      if (!tables.has(table)) continue
      aliases.set(table, table)
      const alias = a[2]
      if (alias && !/^(WHERE|SET|ON|VALUES|SELECT|ORDER|GROUP|LIMIT|LEFT|INNER|JOIN|AS|USING|AND|OR)$/i.test(alias)) {
        aliases.set(alias.toLowerCase(), table)
      }
    }
    if (!aliases.size) continue

    // ── Bare names, when there is exactly one table to resolve against ──
    //
    // ⚠️ 20 Sep — `/api/v2/onthisday` had been returning 500 on EVERY
    // request, forever. It selected a column `r`; the column is `r2_key`.
    // The rail card catches its own errors and hides itself, so On This Day
    // silently never worked and nothing anywhere said so.
    //
    // This checker could not see it: it validated ALIAS-QUALIFIED
    // references, and a query with no alias has every bare name skipped.
    // That is the same blind spot `check-dropped-tables.mjs` learned about
    // from the other side.
    //
    // A single-table query is the one case where a bare name is
    // unambiguous, so that is the only case this resolves. The moment a
    // second table is in scope the name could belong to either and the
    // checker would rather say nothing than guess.
    if (aliases.size === 1) {
      const table = [...aliases.values()][0]
      // ⚠️ A dropped table's CREATE is still in MIGRATIONS — the array is
      // append-only — so its columns are still "known" while the table is
      // gone. A later ALTER against one is an obsolete migration the runner
      // already records and stops asking about (`isDroppedTableError`), not
      // a wrong column name.
      if (DROPPED.has(table)) continue
      const cols = tables.get(table)
      // Only the SELECT list and the WHERE/SET clauses — not the whole
      // string, which carries keywords, function names and bound values.
      // ⚠️ An OUTPUT label is not a column. `COUNT(*) AS n` names the
      // result, and the first run of this reported `n` nineteen times out
      // of twenty-six findings — exactly the "cries wolf" failure that
      // teaches the next reader to skim. Every `AS x` in the query is
      // collected and skipped.
      const labels = new Set(
        [...sql.matchAll(/\bAS\s+[`"]?(\w+)[`"]?/gi)].map(a => a[1].toLowerCase()),
      )
      const fields = sql
        // A qualified name is handled below; strip it so its column half
        // does not read as a bare one.
        .replace(/\b[a-zA-Z]\w*\.\w+\b/g, ' ')
        // String literals are values, not column names.
        .replace(/'[^']*'/g, ' ')
      for (const r of fields.matchAll(/\b([a-z_][a-z0-9_]*)\b/gi)) {
        const name = r[1].toLowerCase()
        if (SQL_WORDS.has(name)) continue
        if (labels.has(name)) continue
        if (tables.has(name)) continue
        if (!cols || cols.has(name)) continue
        checked++
        const line = src.slice(0, m.index + sql.indexOf(r[0])).split('\n').length
        problems.push(
          `${file.replace(ROOT + '/', '')}:${line}  ${r[0]}  —  ` +
          `${table} has no column "${name}" (un-aliased query)`,
        )
      }
    }

    // qualified references: alias.column
    for (const r of sql.matchAll(/\b([a-zA-Z]\w*)\.(\w+)\b/g)) {
      const alias = r[1].toLowerCase()
      const col = r[2].toLowerCase()
      const table = aliases.get(alias)
      if (!table) continue
      checked++
      const cols = tables.get(table)
      if (cols && !cols.has(col)) {
        const line = src.slice(0, m.index + sql.indexOf(r[0])).split('\n').length
        problems.push(
          `${file.replace(ROOT + '/', '')}:${line}  ${r[0]}  —  ` +
          `${table} has no column "${col}"`,
        )
      }
    }
  }
}

console.log(`Schema: ${tables.size} tables.`)
console.log(`Checked ${checked} qualified column references in src/ and workers/.`)

if (problems.length) {
  console.error(`\n${problems.length} unknown column${problems.length === 1 ? '' : 's'}:\n`)
  for (const p of [...new Set(problems)]) console.error('  ' + p)
  console.error('')
  process.exit(1)
}
console.log('No unknown columns.')
