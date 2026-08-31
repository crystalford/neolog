'use client'

/**
 * Brave Search API key (optional). When set, Topics' auto-search uses it
 * to find candidate URLs from the topic + angle. Without it, Topics
 * research falls back to pasted URLs only.
 *
 * Brave's free tier covers most operator-scale use. The key is stored on
 * the operator row (operator.brave_search_api_key). Treat it as a secret:
 * we never echo it back in the GET response — only "set" / "not set."
 */

import { useEffect, useState } from 'react'

export function BraveKeyRow() {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v2/operator/brave-key', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => setHasKey(!!d?.has_key))
      .catch(() => setHasKey(false))
  }, [])

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const r = await fetch('/api/v2/operator/brave-key', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: value.trim() }),
      })
      if (!r.ok) {
        const d: any = await r.json().catch(() => ({}))
        throw new Error(d?.error || `HTTP ${r.status}`)
      }
      setHasKey(true); setEditing(false); setValue('')
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('Delete the Brave Search API key? Topics auto-search will stop working.')) return
    setSaving(true)
    try {
      await fetch('/api/v2/operator/brave-key', { method: 'DELETE', credentials: 'include' })
      setHasKey(false)
    } finally { setSaving(false) }
  }

  return (
    <div style={{
      padding: '14px 18px', border: '1px solid var(--line-1)', borderRadius: 10,
      background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>Brave Search</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>
            Powers Topics auto-search. Free tier covers 2,000 queries/month — way more than you'll use. Paste your key from <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>api.search.brave.com</code>.
          </div>
        </div>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: hasKey ? 'var(--sig)' : 'var(--fg-3)',
          border: `1px solid ${hasKey ? 'var(--sig)' : 'var(--line-2)'}`,
          borderRadius: 100, padding: '2px 8px',
        }}>
          {hasKey === null ? '…' : hasKey ? 'Set' : 'Not set'}
        </span>
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="password"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="BSA…"
            style={{
              flex: 1, fontSize: 13, padding: '6px 10px',
              background: 'var(--bg-2)', color: 'var(--fg)',
              border: '1px solid var(--line-2)', borderRadius: 6,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
          <button onClick={save} disabled={saving || value.trim().length < 10} className="canon-btn primary" style={{ fontSize: 11 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setValue('') }} className="canon-btn ghost" style={{ fontSize: 11 }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditing(true)} className="canon-btn ghost" style={{ fontSize: 11 }}>
            {hasKey ? 'Replace key' : 'Add key'}
          </button>
          {hasKey && (
            <button onClick={remove} disabled={saving} className="canon-btn ghost" style={{ fontSize: 11, color: 'var(--t-terra)' }}>
              Delete
            </button>
          )}
        </div>
      )}

      {err && <div style={{ fontSize: 11, color: 'var(--t-terra)' }}>{err}</div>}
    </div>
  )
}
