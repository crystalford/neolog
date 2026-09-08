#!/usr/bin/env node
/**
 * Nothing may delete a recording.
 *
 * The files in R2 are the only data this product preserves. Everything else —
 * the log, the transcripts, the pages — is rebuildable from them, and on
 * 8 Sep everything else was deliberately thrown away. That makes an R2 delete
 * the one unrecoverable action in the codebase.
 *
 * Three handlers had one as recently as this morning: the per-recording
 * DELETE, the bulk delete (offering it for a whole selection at once), and
 * the reset route's ancestor. All three now bury the row and keep the bytes.
 *
 * So: `deleteObject` may exist in `src/lib/r2.ts`, which defines it, and
 * nowhere else. A call site is a bug regardless of what guards it — a
 * confirmation dialog is not a defence against a code path that should not
 * exist.
 *
 * If a real need ever appears (a file uploaded twice, say), add the path to
 * ALLOWED below with the reason, on purpose, in a commit that says so.
 *
 * Run: node scripts/check-r2-safety.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = process.cwd()
const ROOTS = ['src', 'workers']

/** Where `deleteObject` is allowed to appear, and why. */
const ALLOWED = new Map([
  ['src/lib/r2.ts', 'defines it'],
])

function walk(dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}

const problems = []
let scanned = 0

for (const r of ROOTS) {
  for (const file of walk(join(ROOT, r))) {
    scanned++
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    if (ALLOWED.has(rel)) continue
    const text = readFileSync(file, 'utf8')
    // Strip comments: this file and several others discuss the rule in prose,
    // and a comment saying "there must never be a deleteObject here" is the
    // opposite of a violation.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const lines = code.split('\n')
    lines.forEach((line, i) => {
      if (/\bdeleteObject\b/.test(line) || /\bVIDEOS\.delete\s*\(/.test(line)) {
        problems.push({ file: rel, line: i + 1, text: line.trim().slice(0, 100) })
      }
    })
  }
}

console.log(`Checked ${scanned} files for anything that deletes a recording.`)

if (problems.length) {
  console.error(`\n${problems.length} path${problems.length === 1 ? '' : 's'} can delete a file in R2:\n`)
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  ${p.text}`)
  }
  console.error('\nThe recordings are the only data this product preserves.')
  console.error('Bury the row instead, or add the path to ALLOWED with a reason.')
  process.exit(1)
}

console.log('Nothing can delete a recording.')
