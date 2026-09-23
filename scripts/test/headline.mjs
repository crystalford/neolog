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

// The prompt's own examples, mirrored from the source — `clean()` must never
// let one of them through as a headline.
const EXAMPLE_TEXT = new Set([
  'keeping bees over the winter, and losing the second hive',
  'the ferry timetable changing, and rebooking the Tuesday crossing',
  'a knee injury, and how it changed the way I walk uphill',
  'An interesting discussion of various topics',
  'Algorithms, attention and culture, and their impact on economies and society',
  // Retired, and still refused — two of these reached the feed as headlines
  // on real recordings before the examples were replaced.
  'building neolog, and the difficulties with the upload pipeline',
  'driving to Ancaster, and whether to sell the house',
  'the brain-gut axis, and how it shows up in emotional regulation',
].map(e => e.toLowerCase()))

const OPINION = new RegExp(
  '\\b(' + [
    'interesting', 'fascinating', 'compelling', 'insightful', 'profound',
    'thought-provoking', 'powerful', 'remarkable', 'notable', 'noteworthy',
    'important', 'significant', 'valuable', 'worthwhile', 'worth watching',
    'great', 'excellent', 'brilliant', 'wonderful', 'beautiful', 'amazing',
    'boring', 'dull', 'trivial', 'pointless', 'rambling',
    'candid', 'honest', 'raw', 'moving', 'touching',
  ].join('|') + ')\\b', 'i',
)

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself|we|we're|our|ours|us)\b/i

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
  s = s.replace(/^(recorded|recording|uploaded|uploading)\s+an?\s+(video|vlog)\s+(about\s+)?/i, '')
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
  if (EXAMPLE_TEXT.has(s.toLowerCase())) return null
  if (OPINION.test(s)) return null
  if (FIRST_PERSON.test(s)) return null
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

// ── The real lines from the corpus ──────────────────────────────────────
// ⚠️ Not one of the prompt's examples, retired or current. This assertion
// used to use "building neolog, and the difficulties with the upload
// pipeline", which is now refused on purpose — see the echo section below.
is(
  clean('an inefficient delivery of a $5 subway order across the city'),
  'an inefficient delivery of a $5 subway order across the city',
  'a good line passes through unchanged',
)
is(
  clean('gig work and its ambiguousness about predestination'),
  'gig work and its ambiguousness about predestination',
  'and so does another',
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
is(clean('Recorded a video about the manuscript'), 'the manuscript', 'the sentence stem is stripped')
is(clean('Uploaded a vlog about the drive to Ancaster'), 'the drive to Ancaster', 'so is the other wording of it')
is(clean('Recording a video about halfway to fruit land'), 'halfway to fruit land', 'and the present-participle form of it')
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

// ── An example is not a reading ─────────────────────────────────────────
// ⚠️ A ten-for-ten batch came back with two lines that were the prompt's
// own examples, word for word. An echo of the instructions is
// indistinguishable from a reading of the transcript, and a line the model
// copied out of its instructions is a line the log invented about his life.
is(
  clean('keeping bees over the winter, and losing the second hive'),
  null,
  'a good example, handed straight back, is refused',
)
is(
  clean('An interesting discussion of various topics'),
  null,
  'and so is a bad one',
)
is(
  clean('Keeping Bees Over The Winter, And Losing The Second Hive'),
  null,
  'and case does not get one past',
)
// ⚠️ The two that actually reached the feed. Replacing the examples stops
// new echoes; only refusing the retired strings finds the ones written down.
is(
  clean('building neolog, and the difficulties with the upload pipeline'),
  null,
  'a retired example is refused too',
)
is(
  clean('driving to Ancaster, and whether to sell the house'),
  null,
  'including the other one that reached a real recording',
)

// ── A verdict is not a description ──────────────────────────────────────
// ⚠️ A real batch returned "a couple of very interesting videos". The
// prompt forbids judging, and the prompt is not an enforcement: §0 rule 2
// says the log never comments, and "interesting" is the log telling him
// which of his recordings were worth making.
is(clean('a couple of very interesting videos'), null, 'the line that shipped this guard')
is(clean('a fascinating conversation about the house'), null, 'and any other verdict')
is(clean('a raw, honest account of the week'), null, 'including the flattering kind')
is(
  clean('the drive to Ancaster, and the argument in the car'),
  'the drive to Ancaster, and the argument in the car',
  'a description with no verdict in it still passes',
)

// ── The log does not speak as him ───────────────────────────────────────
// ⚠️ A good batch returned "my struggles with gut health", "my life, a
// train wreck" and "my struggles with structure and productivity". All true
// readings, all the log writing in HIS voice — against the promise at the
// top of this product: it never puts words in your mouth.
is(clean('my struggles with gut health and its impact on work'), null, 'first person in the log\u2019s line')
is(clean('my life, a train wreck'), null, 'including the blunt kind')
is(clean('the drive we took to Ancaster'), null, 'and the plural')
is(
  clean('struggles with gut health, and how it affects the work'),
  'struggles with gut health, and how it affects the work',
  'the same fact with nobody impersonated still passes',
)
// ⚠️ And it must not fire on a word that merely contains one.
is(
  clean('the ferry timetable, and mineral rights in Ancaster'),
  'the ferry timetable, and mineral rights in Ancaster',
  '\u201cmineral\u201d is not \u201cmine\u201d',
)
is(
  clean('building the database, and losing progress on multiple projects'),
  'building the database, and losing progress on multiple projects',
  'and a real line with none of it is untouched',
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
// ⚠️ The examples must stay about subjects he has never recorded. An example
// drawn from his own life cannot be told apart from a reading of it.
is(SRC.includes('EXAMPLE_TEXT.has'), true, 'an answer matching an example is still refused')
is(SRC.includes('OPINION.test'), true, 'and an answer carrying a verdict is too')
is(SRC.includes('FIRST_PERSON.test'), true, 'and one written in his voice')
// ⚠️ The LIVE examples only. `RETIRED_EXAMPLES` sits between them and
// holds exactly these words on purpose — they are what a stale echo is
// matched against, and nothing is ever removed from that list.
is(/neolog|Ancaster|brain-gut/i.test(SRC.slice(SRC.indexOf('const EXAMPLES'), SRC.indexOf('const RETIRED_EXAMPLES'))), false,
   'and no live example is drawn from a subject of his')
is(SRC.includes('const RETIRED_EXAMPLES'), true, 'a retired example is still matched against')
is(SRC.includes('export async function recleanHeadlines'), true,
   'and a line already written can be re-read against the current rules')

console.log(`\n${n} assertions, ${bad} failed`)
if (bad) process.exit(1)
