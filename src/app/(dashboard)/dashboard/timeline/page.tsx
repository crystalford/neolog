'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { VideoUpload, VideoAnalysis, TranscriptSegment } from '@/types/database'

const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
}

type ViewMode = 'analysis' | 'transcript' | 'combined'

function Tag({ children, color = C.amber }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 9, letterSpacing: 2, color,
      background: `${color}12`, border: `1px solid ${color}25`,
      padding: '2px 8px', borderRadius: 2,
      textTransform: 'uppercase', whiteSpace: 'nowrap', fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function formatDate(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  // Sentinel: time unknown — stored as midnight or noon UTC from filename-only extraction
  const utcH = d.getUTCHours(), utcM = d.getUTCMinutes(), utcS = d.getUTCSeconds()
  const timeUnknown = (utcH === 0 || utcH === 12) && utcM === 0 && utcS === 0
  const time = timeUnknown ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const suffix = time ? ` · ${time}` : ''
  if (days === 0) return `Today${suffix}`
  if (days === 1) return `Yesterday${suffix}`
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + suffix
}

function formatDuration(secs: number | null) {
  if (!secs) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSegTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const router = useRouter()
  const supabase = createClient()
  const [viewMode, setViewMode] = useState<ViewMode>('analysis')
  const [uploads, setUploads] = useState<VideoUpload[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageNum, setPageNum] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const PAGE_SIZE = 10

  // For transcript view: load all uploads oldest→newest
  const [transcriptUploads, setTranscriptUploads] = useState<VideoUpload[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptLoaded, setTranscriptLoaded] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('video_uploads')
        .select('*')
        .eq('user_id', session.user.id)
        .not('status', 'eq', 'uploading')
        .order('recorded_at', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1)
      setUploads((data ?? []) as VideoUpload[])
      setLoading(false)
    }
    load()
  }, [])

  // Load full transcript dataset when user switches to transcript view
  useEffect(() => {
    if (viewMode !== 'transcript' || transcriptLoaded) return
    async function loadTranscripts() {
      setTranscriptLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('video_uploads')
        .select('id, file_name, recorded_at, created_at, transcript, transcript_segments, analysis, duration_seconds, status')
        .eq('user_id', session.user.id)
        .not('status', 'eq', 'uploading')
        .not('transcript', 'is', null)
        .order('recorded_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      setTranscriptUploads((data ?? []) as VideoUpload[])
      setTranscriptLoading(false)
      setTranscriptLoaded(true)
    }
    loadTranscripts()
  }, [viewMode, transcriptLoaded])

  const loadMore = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const nextPage = pageNum + 1
    const { data } = await supabase
      .from('video_uploads')
      .select('*')
      .eq('user_id', session.user.id)
      .not('status', 'eq', 'uploading')
      .order('recorded_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })
      .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1)
    setUploads(prev => [...prev, ...((data ?? []) as VideoUpload[])])
    setPageNum(nextPage)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: isMobile ? '14px 16px 12px' : '22px 40px 18px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: isMobile ? 17 : 20, fontWeight: 700, color: C.textPrimary }}>
            Timeline
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, letterSpacing: 1 }}>
            {viewMode === 'transcript'
              ? `${transcriptUploads.length} sessions`
              : `${uploads.length} sessions`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['analysis', 'transcript', 'combined'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              background: viewMode === m ? C.amberGlow : 'none',
              border: `1px solid ${viewMode === m ? C.amber : C.border}`,
              color: viewMode === m ? C.amberBright : C.textDim,
              fontSize: 9, letterSpacing: isMobile ? 1 : 2,
              padding: isMobile ? '5px 8px' : '5px 12px',
              transition: 'all 0.12s', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            }}>
              {isMobile ? m.slice(0, 4) : m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Transcript view: continuous document ─────────────────────────── */}
      {viewMode === 'transcript' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 16px 80px' : '0 40px 80px' }}>
          {transcriptLoading ? (
            <div style={{ padding: '48px 0', fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>LOADING TRANSCRIPTS…</div>
          ) : transcriptUploads.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center', fontSize: 11, color: C.textDimmer, letterSpacing: 2 }}>
              NO TRANSCRIPTS YET
            </div>
          ) : (
            transcriptUploads.map((upload, i) => (
              <TranscriptBlock key={upload.id} upload={upload} index={i} />
            ))
          )}
        </div>
      )}

      {/* ── Analysis + Combined views: paginated cards ───────────────────── */}
      {viewMode !== 'transcript' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 12px 60px' : '0 40px 60px' }}>
          {loading ? (
            <div style={{ padding: '48px 0', fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>LOADING…</div>
          ) : uploads.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.textDimmer, letterSpacing: 2 }}>NO SESSIONS YET</div>
            </div>
          ) : (
            uploads.map((upload, i) => (
              <TimelineEntry
                key={upload.id}
                upload={upload}
                viewMode={viewMode}
                isExpanded={expanded === upload.id}
                onToggle={() => setExpanded(expanded === upload.id ? null : upload.id)}
                onOpenStudio={() => router.push('/dashboard/studio')}
                showConnector={i < uploads.length - 1}
                isMobile={isMobile}
              />
            ))
          )}
          {!loading && uploads.length > 0 && uploads.length % PAGE_SIZE === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 36 }}>
              <button onClick={loadMore} style={{
                background: 'none', border: `1px solid ${C.border}`,
                color: C.textDim, fontSize: 9, letterSpacing: 2,
                padding: '9px 22px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                LOAD EARLIER SESSIONS
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Transcript block: full text for one recording ───────────────────────────

function TranscriptBlock({ upload, index }: { upload: VideoUpload; index: number }) {
  const analysis = upload.analysis as VideoAnalysis | null
  const ts = upload.recorded_at ?? upload.created_at
  const title = analysis?.title ?? upload.file_name?.replace(/\.[^.]+$/, '') ?? 'Untitled'
  const segments = upload.transcript_segments as TranscriptSegment[] | null
  const hasSegments = segments && segments.length > 0

  return (
    <div style={{ paddingTop: 48 }}>
      {/* Session separator */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 28 }}>
        <div style={{
          fontSize: 9, letterSpacing: 3, color: C.amberDim,
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          {formatDate(ts)}
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
          {title}
        </div>
        {upload.duration_seconds && (
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {formatDuration(upload.duration_seconds)}
          </div>
        )}
      </div>

      {/* Full transcript */}
      {hasSegments ? (
        // Segments with timestamps
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {segments.map((seg, i) => (
            <div key={i} style={{
              display: 'flex', gap: 24, alignItems: 'flex-start',
              padding: '6px 0',
              borderTop: i === 0 ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{
                fontSize: 10, color: C.textDimmer, fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 1, paddingTop: 2, flexShrink: 0, width: 38, textAlign: 'right',
              }}>
                {formatSegTime(seg.start)}
              </div>
              <div style={{
                width: 1, background: C.border, alignSelf: 'stretch', flexShrink: 0,
              }} />
              <div style={{
                fontSize: 14, color: C.textSecond, lineHeight: 1.75,
                letterSpacing: 0.2, flex: 1,
              }}>
                {seg.text}
              </div>
            </div>
          ))}
        </div>
      ) : upload.transcript ? (
        // Plain transcript text
        <div style={{
          borderTop: `1px solid ${C.border}`,
          paddingTop: 18,
          fontSize: 14, color: C.textSecond, lineHeight: 1.85,
          letterSpacing: 0.2,
        }}>
          {upload.transcript}
        </div>
      ) : (
        <div style={{
          borderTop: `1px solid ${C.border}`,
          paddingTop: 14,
          fontSize: 11, color: C.textDimmer, fontStyle: 'italic',
        }}>
          Transcript not available.
        </div>
      )}

      {/* Connector to next */}
      <div style={{ marginTop: 48, height: 1, background: C.border, opacity: 0.4 }} />
    </div>
  )
}

// ─── Analysis entry: collapsible card ────────────────────────────────────────

function TimelineEntry({
  upload, viewMode, isExpanded, onToggle, onOpenStudio, showConnector, isMobile,
}: {
  upload: VideoUpload
  viewMode: ViewMode
  isExpanded: boolean
  onToggle: () => void
  onOpenStudio: () => void
  showConnector: boolean
  isMobile: boolean
}) {
  const analysis = upload.analysis as VideoAnalysis | null
  const ts = upload.recorded_at ?? upload.created_at
  const ideaCount = (analysis?.content_ideas?.length ?? 0) + (analysis?.strong_opinions?.length ?? 0)
  const keyQuotes = (analysis?.key_quotes ?? []) as string[]
  const segments = upload.transcript_segments as TranscriptSegment[] | null
  const hasSegments = segments && segments.length > 0

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, whiteSpace: 'nowrap' }}>
          {formatDate(ts)}
        </div>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>

      <div style={{ border: `1px solid ${isExpanded ? C.borderBright : C.border}`, background: C.bgSurface }}>
        {/* Header row */}
        <div onClick={onToggle} style={{
          padding: isMobile ? '12px 14px' : '16px 20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14,
        }}>
          <div style={{
            width: isMobile ? 56 : 72, height: isMobile ? 36 : 44,
            background: C.bgRaised, border: `1px solid ${C.border}`,
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {upload.thumbnail_url ? (
              <img src={upload.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 14, color: C.textDimmer }}>▶</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: isMobile ? 13 : 14,
              fontWeight: 600, color: C.textPrimary, marginBottom: 3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {analysis?.title ?? upload.file_name?.replace(/\.[^.]+$/, '') ?? 'Untitled'}
            </div>
            <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {formatDuration(upload.duration_seconds) && <span>{formatDuration(upload.duration_seconds)}</span>}
              {analysis?.mood && <span style={{ color: C.amberDim }}>{analysis.mood}</span>}
              {!isMobile && analysis?.energy_level && <span>{analysis.energy_level} energy</span>}
            </div>
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {ideaCount > 0 && <Tag color={C.amber}>{ideaCount} IDEAS</Tag>}
              {upload.status === 'processing' && <Tag color={C.blue}>PROCESSING</Tag>}
            </div>
          )}
          <div style={{ color: C.textDim, fontSize: 12, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {/* Analysis section */}
            {analysis && (
              <div style={{ padding: isMobile ? '14px 14px' : '18px 20px' }}>
                {analysis.key_win && (
                  <div style={{ marginBottom: 18 }}>
                    <Label>KEY WIN</Label>
                    <div style={{ marginTop: 8, fontSize: 13, color: C.textPrimary, lineHeight: 1.7, fontStyle: 'italic' }}>
                      "{analysis.key_win}"
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, marginBottom: 16 }}>
                  {analysis.content_ideas && analysis.content_ideas.length > 0 && (
                    <div>
                      <Label>IDEAS SURFACED</Label>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {analysis.content_ideas.slice(0, 4).map((idea, j) => (
                          <div key={j} style={{
                            fontSize: 11, color: C.textSecond, padding: '7px 10px',
                            background: C.bgRaised, border: `1px solid ${C.border}`,
                            display: 'flex', alignItems: 'center', gap: 7,
                          }}>
                            <span style={{ color: C.amberDim }}>◆</span>
                            {typeof idea === 'object' ? (idea as any).topic : String(idea)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {keyQuotes.length > 0 && (
                    <div>
                      <Label>KEY QUOTES</Label>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {keyQuotes.slice(0, 3).map((q, j) => (
                          <div key={j} style={{
                            fontSize: 11, color: C.textSecond, padding: '7px 10px',
                            background: C.bgRaised, border: `1px solid ${C.border}`,
                            fontStyle: 'italic',
                          }}>
                            "{typeof q === 'string' ? q : (q as any).text ?? String(q)}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {analysis.strong_opinions && analysis.strong_opinions.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <Label>STRONG OPINIONS</Label>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {analysis.strong_opinions.slice(0, 3).map((op, j) => (
                        <div key={j} style={{
                          fontSize: 11, color: C.textSecond, padding: '7px 10px',
                          background: C.bgRaised, border: `1px solid ${C.border}`,
                        }}>
                          {op}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={onOpenStudio} style={{
                  background: C.amberGlow, border: `1px solid ${C.amberDim}`,
                  color: C.amberBright, fontSize: 9, letterSpacing: 2, padding: '5px 12px',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                }}>
                  OPEN IN STUDIO →
                </button>
              </div>
            )}

            {/* Transcript section (combined mode only) */}
            {viewMode === 'combined' && (
              <div style={{
                padding: '18px 20px',
                borderTop: analysis ? `1px solid ${C.border}` : 'none',
              }}>
                <Label>TRANSCRIPT</Label>
                <div style={{ marginTop: 12 }}>
                  {hasSegments ? (
                    segments.map((seg, i) => (
                      <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                        <div style={{
                          fontSize: 9, color: C.textDimmer, fontFamily: "'JetBrains Mono', monospace",
                          paddingTop: 3, flexShrink: 0, width: 34, textAlign: 'right',
                        }}>
                          {formatSegTime(seg.start)}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.7, flex: 1 }}>
                          {seg.text}
                        </div>
                      </div>
                    ))
                  ) : upload.transcript ? (
                    <div style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.8 }}>
                      {upload.transcript}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.textDimmer }}>
                      {upload.status === 'processing' ? 'Transcript processing…' : 'No transcript available.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showConnector && (
        <div style={{ marginLeft: 57, width: 1, height: 18, background: C.border }} />
      )}
    </div>
  )
}
