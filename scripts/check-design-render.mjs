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
  PAGES = readdirSync(`${REPO}/design/markup`)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace(/\.html$/, ''))
    .filter(p => { try { readFileSync(`${REPO}/design/css/${p}.css`); return true } catch { return false } })
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
      + `<body>${scope ? body.replace('class="wrap"', `class="wrap logpage pg-${page}"`) : body}</body></html>`,
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
  let moved = 0
  const off = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = Math.abs(a[i].w - b[i].w) + Math.abs(a[i].h - b[i].h)
    if (d > 24) {
      moved++
      off.push({ d, c: String(a[i].c).split(' ')[0], their: `${a[i].w}x${a[i].h}`, our: `${b[i].w}x${b[i].h}` })
    }
  }
  // One line per class, worst first — the same reasoning as check-design.mjs:
  // a count says the page is wrong, the list says where to start.
  const byClass = new Map()
  for (const o of off) if (!byClass.has(o.c) || byClass.get(o.c).d < o.d) byClass.set(o.c, o)
  rows.push({ page, n: a.length, moved, off: [...byClass.values()].sort((x, y) => y.d - x.d) })
}
await browser.close()

rows.sort((x, y) => y.moved - x.moved)
for (const r of rows) {
  console.log(`  ${r.page.padEnd(13)} ${String(r.moved).padStart(3)} / ${r.n} boxes differ`)
  if (PAGES.length <= 4) {
    for (const o of r.off.slice(0, 12)) {
      console.log(`      .${o.c.padEnd(14)} design ${o.their.padEnd(11)} ours ${o.our}`)
    }
  }
}
