#!/usr/bin/env node
/**
 * Every kind on the log is reachable.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 *
 * §0 rule 5 is "necessity before schema — seven kinds, and nothing else
 * until a real entry needs one." The mirror of that rule is a kind in the
 * schema that no real entry can ever BE, and `ideas` was exactly that: it
 * sat in `ENTRY_KINDS`, in the feed's filter, in the entry page's
 * `KIND_WORD` and in `entry-schema.ts`'s `TYPE_FOR_KIND`, and **no INSERT or
 * UPDATE anywhere set it**. The log offered a filter for a kind it could not
 * hold, and every check in the repo was green: the column exists, the type
 * is TEXT, the value is legal.
 *
 * `wrong.html` case 4 is the answer — "Rename it and change its kind". The
 * log files an entry by the shape of what arrived (a pasted link is `read`,
 * an upload is `seen`, anything typed is `said`), which is a guess, and the
 * whole product is built on guesses being cheap to correct.
 *
 * Run: node scripts/test/kinds.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : (fail++, console.error('  FAIL ' + n)) }

const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/.*$/gm, ' ')

const lib = readFileSync('src/lib/log-entry.ts', 'utf8')
const KINDS = [...(/export const ENTRY_KINDS[^=]*=\s*\[([\s\S]*?)\]/.exec(lib)?.[1] ?? '')
  .matchAll(/'([a-z_]+)'/g)].map(m => m[1])

ok('ENTRY_KINDS is readable', KINDS.length > 0)
ok('and there are seven of them', KINDS.length === 7)

// ── The correction that makes any kind reachable ─────────────────────────
{
  const route = strip(readFileSync('src/app/api/v2/log/[id]/route.ts', 'utf8'))
  ok('the entry PATCH accepts a kind', /body\.kind/.test(route))
  // ⚠️ Validated against the list, never taken on trust — SQLite will store
  // any string in a TEXT column and no check in this repo would object.
  ok('and validates it against ENTRY_KINDS',
    /ENTRY_KINDS\.includes\(body\.kind/.test(route))
  ok('and records what it used to be filed as', /note\('kind'/.test(route))

  const page = strip(readFileSync('src/app/(app)/entry/[id]/page.tsx', 'utf8'))
  ok('the entry rail offers every other kind',
    /ENTRY_KINDS\.filter\(k => k !== e\.kind\)/.test(page))
  ok('and patches with it', /patch\(\{ kind: k \}\)/.test(page))
}

// ── No kind is a dead letter ─────────────────────────────────────────────
//
// A kind is reachable if something WRITES it, or if the correction above can
// reach it — which, being a filter over the whole list, reaches all of them.
// So this asserts the weaker, sharper thing: every kind is spelled the same
// everywhere it is named, and none has been left out of the words the log
// uses for it.
{
  const page = readFileSync('src/app/(app)/entry/[id]/page.tsx', 'utf8')
  const words = /const KIND_WORD[^=]*=\s*\{([\s\S]*?)\n\}/.exec(page)?.[1] ?? ''
  for (const k of KINDS) {
    ok(`\`${k}\` has a word the log says for it`, new RegExp(`\\b${k}\\s*:`).test(words))
  }

  const schema = readFileSync('src/lib/entry-schema.ts', 'utf8')
  const types = /TYPE_FOR_KIND[^=]*=\s*\{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? ''
  for (const k of KINDS) {
    ok(`\`${k}\` maps to a schema.org type`, new RegExp(`\\b${k}\\s*:`).test(types))
  }
}

// ── And the correction is a correction, not a silent edit ────────────────
{
  const corr = readFileSync('src/lib/corrections.ts', 'utf8')
  ok('a kind change reads as a correction on /corrections', /\bkind:\s*\{/.test(corr))
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
