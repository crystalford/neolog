/**
 * Library — finished productions gallery. Video essays, articles, X threads,
 * published clips. The output of the production engine.
 *
 * Distinct from /uploads (raw vlog archive). Library shows what came OUT;
 * Uploads shows what went IN.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'

interface ProductionRow {
  id: string
  kind: string  // 'video_essay' | 'article' | 'x_post' | 'x_thread' | 'clip'
  headline: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  state: string  // 'drafting' | 'producing' | 'live' | ...
  published_at: string | null
  created_at: string
}

type Filter = 'all' | 'video_essay' | 'article' | 'x_thread' | 'x_post' | 'clip'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'video_essay', label: 'Video essays' },
  { key: 'article', label: 'Articles' },
  { key: 'x_thread', label: 'X threads' },
  { key: 'x_post', label: 'X posts' },
  { key: 'clip', label: 'Clips' },
]

export default function LibraryPage() {
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v2/library', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { productions: [] })
      .then((d: any) => { setProductions(d.productions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return productions
    return productions.filter(p => p.kind === filter)
  }, [productions, filter])

  return (
    <main>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="crumb reveal d2">Finished work</div>
        <h1 className="reveal d3">Library</h1>
        <p className="lead reveal d4">Productions shipped from clusters. Video essays, articles, X threads, clips — the output side of the system.</p>
      </section>

      <div className="gallery-summary reveal d4">
        <span><span className="n">{productions.length}</span> productions</span>
        <span><span className="n">{productions.filter(p => p.state === 'live' || p.published_at).length}</span> live</span>
        <span><span className="n">{productions.filter(p => p.kind === 'video_essay').length}</span> video essays</span>
      </div>

      <div className="filter-bar reveal d4" style={{ padding: '0 24px 16px' }}>
        {FILTERS.map(f => {
          const count = f.key === 'all' ? productions.length : productions.filter(p => p.kind === f.key).length
          return (
            <button key={f.key} className={`fchip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="num">{count}</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="empty-row reveal d5">
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: 'var(--bone-3)' }}>LOADING…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-row reveal d5">
          <h3>{filter === 'all' ? 'Nothing produced yet' : `No ${filter.replace('_', ' ')}s yet`}</h3>
          <p>
            Productions ship from <a href="/studio" style={{ color: 'var(--bone)', textDecoration: 'underline' }}>Studio</a> when a cluster ripens. Go cultivate something and it'll land here once the production engine runs.
          </p>
        </div>
      )}

      <div className="gallery reveal d5">
        {filtered.map(p => (
          <a key={p.id} href={detailHref(p)} className="tile" style={p.thumbnail_url ? { backgroundImage: `url(${p.thumbnail_url})` } : undefined}>
            <span className="tile-badge">{kindLabel(p.kind)}</span>
            <div className="tile-foot">
              <span className="name">{p.headline || 'Untitled'}</span>
              {p.duration_seconds != null && <span className="dur">{fmtDur(p.duration_seconds)}</span>}
            </div>
          </a>
        ))}
      </div>
    </main>
  )
}

function detailHref(p: ProductionRow): string {
  switch (p.kind) {
    case 'video_essay': return `/article/${p.id}` // video essay shares detail route for now
    case 'article': return `/article/${p.id}`
    case 'clip': return `/clip/${p.id}`
    case 'x_post':
    case 'x_thread': return `/post`
    default: return '/library'
  }
}
function kindLabel(k: string): string {
  return ({ video_essay: 'Essay', article: 'Article', x_thread: 'Thread', x_post: 'Post', clip: 'Clip' } as Record<string, string>)[k] || k
}
function fmtDur(s: number): string {
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
