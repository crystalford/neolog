/**
 * A fixed-column grid handed fewer children than it has columns.
 *
 * ⚠️ 21 Sep. Three of these in one morning, on three different pages, and
 * every one of them looked like a different bug from the outside:
 *
 *   /triage      `.rules` is `repeat(3,1fr)` and got one bare `<b>` — the
 *                card rendered as a grey slab with the sentence in a third
 *                of the width
 *   /export      `.out` is `1fr auto` and got three option cards — two sat
 *                side by side, the third dropped to a row of its own, and
 *                the action row nested inside it rendered 190px wide
 *   /corrections `.r` is `88px 1fr 130px 96px` and the empty state was one
 *                `<span>` — "Nothing has been corrected yet. This page fills
 *                itself as the log gets things wrong." rendered EIGHTY-EIGHT
 *                PIXELS wide, one or two words a line, in the date column
 *
 * They are one bug. A grid with named columns is a contract about how many
 * children it takes, and nothing in this repo could read that contract.
 * `tsc` sees valid JSX. `check-design.mjs` sees the class in the markup, and
 * it IS in the markup. `check-design-css.mjs` sees values matching the
 * design, and they DO match. `check-css-vars.mjs` sees every variable
 * resolve. The rendered check catches it only when the result happens to be
 * two labels colliding — the /corrections one collided with nothing, it was
 * simply a paragraph in a date column.
 *
 * So this one reads the contract. For every page-scoped rule that declares
 * `display:grid` with a countable `grid-template-columns`, it finds the
 * markup using that class and counts the direct children it is given.
 *
 * ── What it deliberately does not flag ──────────────────────────────────
 *
 * "A check that cries wolf is worse than no check" is written into this repo
 * three times over, so the guards matter more than the finding:
 *
 *  - a container whose children come from `.map(` produces N at runtime and
 *    is skipped outright
 *  - so is one holding a conditional (`&&`, `? :`) at child level, where the
 *    count depends on data
 *  - `auto` and `min-content` columns collapse to nothing when unfilled, so
 *    a track list containing one is not a contract about a count
 *  - and a single child is only reported when the grid has THREE or more
 *    columns, or when its first column is a fixed pixel width — which is the
 *    case that actually disfigures a page
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const CSS = readFileSync('src/app/globals.css', 'utf8')

/** Strip comments so an explanation of a bug cannot trip the check on it. */
const strip = s => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')

// ── The contracts, out of the stylesheet ────────────────────────────────

/** Split a track list on top-level spaces, so `repeat(3,1fr)` stays whole. */
function tracks(list) {
  const out = []
  let depth = 0, cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** How many columns, or null when the count is not knowable. */
function columnCount(list) {
  let n = 0
  for (const t of tracks(list)) {
    const rep = /^repeat\(\s*(\d+)\s*,/.exec(t)
    if (rep) { n += parseInt(rep[1], 10); continue }
    // An auto-ish track collapses when unfilled, so the list is not a count.
    if (/auto-fit|auto-fill|^auto$|min-content|max-content/.test(t)) return null
    n += 1
  }
  return n || null
}

/**
 * Every contract, keyed by the scope it governs.
 *
 * ⚠️ Keyed by SCOPE as well as class, not by class alone. `.rules` is
 * defined seven times over — once per page that uses it — and a first
 * version that kept one contract per class name threw all seven away as
 * ambiguous, so the /triage bug this check was written for walked straight
 * past it. A page-scoped rule governs that page and nothing else; the
 * ambiguity that matters is two UNSCOPED rules for one class, or a scoped
 * and an unscoped one, where which applies depends on specificity.
 */
const contracts = []     // { cls, scope, cols, list, firstFixed }
const unscoped = new Map()
for (const m of strip(CSS).matchAll(/(\.logpage(?:\.pg-[\w-]+)?\s+\.([\w-]+))\s*\{([^}]*)\}/g)) {
  const body = m[3].replace(/\s+/g, '')
  if (!body.includes('display:grid')) continue
  const cols = /grid-template-columns:([^;]+)/.exec(m[3])
  if (!cols) continue
  const list = cols[1].trim()
  const n = columnCount(list)
  if (!n || n < 2) continue
  const cls = m[2]
  const scope = /\.pg-([\w-]+)/.exec(m[1])
  const entry = {
    cls, scope: scope ? scope[1] : null, cols: n, list,
    firstFixed: /^\d+px$/.test(tracks(list)[0]),
  }
  if (!entry.scope) {
    // A second unscoped rule for the same class, with a different shape, is
    // a collision this check cannot resolve — and would rather say nothing
    // about than guess at.
    const seen = unscoped.get(cls)
    if (seen && seen.list !== list) { seen.ambiguous = true; continue }
    unscoped.set(cls, entry)
  }
  contracts.push(entry)
}

// ── The markup, and how many children each container is given ───────────

/** The substring of `src` inside the element opening at `open`. */
function innerOf(src, open) {
  let i = open, depth = 0, start = -1
  while (i < src.length) {
    if (src[i] === '<') {
      if (src[i + 1] === '/') {
        depth--
        if (depth === 0) return src.slice(start, i)
      } else {
        const selfClose = /^<(\w+)[^>]*?\/>/.exec(src.slice(i))
        if (!selfClose) {
          depth++
          if (depth === 1) {
            const gt = src.indexOf('>', i)
            if (gt < 0) return null
            start = gt + 1
            i = gt
          }
        } else {
          i += selfClose[0].length - 1
        }
      }
    }
    i++
  }
  return null
}

/**
 * Direct grid items in a JSX fragment.
 *
 * ⚠️ A bare text node at depth 0 IS a grid item — the browser wraps it in an
 * anonymous one. The first version counted only elements and reported every
 * rail card header (`<div className="h">Written down <span>…</span></div>`)
 * as one child in a two-column grid, when the text takes the first column
 * and renders correctly. Fourteen of its twenty-one findings were that.
 */
function childCount(inner) {
  let depth = 0, n = 0, i = 0
  let text = ''
  const flushText = () => {
    // A `{expr}` at depth 0 is an item too, but its own braces are not text.
    if (/[^\s{}]/.test(text)) n++
    text = ''
  }
  while (i < inner.length) {
    if (inner[i] !== '<') {
      if (depth === 0) text += inner[i]
      i++
      continue
    }
    if (depth === 0) flushText()
    // ⚠️ Skip PAST the closing tag. Advancing by one left "div>" in the
    // stream, which then read as text at depth 0 and counted as a grid item
    // — so every container came back with roughly twice the children it
    // had, and a three-column grid holding two cells read as four and was
    // let through. Found by removing a real cell and watching the check
    // stay green.
    if (inner[i + 1] === '/') {
      depth--
      const close = inner.indexOf('>', i)
      i = close < 0 ? i + 1 : close + 1
      continue
    }
    const self = /^<(\w+)[^>]*?\/>/.exec(inner.slice(i))
    if (self) {
      if (depth === 0) n++
      i += self[0].length
      continue
    }
    const open = /^<(\w+)[^>]*?>/.exec(inner.slice(i))
    if (!open) { i++; continue }
    if (depth === 0) n++
    depth++
    i += open[0].length
  }
  if (depth === 0) flushText()
  return n
}

const FILES = execSync(
  "find src -name '*.tsx' -not -path '*/node_modules/*'",
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

const findings = []
for (const file of FILES) {
  const src = strip(readFileSync(file, 'utf8'))
  const pg = /className="logpage pg-([\w-]+)"/.exec(src)
  for (const c of contracts) {
    if (c.ambiguous) continue
    // A page-scoped rule governs that page's markup and nothing else. An
    // unscoped one governs any `.logpage`, which is every one of them.
    if (c.scope && (!pg || pg[1] !== c.scope)) continue
    // ⚠️ An unscoped contract is skipped where the page ALSO scopes that
    // class — the page-scoped rule wins on specificity, and it is already in
    // this list with the right shape.
    if (!c.scope && pg && contracts.some(o => o.cls === c.cls && o.scope === pg[1])) continue
    const re = new RegExp(`<div className="${c.cls}"[^>]*>`, 'g')
    for (const m of src.matchAll(re)) {
      const inner = innerOf(src, m.index)
      if (inner == null) continue
      // Children produced at runtime — the count is not in the markup.
      if (/\.map\(/.test(inner)) continue
      if (/\{[^}]*&&|\{[^}]*\?[^}]*:/.test(inner)) continue
      const n = childCount(inner)
      if (n === 0 || n >= c.cols) continue
      // Only the shapes that actually disfigure the page.
      if (n === 1 && !(c.cols >= 3 || c.firstFixed)) continue
      const line = src.slice(0, m.index).split('\n').length
      findings.push({ file, line, cls: c.cls, given: n, want: c.cols, list: c.list })
    }
  }
}

if (findings.length) {
  console.log(`\n${findings.length} grid${findings.length === 1 ? '' : 's'} given fewer children than it has columns:\n`)
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}`)
    console.log(`     .${f.cls} is ${f.list} — ${f.want} columns, given ${f.given}`)
    console.log('')
  }
  console.log('A grid with named columns is a contract about how many children')
  console.log('it takes. Give it that many, or use a class that fits what it holds.')
  process.exit(1)
}

console.log(`${contracts.length} fixed-column grid rules checked. Every one is given what it declares.`)

// ── A block-level class used as a modifier ──────────────────────────────
//
// ⚠️ 21 Sep, and it is the same family one level along. `.logpage .none` is
// the page's EMPTY STATE — forty pixels of padding, meant to stand alone in
// a column. It was also being used as a MODIFIER: `className="c none"` on a
// value inside a row, meaning "there is nothing here, dim it".
//
// The padding lands inside the row either way. On `/everything` every door
// with no count rendered eighty pixels taller than the ones beside it, and
// `/vlogs` gave the same treatment to every recording with nothing read out
// of it — which is all of them — so the recordings list read as enormously
// sparse for that one reason.
//
// Nothing could see it: the class is in the markup, its values match the
// design, its variables resolve, and no two labels collide. So this asks
// the one question that separates the two uses — is a class the stylesheet
// gives standalone block padding ever written ALONGSIDE another class?
const CSS_FLAT = strip(CSS)
const BLOCKY = new Set()
for (const m of CSS_FLAT.matchAll(/\.logpage\s+\.([\w-]+)\s*\{([^}]*)\}/g)) {
  const cls = m[1]
  const body = m[2].replace(/\s+/g, '')
  // A generous floor: a modifier never needs 20px of its own padding.
  const pad = /padding:(\d+)px/.exec(body)
  if (!pad || parseInt(pad[1], 10) < 20) continue
  // ⚠️ Two exemptions, both principled rather than convenient.
  //
  // A positioned overlay's padding is its OWN layout — it insets content
  // from the viewport — not something that lands inside a row. `.lb`, the
  // lightbox, is `position:fixed; inset:0; padding:48px 64px`.
  if (/position:(fixed|absolute)/.test(body)) continue
  // And a compound selector in the stylesheet — `.lb.on { display:flex }` —
  // is the stylesheet SAYING the pairing is intended. That is the strongest
  // signal available and it is the one that clears the false positive this
  // check opened with.
  if (new RegExp(`\\.${cls}\\.[\\w-]+\\s*[,{]`).test(CSS_FLAT)) continue
  BLOCKY.add(cls)
}

const modifiers = []
for (const file of FILES) {
  const src = strip(readFileSync(file, 'utf8'))
  for (const cls of BLOCKY) {
    // `className="x y"` and `` className={`x${… ' y'}`} `` both count.
    // ⚠️ Word-bounded in BOTH branches. Without it in the
    // template-literal one, `.sh` matched `shots`, `isheld` and `show`,
    // and the check opened with seven findings that were all the same
    // substring — the "cries wolf" failure this repo has written down
    // three times. Built by concatenation rather than as a template
    // literal, because a backtick inside one is more trouble than it
    // is worth.
    const BT = String.fromCharCode(96)
    const re = new RegExp(
      'className=(?:"[^"]*\\b' + cls + '\\b[^"]*"'
      + '|\\{' + BT + '[^' + BT + ']*\\b' + cls + '\\b[^' + BT + ']*' + BT + '\\})',
      'g')
    for (const m of src.matchAll(re)) {
      const attr = m[0]
      // Alone is the correct use. Alongside anything else is the bug.
      const names = attr.replace(/^className=/, '')
        .replace(/[{}`"$]/g, ' ')
        .replace(/\?[^:]*:/g, ' ')
        .split(/[\s']+/).filter(w => /^[\w-]+$/.test(w))
      if (names.length <= 1) continue
      modifiers.push({
        file, cls,
        line: src.slice(0, m.index).split('\n').length,
        attr: attr.slice(0, 64),
      })
    }
  }
}

if (modifiers.length) {
  console.log(`\n${modifiers.length} block-level class${modifiers.length === 1 ? '' : 'es'} used as a modifier:\n`)
  for (const m of modifiers) {
    console.log(`  ${m.file}:${m.line}`)
    console.log(`     .${m.cls} carries standalone padding — ${m.attr}`)
    console.log('')
  }
  console.log('That padding lands inside whatever row it is written on. A class')
  console.log('that means "this is empty" is not the same as one that means')
  console.log('"dim this value" — give the second one its own name.')
  process.exit(1)
}
