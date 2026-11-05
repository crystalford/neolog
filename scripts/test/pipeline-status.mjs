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

// ── The playable copy: a downscale, and no size limit on it ─────────────
// ⚠️ 5 Nov. The operator asked for uploads of any size to be as dependable
// as YouTube. The answer is that NOTHING PLAYS THE MASTER — the pipeline
// makes a small proxy — and these assertions are the three things that have
// to stay true for that to hold at any size.
{
  const lib = readFileSync('src/lib/pipeline-status.ts', 'utf8')
  ok('the proxy long edge is shared, not re-typed per caller',
    /export const PROXY_LONG_EDGE = 1280/.test(lib))
  ok('and so is the request bound', /export const PROXY_REQUEST_MS/.test(lib))

  const server = readFileSync('workers/ffmpeg/server.js', 'utf8')
  const proxy = server.slice(server.indexOf('async function transcodeProxy'))
  const body = proxy.slice(0, proxy.indexOf('\nconst routes'))

  // ⚠️ The input must NOT be downloaded. This is the single reason the
  // endpoint works at 10 GB where the old one could not, and a future edit
  // that "tidies" it into downloadToTmp puts the 4 GB wall straight back.
  ok('the proxy never downloads the master', !body.includes('downloadToTmp'))
  ok('it hands ffmpeg the URL directly', /'-i', input_url/.test(body))
  ok('and it downscales rather than re-encoding at source size',
    body.includes("'-vf'") && body.includes('force_original_aspect_ratio=decrease'))
  // ⚠️ Never upscales: min(edge,iw) caps at the source's own dimension, so a
  // 720p phone clip is not blown up to 1280 and a vertical stays vertical.
  ok('and never upscales a small source', /min\(\$\{edge\},iw\)/.test(body))
  // ⚠️ A silent DJI clip has no audio stream. Eight of ten corpus failures
  // were once exactly that, so the optional map is load-bearing.
  ok('a silent recording still gets a proxy', /'-map', '0:a:0\?'/.test(body))
}

// ⚠️ Comments stripped FIRST. Every one of these spans explains in prose
// what it must not DO — `TRANSCODE_MAX_BYTES` is named in a comment saying it
// no longer applies here, and the softStep is still labelled `transcode-h264`
// so its outcome key stays stable. The same lesson `check-dropped-tables`,
// `check-container-server` and `check-pipeline-artifact-exists` each learned:
// a check that reads a file's own explanation of a bug reports the bug.
// ⚠️ The `[^:]` guard is not decoration. A bare `//` rule eats `https://`
// out of every URL in the file, so the endpoint under test vanishes and the
// check passes or fails for a reason that has nothing to do with the code.
// Same form `scripts/test/bulk-upload.mjs` and `check-sql-columns.mjs` use.
// ⚠️ LINE comments only, and both halves of that are deliberate.
//
// The `[^:]` guard is not decoration: a bare `//` rule eats `https://` out of
// every URL in the file, so the endpoint under test vanishes and the check
// then passes or fails for a reason that has nothing to do with the code.
//
// And block comments are left ALONE, because stripping them with a regex is
// the bug that once deleted three live helpers out of
// `workers/ffmpeg/server.js`: `{ reason: 'source is audio/*' }` in this very
// file opens a match that runs to the next `*/` and destroys everything
// between. A regex cannot tell a comment from a string. Nothing checked here
// hides behind a block comment — every explanation this test has to see past
// is a `//` line.
const strip = code => code.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// ⚠️ The proxy is STREAMED into R2. Buffering it in a Worker caps the feature
// on OUTPUT size — the ceiling this repo carried for months without saying
// so — and that is invisible until a long recording silently has no copy.
for (const [f, start, end] of [
  ['workers/pipeline/src/index.ts', 'transcode-proxy', 'transcoded_r2_key = ?'],
  ['workers/process-upload/src/workflow.ts', 'transcode-proxy', 'transcoded_r2_key = ?'],
]) {
  const bare = strip(readFileSync(f, 'utf8'))
  const span = bare.slice(bare.indexOf(start), bare.indexOf(end, bare.indexOf(start)))
  ok(`${f}: the span under test was found`, span.length > 100 && span.length < 4000)
  ok(`${f} streams the proxy into R2`, !span.includes('arrayBuffer('))
  // ⚠️ A stream that ends early still stores, and what it stores looks like a
  // valid object. Without this a half-written proxy plays and then stops.
  ok(`${f} rejects a proxy that was cut short`,
    span.includes('content-length') && /stored !== declared/.test(span))
  // ⚠️ Asserted against the WHOLE file, not the span — the span begins at the
  // endpoint name, so the `https://…/` in front of it sits outside. And the
  // whole file is the stronger claim anyway: neither of these may reach the
  // full-resolution endpoint ANYWHERE. The softStep LABEL may still read
  // `transcode-h264`, because that key is what `extraction_outcomes` is read
  // by and renaming it would orphan every recording's recorded outcome.
  ok(`${f} fetches the proxy endpoint`,
    bare.includes('ffmpeg.neolog.internal/transcode-proxy'))
  ok(`${f} never fetches the full-resolution one`,
    !bare.includes('ffmpeg.neolog.internal/transcode-h264'))
  // ⚠️ The signature must outlive the ENCODE, not the request: ffmpeg
  // range-reads the master throughout, so a one-hour URL on a forty-minute
  // job expires mid-read and reads as a corrupt master.
  const upTo = bare.slice(0, bare.indexOf(start))
  const presign = upTo.lastIndexOf('presignR2Get')
  ok(`${f} signs the master for longer than the encode`,
    /6 \* 3600/.test(bare.slice(presign, presign + 120)))
}

// ⚠️ No size gate in front of the pipeline's transcode any more. That gate
// was correct for a full-resolution encode and is the bug for a proxy: it
// would refuse exactly the files this was built for.
{
  const bare = strip(readFileSync('workers/pipeline/src/index.ts', 'utf8'))
  const st = bare.indexOf('private async stepTranscode')
  const body = bare.slice(st, bare.indexOf('\n  private async', st + 10))
  ok('the stepTranscode body was found', body.includes('transcode-proxy'))
  ok('the pipeline no longer refuses a big file a playable copy',
    !body.includes('TRANSCODE_MAX_BYTES'))
}

// The hand-operated callers keep the old endpoint, so they keep its ceiling.
const ceilingCopies = []
for (const f of [
  'src/app/api/v2/admin/transcode-one/route.ts',
  'src/app/api/v2/admin/transcode-backfill/route.ts',
]) {
  const code = readFileSync(f, 'utf8')
  ok(`${f} imports the ceiling it needs`,
    /import \{[^}]*TRANSCODE_MAX_BYTES[^}]*\} from '(?:@\/lib|[./]+src\/lib)\/pipeline-status'/.test(code))
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  if (/(?:const|let)\s+\w*(?:MAX_BYTES|TRANSCODE_LIMIT|MAX_TRANSCODE)\w*\s*=/.test(bare)) {
    ceilingCopies.push(`${f}: declares its own ceiling`)
  }
}
check('and neither declares its own', ceilingCopies, [])

// ⚠️ The backfill's own cap may narrow, never widen.
{
  const code = readFileSync('src/app/api/v2/admin/transcode-backfill/route.ts', 'utf8')
  ok('the backfill clamps its own cap to the ceiling',
    /Math\.min\(\s*maxSizeMb \* 1_000_000,\s*TRANSCODE_MAX_BYTES\s*\)/.test(code))
}

// ⚠️ The refusal has to point at what DOES work, or it is the dead end this
// repo already records for the healer's "Click Re-extract" message.
{
  const lib = readFileSync('src/lib/pipeline-status.ts', 'utf8')
  const fn = lib.slice(lib.indexOf('export function transcodeRefusal'))
  ok('the refusal names the way that does work', /wedged half-way/.test(fn))
}

// ⚠️ The container has to have the CPU, or the proxy times out instead of
// finishing. This is the one part of "like YouTube" that is bought.
{
  const toml = readFileSync('workers/ffmpeg/wrangler.toml', 'utf8')
  ok('the container is sized for an encode', /instance_type = "standard-4"/.test(toml))
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
