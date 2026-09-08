#!/usr/bin/env node
/**
 * Does the page LOOK like the design?
 *
 * The other three checks read text. `check-design.mjs` asks whether our
 * markup uses the design's class names; `check-design-css.mjs` compares the
 * VALUE of every rule the design defines; `check-css-vars.mjs` asks whether
 * every `var(--x)` resolves. All three are blind to the same thing: **a rule
 * the design has and we never wrote at all.** There is no value to compare
 * and no variable to resolve — there is nothing.
 *
 * That is not hypothetical. 51 of the 74 design pages carry
 *
 *   .wrap>:not(.mh):not(.owner):not(.stamp):not(.ft):not(.grid):not(.rail):not(script){max-width:708px}
 *
 * — the "one frame everywhere" rule — and this stylesheet did not have it in
 * any form. Anything a page rendered outside its `.grid` stretched the full
 * 1052 instead of sitting in the 708 column, so pages read as two different
 * widths stacked on each other. `/walk` had 84 of its 109 boxes wrong from
 * that one absence, with all three text checks green.
 *
 * ── How it works ─────────────────────────────────────────────────────────
 *
 * Render the design's own markup twice in headless Chromium — once under the
 * design's stylesheet, once under ours — and compare every element's box.
 * Same markup both times, so any difference is OUR CSS.
 *
 * Two adjustments make the comparison fair, and both are here rather than in
 * the numbers:
 *
 *   - the class. The design's page children sit directly in `.wrap`; ours
 *     nest under `.logpage.pg-<page>`. The harness adds those classes to
 *     `.wrap` so our scoped rules apply at all — without it nothing matches
 *     and every page looks catastrophically broken.
 *   - the masthead and footer are skipped. `.mh` is a SIBLING of `.logpage`
 *     in `Shell`; the harness has just made it a child, so its width here is
 *     an artifact of the harness, not a fact about the product.
 *
 * `.page` and `.wrap` are skipped too. Their height is the sum of everything
 * inside, so a single child being 20px taller reports as a container
 * differing by 20px and double-counts what is already listed.
 *
 * ⚠️ **A difference is not automatically a bug.** `/vlog`'s `.cap` is 230px
 * wide in the design and 708 here on purpose — the operator asked for the
 * caption under the video rather than beside it. Deliberate divergences
 * belong in the budget with a reason, the same as in `check-design-css.mjs`.
 *
 * Not in CI: it needs Chromium and takes about ten seconds a page. Run it
 * when a page looks wrong, or after touching a layout rule —
 *
 *   node scripts/check-design-render.mjs            every page with a pair
 *   node scripts/check-design-render.mjs walk person   just those
 */
let chromium
// Playwright is not a dependency of this repo — it is a tool for looking at
// a page, not part of the build. Install it anywhere and point PW at the
// module; ESM ignores NODE_PATH, so the path has to be explicit.
for (const spec of ['playwright', process.env.PW].filter(Boolean)) {
  try { ({ chromium } = await import(spec)); break } catch {}
}
if (!chromium) {
  console.log('This check needs Playwright, which the repo does not depend on.\n')
  console.log('  mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright')
  console.log('  PW=/tmp/pw/node_modules/playwright/index.mjs \\')
  console.log('    node scripts/check-design-render.mjs\n')
  console.log('Chromium itself is already installed at /opt/pw-browsers/chromium.')
  process.exit(0)
}
import { readFileSync, readdirSync } from 'node:fs'

const REPO = '/home/user/neolog'
const ours = readFileSync(`${REPO}/src/app/globals.css`, 'utf8')
let PAGES = process.argv.slice(2)
if (!PAGES.length) {
  // ⚠️ The 22 pages that are PRODUCT SURFACES, read from `check-design.mjs`
  // so there is one list and it cannot drift.
  //
  // Globbing `design/markup` instead measures all 74, and the other 52 are
  // entry examples (`image`, `question`, `held`), maps of the package
  // (`index`, `portal`), pages declined with a reason (`elsewhere`, `repo`),
  // pages below the drafting fence (`thinkit`, `sayit`), and futures
  // (`log-2028`, `public-log-2029`). Our stylesheet does not style them, and
  // it should not — so they reported 50 to 240 boxes wrong each and buried
  // the handful of real findings under noise. A checker nobody can read is a
  // checker nobody runs.
  const list = readFileSync(`${REPO}/scripts/check-design.mjs`, 'utf8')
  const body = /const PAGES = \[([\s\S]*?)\n\]/.exec(list)?.[1] ?? ''
  PAGES = [...new Set([...body.matchAll(/\[\s*'([a-z0-9-]+)'/g)].map(m => m[1]))]
}

/**
 * The wrapper class a page's rules are scoped under, where it is not the
 * usual `.logpage.pg-<page>`. `/now` is the intake with nothing else on the
 * screen and carries its own `.nowpage` scope, so measuring it as a logpage
 * matched no rule at all and reported every box at the full 1280 viewport —
 * a page that looks catastrophically broken and is not.
 */
const SCOPE = { now: 'nowpage' }

/**
 * Differences that are decided, not drift — the same convention the other
 * three checks use. A number here needs a reason beside it, and the reason
 * is the point: without one this becomes a place to hide a bug.
 */
const BUDGET = {
  // The eight filters measure 754px against a 708 column, so `.bar .f`
  // wraps here and does not in `log.css`. Rule 4 is one frame everywhere;
  // spilling past it is worse than 37px of toolbar. `.bar` and `.grid`
  // report the same wrap cascading upward.
  log: 3,
  // `vlog.css` has no frame rule (23 of the 74 pages do not), so `.back`
  // spans 1052 there and 708 here — a row of left-aligned links either way.
  // `.cap` is the caption the operator asked to sit under the video rather
  // than beside it. `.player` is the design's 420px mock, not a real one.
  vlog: 3,
  entry: 1,
  // `/facts` renders its own section bodies; `.sec` runs 27px longer.
  dossier: 2,
  // `/asks` deliberately drops the drafted prose answer and its fanned
  // sub-questions — a model writing in his voice on a surface that presents
  // itself as a record (§0 rule 3).
  asks: 2,
  // `/now` is the intake with nothing else on the screen and is built from
  // its own `.nowpage` scope rather than page-by-page from `now.css`. Its
  // atmosphere layers (`.atm`, `.grain`, `.vig`, `.stage`) are ours.
  now: 11,
  // The two blocks below the route on `/walk` are not converted yet.
  walk: 0,
}

/**
 * Put our scope class where the page's rules expect it.
 *
 * Most design pages hang their content off `.wrap`, and our equivalent adds
 * `.logpage.pg-<page>` to that element — so the class goes on `.wrap`. A page
 * with no `.wrap` at all (`now.html` opens straight into `.atm`) gets the
 * whole body wrapped instead, because our `/now` renders `.nowpage` as its
 * root element. Getting this wrong matches no rule and reports every box at
 * the full viewport width: a page that looks catastrophically broken and is
 * not.
 */
function scoped(body, page) {
  const cls = SCOPE[page] ?? `logpage pg-${page}`
  return body.includes('class="wrap"')
    ? body.replace('class="wrap"', `class="wrap ${cls}"`)
    : `<div class="${cls}">${body}</div>`
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const rows = []

for (const page of PAGES) {
  let markup, theirs
  try {
    markup = readFileSync(`${REPO}/design/markup/${page}.html`, 'utf8')
    theirs = readFileSync(`${REPO}/design/css/${page}.css`, 'utf8')
  } catch { console.log(`  ${page}: no design pair`); continue }

  // The design's markup is a full document; take what is inside <body>.
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(markup)?.[1] ?? markup


  async function measure(css, scope) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
    // The design markup links Google Fonts. The proxy blocks it and every
    // page then waits out the timeout, so refuse them up front — both sides
    // fall back to the same stack, which keeps the comparison fair.
    await p.route('**://**', r => (/^(file|data|about)/.test(r.request().url()) ? r.continue() : r.abort()))
    await p.setContent(
      `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>${css}</style></head>`
      + `<body>${scope ? scoped(body, page) : body}</body></html>`,
      { waitUntil: 'load' },
    )
    const out = await p.evaluate(() => {
      const seen = []
      for (const el of document.querySelectorAll('[class]')) {
        // The masthead sits OUTSIDE .logpage in the real Shell; this harness
        // injects the class on .wrap, so skip it and everything under it.
        if (el.closest('.mh, .ft')) continue
        if (el.matches('.page, .wrap')) continue
        const r = el.getBoundingClientRect()
        seen.push({ c: el.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
      }
      return seen
    })
    await p.close()
    return out
  }

  const a = await measure(theirs, false)
  const b = await measure(ours, true)
  // Compare element-by-element in document order — same markup, same order.
  // ⚠️ Match by (class, nth-of-that-class), NOT by index. The scope class has
  // to go somewhere, and on a page with no `.wrap` that means an extra
  // wrapper element on our side only — which shifts every index after it and
  // reports the whole page as broken. Indexing by class also survives an
  // element that renders in one pass and not the other.
  const key = r => `${String(r.c).trim()}#`
  const seq = list => {
    const n = new Map(), out = new Map()
    for (const r of list) {
      const k = key(r); const i = (n.get(k) ?? 0); n.set(k, i + 1)
      out.set(`${k}${i}`, r)
    }
    return out
  }
  const A = seq(a), B = seq(b)
  let moved = 0
  const off = []
  for (const [k, ra] of A) {
    const rb = B.get(k)
    if (!rb) continue
    const d = Math.abs(ra.w - rb.w) + Math.abs(ra.h - rb.h)
    if (d > 24) {
      moved++
      off.push({ d, c: String(ra.c).split(' ')[0], their: `${ra.w}x${ra.h}`, our: `${rb.w}x${rb.h}` })
    }
  }
  // One line per class, worst first — the same reasoning as check-design.mjs:
  // a count says the page is wrong, the list says where to start.
  const byClass = new Map()
  for (const o of off) if (!byClass.has(o.c) || byClass.get(o.c).d < o.d) byClass.set(o.c, o)
  rows.push({ page, n: A.size, moved, off: [...byClass.values()].sort((x, y) => y.d - x.d) })
}
await browser.close()

rows.sort((x, y) => y.moved - x.moved)
let over = 0
for (const r of rows) {
  const budget = BUDGET[r.page] ?? 0
  const flag = r.moved > budget ? '  DRIFTED' : r.moved < budget ? '  \u2193 lower the budget' : ''
  console.log(`  ${r.page.padEnd(13)} ${String(r.moved).padStart(3)} / ${String(budget).padEnd(3)} boxes differ${flag}`)
  if (r.moved > budget) over++
  if (PAGES.length <= 4 || r.moved > budget) {
    for (const o of r.off.slice(0, 12)) {
      console.log(`      .${o.c.padEnd(14)} design ${o.their.padEnd(11)} ours ${o.our}`)
    }
  }
}

if (over) {
  console.error(`\n${over} page(s) render further from the design than the budget allows.`)
  console.error('Every budget is a debt, not a target — the real number is zero.')
  process.exit(1)
}
console.log('\nNo page renders further from the design than its budget.')
