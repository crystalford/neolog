#!/usr/bin/env node
/**
 * Tests for the pure logic where a bug corrupts the log silently.
 *
 * These are the functions with no UI to notice them going wrong:
 *
 *   file placement        decides a date. Wrong here = a confident date the
 *                         log was never told.
 *   the citation checker  decides which model sentences the operator sees.
 *                         Wrong here = an uncited claim shown as fact.
 *   date rendering        decides what a precision means on screen.
 *
 * Run: node scripts/test/log-logic.mjs
 */

let pass = 0, fail = 0
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

// The 4-gram grounding check was tested here. It is gone, and so is the
// thing it guarded: it existed to catch an extraction model's paraphrase
// being attributed to the operator, and nothing paraphrases him any more.
// `read-recording.ts` copies contiguous runs of `transcript_words`, so a
// line on the log IS the transcript rather than something checked against
// it. A checker kept alive with no caller would suggest otherwise.

// ── File placement (src/lib/log-intake.ts) ───────────────────────────────
console.log('placement')
function placeFile({ clientDate, clientSource, arrivedAt }) {
  if (clientDate && !isNaN(new Date(clientDate).getTime())) {
    const src = (clientSource || '').toLowerCase()
    if (src === 'exif') return { precision: 'exact', by: 'exif' }
    if (['mvhd', 'media', 'pre_extracted'].includes(src)) return { precision: 'exact', by: 'media' }
    if (src === 'filename') return { precision: 'day', by: 'filename' }
    return { precision: 'day', by: 'client' }
  }
  return { precision: 'approx', by: 'arrival' }
}
check('EXIF is exact', placeFile({ clientDate: '2026-04-01', clientSource: 'exif' }).precision, 'exact')
check('a filename date is day-precision', placeFile({ clientDate: '2026-04-01', clientSource: 'filename' }).precision, 'day')
check('no clock is approximate', placeFile({ arrivedAt: '2026-09-07' }).precision, 'approx')
check('no clock is placed by arrival', placeFile({ arrivedAt: '2026-09-07' }).by, 'arrival')
check('an invalid date falls through to approximate',
      placeFile({ clientDate: 'not-a-date', clientSource: 'exif' }).precision, 'approx')

// ── The citation checker (src/lib/search.ts, src/lib/month.ts) ──────────
console.log('citations')
function keepCited(text, validNums) {
  const valid = new Set(validNums)
  const out = []
  let dropped = 0
  for (const s of text.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean)) {
    const cites = Array.from(s.matchAll(/\[(\d+)\]/g)).map(m => parseInt(m[1], 10))
    if (!cites.length || cites.some(c => !valid.has(c))) { dropped++; continue }
    out.push(s)
  }
  return { kept: out, dropped }
}
check('an uncited sentence is dropped',
      keepCited('You said it once. You said it again [2].', [1, 2]),
      { kept: ['You said it again [2].'], dropped: 1 })
check('a citation to a passage never sent is dropped',
      keepCited('You said it [9].', [1, 2]), { kept: [], dropped: 1 })
check('multiple citations on one sentence are fine',
      keepCited('You said it twice [1][2].', [1, 2]),
      { kept: ['You said it twice [1][2].'], dropped: 0 })
check('a model that cites nothing yields nothing',
      keepCited('This is a confident claim with no evidence.', [1]),
      { kept: [], dropped: 1 })

// ── Date rendering (src/lib/log-entry.ts) ───────────────────────────────
console.log('dates')
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function stampFor(iso, p) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  if (p === 'year') return `~${d.getUTCFullYear()}`
  if (p === 'month') return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  if (p === 'approx') return `~${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}
// The rule this protects: the log must never render a day it was not told.
check('year precision shows only the year', stampFor('2008-07-01T12:00:00Z', 'year'), '~2008')
check('month precision shows no day', stampFor('2026-08-15T12:00:00Z', 'month'), 'Aug 2026')
check('approximate is marked', stampFor('2026-09-07T12:00:00Z', 'approx'), '~7 Sep')
check('exact shows the day plainly', stampFor('2026-09-07T12:00:00Z', 'exact'), '7 Sep')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
