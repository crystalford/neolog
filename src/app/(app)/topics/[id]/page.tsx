'use client'

/**
 * Topic detail — the "feed a seed, get a script" surface.
 *
 * 1. Edit title / angle / notes inline (auto-save on blur).
 * 2. Paste source URLs (optional — system can auto-search if you've saved
 *    a Brave Search API key in Settings).
 * 3. Hit Research. System crawls each URL via Cloudflare Browser Run,
 *    synthesizes a research brief from the markdown via gpt-oss-120b.
 * 4. Review/edit the brief.
 * 5. Build the script — uses the brief as substance + your past vlogs
 *    as voice samples.
 * 6. Same Studio downstream: record/synth voice → b-roll → render.
 *
 * All on Cloudflare. Past vlogs become voice training forever; no new
 * uploads required to make new essays.
 */

export const runtime = 'edge'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface Topic {
  id: string; title: string; framing: string | null; angle: string | null
  notes: string | null; state: string; updated_at: string
  research_brief: string | null; research_status: string | null
  research_at: string | null; pasted_urls: string[]
}
interface SourceRow {
  id: string; url: string; title: string | null; origin: string | null
  bytes: number | null; fetched_at: string; error: string | null
}
interface Production { id: string; state: string }
interface SuggestedAngle {
  angle: string
  framing: string
  research_questions: string[]
}

export default function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [topic, setTopic] = useState<Topic | null>(null)
  const [sources, setSources] = useState<SourceRow[]>([])
  const [production, setProduction] = useState<Production | null>(null)
  const [loading, setLoading] = useState(true)
  const [researching, setResearching] = useState(false)
  const [building, setBuilding] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [urlsDraft, setUrlsDraft] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestedAngle[] | null>(null)
  const [suggestionsGrounded, setSuggestionsGrounded] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  // Show the suggestion panel by default UNLESS the operator already wrote
  // an angle (then collapse it; they know where they're going).
  const [showSuggestions, setShowSuggestions] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v2/topics/${id}`, { credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setTopic(d.topic)
      setSources(d.sources ?? [])
      setProduction(d.production ?? null)
      setUrlsDraft((d.topic?.pasted_urls ?? []).join('\n'))
      // Instant suggestions: the topic GET now returns the cached
      // suggestions inline (pre-fired on topic create). If present, the
      // page renders them immediately with no spinner.
      if (Array.isArray(d?.suggestions) && d.suggestions.length > 0) {
        setSuggestions(d.suggestions)
        setSuggestionsGrounded(!!d?.suggestions_grounded)
      }
      // Collapse suggestions if operator already typed an angle.
      if ((d.topic?.angle ?? '').trim().length > 20) setShowSuggestions(false)
    } catch (e: any) {
      setNote(e?.message || String(e))
    } finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])

  const fetchSuggestions = useCallback(async (force = false) => {
    setLoadingSuggestions(true)
    try {
      const r = await fetch(`/api/v2/topics/${id}/suggest-angles`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : [])
      setSuggestionsGrounded(!!d?.grounded)
    } catch (e: any) {
      setNote(`Couldn't fetch suggestions: ${e?.message || e}`)
    } finally { setLoadingSuggestions(false) }
  }, [id])

  // Auto-load suggestions once on first visit (unless already collapsed).
  useEffect(() => {
    if (!topic || suggestions !== null || !showSuggestions) return
    fetchSuggestions()
  }, [topic, suggestions, showSuggestions, fetchSuggestions])

  const useAngle = async (s: SuggestedAngle) => {
    const angleText = `${s.angle} — ${s.framing}`
    await patch('angle', angleText)
    // Append research questions to notes so they shape the research step
    // without overwriting any notes the operator already wrote.
    if (s.research_questions.length > 0) {
      const block = `Research questions for "${s.angle}":\n` +
        s.research_questions.map(q => `  · ${q}`).join('\n')
      const existing = (topic?.notes ?? '').trim()
      const next = existing ? `${existing}\n\n${block}` : block
      await patch('notes', next)
    }
    await load()
    setShowSuggestions(false)
  }

  const patch = async (field: string, value: any) => {
    setSavingField(field)
    try {
      await fetch(`/api/v2/topics/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } finally { setSavingField(null) }
  }

  const saveUrls = async () => {
    const lines = urlsDraft.split('\n').map(s => s.trim()).filter(s => /^https?:\/\//i.test(s))
    await patch('pasted_urls', lines)
    await load()
  }

  const research = async () => {
    await saveUrls()
    setResearching(true)
    setNote('Crawling sources and synthesizing the brief on Cloudflare… ~45-90s.')
    try {
      const r = await fetch(`/api/v2/topics/${id}/research`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'both' }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const errCount = (d.errors ?? []).length
      const successCount = (d.sources ?? []).filter((s: any) => !s.error).length
      setNote(`Brief written from ${successCount} source${successCount === 1 ? '' : 's'}${errCount > 0 ? ` · ${errCount} failed (see source list)` : ''}.`)
      await load()
    } catch (e: any) {
      setNote(`Research failed: ${e?.message || e}`)
    } finally {
      setResearching(false)
    }
  }

  const build = async (mode: 'video_essay' | 'short' = 'video_essay') => {
    if (mode === 'video_essay' && production) { router.push(`/production/${production.id}`); return }
    setBuilding(true)
    setNote(mode === 'short'
      ? 'Drafting a 30-60s short in your voice…'
      : 'Drafting the script — brief as substance, your past vlogs as voice…')
    try {
      const r = await fetch('/api/v2/productions', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_kind: 'topic', source_id: id, production_type: mode }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const pid = d?.id || d?.production?.id
      if (pid) router.push(`/production/${pid}`)
      else { setNote('Script created.'); await load() }
    } catch (e: any) {
      setNote(`Build failed: ${e?.message || e}`)
      setBuilding(false)
    }
  }

  const deleteTopic = async () => {
    if (!confirm(`Delete topic "${topic?.title}"?`)) return
    await fetch(`/api/v2/topics/${id}`, { method: 'DELETE', credentials: 'include' })
    router.push('/topics')
  }

  if (loading) return <Shell><div style={{ padding: 40, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: 1, color: 'var(--fg-4)' }}>LOADING…</div></Shell>
  if (!topic) return <Shell><div style={{ padding: 40, color: 'var(--t-terra)' }}>Topic not found.</div></Shell>

  const color = topicColor(topic.title)
  const hasBrief = !!topic.research_brief && topic.research_brief.length > 100

  return (
    <Shell>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
        <div style={{ padding: '24px 0 8px', fontSize: 12, color: 'var(--fg-3)' }}>
          <Link href="/topics" style={{ color: 'inherit', textDecoration: 'none' }}>← Topics</Link>
        </div>

        <section style={{ paddingBottom: 24 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 10,
          }}>Topic</div>
          <input
            type="text"
            defaultValue={topic.title}
            onBlur={e => patch('title', e.target.value.trim())}
            style={{
              width: '100%', fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 300,
              letterSpacing: '-1.5px', lineHeight: 1.1, color: 'var(--fg)',
              background: 'transparent', border: 'none',
              borderLeft: `4px solid ${color}`, paddingLeft: 16,
            }}
          />
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--fg-3)', marginTop: 12 }}>
            {savingField ? 'Saving…' : 'Edit fields inline. Auto-save on blur.'}
          </div>
        </section>

        {/* Angle suggestions — auto-generated when the page opens */}
        {showSuggestions ? (
          <section style={{
            padding: 18, border: '1px solid var(--line-1)', borderRadius: 14,
            background: 'rgba(91, 141, 246, 0.03)', marginBottom: 24,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 2.4,
                  textTransform: 'uppercase', color: 'var(--fg-3)',
                }}>
                  Where do you want to take this?
                  {suggestionsGrounded && (
                    <span style={{ marginLeft: 8, color: 'var(--sig)' }}>· grounded in web search</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 4, lineHeight: 1.5 }}>
                  Pick one to direct the piece (the angle + research questions get filled in), or skip and write your own below.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => fetchSuggestions(true)} disabled={loadingSuggestions}
                  className="canon-btn ghost" style={{ fontSize: 11 }}>
                  {loadingSuggestions ? 'Thinking…' : 'Regenerate'}
                </button>
                <button onClick={() => setShowSuggestions(false)} className="canon-btn ghost" style={{ fontSize: 11 }}>
                  Hide
                </button>
              </div>
            </div>

            {loadingSuggestions && (!suggestions || suggestions.length === 0) ? (
              <div style={{ fontSize: 12, color: 'var(--fg-3)', padding: '14px 0' }}>
                Reading the topic and proposing angles… ~15s.
              </div>
            ) : suggestions && suggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                Couldn't propose angles for this topic. Write one in the field below.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {(suggestions ?? []).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => useAngle(s)}
                    disabled={loadingSuggestions}
                    style={{
                      textAlign: 'left',
                      padding: '14px 14px',
                      border: '1px solid var(--line-2)',
                      borderRadius: 10,
                      background: 'var(--bg-2)',
                      color: 'var(--fg)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--sig)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line-2)' }}
                  >
                    <div style={{
                      fontSize: 14, fontWeight: 500, lineHeight: 1.3, letterSpacing: '-0.2px',
                    }}>
                      {s.angle}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.45 }}>
                      {s.framing}
                    </div>
                    {s.research_questions.length > 0 && (
                      <ul style={{
                        margin: '4px 0 0 0', padding: '0 0 0 14px',
                        fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.45,
                      }}>
                        {s.research_questions.slice(0, 3).map((q, qi) => (
                          <li key={qi}>{q}</li>
                        ))}
                      </ul>
                    )}
                    <div style={{
                      marginTop: 'auto', fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10, letterSpacing: 1, color: 'var(--sig)',
                      textTransform: 'uppercase',
                    }}>
                      use this →
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowSuggestions(true)} className="canon-btn ghost" style={{ fontSize: 11 }}>
              Suggest angles
            </button>
          </div>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>
          <FieldBlock
            label="Your angle / thesis"
            sub="What's YOUR take? The system uses this to direct what to look for + how to frame the script."
            initial={topic.angle ?? ''}
            placeholder={`e.g. "He didn't choose his role, but he keeps re-choosing it every year."`}
            onSave={v => patch('angle', v)}
            rows={3}
          />
          <FieldBlock
            label="Notes (optional)"
            sub="Anything else the script should know. Stays as raw material, not quoted."
            initial={topic.notes ?? ''}
            placeholder=""
            onSave={v => patch('notes', v)}
            rows={3}
          />
        </section>

        {/* Sources + research */}
        <section style={{
          padding: 18, border: '1px solid var(--line-1)', borderRadius: 14,
          background: 'var(--bg-1)', marginBottom: 16,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 2.4,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 12,
          }}>Sources</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 10, lineHeight: 1.5 }}>
            Paste URLs (one per line) or leave empty to let the system auto-search via Brave (requires the API key in Settings).
          </div>
          <textarea
            value={urlsDraft}
            onChange={e => setUrlsDraft(e.target.value)}
            onBlur={saveUrls}
            placeholder={'https://example.com/article\nhttps://other.com/post'}
            rows={4}
            style={{
              width: '100%', fontSize: 12.5, padding: '10px 12px',
              background: 'var(--bg-2)', color: 'var(--fg-1)',
              border: '1px solid var(--line-2)', borderRadius: 8,
              fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5, resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={research} disabled={researching || building} className="canon-btn primary" style={{ fontSize: 12 }}>
              {researching ? 'Researching…' : hasBrief ? 'Re-research' : 'Research the topic'}
            </button>
            {topic.research_status && (
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5,
                color: topic.research_status === 'ok' ? 'var(--sig)' : topic.research_status === 'partial' ? 'var(--t-ochre)' : 'var(--fg-3)',
                letterSpacing: 1, textTransform: 'uppercase',
              }}>
                {topic.research_status}
              </span>
            )}
          </div>

          {sources.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sources.map(s => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer"
                  style={{
                    fontSize: 12, color: s.error ? 'var(--t-terra)' : 'var(--fg-2)',
                    textDecoration: 'none', padding: '6px 10px',
                    border: '1px solid var(--line-2)', borderRadius: 6,
                    background: 'var(--bg-2)', display: 'flex', gap: 8,
                  }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1,
                    color: s.origin === 'pasted' ? 'var(--sig)' : 'var(--fg-3)',
                  }}>{s.origin?.toUpperCase()}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title || s.url}
                  </span>
                  {s.error && <span style={{ fontSize: 10, color: 'var(--t-terra)' }}>{s.error.slice(0, 50)}</span>}
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Brief */}
        {hasBrief && (
          <section style={{
            padding: 18, border: '1px solid var(--line-1)', borderRadius: 14,
            background: 'var(--bg-1)', marginBottom: 16,
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 2.4,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 12,
            }}>Research brief</div>
            <textarea
              defaultValue={topic.research_brief ?? ''}
              onBlur={e => patch('research_brief', e.target.value)}
              rows={16}
              style={{
                width: '100%', fontSize: 13, padding: '10px 12px',
                background: 'var(--bg-2)', color: 'var(--fg-1)',
                border: '1px solid var(--line-2)', borderRadius: 8,
                fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical',
              }}
            />
          </section>
        )}

        {/* Build */}
        <section style={{ display: 'flex', gap: 10, paddingBottom: 64, flexWrap: 'wrap' }}>
          <button onClick={() => build('video_essay')} disabled={building || researching} className="canon-btn primary" style={{ fontSize: 13 }}>
            {building ? 'Drafting…' : production ? 'Open the script →' : hasBrief ? 'Build the script' : 'Build the script (no research yet)'}
          </button>
          <button onClick={() => build('short')} disabled={building || researching}
            className="canon-btn ghost" style={{ fontSize: 13, color: 'var(--sig)' }}
            title="Bang out a 30-60s vertical short on this topic. No long-form commitment."
          >
            {building ? '…' : '⚡ Make a short'}
          </button>
          <button onClick={deleteTopic} className="canon-btn ghost" style={{ fontSize: 12, color: 'var(--t-terra)' }}>
            Delete topic
          </button>
          {note && <span style={{ fontSize: 12, color: 'var(--fg-3)', alignSelf: 'center' }}>{note}</span>}
        </section>
      </div>
    </Shell>
  )
}

function FieldBlock({ label, sub, initial, placeholder, onSave, rows }: {
  label: string; sub: string; initial: string; placeholder: string
  onSave: (v: string) => Promise<void>
  rows: number
}) {
  const [val, setVal] = useState(initial)
  return (
    <div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 1.8,
        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 8 }}>{sub}</div>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => onSave(val.trim())}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%', fontSize: 13.5, padding: '10px 12px',
          background: 'var(--bg-2)', color: 'var(--fg-1)',
          border: '1px solid var(--line-2)', borderRadius: 8,
          fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical',
        }}
      />
    </div>
  )
}
