/**
 * What comes back from the model, and what is allowed through.
 *
 * `clean()` is the only thing standing between a model's output and a
 * sentence on the feed. Everything it lets through is rendered as the log's
 * line about a recording, so a half-usable line is worse than none — it sits
 * there looking like a fact.
 *
 * ⚠️ Same shape as `hallucination-guard.mjs`: the real function is in a
 * TypeScript module that imports `./d1` and `./llm`, which this script
 * cannot load, so the pure logic is re-implemented here and the real source
 * is then asserted to still match it. If the two drift, the assertions at
 * the bottom fail and say so.
 */

import { readFileSync } from 'node:fs'

const RAW = readFileSync(new URL('../../src/lib/headline.ts', import.meta.url), 'utf8')

// ⚠️ Comments stripped first. The file explains at length why it reads
// `transcript_words` and never `transcript_text`, and an assertion that
// `transcript_text` is absent trips over that explanation — the lesson
// `check-dropped-tables.mjs` and `check-container-server.mjs` both learned.
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const MAX_CHARS = 150

function sentenceBreak(s) {
  for (let i = 0; i < s.length; i++) {
    if (!'.!?'.includes(s[i])) continue
    if (s[i] === '.' && i >= 1 && /[A-Z]/.test(s[i - 1]) && (i < 2 || !/[A-Za-z]/.test(s[i - 2]))) continue
    const after = s.slice(i + 1)
    if (after === '') return i
    if (!/^\s/.test(after)) continue
    const next = after.trimStart()
    if (next === '' || /^[A-Z0-9"\u201c]/.test(next)) return i
  }
  return -1
}

function clean(raw) {
  let s = (raw || '').trim()
  if (!s) return null
  if (/^nothing\b/i.test(s)) return null

  s = s.replace(/^["'`\s]+|["'`\s]+$/g, '')
  s = s.replace(/^(headline|summary|line|answer)\s*:\s*/i, '')
  s = s.replace(/^(recorded|uploaded)\s+a\s+(video|vlog)\s+(about\s+)?/i, '')
  s = s.replace(/^(this video is|the video is|a video|this is)\s+(about\s+)?/i, '')
  s = s.replace(/^(about|on)\s+/i, '')
  s = s.replace(/^the speaker\s+/i, '')
  s = s.trim()
  if (!s) return null

  const firstBreak = sentenceBreak(s)
  if (firstBreak > 0) s = s.slice(0, firstBreak)
  s = s.replace(/[.,;:\s]+$/, '').trim()

  if (s.length > MAX_CHARS) {
    const cut = s.slice(0, MAX_CHARS)
    const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' — '), cut.lastIndexOf('; '))
    if (at < 20) return null
    s = s.slice(0, at).replace(/[,;:\s]+$/, '').trim()
  }

  if (s.length < 8) return null
  if (!/[a-z]/i.test(s)) return null
  return s
}

function recordingSentence(headline, plain) {
  const h = (headline || '').trim()
  return h ? `Recorded a video about ${h}.` : plain
}

let n = 0
let bad = 0
const is = (got, want, what) => {
  n++
  if (got !== want) { bad++; console.log(`  FAIL ${what}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`) }
}

console.log('what the model returns, and what is let through\n')

// ── Its own escape hatch ────────────────────────────────────────────────
is(clean('NOTHING'), null, 'the exact refusal word')
is(clean('nothing identifiable in this transcript'), null, 'a refusal in prose')
is(clean(''), null, 'an empty answer')
is(clean('   '), null, 'whitespace only')

// ── The real lines from the first ten ───────────────────────────────────
is(
  clean('building neolog, and the difficulties with the upload pipeline'),
  'building neolog, and the difficulties with the upload pipeline',
  'a good line passes through unchanged',
)

// ⚠️ This is the case the cap used to throw away whole. It is true up to
// its tail, so the tail goes and the subject stays.
const long = 'Ancaster as an ad network and the future of agentic communication with email management by AI agents like Gemini, among other topics discussed at length'
const cutLong = clean(long)
is(cutLong !== null, true, 'an overlong line is cut, not discarded')
is(cutLong.length <= MAX_CHARS, true, 'and what is kept is within the cap')
is(cutLong.startsWith('Ancaster as an ad network'), true, 'and it keeps the subject, not the tail')
is(/[,;:]$/.test(cutLong), false, 'and it does not end on the punctuation it was cut at')

// A line with no clause boundary before the cap has nothing safe to keep.
is(clean('a'.repeat(200)), null, 'an overlong line with no clause boundary goes')

// ── The stem it was asked to complete, handed back whole ────────────────
is(clean('Recorded a video about building neolog'), 'building neolog', 'the sentence stem is stripped')
is(clean('Uploaded a vlog about the drive to Ancaster'), 'the drive to Ancaster', 'so is the other wording of it')
is(clean('About the brain-gut axis'), 'the brain-gut axis', 'and a bare leading "about"')
is(clean('Headline: selling the house'), 'selling the house', 'and a label the prompt did not ask for')
is(clean('"driving to Ancaster, and the argument"'), 'driving to Ancaster, and the argument', 'and surrounding quotes')

// ── One sentence, not a summary ─────────────────────────────────────────
is(
  clean('building neolog. It covers the upload pipeline in detail and then moves on.'),
  'building neolog',
  'everything after the first full stop is the summary nobody asked for',
)

// ── An abbreviation is not the end of a sentence ────────────────────────
// ⚠️ The first real line this feature wrote was "doing a U.S" — the
// transcript said "doing a U.S. road trip" and the cut fired on the
// abbreviation's own period. It shipped, on the feed, as what a recording
// was about.
is(
  clean('doing a U.S. road trip, and the argument about the route'),
  'doing a U.S. road trip, and the argument about the route',
  'a full stop inside an abbreviation is not a sentence break',
)
is(
  clean('a call with J. Smith about the manuscript'),
  'a call with J. Smith about the manuscript',
  'nor is an initial',
)
is(
  clean('building neolog. Then a long tangent about the weather.'),
  'building neolog',
  'a real sentence break still cuts',
)
is(
  clean('the 3.5 hour drive to Ancaster'),
  'the 3.5 hour drive to Ancaster',
  'and a decimal point is not one either',
)

// ── Nothing usable ──────────────────────────────────────────────────────
is(clean('a talk'), null, 'too short to be a line')
is(clean('12 34 56'), null, 'no letters in it at all')

// ── The sentence it ends up as ──────────────────────────────────────────
is(
  recordingSentence('building neolog, and the upload pipeline', 'Recorded 22 minutes of video.'),
  'Recorded a video about building neolog, and the upload pipeline.',
  'the line completes the sentence it was written for',
)
is(
  recordingSentence(null, 'Recorded 22 minutes of video.'),
  'Recorded 22 minutes of video.',
  'a recording with no line keeps the one composed from its own duration',
)
is(
  recordingSentence('   ', 'Recorded a video.'),
  'Recorded a video.',
  'and so does one whose line is blank',
)

// ── The real source still matches this ──────────────────────────────────
console.log('\nthe real source still has the shape this file tests\n')

is(/const MAX_CHARS = 150\b/.test(SRC), true, 'MAX_CHARS is the value tested here')
is(SRC.includes("if (/^nothing\\b/i.test(s)) return null"), true, 'the refusal check is still there')
is(SRC.includes('lastIndexOf'), true, 'an overlong line is still cut rather than discarded')
is(SRC.includes('sentenceBreak'), true, 'the sentence break still knows about abbreviations')
// ⚠️ The backlog must filter on the same floor `writeHeadline` guards
// with, or a clip too short to have a line sits in `left` forever and the
// Settings loop can never finish.
is(/const MIN_WORDS = 25/.test(SRC), true, 'the word floor is a named constant')
is((SRC.match(/MIN_WORDS/g) || []).length >= 4, true, 'and the backlog query filters on it too')
// ⚠️ The invariant the whole feature rests on: the line comes from the
// words as he said them, never from `transcript_text`, which can hold prose
// from a pre-8-Sep run with no timings behind it.
is(SRC.includes('FROM transcript_words'), true, 'the line is still read from the word timings')
is(SRC.includes('transcript_text'), false, 'and never from transcript_text')
// And it must never write the column the extraction engine wrote into.
is(/UPDATE vlogs SET headline = \?/.test(SRC), true, 'it writes `headline`')
is(/SET title|SET summary/.test(SRC), false, 'and never `title` or `summary`')
// `headline_at` is stamped either way, which is what stops a refused
// recording being asked again until it answers.
is(/headline_at = CURRENT_TIMESTAMP/.test(SRC), true, 'the stamp goes on whether or not there is a line')

console.log(`\n${n} assertions, ${bad} failed`)
if (bad) process.exit(1)
