'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  purple:       '#7060A8',
  red:          '#8A4040',
}

// ── Pipeline node definitions ─────────────────────────────────────────────────

type NodeColor = string

interface PipelineNode {
  id: string
  label: string
  color: NodeColor
  x: number
  y: number
  desc: string
  promptKey?: string
}

const NODES: PipelineNode[] = [
  { id: 'upload',    label: 'Upload',      color: C.blue,   x: 60,  y: 40,  desc: 'Video ingested via R2 multipart upload. Files up to 5 GB.' },
  { id: 'transcribe',label: 'Transcribe',  color: C.blue,   x: 220, y: 40,  desc: 'AssemblyAI Universal-2 · Speaker diarization · Auto-chapters · Timestamps' },
  { id: 'extract',   label: 'Extract',     color: C.purple, x: 380, y: 40,  desc: 'Claude Haiku · Per-vlog analysis · Entities, voice profile, ideas, quotes, emotional arc', promptKey: 'extraction' },
  { id: 'debrief',   label: 'Debrief',     color: C.amber,  x: 540, y: 40,  desc: 'Claude Sonnet (streaming) · AI-led conversation · Surfaces ideas, leads to style brief', promptKey: 'debrief' },
  { id: 'style',     label: 'Style Brief', color: C.amber,  x: 540, y: 120, desc: '3-question flow · Generates StyleCard JSON · Locks visual identity for the production' },
  { id: 'script',    label: 'Script',      color: C.amber,  x: 380, y: 120, desc: 'Claude Opus (Batch API) · Essay or Story mode · Voice-matched · Visual prompts per segment', promptKey: 'script' },
  { id: 'voice',     label: 'Voice',       color: C.green,  x: 220, y: 120, desc: 'ElevenLabs IVC · Voice clone from vlogs · TTS per segment narration' },
  { id: 'music',     label: 'Music',       color: C.green,  x: 220, y: 200, desc: 'Suno API · AI-generated per production · No Content ID exposure' },
  { id: 'images',    label: 'Images',      color: C.green,  x: 380, y: 200, desc: 'FLUX 2 Pro · Start + end frames per segment · 1920×1080 PNG' },
  { id: 'video',     label: 'Video',       color: C.green,  x: 540, y: 200, desc: 'Kling 3.0 Pro via fal.ai · First+last frame · 5s clips' },
  { id: 'assembly',  label: 'Assembly',    color: C.amber,  x: 700, y: 120, desc: 'FFmpeg · Cut types · VO + music layers · Multi-ratio output' },
  { id: 'posts',     label: 'Posts',       color: C.purple, x: 700, y: 40,  desc: 'Claude Sonnet (Batch) · Quote → post candidate · Format templates · X publishing', promptKey: 'posts' },
  { id: 'publish',   label: 'Publish',     color: C.amber,  x: 700, y: 200, desc: 'YouTube, TikTok, X · Multi-ratio export' },
]

// ── Default prompt content ────────────────────────────────────────────────────

const DEFAULT_PROMPTS: Record<string, { name: string; model: string; description: string; prompt: string }> = {
  extraction: {
    name: 'Per-vlog extraction',
    model: 'claude-haiku-4-5-20251001',
    description: 'Runs on every uploaded vlog. Extracts entities, voice profile, ideas, quotes, and emotional arc.',
    prompt: `You are analyzing a single vlog transcript to extract signal for a creative production system.

OUTPUT: Return valid JSON only. No preamble.

Extract the following fields:
- title: short headline (5-8 words)
- key_win: the single most significant thing from this session
- summary: 2-3 sentence summary
- emotional_arc: how mood/energy shifted
- mood: current mood
- energy_level: high | medium | low
- content_ideas: array of {topic, format}
- strong_opinions: array of strings
- key_quotes: array of verbatim quotes
- action_items: array of {task, urgency}
- entities: people, projects, and concepts mentioned

RULES:
- Only include key_quotes if genuinely quotable
- content_ideas: only if it has a distinct angle
- Do not summarize logistics or small talk`,
  },
  debrief: {
    name: 'Debrief conversation',
    model: 'claude-sonnet-4-6',
    description: 'AI-led conversation that surfaces ideas and transitions to style brief.',
    prompt: `You are Neolog, a creative producer running a weekly debrief with a solo creator.
You have analyzed their vlogs and found ideas worth making into content.

YOUR JOB:
1. Present the strongest ideas clearly and specifically
2. Help the creator pick one to develop
3. Refine the angle through conversation
4. Transition to the Visual Style Brief

RULES:
- NEVER say hello or introduce yourself. Lead with what you found.
- One idea or question at a time. Never overwhelm.
- Always anchor ideas in something they actually said. Quote them back.
- Don't prescribe format. Describe what you sense about the material.
- Match their energy. Fast if excited. Slow if uncertain.

OPENING: Lead with: "[X] vlogs, one idea kept coming up. Here's the one worth making this week:"`,
  },
  script: {
    name: 'Script generation',
    model: 'claude-opus-4-6',
    description: 'Generates full video script with per-segment visual instructions. Uses style card and voice profile.',
    prompt: `You are a scriptwriter and cinematographer working as one system.
Write in the creator's authentic voice AND specify the visual world for every segment.

<style_card>{STYLE_CARD_JSON}</style_card>
<voice_profile>{ACCUMULATED_VOICE_PROFILE}</voice_profile>
<voice_samples>{TRANSCRIPT_EXCERPTS_1500_WORDS}</voice_samples>
<idea>{SELECTED_IDEA_CARD_JSON}</idea>

VOICE RULES:
- Use their exact vocabulary
- Match sentence rhythm from voice_profile
- Write for spoken delivery, not written text

OUTPUT: Return valid JSON only. Full script with segments array.
Each segment contains: id, segment_type, narration, flux_prompt, runway_prompt, cut_type, music_cue, narration_visual_relationship, shot_type, camera_movement, keyframe_strategy`,
  },
  posts: {
    name: 'Post format generation',
    model: 'claude-sonnet-4-6',
    description: 'Takes raw quote or idea and generates multiple post versions using active format templates.',
    prompt: `You generate social post versions from raw extracted content.
Match the creator's voice exactly. Never add generic AI phrases.

<voice_profile>{ACCUMULATED_VOICE_PROFILE}</voice_profile>
<source>
type: {source_type}
content: {raw_content}
</source>
<active_formats>{FORMAT_TEMPLATES}</active_formats>

For each active format, generate one version following that format's instruction exactly.

RULES:
- Write in their voice, not yours
- Never add "Here's the thing:" or similar AI tells
- Keep punchy — every word earns its place
- Threads must have genuine escalation, not padding

OUTPUT: Valid JSON array only. [{format_name, text}]`,
  },
}

// ── Main page ─────────────────────────────────────────────────────────────────

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

type PanelTab = 'overview' | 'prompt' | 'formats'

export default function SystemPage() {
  const supabase = createClient()
  const [activeNode, setActiveNode] = useState('extract')
  const [activeTab, setActiveTab] = useState<PanelTab>('overview')
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [promptVersions, setPromptVersions] = useState<any[]>([])
  const [customFields, setCustomFields] = useState<any[]>([])
  const [formats, setFormats] = useState<any[]>([])
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)
  const [addingFormat, setAddingFormat] = useState(false)
  const [newFormat, setNewFormat] = useState({ name: '', instruction: '' })

  const node = NODES.find(n => n.id === activeNode)
  const promptData = node?.promptKey ? DEFAULT_PROMPTS[node.promptKey] : null

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: versions },
        { data: fields },
        { data: fmts },
      ] = await Promise.all([
        supabase
          .from('prompt_versions')
          .select('*')
          .eq('user_id', session.user.id)
          .order('version', { ascending: false }),
        supabase
          .from('custom_extraction_fields')
          .select('*')
          .eq('user_id', session.user.id),
        supabase
          .from('post_format_templates')
          .select('*')
          .or('user_id.is.null,user_id.eq.' + session.user.id)
          .order('sort_order'),
      ])

      setPromptVersions(versions ?? [])
      setCustomFields(fields ?? [])
      setFormats(fmts ?? [])
    }
    load()
  }, [])

  const startEdit = () => {
    setEditText(promptData?.prompt ?? '')
    setEditing(true)
  }

  const savePrompt = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !node?.promptKey) return

    const currentVersion = promptVersions.filter(v => v.prompt_key === node.promptKey).length + 1

    await supabase.from('prompt_versions').insert({
      user_id: session.user.id,
      prompt_key: node.promptKey,
      version: currentVersion,
      prompt_text: editText,
      model: promptData?.model ?? 'unknown',
      is_active: true,
    })

    // Mark previous versions inactive
    await supabase
      .from('prompt_versions')
      .update({ is_active: false })
      .eq('user_id', session.user.id)
      .eq('prompt_key', node.promptKey)
      .lt('version', currentVersion)

    const { data: updated } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('version', { ascending: false })

    setPromptVersions(updated ?? [])
    setEditing(false)
  }

  const toggleFormat = async (id: string, isActive: boolean) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('post_format_templates').update({ is_active: !isActive }).eq('id', id)
    setFormats(prev => prev.map(f => f.id === id ? { ...f, is_active: !isActive } : f))
  }

  const addFormat = async () => {
    if (!newFormat.name || !newFormat.instruction) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('post_format_templates').insert({
      user_id: session.user.id,
      name: newFormat.name,
      instruction: newFormat.instruction,
      is_active: true,
      sort_order: formats.length + 1,
    }).select().single()
    if (data) setFormats(prev => [...prev, data])
    setNewFormat({ name: '', instruction: '' })
    setAddingFormat(false)
  }

  const nodeVersions = node?.promptKey
    ? promptVersions.filter(v => v.prompt_key === node.promptKey)
    : []

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '22px 40px 18px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
          System
        </div>
        <div style={{ fontSize: 11, color: C.textSecond }}>
          How Neolog works. Click any node to inspect or edit the prompts powering it.
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: pipeline diagram */}
        <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', borderRight: `1px solid ${C.border}` }}>
          <Label>PIPELINE MAP</Label>
          <div style={{ marginTop: 20, overflowX: 'auto' }}>
            <svg width="820" height="260" style={{ display: 'block' }}>
              {/* Connection lines */}
              {[
                [100, 60, 220, 60], [260, 60, 380, 60], [420, 60, 540, 60],
                [540, 60, 540, 120], [540, 120, 420, 120], [380, 120, 260, 120],
                [220, 120, 220, 200], [380, 120, 380, 200], [540, 120, 540, 200],
                [580, 200, 700, 200], [580, 60, 700, 60], [700, 120, 700, 60], [700, 120, 700, 200],
              ].map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={C.borderBright} strokeWidth="1" strokeDasharray="3,3" />
              ))}

              {/* Nodes */}
              {NODES.map(n => {
                const isActive = activeNode === n.id
                return (
                  <g key={n.id} onClick={() => { setActiveNode(n.id); setActiveTab('overview'); setEditing(false) }} style={{ cursor: 'pointer' }}>
                    <rect
                      x={n.x} y={n.y - 18} width={80} height={36}
                      fill={isActive ? `${n.color}20` : C.bgRaised}
                      stroke={isActive ? n.color : C.border}
                      strokeWidth={isActive ? 1.5 : 1}
                      rx={2}
                    />
                    <text
                      x={n.x + 40} y={n.y + 5}
                      textAnchor="middle"
                      fill={isActive ? n.color : C.textSecond}
                      fontSize={10}
                      fontFamily="JetBrains Mono"
                      letterSpacing={1}
                    >
                      {n.label.toUpperCase()}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Legend */}
          <div style={{ marginTop: 16, display: 'flex', gap: 24 }}>
            {[
              [C.blue, 'Input'],
              [C.purple, 'Intelligence'],
              [C.green, 'Generation'],
              [C.amber, 'Production'],
            ].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Maintenance */}
          <div style={{ marginTop: 36 }}>
            <Label>MAINTENANCE</Label>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                padding: '14px 16px', background: C.bgSurface, border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: C.textPrimary, marginBottom: 4 }}>Reprocess stuck uploads</div>
                  <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.6 }}>
                    Restarts uploads stuck at saving-results, error, or uploaded (idle &gt;5 min). Up to 50 at a time.
                  </div>
                  {reprocessResult && (
                    <div style={{ fontSize: 10, color: C.green, marginTop: 6 }}>{reprocessResult}</div>
                  )}
                </div>
                <Btn small onClick={async () => {
                  setReprocessing(true)
                  setReprocessResult(null)
                  try {
                    const res = await fetch('/api/system/reprocess-stuck', { method: 'POST' })
                    const data = await res.json()
                    if (data.reprocessed === 0) {
                      setReprocessResult('No stuck uploads found.')
                    } else {
                      setReprocessResult(`Restarted ${data.reprocessed} upload${data.reprocessed === 1 ? '' : 's'}.`)
                    }
                  } catch {
                    setReprocessResult('Request failed.')
                  }
                  setReprocessing(false)
                }}>
                  {reprocessing ? 'RUNNING…' : 'RUN'}
                </Btn>
              </div>

              <div style={{
                padding: '14px 16px', background: C.bgSurface, border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: C.textPrimary, marginBottom: 4 }}>Backfill recording dates</div>
                  <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.6 }}>
                    Re-extracts recorded_at from MP4 metadata and filenames for uploads showing "Today" instead of actual date. Up to 200 at a time.
                  </div>
                  {backfillResult && (
                    <div style={{ fontSize: 10, color: C.green, marginTop: 6 }}>{backfillResult}</div>
                  )}
                </div>
                <Btn small onClick={async () => {
                  setBackfilling(true)
                  setBackfillResult(null)
                  try {
                    const res = await fetch('/api/system/backfill-dates', { method: 'POST' })
                    const data = await res.json()
                    if (data.queued) {
                      setBackfillResult('Queued. Check back in a minute — dates will update as uploads are processed.')
                    } else {
                      setBackfillResult(data.error || 'Request failed.')
                    }
                  } catch {
                    setBackfillResult('Request failed.')
                  }
                  setBackfilling(false)
                }}>
                  {backfilling ? 'QUEUING…' : 'RUN'}
                </Btn>
              </div>
            </div>
          </div>

          {/* Custom extraction fields */}
          <div style={{ marginTop: 36 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Label>CUSTOM EXTRACTION FIELDS</Label>
              <Btn small onClick={async () => {
                const name = prompt('Field name (e.g. McLuhan references)')
                const instruction = prompt('Instruction for Claude')
                if (!name || !instruction) return
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) return
                const { data } = await supabase.from('custom_extraction_fields').insert({
                  user_id: session.user.id, field_name: name, instruction, is_active: true,
                }).select().single()
                if (data) setCustomFields(prev => [...prev, data])
              }}>
                + ADD FIELD
              </Btn>
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12, lineHeight: 1.6 }}>
              Add instructions to the extraction prompt. Runs on every new vlog.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {customFields.length === 0 ? (
                <div style={{ fontSize: 11, color: C.textDimmer }}>No custom fields yet.</div>
              ) : customFields.map((f: any) => (
                <div key={f.id} style={{
                  padding: '10px 14px', background: C.bgSurface,
                  border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div
                    onClick={() => supabase.from('custom_extraction_fields').update({ is_active: !f.is_active }).eq('id', f.id).then(() =>
                      setCustomFields(prev => prev.map(x => x.id === f.id ? { ...x, is_active: !x.is_active } : x))
                    )}
                    style={{
                      width: 16, height: 16, border: `1px solid ${f.is_active ? C.amber : C.border}`,
                      background: f.is_active ? C.amberGlow : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: C.amber, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {f.is_active ? '✓' : ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.textPrimary, marginBottom: 2 }}>{f.field_name}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>{f.instruction}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: node inspector */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Node header */}
          <div style={{ padding: '20px 24px 0', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: node?.color ?? C.amber }} />
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: C.textPrimary }}>
                {node?.label}
              </div>
              {nodeVersions.length > 0 && (
                <span style={{
                  fontSize: 9, letterSpacing: 2, color: node?.color ?? C.amber,
                  background: `${node?.color ?? C.amber}12`, border: `1px solid ${node?.color ?? C.amber}25`,
                  padding: '2px 8px', borderRadius: 2,
                }}>
                  v{nodeVersions[0]?.version}
                </span>
              )}
            </div>
            {node && (
              <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 16, lineHeight: 1.6 }}>
                {node.desc}
              </div>
            )}
            <div style={{ display: 'flex', gap: 0 }}>
              {(['overview', 'prompt', ...(activeNode === 'posts' ? ['formats'] : [])] as PanelTab[]).map(t => (
                <button key={t} onClick={() => { setActiveTab(t); setEditing(false) }} style={{
                  background: 'none', border: 'none',
                  borderBottom: activeTab === t ? `2px solid ${C.amber}` : '2px solid transparent',
                  color: activeTab === t ? C.amberBright : C.textDim,
                  fontSize: 9, letterSpacing: 2, padding: '0 12px 10px',
                  transition: 'all 0.12s', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {promptData ? (
                  <>
                    <div>
                      <Label>MODEL</Label>
                      <div style={{
                        marginTop: 8, padding: '8px 12px',
                        background: C.bgRaised, border: `1px solid ${C.border}`,
                        fontSize: 11, color: C.textSecond, fontFamily: 'monospace',
                      }}>
                        {promptData.model}
                      </div>
                    </div>
                    <div>
                      <Label>PURPOSE</Label>
                      <div style={{ marginTop: 8, fontSize: 12, color: C.textSecond, lineHeight: 1.7 }}>
                        {promptData.description}
                      </div>
                    </div>
                    <div>
                      <Label>VERSION HISTORY</Label>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {nodeVersions.length === 0 ? (
                          <div style={{
                            padding: '8px 12px', background: C.amberGlow,
                            border: `1px solid ${C.amberDim}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <div style={{ fontSize: 11, color: C.textPrimary }}>v1 · Default</div>
                            <span style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>Built-in</span>
                          </div>
                        ) : nodeVersions.map((v: any, i: number) => (
                          <div key={v.id} style={{
                            padding: '8px 12px',
                            background: i === 0 ? C.amberGlow : C.bgSurface,
                            border: `1px solid ${i === 0 ? C.amberDim : C.border}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <div style={{ fontSize: 11, color: i === 0 ? C.textPrimary : C.textDim }}>
                              v{v.version} · {i === 0 ? 'Current' : 'Previous'}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>
                                {new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              {i > 0 && <Btn small>RESTORE</Btn>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: C.textDimmer }}>
                    {node ? 'This node does not have an editable prompt.' : 'Select a node to inspect it.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'prompt' && promptData && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Label>SYSTEM PROMPT</Label>
                  <Btn small onClick={editing ? () => setEditing(false) : startEdit}>
                    {editing ? 'CANCEL' : 'EDIT'}
                  </Btn>
                </div>
                {editing ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      style={{
                        width: '100%', background: C.bgRaised,
                        border: `1px solid ${C.amber}`,
                        color: C.textPrimary, fontSize: 11, padding: 12,
                        outline: 'none', resize: 'vertical', minHeight: 300,
                        lineHeight: 1.7, fontFamily: 'monospace',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <Btn primary onClick={savePrompt}>
                        SAVE v{(nodeVersions[0]?.version ?? 0) + 1}
                      </Btn>
                      <Btn onClick={() => setEditing(false)}>CANCEL</Btn>
                    </div>
                  </div>
                ) : (
                  <pre style={{
                    fontSize: 10, color: C.textSecond, lineHeight: 1.8,
                    whiteSpace: 'pre-wrap', fontFamily: 'monospace',
                    background: C.bgRaised, border: `1px solid ${C.border}`,
                    padding: 12, overflow: 'hidden',
                  }}>
                    {nodeVersions.find((v: any) => v.is_active)?.prompt_text ?? promptData.prompt}
                  </pre>
                )}
              </div>
            )}

            {activeTab === 'formats' && activeNode === 'posts' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <Label>POST FORMAT TEMPLATES</Label>
                  <Btn small onClick={() => setAddingFormat(true)}>+ ADD</Btn>
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14, lineHeight: 1.6 }}>
                  Each format is injected into the post generation prompt.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {formats.map((f: any) => (
                    <div key={f.id} style={{
                      padding: '12px 14px',
                      background: f.is_active ? C.bgSurface : C.bgRaised,
                      border: `1px solid ${C.border}`,
                      opacity: f.is_active ? 1 : 0.5,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div
                          onClick={() => toggleFormat(f.id, f.is_active)}
                          style={{
                            width: 16, height: 16,
                            border: `1px solid ${f.is_active ? C.amber : C.border}`,
                            background: f.is_active ? C.amberGlow : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: C.amber, cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          {f.is_active ? '✓' : ''}
                        </div>
                        <div style={{ fontSize: 12, color: C.textPrimary, fontWeight: 500 }}>{f.name}</div>
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.6, paddingLeft: 26 }}>
                        {f.instruction}
                      </div>
                    </div>
                  ))}
                  {addingFormat && (
                    <div style={{
                      padding: 14, border: `1px solid ${C.amber}`,
                      background: C.amberGlow, marginTop: 4,
                    }}>
                      <div style={{ fontSize: 9, color: C.amberDim, letterSpacing: 2, marginBottom: 10 }}>NEW FORMAT</div>
                      <input
                        value={newFormat.name}
                        onChange={e => setNewFormat({ ...newFormat, name: e.target.value })}
                        placeholder="Format name"
                        style={{
                          width: '100%', background: C.bgRaised,
                          border: `1px solid ${C.border}`,
                          color: C.textPrimary, fontSize: 11,
                          padding: '7px 10px', outline: 'none', marginBottom: 8,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      />
                      <textarea
                        value={newFormat.instruction}
                        onChange={e => setNewFormat({ ...newFormat, instruction: e.target.value })}
                        placeholder="Instruction for Claude..."
                        style={{
                          width: '100%', background: C.bgRaised,
                          border: `1px solid ${C.border}`,
                          color: C.textPrimary, fontSize: 11,
                          padding: '7px 10px', outline: 'none',
                          resize: 'vertical', minHeight: 60, lineHeight: 1.6,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      />
                      <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                        <Btn primary small onClick={addFormat}>SAVE FORMAT</Btn>
                        <Btn small onClick={() => setAddingFormat(false)}>CANCEL</Btn>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
