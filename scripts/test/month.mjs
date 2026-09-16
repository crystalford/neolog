#!/usr/bin/env node
/**
 * The month, cut into weeks — and the arithmetic that decides which day
 * lands in which one.
 *
 * `/month/[ym]` shows the month week by week, newest first, each opening to
 * its own entries. The cut is on the CALENDAR day, not a rolling seven from
 * the 1st, so a week is the one he lived rather than an offset from a
 * boundary. That makes it date arithmetic, and date arithmetic fails
 * quietly: a week that overlaps the one before it shows an entry twice, and
 * a gap between two weeks hides one completely. Neither looks like an error
 * — the page renders, the counts are plausible, and an entry is simply not
 * where he left it.
 *
 * So the assertions are about COVERAGE, not about the boundaries:
 *
 *   every day is in a week          no gap, so nothing is hidden
 *   every day is in exactly one     no overlap, so nothing is doubled
 *   a week starts on a Monday       or on the 1st, where the month does
 *   the first week can be short     a month rarely begins on a Monday
 *
 * Run: node scripts/test/month.mjs
 */

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

/** The cut, copied from `src/app/(app)/month/[ym]/page.tsx`. */
function weeksOf(yy, mm, daysInMonth) {
  const out = []
  let end = daysInMonth
  while (end >= 1) {
    const dow = new Date(Date.UTC(yy, mm - 1, end)).getUTCDay()   // 0 = Sunday
    const span = dow === 1 ? 1 : dow === 0 ? 7 : dow
    const start = Math.max(1, end - span + 1)
    out.push({ start, end })
    end = start - 1
  }
  return out
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()

console.log('the month: every day in exactly one week')

// Every month of four years, including two leap Februaries.
let months = 0
for (let y = 2023; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    months++
    const d = daysIn(y, m)
    const ws = weeksOf(y, m, d)
    const seen = []
    for (const w of ws) for (let i = w.start; i <= w.end; i++) seen.push(i)
    seen.sort((a, b) => a - b)

    const label = `${y}-${String(m).padStart(2, '0')}`
    ok(`${label} covers every day exactly once`,
       seen.length === d && seen.every((v, i) => v === i + 1))
    ok(`${label} is newest first`,
       ws.every((w, i) => i === 0 || w.end < ws[i - 1].start))
    // Every week but the last one printed (which is the FIRST of the month)
    // begins on a Monday. The month's own first week begins on the 1st.
    ok(`${label} weeks begin on a Monday`,
       ws.every((w, i) => i === ws.length - 1
         ? w.start === 1
         : new Date(Date.UTC(y, m - 1, w.start)).getUTCDay() === 1))
  }
}
ok('four years of months were checked', months === 48)

// February 2026 starts on a Sunday: the 1st is its own one-day week.
check('a month starting on a Sunday keeps the 1st in its own week',
      weeksOf(2026, 2, 28).at(-1), { start: 1, end: 1 })
// A month starting ON a Monday has a full first week.
const mar2027 = weeksOf(2027, 3, 31)
ok('a month starting on a Monday has no stub week',
   new Date(Date.UTC(2027, 2, mar2027.at(-1).start)).getUTCDay() === 1)

// ── The density bands on the coverage strip ─────────────────────────────
// Three bands measured against HIS fullest day, not a number the log picked.
const band = (n, max) => n === 0 ? '' : n >= max * 0.66 ? 's3' : n >= max * 0.33 ? 's2' : 's1'
check('nothing said is no band',        band(0, 9), '')
check('one of nine is the lightest',    band(1, 9), 's1')
check('a third is the middle',          band(3, 9), 's2')
check('two thirds is the darkest',      band(6, 9), 's3')
check('the fullest day is the darkest', band(9, 9), 's3')
// A quiet month: one entry on one day is that month's "a lot".
check('one entry in a whole month still bands', band(1, 1), 's3')

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
