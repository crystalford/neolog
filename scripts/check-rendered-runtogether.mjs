/**
 * Words that run together because a rule never reached its element.
 *
 * ⚠️ 21 Sep. Three of these shipped at once, on three different pages:
 *
 *   /settings  "the recordingsCloudflare R2 · neolog-videosyours"
 *   /footage   "usablenofix what's in it"
 *   /clear     "Not here yetStill uploading, or queued."
 *
 * Each is the same shape. The stylesheet describes one element and the
 * markup is another — `a.d` against `<span class="d">`, `.paste .who`
 * against a `.who` in a card, `b`/`p` against two bare `<span>`s — so the
 * layout rule matched nothing, the children fell back to inline, and two
 * labels concatenated into a non-word.
 *
 * **Every text-level check in this repo passes all three, and did.**
 * `check-design.mjs` confirms the class is in the markup: it is.
 * `check-design-css.mjs` confirms the values match the design: they do.
 * `check-css-vars.mjs` confirms the variables resolve: they do. A selector
 * that cannot reach its element is invisible to all of them — it is the
 * mirror of "a rule the design has that we never wrote at all", which
 * CLAUDE.md already records as the class of bug only a rendered page shows.
 *
 * So this one renders the page and reads the boxes. For every pair of
 * adjacent inline siblings that carry text and touch with no gap, it asks
 * whether a reader would see two things or one word.
 *
 * ── Why it runs against the deployed site ───────────────────────────────
 *
 * These pages read D1 and presign R2 on the server. There is no local
 * render of them — `wrangler pages dev` is recorded as broken against D1 on
 * this toolchain, and the OpenNext preview has not been proven. The runner
 * has both egress and the Access service token, so that is where it runs.
 */

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://neolog.ai'

/** Every surface, plus the uploader which hides behind a button. */
const PAGES = [
  '/', '/vlogs', '/settings', '/search', '/facts', '/export', '/corrections',
  '/writing', '/footage', '/clear', '/triage', '/everything', '/messages',
  '/screenshots', '/pages', '/onthisday', '/numbers', '/asks', '/glossary',
  '/ways-in', '/public', '/month/2026-07',
]

/**
 * In the page: find adjacent inline siblings whose text collides.
 *
 * The guards are what keep this from crying wolf, which CLAUDE.md is
 * explicit about — "a check that is wrong about what it measured teaches
 * the next reader to skim its output":
 *
 *  - both siblings must be INLINE level; a block element already separates
 *  - both must carry real text, trimmed
 *  - their boxes must sit on the same line and touch (< 0.5px apart)
 *  - the join must be word-character against word-character. "12" + "px"
 *    is a legitimate pair; so is a value followed by a comma. What is never
 *    legitimate is a letter running straight into a capital — "yetStill" —
 *    or two words with no space at all.
 *  - and at least one side must be a real word rather than a glyph, so
 *    punctuation and single letters do not register
 */
const FIND = () => {
  const out = []
  const inline = el => getComputedStyle(el).display.startsWith('inline')
  const text = el => (el.textContent || '').trim()

  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children]
    if (kids.length < 2) continue
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i], b = kids[i + 1]
      if (!inline(a) || !inline(b)) continue
      const ta = text(a), tb = text(b)
      if (!ta || !tb) continue
      if (ta.length < 3 && tb.length < 3) continue

      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      if (!ra.width || !rb.width) continue
      // same line, and touching
      const sameLine = Math.abs(ra.top - rb.top) < 4
      const gap = rb.left - ra.right
      if (!sameLine || gap > 0.5 || gap < -2) continue

      const last = ta[ta.length - 1], first = tb[0]
      if (!/[\w)]/.test(last) || !/[\w(]/.test(first)) continue

      out.push({
        joined: `${ta.slice(-24)}|${tb.slice(0, 24)}`,
        parent: parent.tagName.toLowerCase() + (parent.className ? '.' + String(parent.className).trim().split(/\s+/).join('.') : ''),
        a: a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).trim().split(/\s+/).join('.') : ''),
        b: b.tagName.toLowerCase() + (b.className ? '.' + String(b.className).trim().split(/\s+/).join('.') : ''),
      })
    }
  }
  return out
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: {
    'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID || '',
    'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET || '',
  },
})
const page = await ctx.newPage()

let total = 0
for (const path of PAGES) {
  try {
    // ⚠️ `domcontentloaded`, not `networkidle`. /vlogs polls the upload
    // queue every fifteen seconds and the home page drains it too, so the
    // network never goes idle and every such page burned a 60s timeout.
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(1500)
    const hits = await page.evaluate(FIND)
    if (hits.length) {
      total += hits.length
      console.log(`\n${path}`)
      for (const h of hits) {
        console.log(`  "${h.joined}"`)
        console.log(`     in ${h.parent}  —  ${h.a} + ${h.b}`)
      }
    }
  } catch (err) {
    console.log(`\n${path}  (could not read: ${err.message})`)
  }
}

await browser.close()

if (total) {
  console.log(`\n${total} place${total === 1 ? '' : 's'} where two labels render as one word.`)
  console.log('A layout rule is not reaching the element the markup uses.')
  process.exit(1)
}
console.log('\nNo run-together text on any surface.')
