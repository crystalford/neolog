#!/usr/bin/env node
/**
 * A held entry gives up nothing, on any surface, in any sense.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *
 * SPEC §0.2: what the operator UPLOADS lands `held` and is released only
 * after the vision check has looked at it. Being wrong towards private is
 * the only safe direction, so every failure path holds back.
 *
 * CLAUDE.md states the operative test, and it is not about appearance:
 *
 *   "'Held' means every sense, not just the picture… When a new kind of
 *    media reaches `LogRow`, the question is not 'should it blur' — it is
 *    'does `held` reach it at all'."
 *
 * ── What was wrong ───────────────────────────────────────────────────────
 *
 * `LogRow` has withheld a held picture since the feed was built. `/entry/[id]`
 * never did: it put `className="blur"` on a live `<img src>` — so the URL was
 * in the response, the browser fetched the bytes, and a CSS filter was the
 * only thing between the operator and a file the log had NOT LOOKED AT. The
 * `<audio>` and `<video>` branches beside it did not even blur.
 *
 * The fix is at the API, not the page: `/api/v2/log/[id]` no longer presigns
 * a held row, so a client cannot show what it was never sent. This checks
 * both halves, because either alone would let it back.
 *
 * Run: node scripts/test/held.mjs
 */

import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : (fail++, console.error('  FAIL ' + n)) }

/** Comments say what the code should do; only the code does it. */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/.*$/gm, ' ')

// ── The API withholds the URL ────────────────────────────────────────────
{
  const code = strip(readFileSync('src/app/api/v2/log/[id]/route.ts', 'utf8'))
  ok('the entry API does not presign a held row',
    /visibility !== 'held'/.test(code) && /presignGetUrl/.test(code))
  // The guard has to sit ON the presign, not merely somewhere in the file.
  const presign = /if \([^)]*r2_key[^)]*\)\s*\{[\s\S]{0,200}?presignGetUrl/.exec(code)
  ok('and the guard is on the presign itself',
    !!presign && /visibility !== 'held'/.test(presign[0]))
}

// ── The entry page renders no URL for a held entry ───────────────────────
{
  const code = strip(readFileSync('src/app/(app)/entry/[id]/page.tsx', 'utf8'))

  ok('a held entry renders the design’s placeholder',
    /className="still"/.test(code) && /not shown/.test(code))

  // ⚠️ The blur is gone and must stay gone: it is a filter over bytes the
  // browser already holds, which is not withholding anything.
  ok('no blur class survives on the entry page', !/['"]blur['"]/.test(code))

  // Every media element must sit on the NOT-held side of the branch.
  const heldBranch = /\{held \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}/.exec(code)
  ok('the media block branches on held', !!heldBranch)
  if (heldBranch) {
    const [, whenHeld] = heldBranch
    for (const tag of ['<img', '<audio', '<video', 'href=']) {
      ok(`a held entry renders no ${tag.replace(/[<=]/g, '')}`, !whenHeld.includes(tag))
    }
    ok('and no media_url reaches the held branch', !/media_url/.test(whenHeld))
  }

  // The placeholder is chosen off r2_key, not media_url — a held entry HAS a
  // file, and saying so is not the same as showing it.
  ok('the placeholder is driven by r2_key', /held \? e\.r2_key : e\.media_url/.test(code))
}

// ── The feed still withholds, in all three senses ────────────────────────
{
  const code = strip(readFileSync('src/components/LogRow.tsx', 'utf8'))
  ok('the feed withholds a held picture', /held\s*\n?\s*\?\s*<span className="still"/.test(code))
  ok('the feed withholds a held video frame', /held\s*\n?\s*\?\s*<span className="vid"/.test(code))
  // A poster is a still out of a file the log has not looked at; audio is the
  // same leak with a different sense.
  ok('and a held entry never plays', /audio && audio\.url && !held/.test(code))
}

// ── /triage is the third surface, and it leaked the same way ─────────────
{
  const api = strip(readFileSync('src/app/api/v2/triage/route.ts', 'utf8'))
  ok('the triage API does not presign a held row', /visibility !== 'held'/.test(api))

  const page = strip(readFileSync('src/app/(app)/triage/page.tsx', 'utf8'))
  ok('and triage renders the placeholder instead', /className="still"/.test(page))
  ok('with no blur class left on it', !/['"]blur['"]/.test(page))
}

// ── The stylesheet offers no blur to fall back on ────────────────────────
//
// ⚠️ `backdrop-filter` is excluded deliberately: that is the lightbox's
// scrim, which obscures the PAGE behind a dialog and has nothing to do with
// a file. What must not exist is `filter: blur` on an image — a rule sitting
// in the sheet is an invitation to render the picture and let CSS "handle"
// it, which is precisely what two surfaces were doing.
{
  const css = readFileSync('src/app/globals.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const blurs = [...css.matchAll(/(^|[^-])filter:\s*blur/g)]
  ok('no image-blur rule remains in the stylesheet', blurs.length === 0)
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
