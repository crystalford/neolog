#!/usr/bin/env node
/**
 * An API route nothing in the product calls.
 *
 * `check-routes.mjs` covers one direction: a fetch to a path that was never
 * built is a runtime 404 that renders as an empty list, which reads as
 * "nothing here yet" rather than as a bug. This is the other direction, and
 * it hides differently — a route with no caller is not an error anywhere. It
 * builds, it typechecks, it deploys, and the feature it was written for
 * simply does not exist on any screen.
 *
 * That is not hypothetical. `PATCH /api/v2/vlogs/[id]/transcript-words` was
 * written in full — one word at a time enforced, `transcript_text` rebuilt,
 * what Whisper heard kept in `entry_revisions` — and no page called it. The
 * transcript on `/vlog/[id]` rendered every word as a dead span, so half of
 * `fix.html` was API-only for a week with nothing objecting.
 *
 * ⚠️ **A route's own file does not count as a caller.** The first pass of
 * this scan matched the path inside the route's own header comment and
 * reported zero dead routes across seventy-two. Every route documents its own
 * path at the top; that is the one occurrence that proves nothing.
 *
 * A route reached only by a method the callers never use is still counted as
 * reached — matching per-method callers means parsing fetch options, and a
 * wrong answer there would train the operator to ignore this check. The
 * budget below carries the routes that are legitimately reached another way.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Routes with no in-repo caller, on purpose. Each needs a reason — this list
 * is a record of decisions, not a way to quiet the check.
 */
const REACHED_ELSEWHERE = {
  // ── Run by hand, because the operator has no terminal ──────────────────
  //
  // CLAUDE.md: the Claude Code session IS the operator's runtime. A
  // maintenance job that would be a script anywhere else is an HTTP endpoint
  // here, called through `workers/admin-bridge` — so "no in-repo caller" is
  // the correct state for these, not a gap. Each is a recovery tool for a
  // recording the pipeline dropped.
  '/api/debug/whoami': 'confirms which operator the Access JWT resolves to',
  '/api/v2/admin/bindings-check': 'run through the bridge when a deploy looks wrong',
  '/api/v2/admin/run-migrations': 'forces the migration pass without waiting for a cold isolate',
  '/api/v2/admin/backfill-recorded-at': 'redates archived imports whose four-tier pass was skipped',
  '/api/v2/admin/import-r2': 'registers recordings already in the bucket but not in D1',
  '/api/v2/admin/regenerate-thumbnails': 'the bulk form of the /settings button',
  '/api/v2/admin/reset-stuck': 'clears a row wedged mid-pipeline',
  '/api/v2/admin/reset-stuck-transcoding': 'the same, for the transcode step alone',
  '/api/v2/admin/thumb-broker': 'drives the thumbnail cascade over a selection',
  '/api/v2/admin/transcode-broker': 'the same, for transcode',
  '/api/v2/admin/transcode-backfill': 'transcodes HEVC originals uploaded before the cascade existed',
  '/api/v2/dev/replay/[id]': 'replays one recording through the pipeline while debugging it',
  '/api/v2/dev/transcribe-test': 'probes the Whisper call shape directly — the REST-vs-binding question',

  // ── Reached from outside the repo ──────────────────────────────────────
  '/api/v2/log': 'the feed, fetched with a query string built at the call site',
  '/api/v2/health': 'external monitoring and the bootstrap workflow',
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === 'route.ts') out.push(p)
  }
  return out
}

const routeFiles = walk('src/app/api')
const corpusFiles = []
// ⚠️ `src/app/api` is NOT in the corpus. One route's header comment naming
// another route's path marked it reached — `/api/v2/photos` counted as live
// because `photos/presign` mentions it, when no screen calls either. A
// caller that matters is one that puts the feature in front of the operator
// or runs it on a schedule: a page, a component, a worker, a script, a
// workflow. A route that genuinely calls another route shows up here and
// gets recorded below with its reason.
for (const dir of ['src/app/(app)', 'src/components', 'src/lib', 'workers', 'scripts', '.github']) {
  try { walk2(dir, corpusFiles) } catch {}
}
function walk2(dir, out) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk2(p, out)
    else if (/\.(ts|tsx|mjs|js|yml|yaml)$/.test(e)) out.push(p)
  }
}

const unreached = []
for (const file of routeFiles) {
  const route = file.replace(/^src\/app/, '').replace(/\/route\.ts$/, '')
  // A dynamic segment is filled in at the call site, so match the literal
  // prefix before the first [param] — `/api/v2/vlogs/${id}/thumbnail` has to
  // match `/api/v2/vlogs`.
  const probe = route.split('/[')[0]
  let hits = 0
  for (const f of corpusFiles) {
    if (f === file) continue                        // ⚠️ never its own header
    if (f.endsWith('check-unreached-routes.mjs')) continue  // nor this file's own examples
    const text = readFileSync(f, 'utf8')
    if (text.includes(probe)) { hits++; break }
  }
  if (hits === 0 && !(route in REACHED_ELSEWHERE)) unreached.push(route)
}

// ── The FFmpeg container's endpoints ────────────────────────────────────
//
// Same question, on the one surface that is not a Next route. The container
// is DEPLOYED, so an endpoint nothing calls is running code for a feature
// that does not exist — and it hides better than a dead route does, because
// `server.js` is plain JS outside every typecheck in this repo.
//
// Seven were found on 9 Sep: /trim, /concat, /extract-audio-segment,
// /extract-video-segment, /render-video-essay, /ken-burns and
// /images-to-video — 520 of that file's 1,240 lines, all of them the
// production engine deleted on 8 Sep.
//
// ⚠️ The first version looked for `const ROUTES` and the map is `const
// routes`, so it parsed nothing, found nothing, and passed — the exact
// failure this check exists to catch, in the check itself. An empty parse is
// a hard error now, not a pass.
const FFMPEG_SERVER = 'workers/ffmpeg/server.js'
let containerDead = []
try {
  const server = readFileSync(FFMPEG_SERVER, 'utf8')
  const map = /const routes\s*=\s*\{([\s\S]*?)\n\}/i.exec(server)?.[1] ?? ''
  const endpoints = [...map.matchAll(/'(\/[a-z0-9-]+)'/g)].map(m => m[1])
  if (!endpoints.length) {
    console.error(`Could not read the endpoint map out of ${FFMPEG_SERVER}.`)
    process.exit(1)
  }
  for (const ep of endpoints) {
    const called = corpusFiles.some(f =>
      f !== FFMPEG_SERVER
      && !f.endsWith('check-unreached-routes.mjs')
      && !f.startsWith('workers/ffmpeg/')     // its own Dockerfile and worker list them
      && readFileSync(f, 'utf8').includes(ep))
    if (!called) containerDead.push(ep)
  }
} catch { /* no container in this checkout */ }

console.log(`${routeFiles.length} API routes checked against every caller in the repo.`)
if (unreached.length) {
  console.error(`\n${unreached.length} route(s) nothing calls:\n`)
  for (const r of unreached) console.error('  ' + r)
  console.error(
    '\nEither wire it to the surface it was written for, or record it in'
    + '\nREACHED_ELSEWHERE with the reason it has no in-repo caller.\n',
  )
  process.exit(1)
}
if (containerDead.length) {
  console.error(`\n${containerDead.length} FFmpeg container endpoint(s) nothing calls:\n`)
  for (const e of containerDead) console.error('  ' + e)
  console.error(
    '\nThe container is deployed, so these are running. Wire one to the'
    + '\nfeature it was written for, or take it out of server.js.\n',
  )
  process.exit(1)
}

console.log(`Every route has a caller. ${Object.keys(REACHED_ELSEWHERE).length} are recorded as reached from outside.`)
