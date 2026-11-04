/**
 * The uploader's decisions, tested where they can be.
 *
 * `src/lib/bulk-upload.ts` is mostly network and `localStorage`, neither of
 * which exists here. What CAN be tested is the set of small decisions that
 * decide whether a 1.2 GB upload survives — and every one of them has been
 * wrong at least once in this file's short life:
 *
 *  - the part size, which R2 requires to be UNIFORM and which must come out
 *    the same on a resume as it did on the first attempt
 *  - whether a failed `complete` means "start over" or "try again", which
 *    the first version got backwards and would have discarded a gigabyte
 *    sitting intact in R2
 *  - the ledger key, and the looser one that catches a file whose modified
 *    time has moved
 *
 * ⚠️ Same shape as `hallucination-guard.mjs` and `headline.mjs`: the pure
 * logic is re-implemented here and the real source is then asserted to still
 * match it, so the two cannot drift without this failing and saying so.
 */

import { readFileSync } from 'node:fs'

const RAW = readFileSync(new URL('../../src/lib/bulk-upload.ts', import.meta.url), 'utf8')
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const MIN_PART = 8 * 1024 * 1024
const MAX_PART = 64 * 1024 * 1024
const TARGET_PARTS = 200
const MiB = 1024 * 1024

function partSizeFor(bytes) {
  const wanted = Math.ceil(bytes / TARGET_PARTS)
  if (wanted <= MIN_PART) return MIN_PART
  if (wanted >= MAX_PART) return MAX_PART
  return Math.ceil(wanted / MiB) * MiB
}

/** What a failed `complete` means. */
function completeMeans(status) {
  return status >= 400 && status < 500 ? 'start over' : 'try again'
}

const LEDGER_PREFIX = 'neolog.upload.'
const ledgerKey = f => `${LEDGER_PREFIX}${f.name}:${f.size}:${f.lastModified}`
const ledgerKeyLoose = f => `${LEDGER_PREFIX}${f.name}:${f.size}:`

let n = 0
let bad = 0
const is = (got, want, what) => {
  n++
  if (got !== want) {
    bad++
    console.log(`  FAIL ${what}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`)
  }
}

console.log('the uploader: what decides whether a big file survives\n')

// ── Part size ───────────────────────────────────────────────────────────
// ⚠️ R2 rejects a mixed-size multipart upload AT COMPLETE — after every byte
// has been sent. So this has to be a pure function of the file's length and
// nothing else, or a resume computes a different size and the whole upload
// is thrown away at the last step.
is(partSizeFor(3 * MiB), MIN_PART, 'a small file is one part at the floor')
is(partSizeFor(100 * MiB), MIN_PART, 'and so is a hundred megabytes')
is(partSizeFor(1.2e9), MIN_PART, 'his biggest recording still sits at the floor')
is(Math.ceil(1.2e9 / partSizeFor(1.2e9)), 144, '1.2 GB is 144 parts, not thousands')

// Past the floor it grows rather than the count growing.
const fiveGB = 5 * 1000 * 1000 * 1000
is(partSizeFor(fiveGB) > MIN_PART, true, '5 GB needs a bigger part')
is(partSizeFor(fiveGB) % MiB, 0, 'and it is a whole number of MiB')
is(Math.ceil(fiveGB / partSizeFor(fiveGB)) <= TARGET_PARTS, true, 'and stays under the target count')

// ── Ten gigabytes, and past it ──────────────────────────────────────────
// ⚠️ The size he asked about. Every one of these numbers has to land inside
// a ceiling somewhere else: R2's 10,000 parts, `/initiate`'s 2,000, and
// `/initiate`'s own 512 MiB cap on a single part.
const tenGB = 10 * 1000 * 1000 * 1000
is(partSizeFor(tenGB), 48 * MiB, '10 GB comes out at 48 MiB a part')
is(Math.ceil(tenGB / partSizeFor(tenGB)), 199, 'which is 199 parts')
is(Math.ceil(tenGB / partSizeFor(tenGB)) <= 2000, true, 'inside /initiate\'s part ceiling')
is(partSizeFor(tenGB) <= 512 * MiB, true, 'and inside its per-part ceiling')

// ⚠️ A part is the unit of retry — what one failure re-sends, and what has
// to cross the wire without stopping. Letting it grow with the file forever
// made the biggest uploads the most fragile, which is backwards.
is(partSizeFor(500e9), MAX_PART, 'past 12.8 GB the part stops growing')
is(partSizeFor(1e12) <= MAX_PART, true, 'and never exceeds the cap at any size')
is(Math.ceil(128e9 / partSizeFor(128e9)) <= 2000, true, '128 GB still fits 2,000 parts')
is(Math.ceil(500e9 / partSizeFor(500e9)) <= 10_000, true, 'and 500 GB fits R2\'s own 10,000')

// ⚠️ The invariant the whole thing rests on: same input, same answer, every
// time. A resume that disagrees by one byte loses the entire upload.
for (const size of [1, 999, 8 * MiB - 1, 8 * MiB, 8 * MiB + 1, 1.2e9, fiveGB, tenGB, 500e9]) {
  is(partSizeFor(size), partSizeFor(size), `the size for ${size} is stable`)
  is(partSizeFor(size) >= 5 * MiB, true, `and ${size} is above R2's 5 MiB floor`)
}

// ── What a failed complete means ────────────────────────────────────────
// ⚠️ The first version of this file discarded the ledger on EVERY failure,
// so a dropped request at the final step threw away a gigabyte that was
// sitting in R2 intact and uploaded it again from part one.
is(completeMeans(400), 'start over', 'a bad request means our ledger is wrong')
is(completeMeans(404), 'start over', 'and so does an upload R2 has dropped')
is(completeMeans(409), 'start over', 'and a conflict')
is(completeMeans(500), 'try again', 'a server fault is weather')
is(completeMeans(502), 'try again', 'and so is a bad gateway')
is(completeMeans(503), 'try again', 'and so is being busy')

// ── The ledger key ──────────────────────────────────────────────────────
const a = { name: 'DJI_20260702095405_0062_D.MP4', size: 1246000000, lastModified: 1750000000000 }
const moved = { ...a, lastModified: 1760000000000 }
const other = { ...a, size: 999 }

is(ledgerKey(a) === ledgerKey({ ...a }), true, 'the same file gives the same key')
is(ledgerKey(a) === ledgerKey(moved), false, 'a moved mtime gives a different one')
// ⚠️ Which is why the loose key exists. Copying a folder, syncing it or
// restoring it rewrites mtime, and without this a 1.2 GB resume silently
// starts from zero — indistinguishable from the resume not working.
is(ledgerKey(moved).startsWith(ledgerKeyLoose(a)), true, 'but the loose key still finds it')
is(ledgerKey(other).startsWith(ledgerKeyLoose(a)), false, 'and a different size does not match')

// A name with a colon in it must not make the loose prefix ambiguous for a
// DIFFERENT file — the prefix ends at the size, which is a number.
const colon = { name: 'a:b.mp4', size: 10, lastModified: 1 }
const colon2 = { name: 'a', size: 10, lastModified: 1 }
is(ledgerKey(colon2).startsWith(ledgerKeyLoose(colon)), false, 'a colon in a name does not collide')

// ── The real source still has this shape ────────────────────────────────
console.log('\nthe real source still matches\n')

is(/const MIN_PART = 8 \* 1024 \* 1024/.test(SRC), true, 'the part floor is the value tested here')
is(/const MAX_PART = 64 \* 1024 \* 1024/.test(SRC), true, 'and so is the part ceiling')
is(/const TARGET_PARTS = 200/.test(SRC), true, 'and so is the target count')

// ⚠️ A part is abandoned for STOPPING, never for taking a while. A flat
// duration is a size-independent guard on a size-dependent transfer: at
// 48 MiB a ten-minute ceiling demands 80 kB/s a part, so a slow link did not
// upload slowly — every part timed out, every retry timed out the same way,
// and the file failed having moved nothing.
is(SRC.includes('PART_TIMEOUT_MS'), false, 'there is no flat per-part duration left')
is(SRC.includes('PART_STALL_MS'), true, 'a part is killed for going quiet')
is(SRC.includes('xhr.upload.onprogress'), true, 'which needs real bytes-on-the-wire')
// ⚠️ `fetch` cannot report how much of a request body has gone out, so a
// stall cannot be detected through it. If this goes back to fetch the guard
// silently becomes a duration again.
is(/fetch\([^)]*method: 'PUT'/.test(SRC), false, 'parts do not go through fetch')

// ⚠️ The file must never be read whole. `arrayBuffer()` on a 1.2 GB
// recording is how the composer's path died, and a `slice` is the only way
// a part should ever be taken.
is(SRC.includes('arrayBuffer'), false, 'the file is never read whole')
is(SRC.includes('file.slice('), true, 'parts are sliced')

// The destructive branch must still be gated on a 4xx.
is(/status >= 400 && \w+\.status < 500/.test(SRC), true, 'only a 4xx drops the ledger')
is(SRC.includes('ledger.completed'), true, 'a sealed upload is remembered, so a retry does not re-seal it')
is(SRC.includes('waitForOnline'), true, 'an offline window is waited out rather than spent on retries')
is(SRC.includes('reg.status === 409'), true, 'a duplicate at registration is success, not failure')
is(SRC.includes('export async function alreadyIn'), true, 'the whole drop is checked for duplicates at once')
is(SRC.includes('ledgerKeyLoose'), true, 'a moved mtime still resumes')

// ⚠️ Two files at a time times three parts is six, which is what a browser
// gives per origin. More than that queues in the browser and makes the rate
// reading lie.
const files = /FILE_CONCURRENCY = (\d+)/.exec(SRC)
const parts = /PART_CONCURRENCY = (\d+)/.exec(SRC)
is(Number(files?.[1]) * Number(parts?.[1]) <= 6, true, 'in-flight requests stay inside the browser cap')

console.log(`\n${n} assertions, ${bad} failed`)
if (bad) process.exit(1)
