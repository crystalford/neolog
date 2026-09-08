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
const norm=v=>v.replace(/\s+/g,'').replace(/0\./g,'.').replace(/;$/,'').toLowerCase()

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
