#!/usr/bin/env node
/**
 * A page's stylesheet that no page renders.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The third of these, and the same shape as the two below it:
 * `check-unreached-routes.mjs` finds a route with no caller,
 * `check-unreached-lib.mjs` finds a library with no importer, and this finds
 * a `.logpage.pg-<page>` block with no page that renders it.
 *
 * It hides the way the other two do — as nothing. The CSS parses, every
 * `var()` in it resolves, `check-design-css.mjs` reads it and reports the
 * page as MATCHING the design, and the page it was written for either does
 * not exist or renders under a different scope. Four of these were found on
 * 9 Sep, 350 rules between them:
 *
 *   pg-wrong   84 rules, faithfully transcribed, and `wrong.html` had no
 *              route at all — the corrections record sat unbuilt behind a
 *              complete stylesheet.  (Now /corrections, so it is not here.)
 *   pg-now     77 rules, and /now renders `.nowpage` as its root. The page
 *              was fine; the CHECK was measuring the dead block, so /now
 *              read 4 rules out when it was 9.
 *   pg-term    157 rules for term.html, which is the public log showing one
 *              entry to a stranger — /public and /entry/[id] between them,
 *              built twice already. SPEC §3: nothing is designed twice.
 *   pg-idea    67 rules for an entry example. `/entry/[id]` is that page.
 *   pg-export  49 rules for a PRINTED export document — `doc-page`, pt units,
 *              a light ground. /export is takeout.html and the export is
 *              Markdown plus a JSON manifest. If a printed export is ever
 *              built, the design is where it always was, in
 *              `design/css/export.css`.
 *
 * ⚠️ A scope belongs in KNOWN below only when the page it styles is one this
 * product has decided not to build, with the decision written down — not
 * when it is merely unfinished. The first question is always whether the
 * page should be built.
 *
 * Run: node scripts/check-unreached-css.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync('src/app/globals.css', 'utf8')

/**
 * Scopes with no route, on purpose. Empty today: every one found on 9 Sep
 * was either built (`wrong`) or deleted, because a stylesheet for a page
 * that will never exist is 50 to 160 lines nobody can tell from live code.
 */
const KNOWN = {}

/** Every .tsx under src/ — the only place a scope class can be rendered. */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}
const src = walk('src').map(f => readFileSync(f, 'utf8')).join('\n')

const scopes = [...new Set([...css.matchAll(/\.logpage\.(pg-[a-z0-9-]+)/g)].map(m => m[1]))].sort()

let dead = 0
for (const s of scopes) {
  const rules = (css.match(new RegExp(`\\.logpage\\.${s}\\b`, 'g')) || []).length
  // A className is a string in the source, so a bare occurrence is enough —
  // and it must be enough, because the class can be joined, templated or
  // put in an array (`/now` builds its scope with `cls.push`).
  if (new RegExp(`\\b${s}\\b`).test(src)) continue
  if (KNOWN[s]) { console.log(`  ${s.padEnd(16)} ${String(rules).padStart(3)} rules · ${KNOWN[s]}`); continue }
  console.error(`  ${s.padEnd(16)} ${String(rules).padStart(3)} rules and no page renders it`)
  dead++
}

console.log(`\n${scopes.length} page scopes in globals.css, checked against every .tsx in src/.`)
if (dead) {
  console.error(`\n${dead} scope(s) style a page that does not exist.`)
  console.error('Either the page should be built, or the rules should go — a stylesheet')
  console.error('nobody renders is indistinguishable from live code when you read it.')
  process.exit(1)
}
console.log('Every page scope is rendered by a page.')
