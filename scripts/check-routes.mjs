#!/usr/bin/env node
/**
 * Check that every API path the client fetches actually exists as a route.
 *
 * Companion to `check-sql-columns.mjs`, and it exists for the same reason: a
 * fetch to a path that was never built, or was renamed, is a runtime 404 that
 * `tsc` and `next build` are both blind to. The page renders, the list is
 * empty, and it looks like "no data yet" rather than a bug.
 *
 * It resolves Next's App Router conventions — `[id]` and `[...slug]` segments
 * match any value — and reports any fetched path with no route file behind it.
 *
 * Run: node scripts/check-routes.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = process.cwd()
const API_DIR = join(ROOT, 'src/app/api')

// ── Every route.ts under src/app/api, as a matchable pattern ─────────────
const routes = []
function collect(dir, segs = []) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collect(p, [...segs, name])
    else if (name === 'route.ts' || name === 'route.tsx') routes.push(segs)
  }
}
// Segments are collected relative to src/app/api, so the 'api' prefix
// that every fetched path carries has to be put back.
collect(API_DIR, ['api'])

/** A route segment list matches a fetched path's segments. */
function matches(routeSegs, pathSegs) {
  // A catch-all swallows the rest.
  const catchAll = routeSegs.findIndex(s => s.startsWith('[...'))
  if (catchAll >= 0) {
    if (pathSegs.length < catchAll) return false
    return routeSegs.slice(0, catchAll).every((s, i) => seg(s, pathSegs[i]))
  }
  if (routeSegs.length !== pathSegs.length) return false
  return routeSegs.every((s, i) => seg(s, pathSegs[i]))
}
function seg(routeSeg, pathSeg) {
  if (pathSeg === undefined) return false
  // Route groups like (app) never appear in a URL.
  if (routeSeg.startsWith('(') && routeSeg.endsWith(')')) return true
  if (routeSeg.startsWith('[')) return true          // dynamic: matches anything
  return routeSeg === pathSeg
}

// ── Every /api/... path fetched from src ─────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}

const problems = []
let checked = 0

for (const file of walk(join(ROOT, 'src'))) {
  const src = readFileSync(file, 'utf8')
  // fetch('/api/...') and fetch(`/api/...`), including template literals.
  for (const m of src.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"?\s]*)/g)) {
    const raw = m[1]
    // Template holes become a wildcard segment.
    const path = raw.replace(/\$\{[^}]*\}/g, '*')
    const segs = path.split('/').filter(Boolean)
    checked++
    const hit = routes.some(r => matches(r, segs))
    if (!hit) {
      const line = src.slice(0, m.index).split('\n').length
      problems.push(`${file.replace(ROOT + '/', '')}:${line}  ${raw}`)
    }
  }
}

console.log(`Routes found: ${routes.length}.`)
console.log(`Checked ${checked} fetched API paths in src/.`)

if (problems.length) {
  console.error(`\n${problems.length} fetch${problems.length === 1 ? '' : 'es'} to a path with no route:\n`)
  for (const p of [...new Set(problems)]) console.error('  ' + p)
  console.error('')
  process.exit(1)
}
console.log('Every fetched API path has a route.')
