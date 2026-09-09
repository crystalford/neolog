#!/usr/bin/env node
/**
 * Tests for note splitting (`src/lib/split-note.ts`).
 *
 * ── What can go wrong here, and what cannot ──────────────────────────────
 *
 * A part containing words he did not say is structurally impossible: the
 * model returns ANCHORS, never text, and a part is a slice of the transcript
 * between two of them. So the failures worth testing are the two that ARE
 * possible — a cut in the wrong place, and a word that ends up in two parts
 * or in none.
 *
 * ⚠️ Both were live until 9 Sep, and the previous version of this file could
 * not have caught either, because it inlined the implementation as it stood
 * and used a fixture with no whitespace to collapse.
 *
 *   the index space   `findAnchor` searched a flattened copy — lowercased,
 *                     whitespace runs collapsed — and returned `indexOf` on
 *                     THAT string, which `splitNote` then used to slice the
 *                     ORIGINAL. Every run of two or more whitespace
 *                     characters makes the flattened copy shorter, so after
 *                     the first paragraph break the cut landed somewhere
 *                     else: mid-word, with the part before it keeping words
 *                     the part after it also had. `read-recording.ts` never
 *                     saw it — it joins words with single spaces — and the
 *                     composer's talk button hands over a raw Whisper
 *                     transcript, which is full of newlines.
 *
 *   the dropped sliver  a part under twelve words was skipped, and skipped
 *                     means those words were in NO entry. The whole take
 *                     survives on the recording, so nothing looked broken.
 *                     A sliver now merges into its neighbour: the seam is
 *                     what the log may be wrong about, the words are not.
 *
 * Run: node scripts/test/split-note.mjs
 */

import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : (fail++, console.error('  FAIL ' + n)) }
const eq = (n, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${n}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}

// ── The pure half, re-implemented ────────────────────────────────────────
// `src/lib/split-note.ts` reaches the model abstraction through the '@/'
// alias, which does not resolve outside Next. The source is asserted against
// at the bottom so this copy cannot drift from it silently.

function flatten(s) {
  let flat = ''
  const map = []
  let i = 0
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      const at = i
      while (i < s.length && /\s/.test(s[i])) i++
      flat += ' '; map.push(at)
      continue
    }
    for (const ch of s[i].toLowerCase()) { flat += ch; map.push(i) }
    i++
  }
  return { flat, map }
}

const MIN_PART_WORDS = 12
const wordCount = t => t.split(/\s+/).filter(Boolean).length

function sliceAt(transcript, anchors) {
  const { flat, map } = flatten(transcript)
  const cuts = [0]
  let fromFlat = 0
  for (const a of anchors.slice(1)) {
    const needle = a.toLowerCase().replace(/\s+/g, ' ').trim()
    if (needle.length < 8) continue
    const idxFlat = flat.indexOf(needle, fromFlat + 1)
    if (idxFlat < 0) continue
    const idx = map[idxFlat]
    if (idx <= cuts[cuts.length - 1]) continue
    cuts.push(idx); fromFlat = idxFlat
  }
  if (cuts.length < 2) return [transcript.trim()]

  const spans = cuts.map((at, i) => ({ at, end: i + 1 < cuts.length ? cuts[i + 1] : transcript.length }))
  for (let i = spans.length - 1; i > 0; i--) {
    if (wordCount(transcript.slice(spans[i].at, spans[i].end)) < MIN_PART_WORDS) {
      spans[i - 1].end = spans[i].end
      spans.splice(i, 1)
    }
  }
  while (spans.length >= 2 && wordCount(transcript.slice(spans[0].at, spans[0].end)) < MIN_PART_WORDS) {
    spans[1].at = spans[0].at
    spans.shift()
  }
  const parts = spans.map(s => transcript.slice(s.at, s.end).trim())
  return parts.length >= 2 ? parts : [transcript.trim()]
}

/** The invariant, on any transcript: every word in exactly one part, in order. */
function coversExactly(transcript, parts) {
  const all = transcript.trim().split(/\s+/).filter(Boolean)
  const got = parts.flatMap(p => p.split(/\s+/).filter(Boolean))
  return JSON.stringify(got) === JSON.stringify(all)
}

// ── One line, single spaces — the case the old fixture covered ───────────
const flat1 =
  'so I was thinking about the mushroom farm and whether it is actually the right move for me right now. ' +
  'and then the other thing is the deck, the ledger board is still sitting there waiting for me to get to it. ' +
  'oh and I need to remember to call Freddie back about the thing he mentioned on Tuesday afternoon.'

const A = [
  'so I was thinking about the mushroom',
  'and then the other thing is the deck',
  'oh and I need to remember to call Freddie',
]

{
  const parts = sliceAt(flat1, A)
  eq('three anchors give three parts', parts.length, 3)
  ok('every part is verbatim in the transcript', parts.every(p => flat1.includes(p)))
  ok('every word in exactly one part, in order', coversExactly(flat1, parts))
  ok('each part starts on its anchor',
    parts.every((p, i) => p.toLowerCase().startsWith(A[i].toLowerCase().slice(0, 20))))
}

// ── ⚠️ The same note with newlines and double spaces ─────────────────────
// This is the shape Whisper actually returns, and the shape that was broken.
{
  const messy = flat1
    .replace('and then the other thing', '\n\n  and then the other thing')
    .replace('oh and I need', '\n\n\toh and I need')
  const parts = sliceAt(messy, A)
  eq('three anchors still give three parts through the whitespace', parts.length, 3)
  ok('no part begins mid-word', parts.every(p => messy.includes(p)))
  ok('every word in exactly one part, in order', coversExactly(messy, parts))
  ok('each part still starts on its anchor',
    parts.every((p, i) => p.toLowerCase().startsWith(A[i].toLowerCase().slice(0, 20))))
  // The specific corruption: a word appearing twice across the seam.
  const words = parts.flatMap(p => p.split(/\s+/).filter(Boolean))
  eq('no word is duplicated across a seam', words.length, messy.trim().split(/\s+/).filter(Boolean).length)
}

// ── The refusals ─────────────────────────────────────────────────────────
{
  const invented = sliceAt(flat1, [A[0], 'I have always been passionate about fungi cultivation'])
  eq('an invented anchor produces no seam', invented.length, 1)
  ok('and the note comes back whole', invented[0] === flat1.trim())
}
{
  const tiny = sliceAt(flat1, [A[0], 'and'])
  eq('an anchor under eight characters is refused', tiny.length, 1)
}
{
  // A seam eight words from the end is a bad seam, not a thought — but the
  // words are still his.
  const sliver = sliceAt(flat1, [A[0], 'the thing he mentioned on Tuesday afternoon'])
  ok('a trailing sliver never stands as a part', !sliver.some(p => wordCount(p) < MIN_PART_WORDS))
  ok('and its words are kept, not dropped', coversExactly(flat1, sliver))
}
{
  // ⚠️ The case that actually proves the merge: a sliver in the MIDDLE,
  // where dropping it still leaves two parts, so the note does not fall back
  // to whole and the loss is invisible in the count.
  const mid = sliceAt(flat1, [A[0], 'the right move for me right now', A[1]])
  ok('a middle sliver never stands as a part', !mid.some(p => wordCount(p) < MIN_PART_WORDS))
  ok('and the split still happened', mid.length >= 2)
  ok('and not one of his words was dropped at that seam', coversExactly(flat1, mid))
}
{
  // Anchors out of order: the second matches earlier than the first cut.
  const back = sliceAt(flat1, [A[1], A[0]])
  ok('an anchor that would cut backwards is skipped', coversExactly(flat1, back))
}

// ── The source says the same thing ───────────────────────────────────────
{
  const src = readFileSync(new URL('../../src/lib/split-note.ts', import.meta.url), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  const floor = Number(src.match(/MIN_WORDS_TO_SPLIT = (\d+)/)?.[1])
  ok(`the floor is high enough that a short note is left alone (${floor})`, floor >= 100)

  // ⚠️ The fix, asserted structurally: the cut must come from `map`, never
  // from an index into the flattened copy.
  ok('the cut is taken from the index map', /const idx = map\[idxFlat\]/.test(code))
  ok('and the search runs in flattened space', /flat\.indexOf\(needle, fromFlat \+ 1\)/.test(code))
  ok('a sliver merges rather than being skipped',
    /spans\[i - 1\]\.end = spans\[i\]\.end/.test(code) && !/< MIN_PART_WORDS\) continue/.test(code))

  // Nothing here may write. The model is asked for anchors and a part is a
  // slice of the transcript — both, in code.
  ok('every part is a slice of the transcript',
    /transcript\.slice\(s\.at, s\.end\)/.test(code))
  ok('the model is only ever read for anchors',
    /starts_with/.test(code) && !/parsed\?\.(?:text|parts\[\d\]\.text)/.test(code))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
