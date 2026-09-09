#!/usr/bin/env node
/**
 * How far each page has drifted from the design it is supposed to be.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * On 8 Sep the operator looked at the deployed site and said it still looked
 * like the old one. It did. The home page and the feed had been built close
 * to the package; every other page had been written in a vocabulary that
 * RESEMBLED it — plausible class names, numbers re-derived rather than taken
 * — and nothing in the repo could tell the two apart. `tsc` cannot. A build
 * cannot. Reading the CSS cannot, because it looks right.
 *
 * So this compares, per page, two things:
 *
 *   the stylesheet   every rule the design defines, against the rule I wrote
 *                    for it. A value that disagrees is reported with both.
 *   the markup       every class the design's own markup uses, against the
 *                    classes my page renders — following the components it
 *                    imports, since LogRow and Rail carry design classes too.
 *
 * ── The budgets ──────────────────────────────────────────────────────────
 *
 * `PAGES` below carries a per-page ceiling for unused design classes. The
 * number is what that page is at today, not what it should be: this check
 * exists to stop drift, and every page's real target is zero. Lowering one
 * of these numbers is the work; raising one needs a reason in the commit.
 *
 * The design itself is vendored in `design/` — the package lived in a
 * scratch directory that does not survive a session, which would have made
 * every number here unreproducible by the next one.
 *
 * Run: node scripts/check-design.mjs [page]
 */

import { readFileSync, existsSync } from 'node:fs'

/** page in design/ → the route file that must match it → today's ceiling. */
const PAGES = [
  ['log',        'src/app/(app)/page.tsx',              3],
  ['entry',      'src/app/(app)/entry/[id]/page.tsx',   0],
  ['headings',   'src/app/(app)/pages/page.tsx',         0],
  ['person',     'src/app/(app)/page/[id]/page.tsx',    12],
  ['search',     'src/app/(app)/search/page.tsx',       7],
  ['month',      'src/app/(app)/month/[ym]/page.tsx',   6],
  ['onthisday',  'src/app/(app)/onthisday/page.tsx',     4],
  // 5 → 0 on 9 Sep. `clear.html`'s phone (`.ph` holding a `.scr`) had every
  // rule in globals.css since the page was built and was rendered by
  // nothing — the page put a `.big` line in the main column instead, so the
  // surface whose whole job is to say "these are safe to delete" said it in
  // prose beside a list.
  ['clear',      'src/app/(app)/clear/page.tsx',        0],
  ['triage',     'src/app/(app)/triage/page.tsx',       2],
  // takeout.html — "everything out, and the bill" — is this page.
  // export.html is a RENDERED EXPORT DOCUMENT ("Building neolog — exported
  // from the log"): what the Markdown looks like, not a route.
  ['takeout',    'src/app/(app)/export/page.tsx',       6],
  ['dossier',    'src/app/(app)/facts/page.tsx',         5],
  // Its last five are .was (the struck previous wording of a changed
  // claim) and .eg (an example of a machine rephrasing a line) — both need
  // data this product does not keep.
  ['source',     'src/app/(app)/glossary/page.tsx',      5],
  // Its last four — .long, .sq, .th, .tree — are the prose answer and the
  // fanned-out sub-questions. Both are a model writing in his voice on a
  // surface that presents itself as a record, which §0 rule 3 forbids, so
  // this page cannot and should not reach zero. /search is where a written
  // answer lives, and it citation-checks every sentence first.
  ['asks',       'src/app/(app)/asks/page.tsx',          4],
  ['numbers',    'src/app/(app)/numbers/page.tsx',       3],
  // Five of its remaining eight must STAY missing: mic, opts and or are
  // the composer, and yl/yrs are the coverage bar. SPEC §3 — "Not on the
  // public side: the coverage bar (the operator's instrument; it advertises
  // the gaps), questions, the composer." public-log.html draws them; §0
  // wins over a page.
  ['public-log', 'src/app/(app)/public/page.tsx',       8],
  ['vlog',       'src/app/(app)/vlog/[id]/page.tsx',    9],
  ['writing',    'src/app/(app)/writing/page.tsx',      5],
  // writing.html's title is "an essay you wrote" — it covers the mechanic
  // AND one document, so the detail page is measured against it too.
  ['writing',    'src/app/(app)/writing/[id]/page.tsx', 5],
  ['screenshots','src/app/(app)/screenshots/page.tsx',  7],
  ['messages',   'src/app/(app)/messages/page.tsx',     7],
  // messages.html covers the whole mechanic — the list AND one thread — so
  // the thread page is measured against it too; most of its classes live
  // there.
  // 9 → 7 on 9 Sep: the publish preview gained `.k` (whose consent state is
  // being previewed, and what it is) and `.f` (why it reads strangely). The
  // preview was a second copy of the thread with lines missing and nothing
  // on screen saying why — on the one surface that is half somebody else's.
  ['messages',   'src/app/(app)/messages/[id]/page.tsx', 7],
  ['walk',       'src/app/(app)/walk/[id]/page.tsx',    10],
  ['now',        'src/app/(app)/now/page.tsx',           1],
  ['connections','src/app/(app)/ways-in/page.tsx',      10],
  // wrong.html is three sections and only the middle one is product. §1's
  // five worked cases and §3's hard case are `.case` articles with invented
  // dates, invented entries and live-looking buttons — the design teaching
  // the mechanic. Rendering them would put fabricated records on the one
  // surface whose whole point is that its records are real. §2, "the log of
  // it", is the page: `.rec .r .d .w .k .o .me .it .rate .rules`.
  //
  // The 15: twelve are that `.case` family (case two said l x fix t a b gh
  // cost kind); `.body` is the 148px indent under a `.st` header this page
  // does not render; `.n` is that header's step number, counted because it
  // is a link or a dash on other pages and this check matches by class; and
  // `.up` is the trend colour on `.rate` — "↓ 2.1× wrong attaches, compared
  // with the first week", which is the log reading its own numbers out loud
  // (§0 rule 2). None of the fifteen can go down without building something
  // the product refuses.
  ['wrong',      'src/app/(app)/corrections/page.tsx',  15],
]

/**
 * Surfaces with no design page, and why. `everything.html` and
 * `footage.html` in the package are ENTRY EXAMPLES — their titles are
 * "Every entry is one sentence that stands on its own" and "Started
 * vlogging. About four hundred recordings" — even though SPEC §3 names
 * everything.html as the door to the machine layer and §2 describes
 * footage. The package's index and its files disagree, so those two
 * surfaces are built from the prose and cannot be scored against a drawing
 * that is of something else.
 */
const NO_DESIGN_PAGE = {
  // Files in the package that are NOT product surfaces, recorded so nobody
  // points a route at one. Three of them cost real time this session.
  '(export.html)':     'a rendered export document — /export is takeout.html',
  '(everything.html)': 'an entry example, despite SPEC §3 naming it the machine-layer door',
  '(footage.html)':    'an entry example, despite SPEC §2 describing footage',
  '(portal.html)':     'a flat map of the package\'s own HTML files, not a product page',
  '(index.html)':      'the package\'s designed hub, same',
  '/everything': 'built from SPEC §3 prose — everything.html is an entry example and portal.html is a map of the package',
  '/footage':    'built from SPEC §2 prose — footage.html is an entry example',
  '/ready': 'no page in the package', '/share': 'no page in the package',
  '/settings': 'no page in the package', '/vlogs': 'vlog.html is one recording, not the list',
}

/**
 * The frame every page carries — masthead, footer, crumb, the grid. Not
 * drift: `Shell` renders it once for all of them.
 *
 * ⚠️ `r2` is here because it IS `r`. Nine pages in the package — the ones
 * where `.r` already means a ROW — call the footer's right-hand link group
 * `.r2` instead, and `plain.css` gives the two the same rule
 * (`.ft .r2{display:flex;gap:18px}`). Shell renders `.r`, which is correct
 * on every page; charging those nine for a class that is the same element
 * under a second name is the checker being wrong about what it measured.
 */
const SHELL = new Set(['page','wrap','mh','lock','mk','wm','pv','back','crumb','ft','r','r2','sep','on','logpage','grid','main','rail'])

/**
 * The design package talking about itself, on nearly every page — and never
 * product. Counting these as drift charged twenty-odd surfaces for markup
 * that would be a bug if it shipped.
 *
 * ⚠️ Two entries only, and both were read before being put here. This is not
 * a place to send a class that is merely hard to build: a class belongs here
 * when rendering it in the product would be WRONG, not when it is unfinished.
 */
const PACKAGE_FURNITURE = new Set([
  // "A page from the spec — one mechanic, shown. The product itself is the
  // log and the expanded entry." A banner on 25 of the 74 pages telling the
  // reader they are looking at an illustration. Shipping it would be the
  // product announcing it is a mock-up.
  'specnote',
  // The principles block at the foot of a spec page, restating the rule the
  // page demonstrates — "Two owners, one entry", "Forwarded, never pulled".
  // On 24 pages. The product ENFORCES those rules in code; printing them
  // under the feature would be the log explaining itself, which is the
  // opposite of §0 rule 2.
  'rules',
  // The numbered walkthrough section, on 19 of the 74 pages — "1 a thread
  // arrives", "1 read, not looked at", "2 who wrote it" — each wrapping an
  // <h2> and a paragraph that talk the reader through the mechanic step by
  // step. Its own words give it away: "This is the whole design. Not a
  // checkbox you tick once…" The product does not number its features and
  // narrate them; that is the log explaining itself (§0 rule 2).
  //
  // ⚠️ `.n`, the number badge inside it, is NOT here. It is the step number
  // on those pages and a link or a dash on others, and this check matches by
  // class rather than by context — excluding it globally would hide real
  // gaps on the pages that use it for something else.
  'st',
])

function classesInMarkup(html) {
  const out = new Set()
  for (const m of html.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c)
  return out
}

/** My page's classes, plus every component it renders. */
/**
 * ⚠️ Only class names written as LITERALS are seen. A page that computes one
 * — `const band = n > x ? 's3' : 's2'`, then `className={band}` — reads as
 * not using it. `/month`'s density cells and its year strip are built that
 * way, so `s1 s2 s3 q some` sit in its budget while rendering perfectly;
 * `check-design-render.mjs` is what proves they do. Do not contort a page
 * into literals to satisfy this regex.
 */
function classesInPage(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return new Set()
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g))
    for (const c of (m[1] || m[2] || '').split(/[\s${}?:'"()]+/))
      if (c && !/^[A-Z]/.test(c) && !c.startsWith('pg-')) out.add(c)

  // A class picked from a lookup — `className={KIND_CLASS[p.kind]}` — is not
  // a literal, so the pass above cannot see it. `/pages` maps five kinds to
  // `.job .proj .subj .per .place` that way and read as using none of them.
  //
  // Only maps that are actually INDEXED inside a className are read, and only
  // their string values. That matters: `'job'` is both a design class and a
  // value of `pages.kind`, so scanning every quoted string in the file would
  // count a data value as a class and hide a real gap. Narrowing it to maps
  // the markup indexes keeps the failure direction right.
  const indexed = new Set(
    [...src.matchAll(/className=\{[^}]*?\b([A-Z][A-Z0-9_]*)\s*\[/g)].map(m => m[1]),
  )
  for (const name of indexed) {
    const decl = new RegExp(`const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src)
    if (!decl) continue
    for (const v of decl[1].matchAll(/:\s*'([a-z0-9 _-]+)'/g))
      for (const c of v[1].split(/\s+/)) if (c) out.add(c)
  }
  for (const m of src.matchAll(/from '@\/components\/([\w/-]+)'/g))
    for (const ext of ['.tsx', '.ts'])
      for (const c of classesInPage(`src/components/${m[1]}${ext}`, seen)) out.add(c)
  return out
}

const only = process.argv[2]
const rows = []
let over = 0

// One row per DESIGN page, not per route. `messages.html` covers the list and
// the thread, `writing.html` the shelf and the piece — SPEC §3, "one design,
// two views: nothing is designed twice". Two rows for one page printed the
// same number twice once the measure became the union.
const byDesign = new Map()
for (const [page, file, budget] of PAGES) {
  if (!byDesign.has(page)) byDesign.set(page, { files: [], budget })
  byDesign.get(page).files.push(file)
  // Where two routes carried different budgets, the shared one is the lower:
  // a budget is a debt, and the union cannot owe more than its smaller half.
  byDesign.get(page).budget = Math.min(byDesign.get(page).budget, budget)
}

for (const [page, { files, budget }] of byDesign) {
  if (only && page !== only) continue
  const design = `design/markup/${page}.html`
  if (!existsSync(design)) { console.error(`  design/markup/${page}.html missing`); over++; continue }
  for (const f of files) {
    if (!existsSync(f)) { console.error(`  ${f} missing — did a route move?`); over++ }
  }

  const used = classesInMarkup(readFileSync(design, 'utf8'))
  // ⚠️ One design page can cover TWO routes — SPEC §3, "one design, two
  // views: nothing is designed twice". `messages.html` is the list and the
  // thread; `writing.html` is the shelf and the piece. Measuring each route
  // against the whole page separately charged the list for the thread's
  // classes and the thread for the list's, so both carried debt for markup
  // that exists in the other half. The measure is the union.
  const mine = new Set()
  for (const f of files) for (const c of classesInPage(f)) mine.add(c)
  const missing = [...used]
    .filter(c => !mine.has(c) && !SHELL.has(c) && !PACKAGE_FURNITURE.has(c))
    .sort()
  rows.push({ page, files, n: missing.length, budget, missing })
  if (missing.length > budget) over++
}

const w = Math.max(...rows.map(r => r.page.length))
for (const r of rows) {
  const flag = r.n > r.budget ? '  DRIFTED' : r.n < r.budget ? '  ↓ lower the budget' : ''
  console.log(`  ${r.page.padEnd(w)}  ${String(r.n).padStart(3)} / ${String(r.budget).padEnd(3)} unused${flag}`)
  // Naming the classes is the whole point when you are working a budget
  // down: a count says a page has drifted, the list says where to start.
  if (r.n > r.budget || only) console.log(`      ${r.missing.join(' ')}`)
}
console.log(`\n${rows.length} pages measured against design/. ${Object.keys(NO_DESIGN_PAGE).length} surfaces have no design page (listed in this file, with why).`)

if (over) {
  console.error(`\n${over} page${over === 1 ? '' : 's'} drifted further from the design than its budget allows.`)
  console.error('Every budget here is a debt, not a target — the real number is zero.')
  process.exit(1)
}
console.log('No page has drifted.')
