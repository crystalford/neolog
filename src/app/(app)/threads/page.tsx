'use client'

/**
 * Threads — atomic ideas extracted from vlogs.
 * Ported from neolog-design/project/screens/threads.jsx.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons, Pips, TopicDot } from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

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
      <div className="pad-tight" style={{ maxWidth: 820, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="h1-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ borderLeft: '3px solid var(--t-2)', paddingLeft: 14 }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: 6,
            }}>
              Atomic takes
            </div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Threads</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 0, maxWidth: 540 }}>
              Every thread is one idea — voice-grounded, traceable to a single moment in a vlog. The clustering engine groups them across vlogs by abstracted topic.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn"><span className="ico">{NavIcons.External}</span>Export</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28, marginBottom: 22, flexWrap: 'wrap' }}>
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
        </div>

        {loading ? (
          <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <h3>No threads yet</h3>
            <p>Run the extraction pass on a vlog with a transcript and threads will land here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map(t => <ThreadEditorialCard key={t.id} t={t}/>)}
          </div>
        )}
      </div>
    </Shell>
  )
}

function ThreadEditorialCard({ t }: { t: ThreadRow }) {
  const topic = (t.abstracted_topic ?? t.topic ?? 'misc')
  const color = topicColor(topic)
  return (
    <Link href={`/thread/${t.id}`} className="card" style={{
      padding: '18px 22px',
      display: 'block',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className="mono" style={{
          fontSize: 10, color: color,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>
          Thread · {t.register ?? 'observation'}
        </span>
        {t.strength != null && <Pips n={t.strength}/>}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {new Date(t.extracted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div style={{
        fontSize: 17, color: 'var(--fg)',
        lineHeight: 1.45, fontStyle: 'italic',
      }}>
        “{String(t.take ?? '').slice(0, 320)}”
      </div>
      {(t.abstracted_topic || t.topic) && (
        <div className="mono" style={{
          fontSize: 10, color: 'var(--fg-3)', marginTop: 14,
          letterSpacing: 0.8, textTransform: 'uppercase',
        }}>
          {t.abstracted_topic ?? t.topic}
        </div>
      )}
    </Link>
  )
}
