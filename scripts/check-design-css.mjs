#!/usr/bin/env node
/**
 * The stylesheet half of the design check.
 *
 * `check-design.mjs` asks whether a page's MARKUP uses the design's classes.
 * This asks whether the RULES agree: for every selector the design defines,
 * does the value I wrote for it match?
 *
 * Two values are the same if they differ only by whitespace, a leading zero,
 * `!important`, or which name a variable is reached by — this repo aliases
 * the design's `--steel` to `--t-steel` and `--body` to `--font-body`, and
 * comparing the text would report equal values as differences forever while
 * the real ones drowned. Normalising that took the home page from 21
 * differences to 3, and the three that were left were all real: a bare
 * `.rail` from the old sidebar layout putting a border and a filled
 * background on every rail in the product, a send arrow stroked in the wrong
 * colour, and 4px of padding.
 *
 * The budgets are today's numbers, not targets. Raising one needs a reason.
 *
 * Run: node scripts/check-design-css.mjs [page]
 */

import { readFileSync, readdirSync } from 'node:fs'
const D='design/css'
const mine = readFileSync('src/app/globals.css','utf8')

// Strip comments, and drop @media/@supports bodies — a responsive override
// is not the base rule and comparing against it invents differences.
function strip(css){
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let out='', i=0
  while(i<css.length){
    const at = css.indexOf('@', i)
    if(at<0){ out+=css.slice(i); break }
    const brace = css.indexOf('{', at)
    if(brace<0){ out+=css.slice(i); break }
    const head = css.slice(at, brace)
    if(!/^@(media|supports|container)/.test(head)){ out+=css.slice(i, brace+1); i=brace+1; continue }
    out += css.slice(i, at)
    let d=0, j=brace
    for(; j<css.length; j++){ if(css[j]==='{')d++; else if(css[j]==='}'){ d--; if(!d){ j++; break } } }
    i=j
  }
  return out
}

function rules(css){
  css = strip(css)
  const out=new Map()
  const re=/([^{}]+)\{([^{}]*)\}/g; let m
  while((m=re.exec(css))){
    const sel=m[1].split(',').map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean)
    const decls=m[2].split(';').map(d=>d.trim()).filter(Boolean)
    for(const s of sel){ if(!out.has(s)) out.set(s,new Map())
      for(const d of decls){ const i=d.indexOf(':'); if(i<0)continue
        out.get(s).set(d.slice(0,i).trim(), d.slice(i+1).trim().replace(/\s+/g,' ')) } }
  }
  return out
}
/**
 * Two values are the same if they differ only by whitespace, a leading zero,
 * `!important`, or which NAME a variable is reached by. This repo aliases the
 * design's --steel to --t-steel and its --body to --font-body, so comparing
 * the text would report equal values as differences forever and the real
 * ones would drown.
 */
const ALIAS = {
  '--font-body': '--body', '--font-mono': '--mono',
  '--t-steel': '--steel', '--t-teal': '--teal', '--t-ochre': '--ochre',
  '--t-terra': '--terra', '--t-violet': '--violet', '--t-sage': '--sage',
  '--t-plum': '--plum', '--t-rose': '--rose', '--t-brass': '--brass',
  '--t-moss': '--moss', '--sig': '--steel',
}
const norm = v => {
  let out = v.replace(/!important/g, '').replace(/\s+/g, '')
    .replace(/0\./g, '.').replace(/;$/, '').toLowerCase()
  for (const [a, b] of Object.entries(ALIAS)) out = out.split(a).join(b)
  return out
}

// ⚠️ `vlog` was 3 and is 5 on purpose, 8 Sep. The operator saw the deployed
// page and rejected the design's caption-beside-the-video layout: "the text
// should be below... it needs to be tightened up." `vlog.css` lays `.media`
// out as a flex row because ITS player is a 420px mock with room to its
// right; the product plays the real recording at full column width, so the
// same rule squeezed the caption into 230px and broke it across two ragged
// lines. Three rules diverge for that (`.media`, `.media > .cap`, `.rail`'s
// padding), and each carries its reasoning in globals.css.
//
// `log` was 3 and is 4 on purpose, 8 Sep. `log.css` draws `.wv` as twenty-odd
// <i> bars at hand-picked heights — 34%, 52%, 70% — because it is a mock-up
// and someone chose a shape that looked like speech. Nothing in this product
// measures amplitude, and `vlogs` has no column for one, so bars drawn
// without measuring are a picture of a recording the log never looked at,
// sitting beside a duration it did measure as though both were facts. §0
// rule 3. `.wv` is the design's track, flat, and `.prog` fills it; every
// other measurement in that player — position, duration, seek — is real.
//
// Raising a budget needs a reason in the commit — these are those reasons,
// kept next to the number so the next session does not "fix" them back.
const BUDGET={"log": 4, "entry": 2, "headings": 2, "person": 2, "search": 2, "month": 2, "clear": 2, "triage": 2, "dossier": 3, "source": 3, "asks": 3, "numbers": 2, "public-log": 0, "vlog": 5, "writing": 2, "screenshots": 2, "messages": 2, "walk": 1, "now": 4, "takeout": 2, "onthisday": 2, "connections": 2, "wrong": 2}

// No argument: check every page against its budget and exit non-zero on drift.
if(!process.argv[2]){
  let over=0
  for(const [pg,budget] of Object.entries(BUDGET)){
    const P=rules(readFileSync(`${D}/${pg}.css`,'utf8')), M=rules(mine)
    let diff=0
    for(const [sel,decls] of P){
      if(sel.startsWith('@')||sel.startsWith(':')||/^(html|body|\*|a|button|input|textarea|svg)\b/.test(sel)) continue
      const ms=[sel,`.logpage.pg-${pg} ${sel}`,`.logpage.pg-${pg}${sel}`,`.pg-${pg} ${sel}`,`.logpage ${sel}`,`.nowpage ${sel}`].find(c=>M.has(c))
      if(!ms) continue
      const md=M.get(ms)
      for(const [k,v] of decls){ if(md.has(k)&&norm(md.get(k))!==norm(v)){ diff++; break } }
    }
    const flag = diff>budget ? '  DRIFTED' : diff<budget ? '  ↓ lower the budget' : ''
    console.log(`  ${pg.padEnd(13)} ${String(diff).padStart(2)} / ${String(budget).padEnd(2)} rules differ${flag}`)
    if(diff>budget) over++
  }
  if(over){ console.error(`\n${over} page(s) drifted. Every budget is a debt; the real number is zero.`); process.exit(1) }
  console.log('\nNo stylesheet has drifted.')
  process.exit(0)
}

const page=process.argv[2]
const pcss=readFileSync(`${D}/${page}.css`,'utf8')
const P=rules(pcss), M=rules(mine)

// Map a prototype selector onto the one I'd have written for it.
// Every shape I might have written the same rule as.
const PG = process.argv[3] || page
const cands=s=>[
  s,
  `.logpage.pg-${PG} ${s}`,
  `.logpage.pg-${PG}${s}`,
  `.pg-${PG} ${s}`,
  `.logpage ${s}`,
  `.nowpage ${s}`,
]

let miss=0, diff=0, ok=0
const report=[]
for(const [sel,decls] of P){
  if(sel.startsWith('@')||sel.startsWith(':')||/^(html|body|\*|a|button|input|textarea|svg)\b/.test(sel)) continue
  const mineSel=cands(sel).find(c=>M.has(c))
  if(!mineSel){ miss++; report.push(['MISSING', sel, [...decls].slice(0,3).map(([k,v])=>`${k}:${v}`).join('; ')]); continue }
  const md=M.get(mineSel)
  const bad=[]
  for(const [k,v] of decls){
    if(!md.has(k)) { bad.push(`${k}: absent (want ${v})`); continue }
    if(norm(md.get(k))!==norm(v)) bad.push(`${k}: ${md.get(k)}  ≠  ${v}`)
  }
  if(bad.length){ diff++; report.push(['DIFF', `${sel}  →  ${mineSel}`, bad.slice(0,4).join(' | ')]) }
  else ok++
}
console.log(`${page}.html — ${ok} match · ${diff} differ · ${miss} missing\n`)
for(const [kind,sel,note] of report.slice(0,28)) console.log(`  ${kind.padEnd(8)} ${sel}\n           ${note}`)

