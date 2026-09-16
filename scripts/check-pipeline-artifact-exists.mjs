#!/usr/bin/env node
/**
 * `workers/pipeline/src/index.ts`'s `artifactExists()` decides whether a
 * step has already run. Get "already transcribed" wrong and `/start` can
 * never re-run Whisper on a recording that has SOME leftover
 * `transcript_text` — which is most of the corpus, since every recording
 * that ever went through the pre-8-Sep pipeline has one, real or not.
 *
 * ── Why this had to be found by dispatching a real recording ─────────────
 *
 * `tsc` is happy: `Boolean(vlog.transcript_text)` typechecks fine.
 * `check-sql-columns.mjs` is happy: no query, no column reference. The
 * dispatch endpoint itself reports success (`{"dispatched":1,"ok":true}`) —
 * the DO's `/start` route always returns 200, because kicking the alarm IS
 * the success condition, not what the alarm goes on to do. The only trace
 * is a `pipeline_events` row saying `skip_if_exists` / `artifact_exists`,
 * which nothing reads unless you go looking for it.
 *
 * A pilot run on one recording — `01KXZMHC1D36RCKNE2V0B47FP0`,
 * `transcript_text: "You"`, `word_count: 0` — found it: `audio_extract`
 * skipped, `transcribe` skipped, `extract` (the read step) correctly wrote
 * nothing because there were no word timings to read. The dispatch that
 * was supposed to fix that recording touched nothing.
 *
 * `pipeline-state.ts` and `reprocess-vlogs`' scope resolution both already
 * draw the right line — real `transcript_words`, not a non-empty string
 * (the `words_missing` bucket exists for exactly this). This file was the
 * one place that line was never drawn, so this check holds it: the
 * `audio_extract` and `transcribe` branches of `artifactExists()` must not
 * test bare truthiness of `transcript_text`.
 *
 * Run: node scripts/check-pipeline-artifact-exists.mjs
 */

import { readFileSync } from 'node:fs'

const FILE = 'workers/pipeline/src/index.ts'
const src = readFileSync(FILE, 'utf8')

// Isolate the function body so a mention of the banned pattern anywhere
// ELSE in the file (a comment explaining the old bug, for instance) doesn't
// trip this — only the live logic inside artifactExists() matters.
const start = src.indexOf('private async artifactExists(')
if (start < 0) {
  console.error(`✗ ${FILE}: artifactExists() not found — did it move or get renamed?`)
  process.exit(1)
}
// Find the matching closing brace by depth-counting from the function's
// opening brace, the same way check-container-server.mjs resolves a
// function body rather than guessing a line range.
const braceStart = src.indexOf('{', start)
let depth = 0, i = braceStart, end = -1
for (; i < src.length; i++) {
  if (src[i] === '{') depth++
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
}
if (end < 0) {
  console.error(`✗ ${FILE}: could not find the end of artifactExists() — unbalanced braces?`)
  process.exit(1)
}
const body = src.slice(braceStart, end + 1)

// Strip comments before scanning — this file's own comment explaining the
// bug quotes the exact banned pattern, and a check that reads comments as
// code is the same mistake `check-dropped-tables.mjs` and
// `check-container-server.mjs` both had to learn not to make.
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}
const codeOnly = stripComments(body)

const errors = []

// The exact regression: `if (vlog.transcript_text) return true` (or the
// equivalent `return Boolean(vlog.transcript_text)`) treats ANY non-empty
// string as proof of a finished transcription.
const bare = /\bvlog\.transcript_text\s*\)/
if (bare.test(codeOnly)) {
  errors.push(
    'artifactExists() tests bare `vlog.transcript_text` truthiness — this is '
    + 'the exact bug that let a stale one-word transcript ("You") block '
    + 'Whisper from ever running again. Route through a real check '
    + '(transcript_words existing) instead.',
  )
}

// The fix must exist: something that actually queries transcript_words.
if (!/transcript_words/.test(src)) {
  errors.push(
    'No reference to `transcript_words` anywhere in the file — '
    + '"already transcribed" cannot be tested without checking for real '
    + 'word timings.',
  )
}

if (errors.length) {
  console.error(`✗ ${FILE}\n`)
  for (const e of errors) console.error(`  ${e}\n`)
  process.exit(1)
}

console.log(`✓ ${FILE}: artifactExists() tests real transcription, not bare transcript_text truthiness.`)
