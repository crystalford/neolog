#!/usr/bin/env node
/**
 * A library nothing imports.
 *
 * `check-unreached-routes.mjs` catches an API route with no caller. This is
 * the same shape one level down, and it has now happened three times:
 *
 *   `src/lib/vision.ts`   — BOTH functions, written and never imported. So
 *                           `vision_status` stayed 'pending' on every
 *                           recording and `/footage`'s second index — find a
 *                           clip by what was in the frame — had no data at
 *                           all. Three files and CLAUDE.md described it as
 *                           live; none of them was a caller.
 *   `src/lib/design.ts`   — the token module, unimported since the design
 *                           package was vendored, and drifted: `--fg-3`
 *                           #71717a where the screen renders #9a9aa4.
 *   `src/lib/llm.ts`      — 380 of its 474 lines were the extraction
 *                           engine's tier routing, including a live path to
 *                           `api.anthropic.com` that nothing selected.
 *
 * ⚠️ **A mention in a comment is not an importer.** That is exactly how
 * `vision.ts` looked alive: `footage/route.ts` said "src/lib/vision.ts
 * writes them from the thumbnail", `log-intake.ts` said "the call shape
 * vision.ts already uses in production". Both were describing something
 * that had stopped happening. Only a real `import` counts here.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Libraries with no importer, on purpose. A name needs a reason.
 */
const UNIMPORTED_ON_PURPOSE = {
  'anthropic.ts':
    'Anthropic is a paid opt-in the operator has not taken. Wiring it is a '
    + 'deliberate act, and NO branch reaching it is what "nothing currently '
    + 'calls it" should mean.',
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(p)
  }
  return out
}

const libs = walk('src/lib')
const corpus = []
for (const dir of ['src', 'workers', 'scripts']) {
  try { walk(dir, corpus) } catch {}
}
for (const f of ['scripts']) {
  try {
    for (const e of readdirSync(f)) if (e.endsWith('.mjs')) corpus.push(join(f, e))
    for (const e of readdirSync(join(f, 'test'))) if (e.endsWith('.mjs')) corpus.push(join(f, 'test', e))
  } catch {}
}

const orphans = []
for (const lib of libs) {
  const name = lib.split('/').pop()
  const stem = name.replace(/\.tsx?$/, '')
  // A real import of this module, by either spelling. NOT a mention.
  // ⚠️ Static AND dynamic. The first version matched only `import … from`
  // and reported `photo-client.ts` as dead — `useIntake.ts` reaches it with
  // `await import('@/lib/photo-client')`, so EXIF reading was live all
  // along. A check that cries wolf is worse than no check: it teaches the
  // next reader to skim the output.
  const path = `(?:@/lib/${stem}|\\./${stem}|\\.\\./lib/${stem}|[^'"]*/src/lib/${stem})`
  const re = new RegExp(
    `(?:(?:import|from)\\s+[^\\n]*['"]${path}['"]|import\\s*\\(\\s*['"]${path}['"])`,
  )
  let imported = false
  for (const f of corpus) {
    if (f === lib) continue
    if (re.test(readFileSync(f, 'utf8'))) { imported = true; break }
  }
  if (!imported && !(name in UNIMPORTED_ON_PURPOSE)) orphans.push(lib)
}

console.log(`${libs.length} libraries in src/lib. ${Object.keys(UNIMPORTED_ON_PURPOSE).length} unimported on purpose.`)
if (orphans.length) {
  console.error(`\n${orphans.length} librar${orphans.length === 1 ? 'y' : 'ies'} nothing imports:\n`)
  for (const o of orphans) console.error('  ' + o)
  console.error(
    '\nWire it to the surface it was written for, delete it, or record it in'
    + '\nUNIMPORTED_ON_PURPOSE with the reason. A mention in a comment is not'
    + '\nan importer — that is exactly how vision.ts looked alive.\n',
  )
  process.exit(1)
}
console.log('Every library has an importer.')
