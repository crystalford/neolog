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
const ROOTS = [join(ROOT, 'src'), join(ROOT, 'workers')]
for (const file of ROOTS.flatMap(r => { try { return walk(r) } catch { return [] } })) {
  const src = readFileSync(file, 'utf8')
  // Every backtick template that looks like SQL.
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    const sql = m[1]
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
