'use client'

export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { VideoUpload, VideoAnalysis } from '@/types/database'

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
  amberGlowMid: 'rgba(200,144,42,0.15)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
  red:          '#8A4040',
}

type Screen = 'sessions' | 'debrief' | 'style' | 'script' | 'produce' | 'review'

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

function Btn({ children, onClick, primary, small }: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  small?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      background: primary ? C.amber : 'none',
      border: `1px solid ${primary ? C.amber : C.borderBright}`,
      color: primary ? C.bg : C.textSecond,
      fontSize: small ? 9 : 10, letterSpacing: 2,
      fontWeight: primary ? 700 : 400,
      padding: small ? '4px 10px' : '8px 18px',
      transition: 'all 0.12s', whiteSpace: 'nowrap',
      cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
    }}>
      {children}
    </button>
  )
}

// ── Sub-screen: Sessions ─────────────────────────────────────────────────────

function SessionsScreen({ onBegin }: { onBegin: (upload: VideoUpload) => void }) {
  const supabase = createClient()
  const [uploads, setUploads] = useState<VideoUpload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('video_uploads')
        .select('id, file_name, created_at, recorded_at, status, duration_seconds, analysis')
        .eq('user_id', session.user.id)
        .in('status', ['processed', 'ready'])
        .order('recorded_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(20)
      setUploads((data ?? []) as VideoUpload[])
      setLoading(false)
    }
    load()
  }, [])

  const getIdeasCount = (u: VideoUpload) => {
    const a = u.analysis as VideoAnalysis | null
    return (a?.content_ideas?.length ?? 0) + (a?.strong_opinions?.length ?? 0)
  }

  const formatDate = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (days === 0) return `Today · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    if (days === 1) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px' }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>
        Ready to produce
      </div>
      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 26 }}>
        Select a session to begin the production flow.
      </div>
      {loading ? (
        <div style={{ fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>LOADING…</div>
      ) : uploads.length === 0 ? (
        <div style={{ fontSize: 11, color: C.textDimmer }}>
          No processed sessions yet. Upload a vlog and wait for analysis to complete.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {uploads.map(u => {
            const title = (u.analysis as any)?.title ?? u.file_name?.replace(/\.[^.]+$/, '') ?? 'Untitled'
            const ideas = getIdeasCount(u)
            return (
              <div
                key={u.id}
                style={{
                  padding: '16px 20px', background: C.bgSurface,
                  border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.12s', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.amber)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <div>
                  <div style={{ fontSize: 13, color: C.textPrimary, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>
                    {formatDate(u.recorded_at ?? u.created_at)}
                    {ideas > 0 && ` · ${ideas} ideas surfaced`}
                  </div>
                </div>
                <Btn primary small onClick={() => onBegin(u)}>BEGIN →</Btn>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Sub-screen: Debrief ──────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string }

function DebriefScreen({
  upload,
  onContinue,
}: {
  upload: VideoUpload | null
  onContinue: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [started, setStarted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const analysis = upload?.analysis as VideoAnalysis | null

  const startDebrief = async () => {
    if (!upload || started) return
    setStarted(true)
    setStreaming(true)

    // Build a synthetic opening from the extracted data
    const ideas = analysis?.content_ideas?.slice(0, 3) ?? []
    const opinions = analysis?.strong_opinions?.slice(0, 2) ?? []
    const keyWin = analysis?.key_win ?? ''
    const quotes = (analysis?.key_quotes ?? []) as string[]

    const topIdea = ideas[0]
    const topIdeaText = topIdea ? (typeof topIdea === 'object' ? (topIdea as any).topic : String(topIdea)) : null

    const opener = topIdeaText
      ? `${upload.analysis ? '1 session' : 'Your vlogs'}, one idea kept coming up. Here's the one worth making this week:\n\n**${topIdeaText}**\n\n${keyWin ? `You said: "${keyWin}"` : ''}\n\n${quotes[0] ? `The pull quote: "${quotes[0]}"` : ''}\n\nIs this the one, or is there something else you'd rather develop?`
      : `I've gone through your session. ${keyWin ? `The strongest signal: "${keyWin}"` : 'A few things worth developing.'} What do you want to make this week?`

    setMessages([{ role: 'assistant', content: opener }])
    setStreaming(false)
  }

  useEffect(() => {
    if (upload && !started) startDebrief()
  }, [upload])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)

    try {
      const res = await fetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: upload?.id,
          messages: [...messages, { role: 'user', content: userMsg }],
        }),
      })
      if (!res.ok || !res.body) throw new Error('API error')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: assistantText },
        ])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally {
      setStreaming(false)
    }
  }

  const ideas = analysis?.content_ideas?.slice(0, 3) ?? []

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* Idea cards sidebar */}
      <div style={{
        width: 270, borderRight: `1px solid ${C.border}`,
        padding: '18px', overflowY: 'auto', flexShrink: 0,
        background: C.bgSurface,
      }}>
        <Label>IDEAS SURFACED{ideas.length > 0 ? ` — ${ideas.length}` : ''}</Label>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {ideas.map((idea, i) => {
            const text = typeof idea === 'object' ? (idea as any).topic : String(idea)
            const format = typeof idea === 'object' ? (idea as any).format : 'content'
            return (
              <div key={i} style={{
                padding: '11px 13px', border: `1px solid ${C.border}`,
                background: C.bgRaised,
              }}>
                <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                  <Tag color={C.amber}>{format?.toUpperCase() ?? 'IDEA'}</Tag>
                </div>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600,
                  color: C.textPrimary, lineHeight: 1.3, marginBottom: 4,
                }}>
                  {text}
                </div>
              </div>
            )
          })}
          {analysis?.strong_opinions?.slice(0, 2).map((op, i) => (
            <div key={`op-${i}`} style={{
              padding: '11px 13px', border: `1px solid ${C.border}`, background: C.bgRaised,
            }}>
              <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                <Tag color={C.blue}>OPINION</Tag>
              </div>
              <div style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.4 }}>{op}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '22px 26px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: m.role === 'assistant' ? C.amberGlow : C.bgRaised,
                  border: `1px solid ${m.role === 'assistant' ? C.amberDim : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: m.role === 'assistant' ? C.amber : C.textSecond,
                  marginTop: 2,
                }}>
                  {m.role === 'assistant' ? 'NL' : 'C'}
                </div>
                <div style={{
                  fontSize: 12, lineHeight: 1.75, color: C.textPrimary, paddingTop: 2,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                  {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                    <span style={{ opacity: 0.5, animation: 'pulse 1s infinite' }}>▊</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div style={{ padding: '11px 26px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 7 }}>
          <Btn primary onClick={onContinue}>SET VISUAL STYLE →</Btn>
          <Btn>DIFFERENT IDEA</Btn>
        </div>
        <div style={{ padding: '9px 26px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 7 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about an idea or refine the angle…"
            style={{
              flex: 1, background: C.bgRaised, border: `1px solid ${C.border}`,
              color: C.textPrimary, fontSize: 11, padding: '8px 12px', outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={streaming}
            style={{
              background: C.bgRaised, border: `1px solid ${C.border}`,
              color: C.amber, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
            }}
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-screen: Style ────────────────────────────────────────────────────────

const REGISTER_OPTIONS = [
  { id: 'dark_atmospheric', label: 'Dark atmospheric', desc: 'High contrast, mist, practical light' },
  { id: 'observational_doc', label: 'Observational documentary', desc: '16mm grain, natural light' },
  { id: 'abstract', label: 'Abstract conceptual', desc: 'Metaphor-driven, mood over meaning' },
  { id: 'mixed', label: 'Mixed registers', desc: 'Cinematic + raw screen capture' },
]

function StyleScreen({ onLock }: { onLock: (styleCard: any) => void }) {
  const [reg, setReg] = useState<string | null>(null)
  const [palette, setPalette] = useState('')
  const [reference, setReference] = useState('')
  const [locked, setLocked] = useState(false)

  if (locked) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 30, color: C.green }}>✓</div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: C.textPrimary }}>Style locked</div>
        <div style={{ fontSize: 12, color: C.textSecond }}>Writing script…</div>
        <div style={{ marginTop: 8 }}>
          <Btn primary onClick={() => onLock({ register: reg, palette, reference })}>
            VIEW SCRIPT →
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px', maxWidth: 600 }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>
        Visual style
      </div>
      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 28 }}>
        Three questions. Locks the visual world for every generated image.
      </div>

      {/* Q1: Register */}
      <div style={{ marginBottom: 24 }}>
        <Label>01 — REGISTER</Label>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {REGISTER_OPTIONS.map(o => (
            <div
              key={o.id}
              onClick={() => setReg(o.id)}
              style={{
                padding: '11px 14px',
                border: `1px solid ${reg === o.id ? C.amber : C.border}`,
                background: reg === o.id ? C.amberGlow : C.bgSurface,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ fontSize: 12, color: C.textPrimary, marginBottom: 2 }}>{o.label}</div>
              <div style={{ fontSize: 10, color: C.textDim }}>{o.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Q2: Colour anchor */}
      {reg && (
        <div style={{ marginBottom: 24 }}>
          <Label>02 — COLOUR ANCHOR</Label>
          <div style={{ fontSize: 9, color: C.textDim, marginTop: 7, marginBottom: 9 }}>
            One sentence · e.g. "amber on black"
          </div>
          <input
            value={palette}
            onChange={e => setPalette(e.target.value)}
            placeholder="Your colour anchor…"
            style={{
              width: '100%', background: C.bgRaised, border: `1px solid ${C.border}`,
              color: C.textPrimary, fontSize: 13, padding: '10px 13px', outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </div>
      )}

      {/* Q3: Reference (optional) */}
      {reg && palette.length > 3 && (
        <div style={{ marginBottom: 24 }}>
          <Label>03 — REFERENCE (OPTIONAL)</Label>
          <div style={{ fontSize: 9, color: C.textDim, marginTop: 7, marginBottom: 9 }}>
            Describe one image that lives in the world of this piece.
          </div>
          <input
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="A film still, a memory, a scene… or leave blank."
            style={{
              width: '100%', background: C.bgRaised, border: `1px solid ${C.border}`,
              color: C.textPrimary, fontSize: 13, padding: '10px 13px', outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </div>
      )}

      {/* Style card preview + lock */}
      {reg && palette.length > 3 && (
        <div>
          <div style={{ padding: 16, border: `1px solid ${C.amberDim}`, background: C.amberGlow, marginBottom: 18 }}>
            <Label>STYLE CARD</Label>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['register', reg],
                ['palette', palette],
                ['film_stock', '16mm Ektachrome pushed two stops'],
                ['lens', '35mm prime f/2, shallow depth of field'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                  <div style={{ color: C.textDim, width: 80, flexShrink: 0, letterSpacing: 1 }}>{k}</div>
                  <div style={{ color: C.textSecond }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <Btn primary onClick={() => setLocked(true)}>LOCK + WRITE SCRIPT →</Btn>
        </div>
      )}
    </div>
  )
}

// ── Sub-screen: Script ───────────────────────────────────────────────────────

function ScriptScreen({
  upload,
  styleCard,
  onApprove,
}: {
  upload: VideoUpload | null
  styleCard: any
  onApprove: (productionId: string) => void
}) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleProduce = async () => {
    if (!upload) { setError('No session selected. Go back and pick a recording.'); return }
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/studio/produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: upload.id, style_card: styleCard }),
      })
      if (!res.ok) { throw new Error(await res.text()) }
      const { production_id } = await res.json()
      onApprove(production_id)
    } catch (e: any) {
      setError(e.message || 'Failed to start production')
      setStatus('idle')
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, color: C.textDim, letterSpacing: 2 }}>SCRIPT GENERATION</div>
      <div style={{ fontSize: 12, color: C.textSecond, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
        Claude will write a structured script from your recording&apos;s strongest idea. The script is generated as a background job and saved to the production.
      </div>
      {error && (
        <div style={{ fontSize: 10, color: C.red, maxWidth: 400, textAlign: 'center' }}>{error}</div>
      )}
      <div style={{ marginTop: 8 }}>
        <Btn primary onClick={handleProduce}>
          {status === 'submitting' ? 'STARTING…' : 'APPROVE + PRODUCE →'}
        </Btn>
      </div>
    </div>
  )
}

// ── Sub-screen: Produce ──────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 'script',   label: 'Script generation', sub: 'Claude Sonnet · structured script' },
  { id: 'voice',    label: 'Voice synthesis',   sub: 'ElevenLabs · voice clone' },
  { id: 'music',    label: 'Music generation',  sub: 'Suno · custom track' },
  { id: 'images',   label: 'Image generation',  sub: 'FLUX 2 Pro · start + end frames' },
  { id: 'video',    label: 'Video generation',  sub: 'Kling 3.0 Pro · first+last frame' },
  { id: 'assemble', label: 'Assembly + captions', sub: 'FFmpeg · multi-ratio output' },
]

function ProduceScreen({ productionId, onPreview }: { productionId: string | null; onPreview: () => void }) {
  const supabase = createClient()
  const [prodStatus, setProdStatus] = useState<string>('queued')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!productionId) return
    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        const { data } = await supabase
          .from('productions')
          .select('status, error_message')
          .eq('id', productionId)
          .single()
        if (cancelled) break
        if (data) {
          setProdStatus(data.status)
          if (data.error_message) setErrorMsg(data.error_message)
          if (data.status === 'done' || data.status === 'error') break
        }
        await new Promise(r => setTimeout(r, 4000))
      }
    }
    poll()
    return () => { cancelled = true }
  }, [productionId])

  // Map DB status → which stage is active
  const stageIndex = prodStatus === 'queued' ? 0
    : prodStatus === 'running' ? 1
    : prodStatus === 'done' ? PIPELINE_STAGES.length
    : 0
  const pct = Math.round((stageIndex / PIPELINE_STAGES.length) * 100)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px', maxWidth: 600 }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>
        Producing
      </div>
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 32 }}>
        est. 8–12 min · estimated cost shown before billing
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: C.bgRaised, marginBottom: 32, borderRadius: 2 }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: C.amber, borderRadius: 2,
          transition: 'width 0.5s',
        }} />
      </div>

      {/* Stage list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 28 }}>
        {PIPELINE_STAGES.map((p, i) => {
          const st = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'pending'
          return (
            <div key={i} style={{
              padding: '14px 18px',
              border: `1px solid ${st === 'active' ? C.amberDim : C.border}`,
              background: st === 'active' ? C.amberGlow : C.bgSurface,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: st === 'done' ? C.green : st === 'active' ? C.amber : C.textDimmer,
                  animation: st === 'active' ? 'pulse 2s ease-in-out infinite' : 'none',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: st === 'pending' ? C.textDim : C.textPrimary }}>{p.label}</div>
                  <div style={{ fontSize: 9, color: C.textDim, marginTop: 2, letterSpacing: 1 }}>{p.sub}</div>
                </div>
                {st === 'done' && <span style={{ fontSize: 10, color: C.green }}>✓</span>}
              </div>
            </div>
          )
        })}
      </div>

      {prodStatus === 'error' && errorMsg && (
        <div style={{ fontSize: 10, color: C.red, marginBottom: 14 }}>{errorMsg}</div>
      )}

      {prodStatus === 'done'
        ? <Btn primary onClick={onPreview}>VIEW RESULT →</Btn>
        : <Btn onClick={onPreview}>PREVIEW (PLACEHOLDER) →</Btn>
      }
    </div>
  )
}

// ── Sub-screen: Review ───────────────────────────────────────────────────────

type Platform = 'youtube' | 'tiktok' | 'instagram' | 'x'

const PLATFORM_SPECS: Record<Platform, string> = {
  youtube:   'YouTube · 16:9 · up to 15 min',
  tiktok:    'TikTok · 9:16 · up to 3 min',
  instagram: 'Instagram · 9:16 · up to 60s',
  x:         'X · 16:9 · up to 2:20',
}

function ReviewScreen() {
  const [plat, setPlat] = useState<Platform>('youtube')

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px' }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 24 }}>
        Review & publish
      </div>
      <div style={{ display: 'flex', gap: 44 }}>
        {/* Preview area */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
            {(Object.keys(PLATFORM_SPECS) as Platform[]).map(p => (
              <button key={p} onClick={() => setPlat(p)} style={{
                background: plat === p ? C.amberGlow : 'none',
                border: `1px solid ${plat === p ? C.amber : C.border}`,
                color: plat === p ? C.amberBright : C.textDim,
                fontSize: 9, letterSpacing: 2, padding: '4px 10px',
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
              }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{
            width: '100%',
            maxWidth: (plat === 'youtube' || plat === 'x') ? 420 : 230,
            aspectRatio: (plat === 'youtube' || plat === 'x') ? '16/9' : '9/16',
            background: C.bgRaised, border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 9, color: C.textDim, marginBottom: 8,
          }}>
            <div style={{ fontSize: 20, color: C.textDimmer }}>▶</div>
            <div style={{ fontSize: 8, letterSpacing: 2 }}>VIDEO READY</div>
          </div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>{PLATFORM_SPECS[plat]}</div>
        </div>

        {/* Publish panel */}
        <div style={{ width: 250, flexShrink: 0 }}>
          <Label>PUBLISH</Label>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 }}>
            {[
              { p: 'YouTube', selected: true },
              { p: 'TikTok', selected: true },
              { p: 'X', selected: false },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '10px 13px', border: `1px solid ${C.border}`,
                background: C.bgSurface, display: 'flex', alignItems: 'center', gap: 9,
              }}>
                <div style={{
                  width: 14, height: 14,
                  border: `1px solid ${item.selected ? C.amber : C.border}`,
                  background: item.selected ? C.amberGlow : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: C.amber,
                }}>
                  {item.selected ? '✓' : ''}
                </div>
                <div style={{ fontSize: 11, color: C.textPrimary }}>{item.p}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Btn primary>PUBLISH ALL →</Btn>
            <Btn>DOWNLOAD</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Studio Page ─────────────────────────────────────────────────────────

const SUB_NAV: Array<{ id: Screen; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'debrief',  label: 'Debrief'  },
  { id: 'style',    label: 'Style'    },
  { id: 'script',   label: 'Script'   },
  { id: 'produce',  label: 'Produce'  },
  { id: 'review',   label: 'Review'   },
]

export default function StudioPage() {
  const [screen, setScreen] = useState<Screen>('sessions')
  const [activeUpload, setActiveUpload] = useState<VideoUpload | null>(null)
  const [styleCard, setStyleCard] = useState<any>(null)
  const [productionId, setProductionId] = useState<string | null>(null)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sub-nav */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: '0 40px',
        display: 'flex', alignItems: 'center',
        height: 46, flexShrink: 0,
        background: C.bgSurface,
      }}>
        <div style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13,
          color: C.amber, marginRight: 24,
        }}>
          Studio
        </div>
        {SUB_NAV.map(s => (
          <button
            key={s.id}
            onClick={() => setScreen(s.id)}
            style={{
              background: 'none', border: 'none',
              borderBottom: screen === s.id ? `2px solid ${C.amber}` : '2px solid transparent',
              color: screen === s.id ? C.amberBright : C.textDim,
              fontSize: 10, letterSpacing: 1.5, padding: '0 13px',
              height: 46, transition: 'all 0.12s', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Screen content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {screen === 'sessions' && (
          <SessionsScreen onBegin={u => { setActiveUpload(u); setScreen('debrief') }} />
        )}
        {screen === 'debrief' && (
          <DebriefScreen upload={activeUpload} onContinue={() => setScreen('style')} />
        )}
        {screen === 'style' && (
          <StyleScreen onLock={(card) => { setStyleCard(card); setScreen('script') }} />
        )}
        {screen === 'script' && (
          <ScriptScreen
            upload={activeUpload}
            styleCard={styleCard}
            onApprove={(pid) => { setProductionId(pid); setScreen('produce') }}
          />
        )}
        {screen === 'produce' && (
          <ProduceScreen productionId={productionId} onPreview={() => setScreen('review')} />
        )}
        {screen === 'review' && <ReviewScreen />}
      </div>
    </div>
  )
}
