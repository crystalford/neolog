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
  onContinue: (idea: { text: string; format: string } | null) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [started, setStarted] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<{ text: string; format: string } | null>(null)
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
            const isSelected = selectedIdea?.text === text
            return (
              <div
                key={i}
                onClick={() => setSelectedIdea({ text, format: format ?? 'content' })}
                style={{
                  padding: '11px 13px',
                  border: `1px solid ${isSelected ? C.amber : C.border}`,
                  background: isSelected ? C.amberGlow : C.bgRaised,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 5, marginBottom: 6 }}>
                  <Tag color={C.amber}>{format?.toUpperCase() ?? 'IDEA'}</Tag>
                  {isSelected && <span style={{ fontSize: 8, color: C.amber, letterSpacing: 1 }}>SELECTED ✓</span>}
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
          {analysis?.strong_opinions?.slice(0, 2).map((op, i) => {
            const opText = typeof op === 'string' ? op : String(op)
            const isSelected = selectedIdea?.text === opText
            return (
              <div
                key={`op-${i}`}
                onClick={() => setSelectedIdea({ text: opText, format: 'opinion' })}
                style={{
                  padding: '11px 13px',
                  border: `1px solid ${isSelected ? C.blue : C.border}`,
                  background: isSelected ? `${C.blue}12` : C.bgRaised,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 5, marginBottom: 6 }}>
                  <Tag color={C.blue}>OPINION</Tag>
                  {isSelected && <span style={{ fontSize: 8, color: C.blue, letterSpacing: 1 }}>SELECTED ✓</span>}
                </div>
                <div style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.4 }}>{opText}</div>
              </div>
            )
          })}
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

        <div style={{ padding: '11px 26px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 7, alignItems: 'center' }}>
          <button
            onClick={() => selectedIdea && onContinue(selectedIdea)}
            style={{
              background: selectedIdea ? C.amber : C.bgRaised,
              border: `1px solid ${selectedIdea ? C.amber : C.border}`,
              color: selectedIdea ? C.bg : C.textDim,
              fontSize: 9, letterSpacing: 2, fontWeight: selectedIdea ? 700 : 400,
              padding: '8px 18px', cursor: selectedIdea ? 'pointer' : 'default',
              fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.12s',
            }}
          >
            {selectedIdea ? 'SET VISUAL STYLE →' : 'SELECT AN IDEA FIRST'}
          </button>
          {selectedIdea && (
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedIdea.text}
            </div>
          )}
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
  const supabase = createClient()
  const [savedCards, setSavedCards] = useState<any[]>([])
  const [reg, setReg] = useState<string | null>(null)
  const [palette, setPalette] = useState('')
  const [reference, setReference] = useState('')

  useEffect(() => {
    async function loadCards() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('style_cards')
        .select('id, name, register, palette, film_stock, lens, mood, reference_image_prompt')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(6)
      setSavedCards(data ?? [])
    }
    loadCards()
  }, [])

  const handleLockNew = async () => {
    const card = { register: reg, palette, film_stock: '16mm Ektachrome pushed two stops', lens: '35mm prime f/2, shallow depth of field', reference }
    // Save to DB in background — don't block the UI
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      supabase.from('style_cards').insert({
        user_id: session.user.id,
        name: `${reg ?? 'Custom'} — ${palette || 'no palette'}`,
        register: card.register,
        palette: card.palette,
        film_stock: card.film_stock,
        lens: card.lens,
        reference_image_prompt: reference || null,
      }).then(() => {})
    }
    onLock(card)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px', maxWidth: 600 }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>
        Visual style
      </div>
      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 28 }}>
        Choose a saved style card or define a new one.
      </div>

      {/* Saved cards */}
      {savedCards.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Label>SAVED STYLE CARDS</Label>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {savedCards.map(card => (
              <div
                key={card.id}
                onClick={() => onLock(card)}
                style={{
                  padding: '12px 15px', border: `1px solid ${C.border}`,
                  background: C.bgSurface, cursor: 'pointer', transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.amber }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border }}
              >
                <div>
                  <div style={{ fontSize: 12, color: C.textPrimary, marginBottom: 3 }}>{card.name ?? card.register}</div>
                  <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                    {[card.palette, card.lens].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span style={{ fontSize: 9, color: C.amber, letterSpacing: 1 }}>USE →</span>
              </div>
            ))}
          </div>
          <div style={{ margin: '20px 0 24px', borderBottom: `1px solid ${C.border}` }} />
          <Label>OR DEFINE NEW</Label>
        </div>
      )}

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
          <Btn primary onClick={handleLockNew}>LOCK + WRITE SCRIPT →</Btn>
        </div>
      )}
    </div>
  )
}

// ── Sub-screen: Script ───────────────────────────────────────────────────────

function ScriptScreen({
  upload,
  styleCard,
  selectedIdea,
  onApprove,
}: {
  upload: VideoUpload | null
  styleCard: any
  selectedIdea: { text: string; format: string } | null
  onApprove: (productionId: string) => void
}) {
  const [phase, setPhase] = useState<'firing' | 'generating' | 'done' | 'error'>('firing')
  const [error, setError] = useState<string | null>(null)
  const [productionId, setProductionId] = useState<string | null>(null)
  const [scriptData, setScriptData] = useState<{ title?: string; segments?: any[] } | null>(null)

  useEffect(() => {
    if (!upload) { setError('No session selected.'); setPhase('error'); return }
    let cancelled = false

    async function run() {
      try {
        const res = await fetch('/api/studio/produce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_id: upload!.id, style_card: styleCard, selected_idea: selectedIdea }),
        })
        if (!res.ok) throw new Error(await res.text())
        const { production_id } = await res.json()
        if (cancelled) return
        setProductionId(production_id)
        setPhase('generating')

        while (!cancelled) {
          await new Promise(r => setTimeout(r, 4000))
          const r = await fetch(`/api/studio/production-status?id=${production_id}`)
          if (!r.ok || cancelled) continue
          const d = await r.json()
          if (d.status === 'done' && d.script?.script_json) {
            const segs = Array.isArray(d.script.script_json) ? d.script.script_json : []
            setScriptData({ title: d.script.title, segments: segs })
            setPhase('done')
            break
          }
          if (d.status === 'error') {
            setError(d.error_message || 'Script generation failed')
            setPhase('error')
            break
          }
        }
      } catch (e: any) {
        if (!cancelled) { setError(e.message || 'Failed to start production'); setPhase('error') }
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  if (phase === 'firing' || phase === 'generating') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.amber, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2 }}>
          {phase === 'firing' ? 'STARTING PRODUCTION…' : 'CLAUDE IS WRITING YOUR SCRIPT…'}
        </div>
        <div style={{ fontSize: 10, color: C.textDimmer }}>This takes 1–2 minutes</div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 10, color: C.red }}>{error}</div>
      </div>
    )
  }

  // done — show script
  const segments = scriptData?.segments ?? []
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px' }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>
        {scriptData?.title ?? 'Script'}
      </div>
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 24 }}>
        {segments.length} segment{segments.length !== 1 ? 's' : ''} · review and approve to produce
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {segments.map((seg: any, i: number) => (
          <div key={i} style={{ padding: '14px 18px', border: `1px solid ${C.border}`, background: C.bgSurface }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <Tag color={C.amber}>{seg.type?.toUpperCase() ?? `SEG ${i + 1}`}</Tag>
              {seg.duration_seconds && (
                <span style={{ fontSize: 8, color: C.textDim, letterSpacing: 1, marginLeft: 'auto' }}>
                  {seg.duration_seconds}s
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.textPrimary, lineHeight: 1.65, marginBottom: 8 }}>{seg.narration}</div>
            {seg.visual_direction && (
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5, fontStyle: 'italic' }}>
                ↳ {seg.visual_direction}
              </div>
            )}
          </div>
        ))}
      </div>
      <Btn primary onClick={() => productionId && onApprove(productionId)}>APPROVE + PRODUCE →</Btn>
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

function ReviewScreen({ productionId }: { productionId: string | null }) {
  const supabase = createClient()
  const [production, setProduction] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productionId) { setLoading(false); return }
    async function load() {
      const { data } = await supabase
        .from('productions')
        .select('*, scripts(title, script_json, status)')
        .eq('id', productionId)
        .single()
      setProduction(data)
      setLoading(false)
    }
    load()
  }, [productionId])

  const script = production?.scripts
  const segments: any[] = Array.isArray(script?.script_json) ? script.script_json : []
  const hasVideo = !!(production?.final_video_r2_keys)

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>
        LOADING…
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 40px' }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
        {script?.title ?? 'Production'}
      </div>
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 26 }}>
        {production?.status ?? 'unknown'} · {segments.length} segment{segments.length !== 1 ? 's' : ''}
      </div>

      <div style={{ display: 'flex', gap: 36 }}>
        {/* Script segments */}
        <div style={{ flex: 1 }}>
          <Label>SCRIPT</Label>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {segments.length === 0 && (
              <div style={{ fontSize: 10, color: C.textDimmer }}>No script data available.</div>
            )}
            {segments.map((seg: any, i: number) => (
              <div key={i} style={{ padding: '12px 16px', border: `1px solid ${C.border}`, background: C.bgSurface }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
                  <Tag color={C.amber}>{seg.type?.toUpperCase() ?? `${i + 1}`}</Tag>
                  {seg.duration_seconds && (
                    <span style={{ fontSize: 8, color: C.textDim, letterSpacing: 1, marginLeft: 'auto' }}>{seg.duration_seconds}s</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.textPrimary, lineHeight: 1.65, marginBottom: 6 }}>{seg.narration}</div>
                {seg.visual_direction && (
                  <div style={{ fontSize: 9, color: C.textDim, fontStyle: 'italic' }}>↳ {seg.visual_direction}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions panel */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <Label>OUTPUT</Label>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding: '12px 14px', border: `1px solid ${C.border}`, background: C.bgSurface }}>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, marginBottom: 5 }}>VIDEO STATUS</div>
              <div style={{ fontSize: 11, color: hasVideo ? C.green : C.textDimmer }}>
                {hasVideo ? '✓ Ready to download' : 'Assembly pending'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
              {hasVideo
                ? <Btn primary>DOWNLOAD →</Btn>
                : <Btn>DOWNLOAD (PENDING)</Btn>
              }
            </div>
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
  const [selectedIdea, setSelectedIdea] = useState<{ text: string; format: string } | null>(null)
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
          <DebriefScreen upload={activeUpload} onContinue={(idea) => { setSelectedIdea(idea); setScreen('style') }} />
        )}
        {screen === 'style' && (
          <StyleScreen onLock={(card) => { setStyleCard(card); setScreen('script') }} />
        )}
        {screen === 'script' && (
          <ScriptScreen
            upload={activeUpload}
            styleCard={styleCard}
            selectedIdea={selectedIdea}
            onApprove={(pid) => { setProductionId(pid); setScreen('produce') }}
          />
        )}
        {screen === 'produce' && (
          <ProduceScreen productionId={productionId} onPreview={() => setScreen('review')} />
        )}
        {screen === 'review' && <ReviewScreen productionId={productionId} />}
      </div>
    </div>
  )
}
