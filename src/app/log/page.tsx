/**
 * /log — public lifelog.
 *
 * The operator's archive as a destination. Lists vlogs flagged
 * is_podcast=1 (the existing "yes, share this" toggle on /vlog/[id]).
 * Reverse-chronological. No auth — anyone with the URL can browse.
 *
 * Cloudflare Access must add /log and /log/* to the public bypass
 * (same pattern as /p/*, /podcast.xml, /podcast/audio/*) for this to
 * actually serve unauthenticated visitors in production.
 *
 * Each row → /podcast/audio/{vlog_id}.mp3 for listening (the existing
 * stitched mp3.full surface) and /vlog/[id] for the full detail page
 * (still gated). Future: a public /log/[id] surface that shows
 * transcript + chapters but stays read-only.
 */

export const runtime = 'edge'

import Link from 'next/link'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

interface Row {
  id: string
  title: string | null
  recorded_at: string | null
  duration_seconds: number | null
  thread_count: number
  is_audio_only: number | null
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtDuration = (sec: number | null): string => {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default async function PublicLogPage() {
  const env = getRequestContext().env as unknown as Env
  const db = getDb(env)

  const operator = await findOne<{ id: string; display_name: string | null; handle: string | null }>(
    db,
    `SELECT id, display_name, handle FROM operator ORDER BY created_at ASC LIMIT 1`,
  )
  if (!operator) {
    return (
      <main style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--fg-2)' }}>
        Nothing here yet.
      </main>
    )
  }

  const rows = await findMany<Row>(
    db,
    `SELECT v.id, v.title, v.recorded_at, v.duration_seconds, v.is_audio_only,
            (SELECT COUNT(*) FROM threads t
              WHERE t.vlog_id = v.id AND t.deleted_at IS NULL) AS thread_count
       FROM vlogs v
      WHERE v.operator_id = ?
        AND v.deleted_at IS NULL
        AND v.is_podcast = 1
      ORDER BY COALESCE(v.recorded_at, v.created_at) DESC
      LIMIT 200`,
    operator.id,
  )

  const operatorName = operator.display_name || operator.handle || 'neolog'

  return (
    <div className="canon-page">
      <div className="canon-wrap">
        <header style={{
          padding: '22px 0 20px',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center', gap: 32,
          borderBottom: '1px solid var(--line)',
        }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, color: 'var(--fg)', textDecoration: 'none' }}>
            <span style={{ width: 26, height: 26 }}>
              <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
                <circle cx="3" cy="16" r="2.4" fill="currentColor"/>
                <circle cx="29" cy="16" r="2.4" fill="currentColor"/>
              </svg>
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 19, letterSpacing: '-0.5px' }}>neolog</span>
          </Link>
          <div/>
          <a href="/podcast.xml" style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.6,
            textTransform: 'uppercase', color: 'var(--fg-3)', textDecoration: 'none',
          }}>RSS feed →</a>
        </header>

        <main className="canon-main">
          <section className="canon-reveal d1" style={{ padding: '64px 0 32px', maxWidth: 860 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
              display: 'inline-flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
              {operatorName} · lifelog
            </div>
            <h1 style={{
              fontFamily: 'var(--font-body)', fontWeight: 300,
              fontSize: 72, lineHeight: 0.96, letterSpacing: '-2.8px',
              color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
            }}>
              The log<span style={{ color: 'var(--sig)' }}>.</span>
            </h1>
            <p style={{
              fontSize: 17, lineHeight: 1.55, color: 'var(--fg-1)',
              maxWidth: 600, letterSpacing: '-0.15px', marginBottom: 12,
            }}>
              The recordings {operatorName} has chosen to share. Raw, unedited,
              chronological. Subscribe via the RSS feed or listen here.
            </p>
          </section>

          <section style={{ paddingBottom: 64 }}>
            <div className="canon-section-head" style={{ marginBottom: 18 }}>
              <h2>Entries</h2>
              <div className="meta">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</div>
            </div>

            {rows.length === 0 ? (
              <div style={{
                padding: '48px 32px',
                border: '1px dashed var(--line-2)',
                borderRadius: 14, background: 'var(--bg-1)',
                color: 'var(--fg-3)', fontSize: 14.5, lineHeight: 1.55,
                textAlign: 'center', maxWidth: 640,
              }}>
                The log is private right now. Entries appear here when the operator
                flags them as shareable.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map(r => (
                  <article key={r.id} style={{
                    border: '1px solid var(--line-1)',
                    borderLeft: '3px solid var(--sig)',
                    borderRadius: 12,
                    background: 'var(--bg-1)',
                    padding: '16px 20px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.6,
                      textTransform: 'uppercase', color: 'var(--fg-4)',
                      display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
                    }}>
                      <span>{fmtDate(r.recorded_at)}</span>
                      {r.duration_seconds != null && (
                        <span style={{ color: 'var(--fg-3)' }}>{fmtDuration(r.duration_seconds)}</span>
                      )}
                      {r.is_audio_only ? <span style={{ color: 'var(--t-sage)' }}>audio</span> : null}
                      {r.thread_count > 0 && (
                        <span style={{ color: 'var(--fg-3)' }}>{r.thread_count} {r.thread_count === 1 ? 'thread' : 'threads'}</span>
                      )}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: 19, fontWeight: 500,
                      letterSpacing: '-0.3px', color: 'var(--fg)', lineHeight: 1.3,
                    }}>
                      {r.title || '(untitled entry)'}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <a href={`/podcast/audio/${r.id}.mp3`} style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.4,
                        textTransform: 'uppercase', color: 'var(--sig)',
                        textDecoration: 'none',
                        padding: '4px 10px', borderRadius: 100,
                        border: '1px solid var(--sig)',
                      }}>
                        ▶ Play
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <footer style={{
            borderTop: '1px solid var(--line)',
            padding: '32px 0 56px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
            textTransform: 'uppercase', color: 'var(--fg-3)', fontWeight: 500,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
              neolog
            </span>
            <a href="/podcast.xml" style={{ color: 'inherit', textDecoration: 'none' }}>RSS</a>
          </footer>
        </main>
      </div>
    </div>
  )
}
