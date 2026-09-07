#!/usr/bin/env node
/**
 * Tests for note splitting.
 *
 * The failure that matters is a part containing words he did not say. The
 * design makes that structurally impossible — the model returns anchors, not
 * text — so these test the anchor-locating and the refusals.
 */
// Not imported: src/lib/split-note.ts pulls in the model abstraction through
// the '@/' alias, which does not resolve outside Next. The value is asserted
// against the source instead, below.

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : (fail++, console.error('  FAIL ' + n)) }

// Re-implement the pure half so it can be tested without a model.
function findAnchor(haystack, anchor, from) {
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ')
  const a = norm(anchor).trim()
  if (a.length < 8) return -1
  return norm(haystack).indexOf(a, from)
}
function sliceAt(transcript, anchors) {
  const cuts = [0]; let from = 0
  for (const a of anchors.slice(1)) {
    const i = findAnchor(transcript, a, from + 1)
    if (i < 0) continue
    cuts.push(i); from = i
  }
  if (cuts.length < 2) return [transcript.trim()]
  const parts = []
  for (let i = 0; i < cuts.length; i++) {
    const t = transcript.slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : transcript.length).trim()
    if (t.split(/\s+/).filter(Boolean).length < 12) continue
    parts.push(t)
  }
  return parts.length >= 2 ? parts : [transcript.trim()]
}

const t = "so I was thinking about the mushroom farm and whether it is actually the right move for me right now. " +
          "and then the other thing is the deck, the ledger board is still sitting there waiting for me to get to it. " +
          "oh and I need to remember to call Freddie back about the thing he mentioned on Tuesday afternoon."

const parts = sliceAt(t, [
  'so I was thinking about the mushroom',
  'and then the other thing is the deck',
  'oh and I need to remember to call Freddie',
])
ok('three anchors give three parts', parts.length === 3)
ok('every part is verbatim in the transcript',
   parts.every(p => t.toLowerCase().includes(p.toLowerCase().slice(0, 40))))
ok('the parts reassemble to the whole', parts.join(' ').replace(/\s+/g,' ') === t.replace(/\s+/g,' ').trim())

// An anchor the model invented is simply not found.
const invented = sliceAt(t, [
  'so I was thinking about the mushroom',
  'I have always been passionate about fungi cultivation',
])
ok('an invented anchor produces no seam', invented.length === 1)

// A too-short anchor cannot match anything.
ok('a tiny anchor is refused', findAnchor(t, 'and', 0) === -1)

// Slivers are not thoughts.
const sliver = sliceAt(t, ['so I was thinking about the mushroom', 'afternoon.'])
ok('a sliver is dropped rather than kept as a part', !sliver.some(p => p.split(/\s+/).length < 12))

// The floor lives in the source; check the source rather than a copy of it,
// so lowering it there fails here.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../../src/lib/split-note.ts', import.meta.url), 'utf8')
const floor = Number(src.match(/MIN_WORDS_TO_SPLIT = (\d+)/)?.[1])
ok(`the floor is high enough that a short note is left alone (${floor})`, floor >= 100)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
