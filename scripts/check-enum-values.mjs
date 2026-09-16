#!/usr/bin/env node
/**
 * The blind spot the column checker cannot see: a RIGHT column with a WRONG
 * value in it.
 *
 * `check-sql-columns.mjs` catches `vlogs.transcript` when the column is
 * `transcript_text`. It cannot catch `relation = 'reflection'` when the
 * column's two values are `led_from` and `reflects` — the column exists, the
 * type is TEXT, SQLite accepts the write, `tsc` accepts the comparison, and
 * `next build` is green. The only symptom is behaviour: on 7 Sep the walk
 * shipped reading `relation === 'reflection'`, which never matched, so a
 * reflection rendered on a route as an event — exactly what SPEC §1 says it
 * must never become. It was found by reading unrelated code.
 *
 * So: the columns whose values ARE the product logic are listed here with
 * every value they may hold, and this checks both sides —
 *
 *   SQL   `col = 'x'`, `col <> 'x'`, `col IN ('x','y')`
 *   TS    `x.col === 'y'`, `x.col !== 'y'`
 *
 * A value not in the list is an error with the allowed set printed beside
 * it. Adding a value means adding it here, on purpose, which is the point.
 *
 * Run: node scripts/check-enum-values.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'

/**
 * Every column whose values the product reasons about, and the values it
 * may hold. Where a set lives in code, the file is named so the two stay
 * together.
 */
const ENUMS = {
  // src/lib/log-entry.ts
  relation:       ['led_from', 'reflects'],
  visibility:     ['public', 'private', 'held'],
  author:         ['operator', 'log', 'drafted'],
  date_precision: ['exact', 'day', 'month', 'year', 'approx'],
  // src/lib/correspondence.ts
  consent:        ['kept_private', 'named_not_quoted', 'quotable', 'not_on_the_log'],
  // src/lib/documents.ts
  made_by:        ['operator', 'operator_with_log', 'log_drafted_kept', 'log'],
  // src/lib/keep.ts — KeepState. Only `checked` means delete the local copy.
  keep_state:     ['pending', 'checking', 'checked', 'mismatch'],
  verified_by:    ['bytes', 'size'],
  // src/lib/pages.ts
  summary_author: ['log', 'operator'],
  // correspondence_messages
  side:           ['operator', 'other'],
  sent_at_source: ['paste', 'order'],
  // src/lib/pipeline-status.ts — vlogs.pipeline_status. ⚠️ `processing` is
  // in this set and is not in IN_FLIGHT_STATUSES: it is a label the legacy
  // Workflow could leave behind, which reset-stuck-transcoding still has to
  // recognise, and which nothing writes any more.
  pipeline_status: [
    'uploaded', 'transcoding', 'transcribing', 'extracting', 'reading',
    'processing', 'complete', 'failed', 'archived',
  ],
}

/**
 * Columns whose names collide with something else that is not the column.
 * `kind` is on eight tables with eight different value sets, and `side`,
 * `author` and `visibility` appear in unrelated contexts, so a name alone is
 * not enough to check. Only the columns above are checked, and only where
 * the surrounding text makes it a column reference.
 */
const SKIP_FILES = new Set([
  // The migration runner declares the defaults; it is the source, not a use.
  'src/lib/migration-runner.ts',
  // The same, for pipeline_status: this file IS the list.
  'src/lib/pipeline-status.ts',
])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const problems = []
let checked = 0

for (const file of walk(SRC)) {
  if (SKIP_FILES.has(file.replace(/\\/g, '/'))) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')

  for (const [col, allowed] of Object.entries(ENUMS)) {
    // SQL: `col = 'x'` / `col <> 'x'` / `col != 'x'`, optionally alias-qualified.
    const sql = new RegExp(`\\b(?:[a-z_]+\\.)?${col}\\s*(?:=|<>|!=)\\s*'([^']*)'`, 'g')
    // TS: `.col === 'x'` / `.col !== 'x'`
    const ts = new RegExp(`\\.${col}\\s*(?:===|!==)\\s*'([^']*)'`, 'g')
    // SQL: `col IN ('a','b')`
    const inList = new RegExp(`\\b(?:[a-z_]+\\.)?${col}\\s+IN\\s*\\(([^)]*)\\)`, 'gi')

    for (const [re, kind] of [[sql, 'sql'], [ts, 'ts']]) {
      let m
      while ((m = re.exec(text))) {
        checked++
        const value = m[1]
        if (allowed.includes(value)) continue
        // ⚠️ An interpolated list is not a literal value. `pipeline_status
        // IN ('${IN_FLIGHT_STATUSES.join("','")}')` is the one list, built
        // from `src/lib/pipeline-status.ts` — reading the first fragment of
        // it as a value reports the shared constant as an illegal one, which
        // is the opposite of what this check is for.
        if (/\$\{|\\`/.test(value) || value.includes('${')) continue
        // `typeof body.consent === 'string'` is a type test, not a value
        // comparison — what is being compared there is a JS type name.
        if (kind === 'ts' && /typeof\s+[\w.]*$/.test(text.slice(Math.max(0, m.index - 40), m.index + 1))) continue
        const line = text.slice(0, m.index).split('\n').length
        problems.push({
          file, line, col, value, allowed,
          context: (lines[line - 1] || '').trim().slice(0, 110),
          kind,
        })
      }
    }

    let m
    while ((m = inList.exec(text))) {
      const values = [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1])
      const line = text.slice(0, m.index).split('\n').length
      // Same guard as above: an interpolated list is the shared constant,
      // not a literal value.
      if (m[1].includes('${')) continue
      for (const value of values) {
        checked++
        if (allowed.includes(value)) continue
        problems.push({
          file, line, col, value, allowed,
          context: (lines[line - 1] || '').trim().slice(0, 110),
          kind: 'sql-in',
        })
      }
    }
  }
}

console.log(`Checked ${checked} value comparisons across ${Object.keys(ENUMS).length} columns.`)

if (problems.length) {
  console.error(`\n${problems.length} value${problems.length === 1 ? '' : 's'} no column can hold:\n`)
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  ${p.col} = '${p.value}'`)
    console.error(`    allowed: ${p.allowed.join(' · ')}`)
    console.error(`    ${p.context}\n`)
  }
  process.exit(1)
}

console.log('No impossible values.')
