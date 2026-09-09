#!/usr/bin/env node
/**
 * A function called in the FFmpeg container's server that nothing defines.
 *
 * ── Why this file has no other cover ─────────────────────────────────────
 *
 * `workers/ffmpeg/server.js` is plain JavaScript and it is excluded from
 * `tsconfig.workers.json` — that package depends on `@cloudflare/containers`
 * installed in its own node_modules and shares no code with `src/`. So
 * nothing in this repo typechecks it. `wrangler deploy` transpiles the
 * WORKER, not the container image, and `node --check` only parses: a call to
 * an undefined function is a runtime error, not a syntax one, so it passes.
 *
 * On 9 Sep the seven dead production-engine endpoints were removed from that
 * file by a script that counted braces without skipping the ones inside
 * strings and template literals. Cutting `trim` and `concat` overran into
 * their neighbours and took **three live helpers** with them —
 * `downloadToTmp`, `sweepStaleTmpDirs` and `runFfmpeg`. `/transcode-h264`
 * and `/extract-audio` would each have thrown on their first call, which is
 * the whole recording pipeline, and every check in the repo was green.
 *
 * This resolves every called name against what the file defines, imports, or
 * gets from the runtime.
 *
 * Run: node scripts/check-container-server.mjs
 */

import { readFileSync } from 'node:fs'

const FILE = 'workers/ffmpeg/server.js'
const src = readFileSync(FILE, 'utf8')

// Comments and string bodies out first — a name inside a comment is prose,
// and one inside a string is data. (This is the same mistake in miniature
// that caused the deletion: the scanner has to know what is code.)
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/.*$/gm, ' ')
  .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, '``')
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""')

/** Everything the file itself declares, at any depth. */
const defined = new Set([
  ...[...code.matchAll(/(?:^|\s)(?:async\s+)?function\s+(\w+)\s*\(/g)].map(m => m[1]),
  ...[...code.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)].map(m => m[1]),
  // `const { a, b } = …` and `const [a, b] = …`
  ...[...code.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)]
    .flatMap(m => m[1].split(',').map(p => p.split(':').pop().trim().replace(/^\.\.\./, '')))
    .filter(Boolean),
  ...[...code.matchAll(/import\s*\{([^}]*)\}\s*from/g)]
    .flatMap(m => m[1].split(',').map(p => p.split(' as ').pop().trim()))
    .filter(Boolean),
  ...[...code.matchAll(/import\s+(\w+)\s+from/g)].map(m => m[1]),
  // Parameters, so a call to a callback argument is not reported.
  ...[...code.matchAll(/(?:^|\s)(?:async\s+)?function\s+\w*\s*\(([^)]*)\)/g)]
    .flatMap(m => m[1].split(',').map(p => p.split('=')[0].trim().replace(/^\.\.\./, '')))
    .filter(w => /^\w+$/.test(w)),
  ...[...code.matchAll(/\(([^)]*)\)\s*=>/g)]
    .flatMap(m => m[1].split(',').map(p => p.split('=')[0].trim().replace(/^\.\.\./, '')))
    .filter(w => /^\w+$/.test(w)),
  ...[...code.matchAll(/(?:^|[\s(,])(\w+)\s*=>/g)].map(m => m[1]),
  ...[...code.matchAll(/catch\s*\(\s*(\w+)\s*\)/g)].map(m => m[1]),
  ...[...code.matchAll(/for\s*\(\s*(?:const|let|var)\s+(\w+)/g)].map(m => m[1]),
])

/** What the runtime provides. Node globals plus the language's own. */
const AMBIENT = new Set([
  'require', 'fetch', 'Promise', 'Error', 'JSON', 'Math', 'Date', 'Number',
  'String', 'Boolean', 'Object', 'Array', 'Set', 'Map', 'RegExp', 'Symbol',
  'Buffer', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'queueMicrotask', 'structuredClone', 'parseInt', 'parseFloat', 'isNaN',
  'encodeURIComponent', 'decodeURIComponent', 'process', 'console', 'globalThis',
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await',
  'super', 'this', 'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'try',
  // Keywords that read as a call to the regex below: `async (d) => …` and
  // a dynamic `import(...)`.
  'async', 'import',
])

// A bare `name(` that is not `.name(` — a free function call.
const called = new Set(
  [...code.matchAll(/(^|[^.\w$])(\w+)\s*\(/g)]
    .map(m => m[2])
    .filter(n => !AMBIENT.has(n) && !/^\d/.test(n)),
)

const missing = [...called].filter(n => !defined.has(n)).sort()

console.log(`${FILE}: ${defined.size} names in scope, ${called.size} functions called.`)
if (missing.length) {
  console.error(`\n${missing.length} called but never defined:\n`)
  for (const n of missing) {
    const line = src.slice(0, src.search(new RegExp(`(^|[^.\\w$])${n}\\s*\\(`, 'm'))).split('\n').length
    console.error(`  ${n}()  — first called around line ${line}`)
  }
  console.error('\nThis file is plain JS outside every typecheck here, and `node --check`')
  console.error('only parses. A call to a name nothing defines throws on the first')
  console.error('request to whichever endpoint reaches it.\n')
  process.exit(1)
}
console.log('Every function called in the container server is defined.')
