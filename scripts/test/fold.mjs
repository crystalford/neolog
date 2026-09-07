#!/usr/bin/env node
/**
 * Tests for the year banding (src/lib/fold.ts `bandYears`, inlined).
 *
 * SPEC §1: "Nothing is a flat list past about twenty." Twenty-eight year
 * rows is a flat list past twenty, so thin years band together. What must
 * never happen:
 *
 *   a year disappears        every year with entries is on exactly one row,
 *                            and the counts add up to the total
 *   a band claims a gap      a year with nothing in it is not a row, and a
 *                            band must not swallow the years either side of
 *                            it into one line that implies coverage
 *   a full year is hidden    a year that stands on its own keeps its row
 *
 * Run: node scripts/test/fold.mjs
 */

let pass = 0, fail = 0
function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return }
  fail++
  console.error(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`)
}
function ok(name, cond) { check(name, !!cond, true) }

const THIN_SHARE = 0.2
const MAX_BAND_YEARS = 10

function bandYears(byYear) {
  const years = Array.from(byYear.keys()).sort((a, b) => b - a)
  if (!years.length) return []
  const fullest = Math.max(...Array.from(byYear.values()))
  const thinAt = Math.max(2, fullest * THIN_SHARE)
  const isThin = y => (byYear.get(y) || 0) < thinAt
  const out = []
  let i = 0
  while (i < years.length) {
    const y = years[i]
    if (!isThin(y)) {
      out.push({ grain: 'year', label: String(y), count: byYear.get(y) || 0, spans: 1 })
      i++; continue
    }
    let j = i, count = 0
    while (
      j < years.length && isThin(years[j])
      && years[i] - years[j] < MAX_BAND_YEARS
      && (j === i || years[j - 1] - years[j] === 1)
    ) { count += byYear.get(years[j]) || 0; j++ }
    const newest = years[i], oldest = years[j - 1]
    out.push(newest === oldest
      ? { grain: 'year', label: String(newest), count, spans: 1 }
      : { grain: 'years', label: `${oldest} – ${newest}`, count, spans: newest - oldest + 1 })
    i = j
  }
  return out
}

console.log('the fold: nothing is a flat list past about twenty')

// The design's own shape (log-2028.html): two full years standing alone,
// a quarter-century of thin ones banded behind them.
{
  const m = new Map([[2027, 1388], [2026, 1847]])
  for (let y = 2001; y <= 2025; y++) m.set(y, 10 + (y % 7) * 3)
  const b = bandYears(m)
  check('the full years keep their own rows', b.slice(0, 2).map(x => x.label), ['2027', '2026'])
  ok('the thin years are banded', b.slice(2).every(x => x.grain === 'years'))
  ok('and it is no longer a flat list past twenty', b.length <= 6)
  check('no band runs longer than the cap',
    b.filter(x => x.spans > MAX_BAND_YEARS).length, 0)

  // Nothing is lost: every year is covered exactly once and the counts add.
  const total = Array.from(m.values()).reduce((a, c) => a + c, 0)
  check('the counts add up to the whole log', b.reduce((a, x) => a + x.count, 0), total)
  check('every year is on exactly one row', b.reduce((a, x) => a + x.spans, 0), m.size)
}

// A gap must break a band. A year with nothing in it is not a row, and a
// band that spanned it would imply coverage the log does not have.
{
  const m = new Map([[2026, 500], [2020, 5], [2019, 5], [2017, 5], [2016, 5]])
  const b = bandYears(m)
  check('a missing year breaks the band',
    b.map(x => x.label), ['2026', '2019 – 2020', '2016 – 2017'])
  check('and no row claims the empty year', b.reduce((a, x) => a + x.spans, 0), 5)
}

// Thin is relative, not absolute: with nothing to be thin against, every
// year stands on its own. A log of five equal years is not one band.
{
  const m = new Map([[2020, 5], [2019, 5], [2017, 5]])
  const b = bandYears(m)
  ok('with no full year, nothing is thin', b.every(x => x.grain === 'year'))
}

// A lone thin year between two full ones stays a year, not a band of one.
{
  const b = bandYears(new Map([[2026, 500], [2025, 4], [2024, 600]]))
  check('a single thin year is still a year', b.map(x => x.grain), ['year', 'year', 'year'])
  check('and it is labelled as one', b[1].label, '2025')
}

// Every year full: no banding at all.
{
  const b = bandYears(new Map([[2026, 500], [2025, 480], [2024, 520]]))
  ok('nothing is banded when nothing is thin', b.every(x => x.grain === 'year'))
}

// Every year thin and equal — the fullest year is also the thinnest, so the
// share test must not band everything into one line by accident.
{
  const m = new Map()
  for (let y = 2010; y <= 2015; y++) m.set(y, 40)
  const b = bandYears(m)
  ok('equal years are all full, not all thin', b.every(x => x.grain === 'year'))
  check('so each keeps its row', b.length, 6)
}

// A very long thin run is cut at the cap rather than becoming one line.
{
  const m = new Map()
  m.set(2030, 900)
  for (let y = 1995; y <= 2029; y++) m.set(y, 5)
  const b = bandYears(m)
  ok('a 35-year run is cut into bands', b.filter(x => x.grain === 'years').length >= 3)
  ok('none longer than the cap', b.every(x => x.spans <= MAX_BAND_YEARS))
  check('and every year is still covered once',
    b.reduce((a, x) => a + x.spans, 0), m.size)
}

check('an empty log folds to nothing', bandYears(new Map()), [])
check('one year is one row', bandYears(new Map([[2026, 3]])).map(x => x.label), ['2026'])

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
