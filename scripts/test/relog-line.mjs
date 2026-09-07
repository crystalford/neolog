#!/usr/bin/env node
/**
 * Tests for the two decisions in relog that put words in the operator's
 * mouth if they go wrong (src/lib/relog.ts, src/lib/validator.ts — inlined
 * here, same as the other suites in this directory).
 *
 *   the strict grounding check   decides whether a passage read out of
 *                                `transcript_words` may be attributed to
 *                                him. `isGrounded` — one matching 4-gram —
 *                                is deliberately NOT this function: a
 *                                sentence with one real 4-gram and nine
 *                                invented ones passes it.
 *   the sentence cut             decides where a spoken stretch stops being
 *                                the line and starts being the detail. §0
 *                                rule 4: every line is a sentence.
 *
 * Run: node scripts/test/relog-line.mjs
 */

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

// ── src/lib/validator.ts, inlined ────────────────────────────────────────
const norm = s => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
function fourGrams(t) {
  const w = norm(t).split(' ').filter(Boolean)
  const set = new Set()
  for (let i = 0; i <= w.length - 4; i++) set.add(w.slice(i, i + 4).join(' '))
  return set
}
function isGrounded(field, grams) {
  const w = norm(field).split(' ').filter(Boolean)
  if (w.length < 4) return false
  for (let i = 0; i <= w.length - 4; i++) if (grams.has(w.slice(i, i + 4).join(' '))) return true
  return false
}
function isFullyGrounded(field, grams) {
  const w = norm(field).split(' ').filter(Boolean)
  if (w.length < 4) return false
  for (let i = 0; i <= w.length - 4; i++) if (!grams.has(w.slice(i, i + 4).join(' '))) return false
  return true
}

// ── src/lib/relog.ts cutSpokenLine, inlined ──────────────────────────────
const MIN_LINE_WORDS = 6, MAX_LINE_WORDS = 60, MAX_SPAN_WORDS = 200, MAX_DETAIL_CHARS = 1200
function cutSpokenLine(words) {
  const clean = words.map(w => w.trim()).filter(Boolean).slice(0, MAX_SPAN_WORDS)
  if (clean.length < MIN_LINE_WORDS) return null
  const head = clean.slice(0, MAX_LINE_WORDS)
  let end = head.length
  for (let i = head.length - 1; i >= MIN_LINE_WORDS - 1; i--) {
    if (/[.!?]["'”’)\]]?$/.test(head[i])) { end = i + 1; break }
  }
  return {
    line: clean.slice(0, end).join(' '),
    rest: clean.slice(end).join(' ').slice(0, MAX_DETAIL_CHARS),
  }
}

console.log('relog: whose words end up on the log')

// ── The strict check ─────────────────────────────────────────────────────
const TRANSCRIPT =
  'so the thing I keep coming back to is that nobody actually reads the ' +
  'terms they just click through and then act surprised later. that is the ' +
  'whole shape of it.'
const G = fourGrams(TRANSCRIPT)

// A contiguous run of the recording's own words. This is what a span slice
// is, and it must be attributable.
ok('a verbatim run passes the strict check',
  isFullyGrounded('nobody actually reads the terms they just click through', G))

// The failure the loose check cannot see: real opening, invented ending.
const HALF_INVENTED = 'nobody actually reads the terms and that is a moral failure of our age'
ok('one real 4-gram passes the LOOSE check', isGrounded(HALF_INVENTED, G))
ok('...and is REFUSED by the strict check', !isFullyGrounded(HALF_INVENTED, G))

// Reordering his own words is not something he said.
ok('reordered words are refused',
  !isFullyGrounded('they just click through and nobody actually reads the terms', G))

// Padding a real span with a connective is not something he said.
ok('an inserted word is refused',
  !isFullyGrounded('nobody actually really reads the terms they just click through', G))

// Punctuation and case are not differences.
ok('punctuation and case do not matter',
  isFullyGrounded('Nobody actually reads the terms — they just click through!', G))

// Too short to carry evidence at all.
ok('under four words is refused', !isFullyGrounded('nobody actually reads', G))

// A recording with no transcript_text yields no grams; nothing can pass.
ok('an empty transcript grounds nothing', !isFullyGrounded('nobody actually reads the terms', fourGrams('')))

// ── The sentence cut ─────────────────────────────────────────────────────
const W = s => s.split(' ')

check('a short whole thought is the line, with no detail',
  cutSpokenLine(W('I think the whole thing was a mistake from the start.')),
  { line: 'I think the whole thing was a mistake from the start.', rest: '' })

check('fewer than six words is not a line',
  cutSpokenLine(W('I think it was.')), null)

// Two sentences, both under the cap: BOTH are the line. "As many whole
// sentences as fit" — not "the first one".
check('two short sentences both fit on the line',
  cutSpokenLine(W('It was a mistake from the start. I knew that then.')),
  { line: 'It was a mistake from the start. I knew that then.', rest: '' })

// A sentence ends at word 8; the rest runs past the cap. The line stops at
// the last sentence end that fits and the remainder becomes the detail.
{
  const words = W('I got it wrong and I knew it then.').concat(W('x'.repeat(1)).concat(Array(70).fill('and')))
  const got = cutSpokenLine(words)
  check('the line stops at a sentence end', got.line, 'I got it wrong and I knew it then.')
  ok('the remainder becomes the detail', got.rest.startsWith('x and and'))
  ok('the detail is capped', got.rest.length <= MAX_DETAIL_CHARS)
}

// Whisper does produce long unbroken runs. The cap is the cut, and it is
// still only his words.
{
  const got = cutSpokenLine(Array(120).fill('and'))
  check('an unpunctuated run is cut at the cap', got.line.split(' ').length, MAX_LINE_WORDS)
  ok('and the rest is kept', got.rest.length > 0)
}

// Nothing is ever read past MAX_SPAN_WORDS, so a four-minute span cannot
// drag a whole recording onto one row.
{
  const got = cutSpokenLine(Array(4000).fill('word'))
  const total = got.line.split(' ').length + (got.rest ? got.rest.split(' ').length : 0)
  ok('never more than MAX_SPAN_WORDS is used', total <= MAX_SPAN_WORDS)
}

// A quote mark after the full stop still ends the sentence.
check('a closing quote after the stop still ends the line',
  cutSpokenLine(W('He said the whole thing was fine." Then he left the room and never came back')).line,
  'He said the whole thing was fine."')

// Empty and whitespace-only words are dropped, not counted toward the floor.
check('blank words do not pad out the floor',
  cutSpokenLine(['I', '', ' ', 'was', 'wrong']), null)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
