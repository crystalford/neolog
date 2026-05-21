'use client'

/**
 * ProduceModal — pick an output type and call the production engine.
 *
 * Mounted by /studio/[id] and /thread/[id] when the operator clicks
 * "Produce a draft." Routes to /production/[id] on success.
 *
 * Source/type matrix:
 *   thread  → x_post · micro_essay · clip
 *   cluster → article · x_thread
 *
 * Mid-flight: shows a generating state with the model name. Server
 * returns the inserted production id; we navigate there.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type SourceKind = 'thread' | 'cluster'
type ProdType = 'x_post' | 'x_thread' | 'micro_essay' | 'article' | 'clip' | 'video_essay'

const THREAD_OPTIONS: { key: ProdType; label: string; sub: string }[] = [
  { key: 'x_post',      label: 'X post',      sub: '≤ 270 chars · single post, in your voice' },
  { key: 'micro_essay', label: 'Micro-essay', sub: '~400 words · short prose piece' },
  { key: 'clip',        label: 'Clip',        sub: 'Audio segment + caption — pulls the existing R2 segment' },
]
const CLUSTER_OPTIONS: { key: ProdType; label: string; sub: string }[] = [
  { key: 'video_essay', label: 'Video essay', sub: '~10-15 min spoken · script + beats for voiceover recording' },
  { key: 'article',     label: 'Article',     sub: '~1200 words · long-form synthesis' },
  { key: 'x_thread',    label: 'X thread',    sub: '4-7 connected posts · build the argument' },
]

export function ProduceModal({
  open, onClose, sourceKind, sourceId, topic, color,
}: {
  open: boolean
  onClose: () => void
  sourceKind: SourceKind
  sourceId: string
  topic: string
  color: string
}) {
  const router = useRouter()
  const options = sourceKind === 'thread' ? THREAD_OPTIONS : CLUSTER_OPTIONS
  const [picked, setPicked] = useState<ProdType | null>(null)
  // Llama 70B is the in-house default. Sonnet is opt-in when the
  // operator wants the quality bump (and is willing to pay Anthropic).
  const [model, setModel] = useState<'claude' | 'llama70b' | 'kimi'>('llama70b')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const generate = async (type: ProdType) => {
    setPicked(type); setGenerating(true); setError(null)
    try {
      const r = await fetch('/api/v2/productions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_kind: sourceKind,
          source_id: sourceId,
          production_type: type,
          model,
        }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      router.push(`/production/${d.id}`)
    } catch (e: any) {
      setError(String(e?.message || e).slice(0, 280))
      setGenerating(false)
      setPicked(null)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-2)',
          borderLeft: `3px solid ${color}`,
          borderRadius: 14,
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
              textTransform: 'uppercase', color, fontWeight: 600, marginBottom: 4,
            }}>Produce a draft</div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 500,
              color: 'var(--fg)', letterSpacing: '-0.4px', lineHeight: 1.25,
            }}>{topic}</div>
          </div>
          {!generating && (
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: 'var(--fg-3)',
              fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
            }}>×</button>
          )}
        </div>

        {generating && picked ? (
          <div style={{
            padding: 24, textAlign: 'center',
            background: 'var(--bg-2)', borderRadius: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: color,
              boxShadow: `0 0 12px ${color}`,
              animation: 'canon-pulse 1.2s ease-in-out infinite',
            }}/>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--fg-1)', lineHeight: 1.5 }}>
              Drafting <strong>{(options.find(o => o.key === picked) || { label: picked }).label.toLowerCase()}</strong> via <strong>{model === 'claude' ? 'Sonnet' : model === 'kimi' ? 'Kimi K2.6' : 'Llama 70B'}</strong>…
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
              this takes 4-15 seconds
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map(o => (
                <button
                  key={o.key}
                  onClick={() => generate(o.key)}
                  disabled={generating}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 4,
                    padding: '14px 16px',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line-1)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'all .15s',
                    textAlign: 'left',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = 'var(--bg-3)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--line-1)'; e.currentTarget.style.background = 'var(--bg-2)' }}
                >
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                    color: 'var(--fg)', letterSpacing: '-0.2px',
                  }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.4 }}>{o.sub}</span>
                </button>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingTop: 14, borderTop: '1px solid var(--line)',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.4,
                textTransform: 'uppercase', color: 'var(--fg-3)',
              }}>Model</span>
              {(['llama70b', 'kimi', 'claude'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`canon-filter-chip ${model === m ? 'active' : ''}`}
                  style={{ fontSize: 10.5, padding: '4px 10px' }}
                >
                  {m === 'llama70b' ? 'Llama 70B · in-house' : m === 'kimi' ? 'Kimi K2.6' : 'Sonnet · max'}
                </button>
              ))}
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(230,99,74,0.06)',
                border: '1px solid var(--t-terra)',
                borderRadius: 8,
                fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
