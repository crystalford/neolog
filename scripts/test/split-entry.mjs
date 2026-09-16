#!/usr/bin/env node
/**
 * Tests for cutting one entry in two
 * (`src/app/api/v2/log/[id]/split/route.ts`).
 *
 * ── Why this is the correction that needs a test ─────────────────────────
 *
 * Every other correction changes a row. This one MAKES one, out of words the
 * operator said, and it is the only place in the product where a new entry's
 * text is derived from an existing entry's text. The invariant the whole read
 * path exists to hold — an entry is a substring of what he actually said — is
 * therefore easiest to break here, and breaking it is invisible: two entries
 * appear, both read plausibly, and nothing in the repo objects.
 *
 * So this holds three things:
 *
 *   the arithmetic   every word ends up in exactly one half, in order, and
 *                    the halves rejoin to the original. A word silently
 *                    dropped at the seam is a word he said that the log no
 *                    longer has.
 *   the timings gate the recording's own timings are used ONLY when the
 *                    entry is still exactly what the transcript says. Cutting
 *                    a rewritten line by transcript word index would put the
 *                    machine's wording back on the page.
 *   the rebuild      a transcript fix rebuilds only `grounded = 1` entries.
 *                    Without that, fixing a misheard word anywhere in the
 *                    original span rewrites both halves from the transcript
 *                    and the split silently comes undone.
 *
 * Run: node scripts/test/split-entry.mjs
 */

import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

// ── The arithmetic, as the route does it ─────────────────────────────────
// `at` is the index of the word the SECOND half starts on, so the halves are
// [0, at) and [at, end).
function cut(text, at) {
  const own = text.trim().split(/\s+/).filter(Boolean)
  if (own.length < 2) return { error: 'one word is not two things' }
  if (!Number.isInteger(at) || at < 1) return { error: 'at_word must be the index of the word the second part starts on' }
  if (at >= own.length) return { error: 'that word is past the end of the entry' }
  return { first: own.slice(0, at).join(' '), second: own.slice(at).join(' ') }
}

const LINE = 'I was thinking about the job again and then the house came up'
const WORDS = LINE.split(' ')

// Every cut point, so a seam that drops a word cannot hide at one index.
for (let at = 1; at < WORDS.length; at++) {
  const r = cut(LINE, at)
  ok(`cut at ${at} produces two halves`, r.first && r.second)
  check(`cut at ${at} loses nothing`, `${r.first} ${r.second}`, LINE)
  check(`cut at ${at} keeps the order`, r.first.split(' ').concat(r.second.split(' ')), WORDS)
  check(`cut at ${at} starts the second half on that word`, r.second.split(' ')[0], WORDS[at])
}

// ── The cuts that are not cuts ───────────────────────────────────────────
ok('a cut before the first word is refused', !!cut(LINE, 0).error)
ok('a cut past the last word is refused', !!cut(LINE, WORDS.length).error)
ok('a negative index is refused', !!cut(LINE, -3).error)
ok('a fractional index is refused', !!cut(LINE, 2.5).error)
ok('one word is not two things', !!cut('yes', 1).error)
// Whitespace is not a word. An entry that came back from the transcript with
// a double space must not gain an empty half at that seam.
check('runs of whitespace collapse rather than becoming a word',
  cut('the  job   again', 1), { first: 'the', second: 'job again' })

// ── What the route actually does ─────────────────────────────────────────
{
  const src = readFileSync('src/app/api/v2/log/[id]/split/route.ts', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  // Nothing writes. Both halves are slices of the entry's own words, or the
  // transcript's — there is no third source for an entry's text.
  ok('no model is called', !/callReasoning|callChat|env\.AI/.test(code))
  ok('the halves are the entry\'s own words joined',
    /own\.slice\(0, at\)\.join\(' '\)/.test(code) && /own\.slice\(at\)\.join\(' '\)/.test(code))

  // The timings path is gated on the entry still BEING the transcript.
  ok('timings need a said: source_ref', /\^said:\(\.\+\):\(\\d\+\)\$/.test(code))
  ok('timings need grounded = 1', /row\.grounded === 1/.test(code))
  ok('timings need the words to join back to the entry exactly',
    /joined !== own\.join\(' '\)/.test(code))
  ok('and a mismatch falls back rather than cutting blind', /words = \[\]/.test(code))

  // The text path refuses to invent a second.
  ok('a text cut gives the new half no span',
    /row\.vlog_id, null, null,/.test(code))
  ok('a text cut ungrounds the half that keeps the row',
    /SET text = \?, grounded = 0/.test(code))

  // A split is not a turn: both halves came out of the same moment.
  ok('both halves keep the original\'s led_from', /row\.led_from, row\.relation/.test(code))

  // Both wordings kept, on both rows — the rule every correction follows.
  check('two revision rows are written',
    (code.match(/INSERT INTO entry_revisions/g) || []).length, 2)

  // The new half's seam is the one read-recording would have written, so
  // reading the recording again skips it instead of writing a third copy.
  ok('the new half claims the seam read-recording would have',
    /`said:\$\{row\.vlog_id\}:\$\{cut\.word_index\}`/.test(code))
}

// ── The other end of it: the rebuild must leave a cut entry alone ────────
{
  const src = readFileSync('src/app/api/v2/vlogs/[id]/transcript-words/route.ts', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok('a transcript fix rebuilds only grounded entries', /AND grounded = 1/.test(code))
}
{
  const src = readFileSync('src/app/api/v2/log/[id]/route.ts', 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok('rewriting a line ungrounds it', /"author = 'operator'", 'grounded = 0'/.test(code))
  ok('merging two entries ungrounds the target',
    /UPDATE log_entries SET text = \?, grounded = 0/.test(code))
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
