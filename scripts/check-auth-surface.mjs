#!/usr/bin/env node
/**
 * Which routes answer without signing in — and what they are allowed to
 * select.
 *
 * Everything in `src/app/api` calls `requireOperator` except five, and those
 * five are the product's entire unauthenticated surface. A sixth appearing
 * is not an error anywhere: it builds, it typechecks, it deploys, and it
 * serves whatever it queries to anyone who asks. Adding `requireOperator` is
 * one line; forgetting it is also one line, and only this notices.
 *
 * ── The second half, which is the one that bit ────────────────────────────
 *
 * Being unauthenticated is not itself the bug. `/sitemap.xml` is supposed to
 * be readable by a crawler. What it published was the wrong SET: it listed
 * `/page/{id}` for every page with `entry_count > 0`, and that column counts
 * every entry on a page, private and held included. A page whose entries
 * were all private had its existence and address handed out.
 *
 * So an unauthenticated route must show that it filters. It either goes
 * through `loadPublicFeed` — which hard-codes `visibility = 'public'` with no
 * flag to turn it off — or it names `visibility` itself. A route that reads
 * `log_entries` or `pages` and does neither is reported.
 *
 * ⚠️ **`publicOnly` is not a filter this check will accept.** `loadAsks`
 * takes that flag and a query string can clear it; that is safe only because
 * its route requires the operator. A gate a caller can switch off is not a
 * gate on a path with no caller check.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The five, with what each is for. ⚠️ This is a record of decisions. Adding a
 * name is a deliberate act with a reason, not a way to quiet the check.
 */
const OPEN = {
  '/feed.xml': 'RSS. loadPublicFeed.',
  '/feed.json': 'JSON Feed. loadPublicFeed.',
  '/sitemap.xml': 'public addresses. loadPublicFeed + an EXISTS on a public entry.',
  '/llms.txt': 'what the site is, with public counts only.',
  '/api/debug/whoami':
    'exists for when AUTH is what is broken, so it cannot require auth. '
    + 'Answers with booleans and header names — no values, and no table.',
}

/** A route touching either of these is answering with the log itself. */
const SENSITIVE = /\b(log_entries|FROM pages|JOIN pages)\b/

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === 'route.ts') out.push(p)
  }
  return out
}

const files = walk('src/app')
const unexpected = []
const ungated = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  if (src.includes('requireOperator')) continue

  const route = file.replace(/^src\/app/, '').replace(/\/route\.ts$/, '')
  if (!(route in OPEN)) { unexpected.push(route); continue }

  // It is on the list — now check what it selects.
  if (!SENSITIVE.test(src)) continue
  // ⚠️ The CALL, not the import. Matching `loadPublicFeed` anywhere in the
  // file passed a route that still imported it and had stopped calling it —
  // which is exactly how a gate goes missing during an edit.
  const gated = /loadPublicFeed\s*\(/.test(src) || /visibility\s*=\s*'public'/.test(src)
  if (!gated) ungated.push(route)
}

console.log(`${files.length} routes checked. ${Object.keys(OPEN).length} answer without signing in.`)

let bad = 0
if (unexpected.length) {
  bad++
  console.error(`\n${unexpected.length} route(s) with no requireOperator and no reason recorded:\n`)
  for (const r of unexpected) console.error('  ' + r)
  console.error(
    '\nAdd `requireOperator`, or record it in OPEN with why it cannot have one.'
    + '\nA /public/ path in this product means the machine layer, NOT unauthenticated.\n',
  )
}
if (ungated.length) {
  bad++
  console.error(`\n${ungated.length} unauthenticated route(s) read the log without filtering it:\n`)
  for (const r of ungated) console.error('  ' + r)
  console.error(
    "\nGo through `loadPublicFeed`, or name `visibility = 'public'` in the query."
    + '\n`publicOnly` does not count — a caller can clear it.\n',
  )
}
if (bad) process.exit(1)
console.log('Every open route is recorded, and every one that reads the log filters it.')
