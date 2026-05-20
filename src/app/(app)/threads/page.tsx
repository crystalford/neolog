'use client'

/**
 * Threads — atomic ideas extracted from vlogs.
 * Ported from neolog-design/project/screens/threads.jsx.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons, Pips, TopicDot } from '@/components/Shell'

interface ThreadRow {
  id: string
  topic: string | null
  take: string
  register: string | null
  strength: number | null
  abstracted_topic: string | null
  vlog_id: string
  extracted_at: string
  connections?: number
}

export default function ThreadsPage() {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [topicFilter, setTopicFilter] = useState<string | null>(null)

  useEffect(() => {
    // Use the full threads list endpoint, not /threads/recent (that
    // one is a 5-row "last 14 days" summary for the Capture page).
    // Active-run filter + vlog-not-deleted filter applied server-side.
    fetch('/api/v2/threads?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.threads) setThreads(d.threads)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const topicCounts: Record<string, number> = {}
  for (const t of threads) {
    const key = (t.abstracted_topic ?? t.topic ?? 'misc').toLowerCase()
    topicCounts[key] = (topicCounts[key] ?? 0) + 1
  }
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const filtered = topicFilter
    ? threads.filter(t => (t.abstracted_topic ?? t.topic ?? 'misc').toLowerCase() === topicFilter)
    : threads

  return (
    <Shell active="threads" breadcrumb={['Threads']}>
      <div className="pad-tight">
        <div className="h1-row">
          <div>
            <h1>Threads</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 6 }}>
              Atomic takes the system has extracted. Every thread is one idea, voice-grounded, traceable to a single moment in a vlog.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn"><span className="ico">{NavIcons.Filter}</span>Filters</button>
            <button className="btn"><span className="ico">{NavIcons.External}</span>Export</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="pills">
            <button className={`filter-pill ${!topicFilter ? 'active' : ''}`} onClick={() => setTopicFilter(null)}>
              All <span className="n">{threads.length}</span>
            </button>
            {topTopics.map(([topic, count]) => (
              <button
                key={topic}
                onClick={() => setTopicFilter(topic)}
                className={`filter-pill ${topicFilter === topic ? 'active' : ''}`}
              >
                <TopicDot topic={topic}/>{topic} <span className="n">{count}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <button className="btn ghost small"><span className="ico">{NavIcons.Sort}</span>Newest</button>
        </div>

        <div className="list">
          <div className="row head" style={{ gridTemplateColumns: '12px 1.4fr 130px 130px 70px 90px' }}>
            <span/><span>Take</span><span>Topic</span><span>Source</span><span>Strength</span><span>Register</span>
          </div>
          {loading ? (
            <div className="row" style={{ gridTemplateColumns: '1fr', color: 'var(--fg-3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="row" style={{ gridTemplateColumns: '1fr', color: 'var(--fg-3)' }}>
              No threads yet — run the extraction pass on a vlog with a transcript.
            </div>
          ) : filtered.map(t => (
            <Link key={t.id} href={`/thread/${t.id}`} style={{ display: 'contents' }}>
              <div className="row" style={{ gridTemplateColumns: '12px 1.4fr 130px 130px 70px 90px' }}>
                <TopicDot topic={(t.abstracted_topic ?? t.topic ?? 'misc') as string}/>
                <span style={{ color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>"{t.take}"</span>
                <span style={{ color: 'var(--fg-2)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.abstracted_topic ?? t.topic ?? '—'}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                  {new Date(t.extracted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <Pips n={t.strength ?? 0}/>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.register ?? '—'}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  )
}
