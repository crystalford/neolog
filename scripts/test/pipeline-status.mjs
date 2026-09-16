#!/usr/bin/env node
/**
 * One list of pipeline statuses, imported everywhere
 * (`src/lib/pipeline-status.ts`).
 *
 * ── Why this needs a test ────────────────────────────────────────────────
 *
 * Five files each declared their own copy of "what counts as in flight", and
 * on 9 Sep two were wrong in the same way: `workers/healer` and
 * `/api/v2/admin/reset-stuck` both omitted **`reading`** — the pipeline's
 * last step since the read path replaced extraction on 8 Sep.
 *
 * The healer is the only thing that makes a four-hundred-recording run
 * self-recover. It could not see a recording wedged in its final step, so one
 * that hung on the way onto the log stayed hung, forever, with nothing
 * re-dispatching it.
 *
 * Nothing reported it and nothing could: `tsc` is happy with a string array,
 * `check-sql-columns.mjs` sees a legal column, `check-enum-values.mjs` sees
 * legal values. **Every copy was internally valid and one of them was
 * short.** The only defence is that there be one copy.
 *
 * ⚠️ Two lists, not one, and the difference is load-bearing.
 * `IN_FLIGHT_STATUSES` is for a job that RE-DISPATCHES; `OCCUPIED_STATUSES`
 * adds `uploaded`, which is for a job that REPORTS or KILLS. A row sits at
 * `uploaded` while the browser is still pushing a gigabyte to R2, so
 * re-dispatching there turns a slow upload into a broken one.
 *
 * Run: node scripts/test/pipeline-status.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

const SRC = 'src/lib/pipeline-status.ts'
const lib = readFileSync(SRC, 'utf8')

function listOf(name) {
  const body = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(lib)?.[1] ?? ''
  return [...body.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
}

// ── The list itself ──────────────────────────────────────────────────────
const inFlight = listOf('IN_FLIGHT_STATUSES')
ok('IN_FLIGHT_STATUSES is readable', inFlight.length > 0)
ok('and `reading` is on it — the step that was missing from two copies',
  inFlight.includes('reading'))
ok('and `transcribing`, without which Whisper hanging is invisible',
  inFlight.includes('transcribing'))
ok('and `extracting`, the DO’s own name for the step `reading` renamed',
  inFlight.includes('extracting'))

// ⚠️ The one that must NOT be there. A job re-dispatching an `uploaded` row
// interrupts an upload that is still going.
ok('`uploaded` is NOT in the re-dispatch list', !inFlight.includes('uploaded'))
ok('and IS in the report/kill list', /DISPATCHED_STATUS\s*=\s*'uploaded'/.test(lib))
ok('OCCUPIED_STATUSES is the first list plus that one',
  /OCCUPIED_STATUSES[^=]*=\s*\[\s*\.\.\.IN_FLIGHT_STATUSES,\s*DISPATCHED_STATUS\s*\]/.test(lib))

// ── Nobody holds a sixth copy ────────────────────────────────────────────
function walk(dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (n === 'node_modules') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(n)) out.push(p)
  }
  return out
}

// Any array literal holding two or more of the in-flight statuses is a
// second copy of this list, wherever it is called.
const files = [...walk('src'), ...walk('workers')].filter(f => f.replace(/\\/g, '/') !== SRC)
const copies = []
for (const f of files) {
  const code = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const arr of code.matchAll(/\[([^\][]*)\]/g)) {
    const hits = inFlight.filter(s => arr[1].includes(`'${s}'`))
    if (hits.length >= 2) copies.push(`${f}: [${hits.join(', ')}]`)
  }
}
check('no file re-declares the list as an array', copies, [])

// The SQL form is the same copy under another syntax.
const sqlCopies = []
for (const f of files) {
  const code = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const m of code.matchAll(/IN\s*\(([^)]*)\)/gi)) {
    if (m[1].includes('${')) continue                     // built from the list
    const hits = inFlight.filter(s => m[1].includes(`'${s}'`))
    // ⚠️ reset-stuck-transcoding names a deliberately WIDER set — every
    // label a wedged dispatch could have left, including `processing` and
    // `archived`, which are not "in flight" and must not be re-dispatched
    // by the healer. It is a different question, so it keeps its own list.
    if (hits.length >= 2 && !f.includes('reset-stuck-transcoding')) {
      sqlCopies.push(`${f}: IN (${hits.join(', ')})`)
    }
  }
}
check('and no query holds it as an IN list', sqlCopies, [])

// ── The two files that were wrong actually import it ─────────────────────
for (const f of [
  'workers/healer/src/index.ts',
  'src/app/api/v2/admin/reset-stuck/route.ts',
  'src/app/api/v2/admin/reprocess-vlogs/route.ts',
  'src/app/api/v2/admin/pipeline-state/route.ts',
  'src/app/api/v2/admin/terminate-all/route.ts',
]) {
  const code = readFileSync(f, 'utf8')
  ok(`${f} imports the list`, /from '(?:@\/lib|[./]+src\/lib)\/pipeline-status'/.test(code))
}

// The healer re-dispatches, so it must take the narrower one.
{
  // Comments stripped: the file's own ⚠️ note names the wider list to say
  // why it does NOT use it, and that sentence is not an import.
  const code = readFileSync('workers/healer/src/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok('the healer takes IN_FLIGHT_STATUSES, not OCCUPIED_STATUSES',
    /import \{ IN_FLIGHT_STATUSES \}/.test(code) && !/OCCUPIED_STATUSES/.test(code))
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
