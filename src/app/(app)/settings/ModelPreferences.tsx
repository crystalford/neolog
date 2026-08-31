/**
 * Settings · AI preferences — chat default model + extraction default tier.
 * Stored server-side via /api/v2/settings so the chat endpoint + future
 * extraction settings respect them.
 */
'use client'

import { useEffect, useState } from 'react'

const CHAT_OPTIONS = [
  { key: 'llama70b', label: 'Llama 3.3 70B',     sub: 'Workers AI · dense flagship · best writing quality (Recommended)' },
  { key: 'kimi',     label: 'Kimi K2.6',         sub: 'Workers AI · agentic/MoE · pricier than 70B, similar voice' },
  { key: 'scout',    label: 'Llama 4 Scout',     sub: 'Workers AI · cheapest, multimodal, lower writing quality' },
  { key: 'claude',   label: 'Claude Sonnet 4.6', sub: 'Anthropic · premium · ~$0.05/turn (requires funded API key)' },
] as const

const TIER_OPTIONS = [
  { key: 'free',    label: 'Free',    sub: 'Llama 3.3 70B for all 4 passes · ~$0.04/vlog' },
  { key: 'premium', label: 'Premium', sub: 'Sonnet for threads + creative, Llama 70B for the rest · ~$0.10/vlog' },
  { key: 'max',     label: 'Max',     sub: 'Sonnet for all 4 passes · ~$0.17/vlog · (requires funded Anthropic key)' },
] as const

type ChatModel = typeof CHAT_OPTIONS[number]['key']
type Tier = typeof TIER_OPTIONS[number]['key']

export function ModelPreferences() {
  const [chatModel, setChatModel] = useState<ChatModel>('llama70b')
  const [tier, setTier] = useState<Tier>('free')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v2/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        const s = d?.settings || {}
        if (s.chat_default_model && CHAT_OPTIONS.some(o => o.key === s.chat_default_model)) {
          setChatModel(s.chat_default_model)
        }
        if (s.extraction_default_tier && TIER_OPTIONS.some(o => o.key === s.extraction_default_tier)) {
          setTier(s.extraction_default_tier)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async (key: string, value: string) => {
    setSavingKey(key)
    setErr(null)
    try {
      const r = await fetch('/api/v2/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (!r.ok) {
        const d: any = await r.json().catch(() => ({}))
        setErr(d.error || `HTTP ${r.status}`)
      }
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--fg-4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
        LOADING…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PickerRow
        title="Default chat model"
        sub="Which model the /chat surface opens with. Per-conversation override available in the chat header."
        options={CHAT_OPTIONS as any}
        value={chatModel}
        onChange={v => {
          setChatModel(v as ChatModel)
          save('chat_default_model', v)
        }}
        savingThis={savingKey === 'chat_default_model'}
      />
      <PickerRow
        title="Default extraction tier"
        sub="Tier auto-applied to fresh uploads. The vlog detail page can override per-vlog."
        options={TIER_OPTIONS as any}
        value={tier}
        onChange={v => {
          setTier(v as Tier)
          save('extraction_default_tier', v)
        }}
        savingThis={savingKey === 'extraction_default_tier'}
      />
      {err && <div style={{ fontSize: 12, color: 'var(--t-terra)' }}>Save failed: {err}</div>}
    </div>
  )
}

function PickerRow({
  title, sub, options, value, onChange, savingThis,
}: {
  title: string
  sub: string
  options: { key: string; label: string; sub: string }[]
  value: string
  onChange: (v: string) => void
  savingThis: boolean
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{title}</div>
        {savingThis && (
          <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
            SAVING…
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 10 }}>{sub}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map(o => {
          const active = value === o.key
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                background: active ? 'rgba(236,228,210,0.08)' : 'rgba(236,228,210,0.02)',
                border: `1px solid ${active ? 'var(--fg-3)' : 'var(--line-2)'}`,
                borderRadius: 10,
                color: 'var(--fg)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500 }}>{o.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{o.sub}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
