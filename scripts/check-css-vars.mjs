#!/usr/bin/env node
/**
 * Every CSS variable used is defined.
 *
 * `design/css/*` was installed verbatim on 8 Sep and refers to the design's
 * own names — `--body`, `--mono`, `--steel`, `--teal`, the territory colours.
 * This file had named the same values `--font-body`, `--font-mono`,
 * `--t-steel`. So every rule in twenty-four installed page stylesheets that
 * used one of them resolved to nothing: fonts fell back to the browser
 * default, colours to unset. Nothing failed. The build was green, the page
 * rendered, and it was simply wrong in a way you would have to notice by eye.
 *
 * `--c` and `--h` are the other shape of the same bug: per-element custom
 * properties the design sets inline. Where the markup does not set one, the
 * rule must still resolve to something legible, so they carry a default.
 *
 * Run: node scripts/check-css-vars.mjs
 */

import { readFileSync } from 'node:fs'

const css = readFileSync('src/app/globals.css', 'utf8')

// Definitions from anywhere — :root, a scoped block, or an inline default.
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]))
const used = new Map()
for (const m of css.matchAll(/var\((--[a-z0-9-]+)/gi)) {
  if (!used.has(m[1])) used.set(m[1], css.slice(0, m.index).split('\n').length)
}

const missing = [...used.keys()].filter(v => !defined.has(v)).sort()

console.log(`${used.size} variables used, ${defined.size} defined.`)
if (missing.length) {
  console.error(`\n${missing.length} used but never defined:\n`)
  for (const v of missing) console.error(`  ${v}  (first used line ${used.get(v)})`)
  console.error('\nA var that resolves to nothing does not fail — it just renders wrong.')
  process.exit(1)
}
console.log('Every variable resolves.')
