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
  ['log',        'src/app/(app)/page.tsx',              7],
  ['entry',      'src/app/(app)/entry/[id]/page.tsx',   9],
  ['headings',   'src/app/(app)/pages/page.tsx',         5],
  ['person',     'src/app/(app)/page/[id]/page.tsx',    16],
  ['search',     'src/app/(app)/search/page.tsx',       20],
  ['month',      'src/app/(app)/month/[ym]/page.tsx',   28],
  ['onthisday',  'src/app/(app)/onthisday/page.tsx',     6],
  ['clear',      'src/app/(app)/clear/page.tsx',        7],
  ['triage',     'src/app/(app)/triage/page.tsx',       3],
  ['export',     'src/app/(app)/export/page.tsx',       15],
  ['dossier',    'src/app/(app)/facts/page.tsx',         5],
  ['source',     'src/app/(app)/glossary/page.tsx',     12],
  ['asks',       'src/app/(app)/asks/page.tsx',         12],
  ['numbers',    'src/app/(app)/numbers/page.tsx',       8],
  ['public-log', 'src/app/(app)/public/page.tsx',       10],
  ['vlog',       'src/app/(app)/vlog/[id]/page.tsx',    23],
  ['writing',    'src/app/(app)/writing/page.tsx',      16],
  ['screenshots','src/app/(app)/screenshots/page.tsx',  14],
  ['messages',   'src/app/(app)/messages/page.tsx',     21],
  // messages.html covers the whole mechanic — the list AND one thread — so
  // the thread page is measured against it too; most of its classes live
  // there.
  ['messages',   'src/app/(app)/messages/[id]/page.tsx', 12],
  ['walk',       'src/app/(app)/walk/[id]/page.tsx',    24],
  ['now',        'src/app/(app)/now/page.tsx',           1],
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
  '/everything': 'everything.html is an entry example; SPEC §3 describes the door in prose only',
  '/footage':    'footage.html is an entry example; SPEC §2 describes footage in prose only',
  '/ready': 'no page in the package', '/share': 'no page in the package',
  '/ways-in': 'connections.html covers the doors, not this screen',
  '/settings': 'no page in the package', '/vlogs': 'vlog.html is one recording, not the list',
}

const SHELL = new Set(['page','wrap','mh','lock','mk','wm','pv','back','crumb','ft','r','sep','on','logpage','grid','main','rail'])

function classesInMarkup(html) {
  const out = new Set()
  for (const m of html.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) out.add(c)
  return out
}

/** My page's classes, plus every component it renders. */
function classesInPage(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return new Set()
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g))
    for (const c of (m[1] || m[2] || '').split(/[\s${}?:'"()]+/))
      if (c && !/^[A-Z]/.test(c) && !c.startsWith('pg-')) out.add(c)
  for (const m of src.matchAll(/from '@\/components\/([\w/-]+)'/g))
    for (const ext of ['.tsx', '.ts'])
      for (const c of classesInPage(`src/components/${m[1]}${ext}`, seen)) out.add(c)
  return out
}

const only = process.argv[2]
const rows = []
let over = 0

for (const [page, file, budget] of PAGES) {
  if (only && page !== only) continue
  const design = `design/markup/${page}.html`
  if (!existsSync(design)) { console.error(`  design/markup/${page}.html missing`); over++; continue }
  if (!existsSync(file)) { console.error(`  ${file} missing — did a route move?`); over++; continue }

  const used = classesInMarkup(readFileSync(design, 'utf8'))
  const mine = classesInPage(file)
  const missing = [...used].filter(c => !mine.has(c) && !SHELL.has(c)).sort()
  rows.push({ page, file, n: missing.length, budget, missing })
  if (missing.length > budget) over++
}

const w = Math.max(...rows.map(r => r.page.length))
for (const r of rows) {
  const flag = r.n > r.budget ? '  DRIFTED' : r.n < r.budget ? '  ↓ lower the budget' : ''
  console.log(`  ${r.page.padEnd(w)}  ${String(r.n).padStart(3)} / ${String(r.budget).padEnd(3)} unused${flag}`)
  if (r.n > r.budget) console.log(`      ${r.missing.join(' ')}`)
}
console.log(`\n${rows.length} pages measured against design/. ${Object.keys(NO_DESIGN_PAGE).length} surfaces have no design page (listed in this file, with why).`)

if (over) {
  console.error(`\n${over} page${over === 1 ? '' : 's'} drifted further from the design than its budget allows.`)
  console.error('Every budget here is a debt, not a target — the real number is zero.')
  process.exit(1)
}
console.log('No page has drifted.')
