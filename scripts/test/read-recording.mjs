#!/usr/bin/env node
/**
 * Tests for cutting a recording into passages (src/lib/read-recording.ts,
 * inlined, same as the other suites here).
 *
 * This is the whole of how a recording reaches the log now — no model, no
 * extraction, just his words cut at his own pauses. So the things that must
 * never happen are about the WORDS, not about the boundaries:
 *
 *   no word is dropped        every word of the transcript is in exactly one
 *                             passage, in order
 *   no word is invented       the joined passages are the transcript
 *   nothing is placed blind   a recording with no word timings writes
 *                             nothing at all
 *
 * A boundary in the wrong place is a merge or a split away. A missing or
 * invented word is not recoverable, which is why the assertions are here.
 *
 * Run: node scripts/test/read-recording.mjs
 */

import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

const PAUSE_SECONDS = 2.5
const MIN_PASSAGE_WORDS = 8
const MAX_PASSAGE_WORDS = 90
const HARD_MAX_WORDS = 140
const ENDS_SENTENCE = /[.!?]["'”’)\]]?$/

function cutIntoPassages(words) {
  const out = []
  let cur = []
  const flush = () => {
    if (!cur.length) return
    const text = cur.map(w => w.word).join(' ').replace(/\s+/g, ' ').trim()
    if (text) out.push({ text, start: cur[0].start_time, end: cur[cur.length-1].end_time, first_index: cur[0].word_index, words: cur.length })
    cur = []
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; cur.push(w)
    const next = words[i + 1]
    if (!next) break
    const gap = next.start_time - w.end_time
    const long = cur.length >= MAX_PASSAGE_WORDS
    if (gap >= PAUSE_SECONDS && cur.length >= MIN_PASSAGE_WORDS) { flush(); continue }
    if (long && ENDS_SENTENCE.test(w.word)) { flush(); continue }
    if (cur.length >= HARD_MAX_WORDS) { flush(); continue }
  }
  flush()
  const merged = []
  for (const p of out) {
    const last = merged[merged.length - 1]
    if (p.words < MIN_PASSAGE_WORDS && last && last.words + p.words <= HARD_MAX_WORDS) {
      last.text = `${last.text} ${p.text}`; last.end = p.end; last.words += p.words; continue
    }
    merged.push(p)
  }
  return merged
}

/** Build a plausible word stream: `gapsAfter` maps word index → pause after it. */
function speak(sentence, { gapsAfter = {}, rate = 0.35, from = 0 } = {}) {
  const words = []
  let t = from
  sentence.split(/\s+/).filter(Boolean).forEach((w, i) => {
    words.push({ word: w, start_time: +t.toFixed(2), end_time: +(t + rate).toFixed(2), word_index: i })
    t += rate + (gapsAfter[i] || 0)
  })
  return words
}

console.log('reading a recording: his words, cut at his own silence')

const LONG = ('so the thing I keep coming back to is that nobody actually reads the terms they just '
  + 'click through and then act surprised later that is the whole shape of it and I think it '
  + 'explains most of what happened at the last place too').trim()

// ── Nothing is lost, ever ────────────────────────────────────────────────
{
  const words = speak(LONG, { gapsAfter: { 12: 3.0, 24: 4.0 } })
  const ps = cutIntoPassages(words)
  ok('it cuts into more than one passage', ps.length >= 2)
  check('every word is in exactly one passage',
    ps.reduce((n, p) => n + p.words, 0), words.length)
  check('and the passages joined ARE the transcript',
    ps.map(p => p.text).join(' '), words.map(w => w.word).join(' '))
  ok('the passages are in order',
    ps.every((p, i) => i === 0 || p.first_index > ps[i - 1].first_index))
  ok('each carries the second it was said', ps.every(p => typeof p.start === 'number'))
}

// ── The cut is his silence, not a guess ──────────────────────────────────
{
  const words = speak(LONG, { gapsAfter: { 12: 3.0 } })
  const ps = cutIntoPassages(words)
  check('a pause after word 12 ends the passage there', ps[0].words, 13)
}
{
  const words = speak(LONG, {})   // said in one breath
  const ps = cutIntoPassages(words)
  check('no pause, and it stays one passage', ps.length, 1)
}
{
  // A pause too early to be a boundary must not leave a fragment on the log.
  const words = speak(LONG, { gapsAfter: { 2: 4.0 } })
  const ps = cutIntoPassages(words)
  ok('a three-word fragment is not an entry', ps.every(p => p.words >= MIN_PASSAGE_WORDS))
  check('and its words are still all there',
    ps.map(p => p.text).join(' '), words.map(w => w.word).join(' '))
}

// ── The ceiling, for a recording with neither pauses nor punctuation ─────
{
  const words = speak(Array(400).fill('and').join(' '), {})
  const ps = cutIntoPassages(words)
  ok('an unbroken 400-word stretch is still cut', ps.length >= 2)
  ok('and no passage exceeds the ceiling', ps.every(p => p.words <= HARD_MAX_WORDS))
  check('with nothing lost', ps.reduce((n, p) => n + p.words, 0), 400)
}

// ── Determinism: the same recording always reads the same way ────────────
{
  const words = speak(LONG, { gapsAfter: { 12: 3.0, 24: 4.0 } })
  const a = cutIntoPassages(words)
  const b = cutIntoPassages(words)
  check('reading twice gives the same passages', a.map(p => p.first_index), b.map(p => p.first_index))
  // That is what makes source_ref stable, and the write idempotent.
  ok('so the source_ref of each is stable', a.every((p, i) => p.first_index === b[i].first_index))
}

// ── Nothing at all, rather than something placed blind ───────────────────
check('no words means no passages', cutIntoPassages([]), [])

// The cutter never DROPS anything — four words come back as four words,
// because throwing away the only thing he said would be the one
// unrecoverable failure. Refusing to write is the write path's job, and it
// refuses on the same constant.
{
  const ps = cutIntoPassages(speak('too short to keep'))
  check('a four-word recording is not silently discarded here', ps.length, 1)
  const src = readFileSync('src/lib/read-recording.ts', 'utf8')
  ok('and readRecording refuses to write it',
    /words\.length\s*<\s*MIN_PASSAGE_WORDS/.test(src))
  ok('writing nothing rather than dating it by guess',
    /no_words: true/.test(src))
  // A recording with no word timings must never fall back to splitting the
  // plain transcript — every entry would then carry an invented second. The
  // comments say so; this checks the CODE does, with them stripped out.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  ok('and no code path reads transcript_text', !/transcript_text/.test(code))

  // The model decides WHERE the seams are and nothing else. It reaches this
  // file only through splitNote, which answers with verbatim anchors and is
  // incapable of returning prose — so an entry's text can only ever come
  // from joining words. These two assertions are that contract:
  ok('the only model use is the splitter', !/callReasoning|callChat/.test(code))
  ok('and every passage text is words joined, never model output',
    !/text:\s*(?!words|clean|cur|slice)[a-z]*\.?(?:response|output|content)/i.test(code))
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
